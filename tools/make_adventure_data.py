"""«Приключение»: все этапы и доход в простое из таблиц игры -> data/adventure.json.
Этапы — ExploreDungeonSecretChapter (500), противник — SlgMonsterInfo/SlgMonsterAttr, сундук этапа — ExploreDungeonStageReward,
доход каждые 5 минут — ExploreDungeonProduce. Ресурсы: 1 Зерно, 2 Древесина, 3 Трава, 5 Противоядие."""
import json
import re
from pathlib import Path

BD = Path("D:/la-game-files/basedata_json")
TX = Path("D:/la-game-files/gamedata_bin")
OUT = Path(__file__).resolve().parent.parent / "data" / "adventure.json"


def table(n):
    t = json.loads((BD / f"{n}.json").read_text(encoding="utf-8"))
    d = {k: {**v, "id": v.get("id", int(k) if str(k).isdigit() else k)} for k, v in t["data"].items()}
    if t.get("isNeedTransform") and "first" in t:
        base = d.get(str(t["first"]), {})
        d = {k: {**base, **v} for k, v in d.items()}
    return d


NAMES = {}
for f in TX.glob("basedb_f_ru__*.bin"):
    for m in re.finditer(r'\["id"\] = "?([^",]+)"?,\s*\["name"\] = "([^"]*)"', f.read_text(encoding="utf-8", errors="ignore")):
        NAMES.setdefault(m.group(1), m.group(2).replace(" (Привязанный)", ""))
RES = {1: "Зерно", 2: "Древесина", 3: "Трава", 5: "Противоядие"}
SOLD = {9000 + t: f"T{t}" for t in range(1, 11)}


def rew(lst):
    out = []
    for r in (lst.values() if isinstance(lst, dict) else lst or []):
        t = r.get("type")
        out.append([RES.get(t) if t != 99 else NAMES.get(r.get("id"), r.get("id")), r.get("count", 0)])
    return out


ch = table("ExploreDungeonSecretChapter")
mon = table("SlgMonsterInfo")
attr = json.loads((BD / "SlgMonsterAttr.json").read_text(encoding="utf-8"))["data"]
box = table("ExploreDungeonStageReward")
_b0 = box.get("5", {}).get("reward")  # пустые строки таблицы сундуков = как у первой строки (сундук есть каждые 5 этапов)
box = {k: (v if v.get("reward") else {**v, "reward": _b0}) for k, v in box.items()}
prod = table("ExploreDungeonProduce")
stages = []
for k in sorted(ch, key=lambda x: int(x)):
    v = ch[k]
    lv = int(v.get("level") or k)
    m = mon.get(str(v.get("npcBaseId")), {})
    a = attr.get(str(m.get("attrId")), {})
    s = (a.get("soldier") or [{}])[0]
    b = box.get(str(lv * 10 + 0)) or box.get(str(lv))
    stages.append({"n": lv, "power": m.get("recAbility") or a.get("recAbility"), "troop": SOLD.get(s.get("id"), str(s.get("id", ""))), "count": s.get("count"),
                   "hero_lv": (a.get("hero") or [{}])[0].get("level"), "reward": rew(v.get("reward")),
                   "chest": rew(box.get(str(lv), {}).get("reward")) if str(lv) in box else []})
income = [{"lv": int(k), "reward": rew(v.get("reward"))} for k, v in sorted(prod.items(), key=lambda x: int(x[0])) if v.get("reward")]
OUT.write_text(json.dumps({"stages": stages, "income": income}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("этапов:", len(stages), "| с сундуком:", sum(1 for s in stages if s["chest"]), "| уровней дохода:", len(income))
for s in (stages[0], stages[4], stages[40], stages[-1]):
    print(s)
print(income[0], income[-1])
