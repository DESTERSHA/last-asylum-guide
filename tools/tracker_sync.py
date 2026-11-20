"""Сбор данных сервера 397 (API по ключу) в data/tracker/. Адрес API и ключ — в закрытых настройках хранилища.

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
import http.client
from datetime import datetime, timezone
from pathlib import Path

SID = 397
API = os.environ.get("TRACKER_API", "").strip().lstrip("﻿").strip().rstrip("/")
OUT = Path(__file__).resolve().parent.parent / "data" / "tracker"
# закрытое хранилище (отдельный закрытый репозиторий): лента «кто вступил/вышел, откуда и куда», полные ответы API.
# В открытые файлы сайта это НЕ пишется — функция платная, на сайте только демо.
PRIV = Path(os.environ["PRIVATE_DIR"]) if os.environ.get("PRIVATE_DIR") else None
UNION_KEYS = ("union_id", "union_abbr", "union_name", "alliance_abbr", "alliance_name")
TOP = 30
MAX_REQ = 95 + 2 * int(os.environ.get("PLAYERS") or 60)  # на игрока до 2 запросов: карточка + защита/ворон (защита — раз в 20 ч)
PLAYERS_PER_RUN = int(os.environ.get("PLAYERS") or 60)  # карточки игроков за запуск: [SLAV] (≈110) раз в 1,5 ч ≈ 37 за запуск + очередь остальных
HOME_AID = 67181437   # [SLAV] — их карточки берём первыми
KEY = os.environ.get("TRACKER_KEY", "").strip()
used = 0
blocked = False  # лимит ключа исчерпан — дальше не спрашиваем


def get(path):
    global used, blocked
    if blocked:
        raise RuntimeError("лимит ключа исчерпан")
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
                blocked = True
                raise
            if e.code >= 500 and attempt < 3:
                time.sleep(10 * (attempt + 1)); continue
            raise
        except (urllib.error.URLError, TimeoutError, http.client.IncompleteRead, ConnectionError, json.JSONDecodeError):
            # обрыв связи или недочитанный/битый ответ трекера — повторяем, а не роняем весь сбор
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


# Обновить альянс «сейчас» трекер через API не даёт (ответ 403 «Refresh only from the site», проверено 19.11.2026).
# Но его страница альянса при КАЖДОМ открытии сама шлёт «обнови» (POST /api/alliances/<id>/refresh) — трекер за секунды
# забирает из игры окно альянса с рангами (проверено 20.11: FaZe до открытия 0 рангов, после — 93 из 93; CHA без открытия — 0).
# Поэтому перед полным сбором робот открывает страницы альянсов настоящим браузером — как посетитель (refresh_on_site).


def refresh_on_site(ids):
    """Открыть страницы альянсов на сайте трекера (как посетитель): трекер сам обновит окно альянса с рангами.
    Картинки, шрифты и аналитику не грузим — меньше нагрузка на трекер. Повторное обновление трекер сам не чаще раза в 10 мин."""
    if not ids:
        return
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        if not os.environ.get("GITHUB_ACTIONS"):
            print("страницы трекера: нет playwright — пропускаю", file=sys.stderr)
            return
        import subprocess
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "playwright==1.49.1"], check=True)
            subprocess.run([sys.executable, "-m", "playwright", "install", "--with-deps", "chromium"], check=True,
                           stdout=subprocess.DEVNULL)
            from playwright.sync_api import sync_playwright
        except Exception as e:
            print("страницы трекера: не удалось поставить браузер:", e, file=sys.stderr)
            return
    site = "https://lastasylumtracker.com"
    got = []
    try:
        with sync_playwright() as p:
            br = p.chromium.launch()
            ctx = br.new_context(locale="ru-RU", viewport={"width": 1280, "height": 900})
            ctx.route("**/*", lambda route: route.abort() if route.request.resource_type in ("image", "media", "font")
                      or "google-analytics" in route.request.url or "googletagmanager" in route.request.url else route.continue_())
            page = ctx.new_page()
            for aid in ids:
                st = {"ref": None, "ref_t": 0, "live": None, "live0": None}

                def on_resp(r, aid=aid, st=st):
                    u = r.url.split("?")[0]
                    try:
                        if u.endswith(f"/api/alliances/{aid}/refresh") and r.request.method == "POST":
                            st["ref"] = r.status; st["ref_t"] = time.time()
                        elif u.endswith(f"/api/alliances/{aid}") and r.request.method == "GET" and r.status == 200:
                            st["live" if st["ref"] is not None else "live0"] = bool(r.json().get("live"))  # после «обнови» / до
                    except Exception as e:  # ответ не JSON / страница ушла — не роняем обход
                        print("страницы трекера: ответ", aid, e, file=sys.stderr)
                page.on("response", on_resp)
                try:
                    page.goto(f"{site}/alliance/{aid}", wait_until="domcontentloaded", timeout=45000)
                    t0 = time.time()
                    # ждём свежие данные после «обнови»; если трекер не обновлял (обновлял <10 мин назад) — не дольше 20 с
                    while time.time() - t0 < 45 and not st["live"] and not (st["ref"] is not None and time.time() - st["ref_t"] > 20):
                        page.wait_for_timeout(1000)
                    if st["live"] is None:
                        st["live"] = st["live0"]
                except Exception as e:
                    print("страницы трекера: альянс", aid, "не открылся:", str(e).splitlines()[0], file=sys.stderr)
                page.remove_listener("response", on_resp)
                print(f"  страница альянса {aid}: обновление {st['ref']}, окно с рангами {'есть' if st['live'] else 'НЕТ'}")
                if st["live"]:
                    got.append(aid)
                time.sleep(1)
            br.close()
    except Exception as e:
        print("страницы трекера: браузер упал:", e, file=sys.stderr)
    print(f"страницы трекера: открыто {len(ids)}, окно с рангами у {len(got)}")


def probe_sig(a):
    """Отпечаток нашего альянса у трекера: меняется, когда трекер подтянул новые цифры участников или окно альянса."""
    m = a.get("members") or []
    return [a.get("updated_at"), len(m), sum(x.get("power") or 0 for x in m), sum(x.get("kills") or 0 for x in m),
            max([x.get("map_updated_at") or x.get("last_seen_at") or 0 for x in m] or [0])]


def main():
    if not KEY or not API:
        sys.exit("нет TRACKER_KEY или TRACKER_API")
    now = time.time()
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    prev = load(OUT / "server.json", {})
    last = prev.get("updated", 0)
    force = bool(os.environ.get("FORCE"))
    mode = os.environ.get("MODE") or "timer"
    # Трекер обновляет карту не по часам, а раз в 2–3 ч в разное время (19.11: 15:10, 18:29, 21:08, 23:23 МСК).
    # Таймер будит робота каждые 10 мин: робот одним запросом смотрит наш альянс — изменился ли он у трекера.
    # Изменился — сразу полный сбор; нет — выходим. Полный сбор в любом случае не реже раза в 30 мин.
    # Запасное расписание (schedule) — только если полного сбора не было больше 40 мин.
    if not force:
        if mode == "schedule":
            if now - last < 40 * 60:
                print(f"запасное расписание: полный сбор был {round((now - last) / 60)} мин назад — не нужно")
                return
        elif now - last < 28 * 60:
            try:
                sig = probe_sig(get(f"/alliances/{HOME_AID}"))
            except Exception as e:
                print("проверка свежести не удалась:", e, "— делаю полный сбор", file=sys.stderr)
                sig = None
            if sig is not None and sig == prev.get("probe"):
                print(f"у трекера нового нет (полный сбор был {round((now - last) / 60)} мин назад)")
                save(OUT / "checked.json", {"t": now})  # время проверки — на сайте «проверено N мин назад» (а не время последних изменений)
                if not roster_pushed_ok():
                    push_roster()  # прошлая отправка составов не прошла (или ещё не было) — из уже сохранённых файлов, без запросов к трекеру
                return
            print("у трекера новые данные — полный сбор")

    cat = get(f"/servers/catalog/{SID}")
    ranks = get(f"/servers/catalog/{SID}/ranks")
    boards = []
    for b in ranks.get("boards", []):
        boards.append({"slug": b["slug"], "alliance": b["alliance"], "pulled_at": b.get("pulled_at"),
                       "rows": [{"rank": r["rank"], "id": r["id"], "name": r["name"], "abbr": r.get("abbr", ""), "score": int(float(r["score"] or 0))} for r in b["rows"]]})
    save(OUT / "server.json", {"updated": now, "server": {k: cat.get(k) for k in ("sid", "age_days", "open_time_ms", "players", "alliances", "power", "king_name", "union_name", "union_abbr", "migration_open")}, "boards": boards})

    top = next((b for b in boards if b["slug"] == "alliance_power"), {"rows": []})["rows"][:TOP]
    refresh_on_site([r["id"] for r in top])  # как посетитель: трекер подтянет из игры окна альянсов с рангами
    index =load(OUT / "alliances.json", {"alliances": {}})
    players = load(OUT / "players.json", {"players": {}})["players"]
    series = {}
    live_ids = []
    home_probe = None
    moves_all = []  # вступления/выходы — для подписчиков, уходят в закрытую базу (push_moves)

    for row in top:
        aid = row["id"]
        try:
            a = get(f"/alliances/{aid}")
            if aid == HOME_AID:
                home_probe = probe_sig(a)  # отпечаток — для быстрой проверки «есть ли у трекера новое»
            ev = get(f"/alliances/{aid}/events?limit=40")
        except Exception as e:  # один альянс не должен ронять весь сбор
            print("альянс", aid, "пропущен:", e, file=sys.stderr)
            continue
        if PRIV:
            save(PRIV / "a" / f"{aid}.raw.json", {"t": now, "alliance": a, "events": ev})  # ответы API целиком, без отбора
        a = json.loads(json.dumps(a))
        a["name"] = a.get("name") or row["name"]; a["abbr"] = a.get("abbr") or row["abbr"]  # API иногда не присылает название — берём из рейтинга
        raw_members = list(a.get("members", []))
        # с рангами — состав из окна альянса; без рангов — игроки, замеченные на карте с тегом альянса
        a["members"] = [m for m in raw_members if m.get("rank_label")]
        mem = [{"uid": m["uid"], "nick": m.get("nick_name", ""), "power": m.get("power", 0), "lv": m.get("lv", 0), "kills": m.get("kills", 0),
                "rank": m.get("rank_label", ""), "x": m.get("x"), "y": m.get("y"), "active": m.get("active"), "honor": m.get("daily_honor"), "tech": m.get("daily_tech")}
               for m in a.get("members", [])]
        old = load(OUT / "a" / f"{aid}.json", {})
        old_ev = load(PRIV / "a" / f"{aid}.json", {"events": []}) if PRIV else {"events": []}
        stale = not a.get("live")
        roster, roster_t = "live", a.get("updated_at") or now
        # состав по карте: игроки с тегом альянса, которых видели за последние 3 дня (ушедшие отсеиваются), не больше вместимости
        def seen_t(m):
            return m.get("map_updated_at") or m.get("last_seen_at") or 0
        # Как у трекера (её требование 19.11 «бери как у трекера, своё не выдумывай»): есть окно альянса — его состав;
        # окна нет — ВЕСЬ список, который трекер показывает (у Greg трекер пишет «Участники 169» и перечисляет всех 169).
        # До 19.11 здесь было своё правило: только замеченные за 3 дня и не больше вместимости, и переход на карту, если окну > 3 дней.
        mapped = sorted([m for m in raw_members if not m.get("rank_label")], key=lambda m: -(m.get("power") or 0))
        kept = False  # True — трекер состав не прислал, показываем прошлый
        if stale and mapped:
            # рангов у трекера в таком списке нет (на его сайте «—») — и у нас не подставляем старые
            mem = [{"uid": m["uid"], "nick": m.get("nick_name") or m.get("nick", ""), "power": m.get("power", 0), "lv": m.get("lv") or m.get("level", 0), "kills": m.get("kills", 0),
                    "rank": "", "x": m.get("x"), "y": m.get("y"), "vip": m.get("vip"), "seen": seen_t(m)} for m in mapped]
            roster, roster_t = "map", max(seen_t(m) for m in mapped) or now
            a["member_count"] = len(mem)
        elif stale and old.get("members"):  # карты нет — оставляем прошлый состав с его датой
            kept = True
            mem = old["members"]; roster = old.get("roster", "live"); roster_t = old.get("roster_t") or old.get("updated")
            for k_new, k_old in (("leader_name", "leader"), ("capacity", "capacity"), ("level", "level")):
                a[k_new] = old.get(k_old)
            a["member_count"] = len(mem)
        elif stale:
            mem = []
        seen = {(e["t"], e["uid"], e["kind"]) for e in old_ev.get("events", [])}
        events = list(old_ev.get("events", []))
        for e in ev.get("events", []):
            k = (e["t"], e["uid"], e["kind"])
            if k in seen:
                continue
            seen.add(k)
            events.append({"t": e["t"], "kind": e["kind"], "uid": e["uid"], "nick": e.get("nick_then") or e.get("nick_name", ""), "power": e.get("power"),
                           "from": e.get("other_abbr", ""), "now": e.get("now_abbr", "")})
        events.sort(key=lambda e: -e["t"])
        # Когда трекер снял цифры участника. У состава по карте — дата, когда игрока видели.
        # У окна альянса дата (updated_at) — это дата самого окна: трекер обновляет его редко, но цифры участников
        # подтягивает с карты каждые ~30 мин (у [SLAV] сумма мощи менялась при одной и той же дате 16:29, проверено 19.11).
        # Поэтому время цифры = когда робот впервые увидел её изменившейся; в первый раз — дата окна (осторожно).
        obs = {}
        for m in mem:
            u = str(m["uid"]); pp0 = players.get(u, {})
            if roster == "map":
                obs[u] = m.get("seen") or roster_t or 0
            elif kept:
                obs[u] = roster_t or 0
            else:
                sig = [m.get("power"), m.get("kills"), m.get("lv"), m.get("x"), m.get("y")]
                if pp0.get("rsig") is None:
                    t0 = roster_t
                elif pp0.get("rsig") != sig:
                    t0 = now
                else:
                    t0 = pp0.get("rt") or roster_t
                obs[u] = max(t0 or 0, roster_t or 0)
                players.setdefault(u, {}).update({"rsig": sig, "rt": obs[u]})
        fresh_t = max(obs.values()) if obs else roster_t
        save(OUT / "a" / f"{aid}.json", {"updated": now, "fresh_t": fresh_t, "id": aid, "name": a.get("name"), "abbr": a.get("abbr"), "power": a.get("power"), "level": a.get("level"),
                                         "members_count": len(mem) if mem else None, "capacity": a.get("capacity"), "leader": a.get("leader_name"), "language": a.get("language"),
                                         "summary": ev.get("summary"), "live": bool(mem), "roster": roster, "roster_t": roster_t, "members": sorted(mem, key=lambda m: -(m["power"] or 0))})  # без ленты — она в закрытом хранилище
        if PRIV:
            save(PRIV / "a" / f"{aid}.json", {"updated": now, "id": aid, "abbr": a.get("abbr"), "events": events})
        moves_all.extend({"al_id": aid, "al_abbr": a.get("abbr"), "t": e["t"], "kind": e["kind"], "uid": e["uid"], "nick": e.get("nick"),
                          "power": e.get("power"), "from_abbr": e.get("from") or "", "now_abbr": e.get("now") or ""} for e in events)
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
            pp = players.setdefault(str(m["uid"]), {})
            src_t = obs.get(str(m["uid"]), 0)  # когда трекер снял эти цифры (см. выше)
            pp.update({"nick": m["nick"], "aid": aid, "abbr": a.get("abbr"), "rank": m["rank"], "seen": now,
                       "active": m.get("active"), "honor": m.get("honor"), "tech": m.get("tech")})
            # мощь/убийства/город — только если они не старее того, что уже есть (личная карточка бывает свежее состава альянса)
            if src_t >= (pp.get("dt") or pp.get("last") or 0):  # "last" — дата из прошлой карточки, пока "dt" не записан
                pp.update({"power": m["power"], "lv": m["lv"], "kills": m["kills"], "x": m.get("x"), "y": m.get("y"), "dt": src_t,
                           **({"vip": m["vip"]} if m.get("vip") is not None else {})})
            series.setdefault(m["uid"] % 32, {})[str(m["uid"])] = [pp.get("power"), pp.get("kills")]

    # Составы альянсов — ровно как у трекера. (До 19.11 здесь было своё правило «игрок в двух альянсах — оставить, где видели позже»:
    # оно уносило из [SLAV] двоих, которых трекер показывает в SLAV, — у нас было 97 вместо 99. Убрано по её требованию: брать как у трекера.)
    # игроки топ-100, которых нет в составах топ-30 — тоже в базу (чтобы открывались и получили полные данные)
    for b in boards:
        if b["alliance"]:
            continue
        for r in b["rows"]:
            u = str(r["id"])
            if u not in players:
                players[u] = {"nick": r["name"], "aid": 0, "abbr": r.get("abbr", ""), "top": True, "seen": now}
            elif not players[u].get("aid"):
                players[u]["top"] = True
            # рейтинг трекер обновляет раз в сутки: берём из него цифру, только если она свежее той, что уже есть
            # (нужно игрокам вне топ-30 альянсов — их карточка обновляется раз в неделю)
            fld = {"power": "power", "kills": "kills", "castle": "lv"}.get(b["slug"])
            pp = players[u]
            if fld and r.get("score") and (b.get("pulled_at") or 0) > (pp.get("dt") or pp.get("last") or 0):
                pp[fld] = r["score"]
    # игроки, которых больше нет ни в одном из собранных альянсов, — помечаем «без альянса», если они были в обработанном альянсе
    done = set(live_ids)  # «вышел» ставим только по альянсам, у которых есть свежий состав
    in_al = set()  # все, кто есть в составе хоть одного собранного альянса
    for row in top:
        af = load(OUT / "a" / f"{row['id']}.json", None) or {}
        in_al.update(str(m["uid"]) for m in af.get("members") or [])
    for uid, p in players.items():
        if p.get("aid") in done and p.get("seen", 0) < now - 1 and str(uid) not in in_al:
            p.update({"aid": 0, "abbr": ""})

    # история игроков: по очереди, сначала самые сильные; кому уже взяли — повторно через 7 дней
    qpath = OUT / "hist_done3.json"  # 3 — новая очередь: карточка + отряды + защитный состав + ворон с обликом
    done_at = load(qpath, {})
    # первыми — игроки нашего альянса [SLAV], потом остальные по мощи
    order = sorted(players.items(), key=lambda kv: (kv[1].get("aid") != HOME_AID, -(kv[1].get("power") or 0)))
    details = {}
    # очередь: 0) ещё ни разу не брали; 1) [SLAV] — раз в 1,5 часа (трекер сам записывает игрока раз в 2–6 ч);
    # 2) в API не было VIP/лайков/пола — раз в 3 дня; 3) остальные — раз в 7 дней.
    # Защитный состав и ворона перезапрашиваем не чаще раза в 20 ч — они меняются редко, а это лишний запрос.
    def due(uid, p):
        if not p.get("aid") and not p.get("top"):
            return None
        age = now - done_at.get(uid, 0)
        if uid not in done_at:
            return 0
        if p.get("aid") == HOME_AID and age > 90 * 60:
            return 1
        # цифрам игрока больше суток (у альянса трекер давно не обновлял состав — бывает по 26 дней) — карточка раз в сутки
        if now - (p.get("dt") or p.get("last") or 0) > 86400 and age > 20 * 3600:
            return 2
        if p.get("vip") is None and age > 3 * 86400:
            return 3
        if age > 7 * 86400:
            return 4
        return None
    todo = [t[2] for t in sorted((due(u, p), i, u) for i, (u, p) in enumerate(order) if due(u, p) is not None)][:PLAYERS_PER_RUN]
    for uid in todo:
        try:
            pl = get(f"/players/{uid}")
        except Exception as e:
            print("игрок", uid, "пропущен:", e, file=sys.stderr)
            continue
        if uid in players and pl.get("power"):
            pp = players[uid]
            if not pp.get("aid"):  # вне альянсов топ-30 — тег альянса из карточки
                pp["abbr"] = pl.get("union_abbr") or ""
            # когда трекер снял цифры карточки
            card_t = max([pl.get("map_updated_at") or 0, pl.get("last_seen_at") or 0] + [h.get("observed_at") or 0 for h in pl.get("history", [])]) or now
            if card_t >= (pp.get("dt") or 0):  # цифры карточки не старее того, что уже есть
                pp.update({"power": pl.get("power"), "lv": pl.get("level") or pp.get("lv"), "kills": pl.get("kills"), "x": pl.get("x"), "y": pl.get("y"), "dt": card_t})
            pp.update({"nick": pl.get("nick") or pp["nick"], "vip": pl.get("vip"), "likes": pl.get("likes"), "lang": pl.get("language"), "gender": pl.get("gender"),
                       "first": pl.get("first_seen_at"), "card": now,
                       "online": pl.get("online"), "last": pl.get("last_seen_at"), "skin": pl.get("skin_name") or None, "shield": pl.get("shielding")})
            pp.pop("log", None)
            pf = OUT / "p" / f"{uid}.json"
            old = load(PRIV / "p" / f"{uid}.json", {}) if PRIV else load(pf, {})
            arena = None
            if not old.get("arena_t") or now - old["arena_t"] > 20 * 3600:
                try:  # защитный состав и ворон — отдельный адрес API
                    arena = get(f"/players/{uid}/arena")
                except Exception as e:
                    print("защита игрока", uid, "пропущена:", e, file=sys.stderr)
            # история в API — последние 30 дней; у нас копится вся
            hist = {str(h.get("id") or h["observed_at"]): h for h in old.get("history", [])}
            for h in pl.get("history", []):
                hist[str(h.get("id") or h["observed_at"])] = h
            card = {k: v for k, v in pl.items() if k != "alliance_members"}  # список альянса целиком лежит в a/<id>.raw.json
            rec = {"t": now, "card": card, "arena": arena if arena is not None else old.get("arena"),
                   "arena_t": now if arena is not None else old.get("arena_t"),
                   "history": sorted(hist.values(), key=lambda h: h["observed_at"])}
            if PRIV:
                save(PRIV / "p" / f"{uid}.json", rec)  # полный ответ — в закрытое хранилище
            # в открытый файл — без сведений о смене альянса (это платная часть)
            pub_hist = [{k: v for k, v in h.items() if k not in UNION_KEYS} for h in rec["history"]]
            for h in pub_hist:
                h["change_flags"] = ",".join(f for f in str(h.get("change_flags") or "").split(",") if f and f != "union")
            save(pf, {"t": now, "card": {k: v for k, v in card.items() if k != "history"}, "arena": rec["arena"], "arena_t": rec["arena_t"], "history": pub_hist})
        for hrec in sorted(pl.get("history", []), key=lambda h: h["observed_at"]):  # за день — последняя запись дня
            d = datetime.fromtimestamp(hrec["observed_at"], timezone.utc).strftime("%Y-%m-%d")
            series.setdefault(int(uid) % 32, {}).setdefault("__hist__" + uid, {})[d] = [hrec.get("power"), hrec.get("kills")]
        done_at[uid] = now
    save(qpath, done_at)

    for shard, vals in details.items():  # подробности игроков: полная история, защита, ворон
        p = OUT / "x" / f"{shard:02d}.json"
        x = load(p, {})
        x.update(vals)
        save(p, x)
    index["updated"] = now
    save(OUT / "alliances.json", index)
    save(OUT / "players.json", {"updated": now, "players": players})
    save(OUT / "checked.json", {"t": now})
    for shard, vals in series.items():
        p = OUT / "s" / f"{shard:02d}.json"
        s = load(p, {})
        for uid, v in vals.items():
            if uid.startswith("__hist__"):
                rec = s.setdefault(uid[8:], {})
                for d, pk in v.items():
                    if d < day:
                        rec[d] = pk  # прошедший день в API полный — берём его итог дня
                    else:
                        rec.setdefault(d, pk)  # сегодня — не затираем наш свежий снимок
            else:
                s.setdefault(uid, {})[day] = list(v)
        save(p, s)
    sj = load(OUT / "server.json", {})
    sj["probe"] = home_probe
    save(OUT / "server.json", sj)
    push_moves(moves_all)
    push_roster()
    print(f"готово: альянсов {len(top)}, игроков в базе {len(players)}, запросов {used}")


SB_URL = "https://mhicplqgnnvoloyjmhud.supabase.co"
SB_KEY = "sb_publishable_piDd1XwlLrQuLZIVUCi3mw_bSqPRba9"  # публичный ключ сайта; запись проверяет пароль робота внутри базы


def push_moves(moves):
    """Новые вступления/выходы — в закрытую базу подписчиков. Отправляем всё новее (последняя отправка − 3 дня):
    повторы база отбрасывает сама, а сбой одной отправки догоняется следующей."""
    token = os.environ.get("LA_SB_PUSH", "").strip()
    if not token or not PRIV:
        print("платные данные: пароль робота или закрытое хранилище не заданы — пропускаю", file=sys.stderr)
        return
    mark_p = PRIV / "sb_pushed.json"
    mark = load(mark_p, {}).get("t", 0)
    rows = [m for m in moves if m["t"] > mark - 3 * 86400]
    sent = 0
    for i in range(0, len(rows), 500):
        body = json.dumps({"p_token": token, "p_rows": rows[i:i + 500]}).encode("utf-8")
        req = urllib.request.Request(SB_URL + "/rest/v1/rpc/push_moves", data=body, method="POST",
                                     headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                sent += int(json.loads(r.read().decode("utf-8")) or 0)
        except urllib.error.HTTPError as e:
            print("платные данные: база отказала:", e.code, e.read().decode("utf-8", "replace")[:300], file=sys.stderr)
            return
        except (urllib.error.URLError, TimeoutError) as e:
            print("платные данные: нет связи с базой:", e, file=sys.stderr)
            return
    if rows:
        save(mark_p, {"t": max(m["t"] for m in rows)})
    print(f"платные данные: отправлено {len(rows)}, новых в базе {sent}")


def roster_mark():
    return (PRIV or OUT.parent / "_local") / "roster_pushed.json"


ROSTER_V = 3  # версия отправки: поменялась — составы переотправляются при ближайшей проверке
#  2: «R4 · Diplomat» → код R4; 3: ранг целиком как у трекера («R4 · Diplomat») — отдельным полем rank_label


def roster_pushed_ok():
    m = load(roster_mark(), {})
    return bool(m.get("ok")) and m.get("v") == ROSTER_V


def rank_code(s):
    """«R4 · Diplomat» (у R4 трекер пишет должность) → «R4»; пусто/непонятно → ''."""
    s = (s or "").strip()
    return s[:2] if len(s) >= 2 and s[0] == "R" and s[1] in "12345" else ""


def push_roster():
    """Составы топ-30 альянсов (ник, ранг в игре) — в базу сайта: по нику сайт сам находит альянс и ранг человека,
    лидер подтверждает «это наш» (tools/supabase_alliance.sql). Берётся из уже сохранённых файлов data/tracker/a/ —
    ровно то, что показывает трекер, без своих правил."""
    token = os.environ.get("LA_SB_PUSH", "").strip()
    if not token:
        print("составы: пароль робота не задан — пропускаю", file=sys.stderr)
        return
    sj = load(OUT / "server.json", {})
    top = [r["id"] for r in next((b for b in sj.get("boards", []) if b["slug"] == "alliance_power"), {"rows": []})["rows"][:TOP]]
    done, rows = [], []
    for aid in top:
        a = load(OUT / "a" / f"{aid}.json", {})
        mem = a.get("members") or []
        if not mem:
            continue  # состава нет — прошлый в базе не трогаем
        done.append(aid)
        known = a.get("roster") == "live"
        rows.extend({"al_id": aid, "al_abbr": a.get("abbr") or "", "uid": m["uid"], "nick": m.get("nick") or "",
                     "rank": rank_code(m.get("rank")), "rank_label": (m.get("rank") or "").strip() if rank_code(m.get("rank")) else "",
                     "ranks_known": known} for m in mem)
    if not top or not rows:
        print("составы: нечего отправлять", file=sys.stderr)
        return
    body = json.dumps({"p_token": token, "p_done": done, "p_top": top, "p_rows": rows}).encode("utf-8")
    req = urllib.request.Request(SB_URL + "/rest/v1/rpc/push_roster", data=body, method="POST",
                                 headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": "application/json"})
    ok = False
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            n = json.loads(r.read().decode("utf-8") or "0")
        ok = True
        print(f"составы: отправлено {len(rows)} игроков из {len(done)} альянсов, записано {n}")
    except urllib.error.HTTPError as e:
        print("составы: база отказала:", e.code, e.read().decode("utf-8", "replace")[:300], file=sys.stderr)
    except (urllib.error.URLError, TimeoutError) as e:
        print("составы: нет связи с базой:", e, file=sys.stderr)
    save(roster_mark(), {"t": time.time(), "ok": ok, "v": ROSTER_V})


if __name__ == "__main__":
    main()
