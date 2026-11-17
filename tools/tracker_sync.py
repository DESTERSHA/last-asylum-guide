"""Сбор данных сервера 397 из lastasylumtracker.com (API по ключу) в data/tracker/.

Запуск: TRACKER_KEY=... python tools/tracker_sync.py
  каждые 3 часа — рейтинги (топ-100 игроков и альянсов одним запросом), сводка сервера,
  топ-30 альянсов: состав + вступления/выходы — 62 запроса, ~500 в сутки при лимите ключа 1000 (сутки UTC)

Что пишется (всё — обычные файлы сайта, страница server.html читает их сама):
  data/tracker/server.json          сводка сервера + рейтинги (топ-100 игроков и альянсов)
  data/tracker/alliances.json       список альянсов: мощь, участники, мощь по дням
  data/tracker/a/<id>.json          альянс: состав и вся накопленная лента вступлений/выходов
  data/tracker/players.json         все известные игроки (для поиска)
  data/tracker/s/<NN>.json          мощь и убийства игроков по дням (32 файла по остатку id)
Картинки с чужих серверов не берём: на сайте у всех стандартный доктор.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SID = 397
API = "https://lastasylumtracker.com/api"
OUT = Path(__file__).resolve().parent.parent / "data" / "tracker"
TOP = 30
MAX_REQ = 140
PLAYERS_PER_RUN = 30  # история игроков: по 30 за запуск, сначала самые сильные  # предохранитель на один запуск
KEY = os.environ.get("TRACKER_KEY", "").strip()
used = 0


def get(path):
    global used
    if used >= MAX_REQ:
        raise RuntimeError("достигнут предохранитель запросов")
    for attempt in range(4):
        used += 1
        req = urllib.request.Request(API + path, headers={"Authorization": f"Bearer {KEY}", "User-Agent": "la397-guide/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print("429 — лимит, останавливаюсь", file=sys.stderr)
                raise
            if e.code >= 500 and attempt < 3:
                time.sleep(10 * (attempt + 1)); continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if attempt < 3:
                time.sleep(10 * (attempt + 1)); continue
            raise
        finally:
            time.sleep(1.2)


def load(p, default):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save(p, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    if not KEY:
        sys.exit("нет TRACKER_KEY")
    now = time.time()
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    cat = get(f"/servers/catalog/{SID}")
    ranks = get(f"/servers/catalog/{SID}/ranks")
    boards = []
    for b in ranks.get("boards", []):
        boards.append({"slug": b["slug"], "alliance": b["alliance"], "pulled_at": b.get("pulled_at"),
                       "rows": [{"rank": r["rank"], "id": r["id"], "name": r["name"], "abbr": r.get("abbr", ""), "score": int(float(r["score"] or 0))} for r in b["rows"]]})
    save(OUT / "server.json", {"updated": now, "server": {k: cat.get(k) for k in ("sid", "age_days", "open_time_ms", "players", "alliances", "power", "king_name", "union_name", "union_abbr", "migration_open")}, "boards": boards})

    top = next((b for b in boards if b["slug"] == "alliance_power"), {"rows": []})["rows"][:TOP]
    index = load(OUT / "alliances.json", {"alliances": {}})
    players = load(OUT / "players.json", {"players": {}})["players"]
    series = {}
    live_ids = []

    for row in top:
        aid = row["id"]
        try:
            a = get(f"/alliances/{aid}")
            ev = get(f"/alliances/{aid}/events?limit=40")
        except Exception as e:  # один альянс не должен ронять весь сбор
            print("альянс", aid, "пропущен:", e, file=sys.stderr)
            continue
        a["name"] = a.get("name") or row["name"]; a["abbr"] = a.get("abbr") or row["abbr"]  # трекер иногда не присылает название — берём из рейтинга
        # в ответе бывают «хвосты» со сканов карты: без ранга и без статуса «в сети» — это не участники
        a["members"] = [m for m in a.get("members", []) if m.get("rank_label")]
        mem = [{"uid": m["uid"], "nick": m.get("nick_name", ""), "power": m.get("power", 0), "lv": m.get("lv", 0), "kills": m.get("kills", 0),
                "rank": m.get("rank_label", ""), "x": m.get("x"), "y": m.get("y"), "active": m.get("active"), "honor": m.get("daily_honor"), "tech": m.get("daily_tech")}
               for m in a.get("members", [])]
        old = load(OUT / "a" / f"{aid}.json", {"events": []})
        stale = not a.get("live")
        if stale and old.get("live"):  # у трекера старая копия, а у нас есть свежий состав — состав и цифры не трогаем
            mem = old["members"]
            for k_new, k_old in (("leader_name", "leader"), ("capacity", "capacity"), ("level", "level")):
                a[k_new] = old.get(k_old)
            a["member_count"] = len(mem); a["live"] = True; a["power"] = old.get("power")
        elif stale:
            mem = []  # свежего состава ещё не было ни разу — не показываем устаревший
        seen = {(e["t"], e["uid"], e["kind"]) for e in old.get("events", [])}
        events = list(old.get("events", []))
        for e in ev.get("events", []):
            k = (e["t"], e["uid"], e["kind"])
            if k in seen:
                continue
            seen.add(k)
            events.append({"t": e["t"], "kind": e["kind"], "uid": e["uid"], "nick": e.get("nick_then") or e.get("nick_name", ""), "power": e.get("power"),
                           "from": e.get("other_abbr", ""), "now": e.get("now_abbr", "")})
        events.sort(key=lambda e: -e["t"])
        save(OUT / "a" / f"{aid}.json", {"updated": now, "id": aid, "name": a.get("name"), "abbr": a.get("abbr"), "power": a.get("power"), "level": a.get("level"),
                                         "members_count": len(mem) if mem else None, "capacity": a.get("capacity"), "leader": a.get("leader_name"), "language": a.get("language"),
                                         "summary": ev.get("summary"), "live": bool(a.get("live")), "members": sorted(mem, key=lambda m: -(m["power"] or 0)), "events": events})
        ent = index["alliances"].get(str(aid), {"days": {}})
        if datetime.now(timezone.utc).hour < 3 or not ent.get("hist"):
            try:
                h = get(f"/alliances/{aid}/history")
                ent["hist"] = {datetime.fromtimestamp(d["day"], timezone.utc).strftime("%Y-%m-%d"): {"power": d.get("might"), "members": d.get("members"), "joined": d.get("joined"), "left": d.get("left")} for d in h.get("days", [])}
            except Exception as e:
                print("история альянса", aid, "пропущена:", e, file=sys.stderr)
        ent.update({"id": aid, "name": a.get("name"), "abbr": a.get("abbr"), "power": a.get("power"), "members": a.get("member_count"), "capacity": a.get("capacity"),
                    "leader": a.get("leader_name"), "rank": row["rank"], "updated": now})
        ent["days"][day] = a.get("power")
        index["alliances"][str(aid)] = ent
        if mem:
            live_ids.append(aid)
        for m in mem:
            players[str(m["uid"])] = {"nick": m["nick"], "aid": aid, "abbr": a.get("abbr"), "power": m["power"], "lv": m["lv"], "kills": m["kills"], "rank": m["rank"], "seen": now}
            series.setdefault(m["uid"] % 32, {})[str(m["uid"])] = [m["power"], m["kills"]]

    # игроки, которых больше нет ни в одном из собранных альянсов, — помечаем «без альянса», если они были в обработанном альянсе
    done = set(live_ids)  # «вышел» ставим только по альянсам, у которых есть свежий состав
    for uid, p in players.items():
        if p.get("aid") in done and p.get("seen", 0) < now - 1:
            p.update({"aid": 0, "abbr": ""})

    # история игроков: по очереди, сначала самые сильные; кому уже взяли — повторно через 7 дней
    qpath = OUT / "hist_done.json"
    done_at = load(qpath, {})
    order = sorted(players.items(), key=lambda kv: -(kv[1].get("power") or 0))
    todo = [uid for uid, p in order if p.get("aid") and now - done_at.get(uid, 0) > 7 * 86400][:PLAYERS_PER_RUN]
    for uid in todo:
        try:
            pl = get(f"/players/{uid}")
        except Exception as e:
            print("игрок", uid, "пропущен:", e, file=sys.stderr)
            continue
        if uid in players and pl.get("power"):  # личная карточка свежее данных альянса
            players[uid].update({"power": pl.get("power"), "lv": pl.get("level") or players[uid].get("lv"), "kills": pl.get("kills"), "nick": pl.get("nick") or players[uid]["nick"]})
        for hrec in pl.get("history", []):
            d = datetime.fromtimestamp(hrec["observed_at"], timezone.utc).strftime("%Y-%m-%d")
            series.setdefault(int(uid) % 32, {}).setdefault("__hist__" + uid, {})[d] = [hrec.get("power"), hrec.get("kills")]
        done_at[uid] = now
    save(qpath, done_at)

    index["updated"] = now
    save(OUT / "alliances.json", index)
    save(OUT / "players.json", {"updated": now, "players": players})
    for shard, vals in series.items():
        p = OUT / "s" / f"{shard:02d}.json"
        s = load(p, {})
        for uid, v in vals.items():
            if uid.startswith("__hist__"):
                rec = s.setdefault(uid[8:], {})
                for d, pk in v.items():
                    rec.setdefault(d, pk)  # из истории трекера — не затираем наши снимки
            else:
                s.setdefault(uid, {})[day] = list(v)
        save(p, s)
    print(f"готово: альянсов {len(top)}, игроков в базе {len(players)}, запросов {used}")


if __name__ == "__main__":
    main()
