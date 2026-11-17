"""Данные калькулятора снаряжения из таблиц игры -> data/gear.json.
Источник: D:/la-game-files/basedata_json (расшифрованные таблицы) + русские тексты D:/la-game-files/gamedata_bin."""
import json
import re
from pathlib import Path

BD = Path("D:/la-game-files/basedata_json")
TX = Path("D:/la-game-files/gamedata_bin")
OUT = Path(__file__).resolve().parent.parent / "data" / "gear.json"


def table(name):
    t = json.loads((BD / f"{name}.json").read_text(encoding="utf-8"))
    data = {k: {**v, "id": v.get("id", int(k) if str(k).isdigit() else k)} for k, v in t["data"].items()}
    if t.get("isNeedTransform"):  # недостающие поля строки берутся из строки-образца first
        base = data.get(str(t["first"]), {})
        data = {k: {**base, **v} for k, v in data.items()}
    return data


# русские названия предметов и характеристик
NAMES = {}
for f in TX.glob("basedb_f_ru__*.bin"):
    s = f.read_text(encoding="utf-8", errors="ignore")
    for m in re.finditer(r'\["id"\] = "?([^",]+)"?,\s*\["name"\] = "([^"]*)"', s):
        NAMES.setdefault(m.group(1), m.group(2))
NAMES = {k: v.replace(" (Привязанный)", "") for k, v in NAMES.items()}
RES = {3: "Трава", 1100008: "Камень снаряжения"}
# названия характеристик — строго из таблицы характеристик игры (номера пересекаются с номерами предметов)
BEN = {m.group(1): m.group(2) for m in re.finditer(r'\["id"\] = (\d+),\s*\["name"\] = "([^"]*)"', (TX / "basedb_f_ru__DefineBenefit.bin").read_text(encoding="utf-8", errors="ignore"))}


def res_list(cost):
    out = []
    for c in (cost.values() if isinstance(cost, dict) else cost or []):
        t, cid, n = c.get("type"), c.get("id"), c.get("count", 0)
        if t == 99:
            name = NAMES.get(cid, cid)
        elif t == 1100008:  # группа особых ресурсов снаряжения: 1 — камень, 2 — чертёж UR, 3 — чертёж MR
            name = {"1": "Камень снаряжения", "2": "Чертеж снаряжения (UR)", "3": "Чертеж снаряжения (MR)"}.get(str(cid), f"ресурс снаряжения {cid}")
        else:
            name = RES.get(t, NAMES.get(str(t), f"ресурс {t}"))
        out.append([name, n])
    return out


def stats(benefits):
    return [[BEN.get(str(b["Type"]), str(b["Type"])), b["Value"]] for b in benefits or []]


base = table("EquipmentBase")
strg = table("EquipmentStrengthen")
promo = table("EquipmentPromotion")
QUAL = {5: "UR", 4: "SSR", 3: "SR", 2: "R", 6: "MR"}
SLOT = {1: "Оружие", 2: "Броня", 3: "Наручи", 4: "Сапоги"}
items = []
for bid, b in sorted(base.items()):
    bid = int(bid)
    q = b.get("quality") or (bid // 100) % 10
    slot = bid % 100
    lv = sorted((v for v in strg.values() if v.get("equipBaseId", int(v["id"]) // 1000) == bid), key=lambda v: v.get("equipLv", 0))
    if not lv:
        continue
    levels = [{"lv": v.get("equipLv", 0), "cost": res_list(v.get("cost")), "stats": stats(v.get("equipBenefit")), "power": round(v.get("ability", 0)),
               "promo": v.get("promotionLvLimit")} for v in lv]
    # продвижение: строки 00 (исходное), 01..04, 10, 11..14, … 40, 50 (MR). Шаг = переход к следующей строке.
    # цена шага = разница накопленного «возврата» (reward) соседних строк; у последнего шага (возврата нет) — его поле cost
    pr = sorted((v for v in promo.values() if int(v["id"]) // 100 == bid), key=lambda v: int(v["id"]))
    steps, prev = [], None
    for v in pr:
        code = int(v["id"]) % 100
        cur = {n: c for n, c in res_list(v.get("reward"))}
        if prev is not None:
            if cur:
                cost = [[n, c - prev.get(n, 0)] for n, c in cur.items() if c - prev.get(n, 0) > 0]
            else:
                cost = res_list(v.get("cost"))
            steps.append({"to": f"{code // 10}.{code % 10}", "lvLimit": v.get("lvLimit"), "cost": cost,
                          "stats": stats(v.get("equipBenefit")), "extra": stats(v.get("equipAdditionalBenefit")), "power": round(v.get("ability", 0))})
        prev = cur if (cur or prev is None) else prev  # исходная строка 0.0 — нулевой «возврат»
    items.append({"id": bid, "q": QUAL.get(q, str(q)), "slot": SLOT.get(slot, str(slot)), "name": f'{ {1: "Меч", 2: "Броня", 3: "Наручи", 4: "Сапоги"}.get(slot, "?") } ({QUAL.get(q, q)})',
                  "icon": f"icon_equip_buwei{slot}_{q}", "craft": {"cost": res_list(b.get("cost")), "time": b.get("costTime"), "building": b.get("unlockBuildingLevel")},
                  "levels": levels, "promotion": steps})
OUT.write_text(json.dumps({"items": items}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("предметов:", len(items), {q: sum(1 for i in items if i["q"] == q) for q in ("UR", "SSR", "SR", "R")})
ur = next(i for i in items if i["q"] == "UR" and i["slot"] == "Оружие")
print("UR оружие:", ur["name"], "| уровней", len(ur["levels"]), "| ступеней продвижения", len(ur["promotion"]))
tot = {}
for l in ur["levels"][1:]:
    for n, c in l["cost"]:
        tot[n] = tot.get(n, 0) + c
print("усиление 0→60:", tot, "| мощь на 60:", ur["levels"][-1]["power"])
pt = {}
for s in ur["promotion"]:
    for n, c in s["cost"]:
        pt[n] = pt.get(n, 0) + c
print("продвижение полностью:", pt)
