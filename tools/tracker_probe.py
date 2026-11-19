"""Разовая проверка: что трекер отдаёт ПРЯМО СЕЙЧАС по альянсу и игроку (только время и цифры; ключ и адрес не печатаются).
Запуск — workflow «Проверка трекера» (вручную). 3 запроса."""
import json
import os
import sys
import time
import urllib.request

KEY, API = os.environ["TRACKER_KEY"], os.environ["TRACKER_API"].rstrip("/")
AID, UID = os.environ.get("AID", "67181437"), os.environ.get("UID", "440569528717")


def get(path):
    req = urllib.request.Request(API + path, headers={"Authorization": f"Bearer {KEY}", "User-Agent": "la397-guide/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def ts(v):
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        t = v / 1000 if v > 1e12 else v
        if 1.6e9 < t < 2.2e9:
            return time.strftime("%d.%m %H:%M:%S UTC", time.gmtime(t)) + f"  ({round((time.time() - t) / 60)} мин назад)"
    if isinstance(v, str) and len(v) >= 19 and v[4] == "-" and "T" in v:
        return v
    return None


def times(d, pre=""):
    out = []
    if isinstance(d, dict):
        for k, v in d.items():
            if isinstance(v, (dict, list)):
                if isinstance(v, dict):
                    out += times(v, pre + k + ".")
                continue
            t = ts(v)
            if t:
                out.append(f"{pre}{k} = {t}")
    return out


print("сейчас:", time.strftime("%d.%m %H:%M:%S UTC", time.gmtime()))
a = get(f"/alliances/{AID}")
print("\n=== альянс", a.get("abbr"), a.get("name"), "— поля времени:")
print("\n".join(times(a)) or "нет")
m = [x for x in (a.get("members") or []) if str(x.get("id") or x.get("uid") or x.get("player_id")) == UID]
print("участников:", len(a.get("members") or []))
print("игрок в составе альянса:", json.dumps(m[0] if m else None, ensure_ascii=False))
ms = a.get("members") or []
if ms:
    lt = sorted([v for x in ms for k, v in x.items() if ts(v) and isinstance(v, (int, float))], reverse=True)[:3]
    print("самые свежие отметки времени у участников:", [ts(v) for v in lt])
p = get(f"/players/{UID}")
print("\n=== игрок — поля времени:")
print("\n".join(times(p)) or "нет")
print("игрок (основное):", json.dumps({k: p.get(k) for k in ("name", "nick", "power", "level", "kills", "alliance_abbr", "updated_at", "last_seen_at", "map_updated_at")}, ensure_ascii=False))
c = get(f"/servers/catalog/{os.environ.get('SID', '397')}")
print("\n=== сервер — поля времени:")
print("\n".join(times(c)) or "нет")
sys.stdout.flush()
