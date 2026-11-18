"""Игровые названия 3D-моделей -> assets/models/names.json.
Связи из расшифрованных таблиц (D:/la-game-files/basedata_json) + русские тексты (gamedata_bin):
HeroInfo.heroIcon, ModelConfigBase.model/modelIcon, SlgRallyInfo.pic, SlgMonsterInfo.monsterIcon."""
import collections
import json
import re
from pathlib import Path

BD = Path("D:/la-game-files/basedata_json")
TX = Path("D:/la-game-files/gamedata_bin")
M = Path(__file__).resolve().parent.parent / "assets" / "models"


def bd(n):
    return json.loads((BD / f"{n}.json").read_text(encoding="utf-8"))["data"]


def ru(n, field="name"):
    s = (TX / f"basedb_f_ru__{n}.bin").read_text(encoding="utf-8", errors="ignore")
    return {m.group(1): m.group(2) for m in re.finditer(r'\["id"\] = (\d+),\s*\["%s"\] =\s*"([^"]*)"' % field, s)}


votes = collections.defaultdict(collections.Counter)


def vote(model, name, w=1):
    if model and name and not name.startswith("operation_"):
        name = re.sub(r"\s*ур\.\s*\d+$", "", name).strip()
        if name:
            votes[model][name] += w


hn = ru("HeroInfo")
for k, v in bd("HeroInfo").items():
    vote(v.get("heroIcon"), hn.get(str(v.get("id", k))), 3)
mn = ru("ModelConfigBase")
for k, v in bd("ModelConfigBase").items():
    n = mn.get(str(v.get("id", k)))
    vote(v.get("modelIcon"), n, 2)
    vote((v.get("model") or "").replace("_single", ""), n, 2)
rn = ru("SlgRallyInfo", "name2")
for k, v in bd("SlgRallyInfo").items():
    vote(v.get("pic"), rn.get(str(v.get("id", k))))
sn = ru("SlgMonsterInfo")
for k, v in bd("SlgMonsterInfo").items():
    vote(v.get("monsterIcon"), sn.get(str(v.get("id", k))))

models = sorted(p.stem for p in M.rglob("*.glb"))
CJK = re.compile(r"[\u4e00-\u9fff]")


def clean(n):
    """служебные китайские пометки в данных — переводим по смыслу"""
    m = re.match(r"据点boss(\d+)", n)
    if m:
        return "Босс опорного пункта " + m.group(1)
    if "集結怪" in n or "集结怪" in n:
        return "Сборный босс 2-го сезона"
    m = re.match(r"s2小怪(\d+)", n)
    if m:
        return "Монстр 2-го сезона " + m.group(1)
    return None if CJK.search(n) else n


names = {}
for m in models:
    for n, _ in votes.get(m, collections.Counter()).most_common():
        c = clean(n)
        if c:
            names[m] = c
            break
(M / "names.json").write_text(json.dumps(names, ensure_ascii=False, indent=1), encoding="utf-8")
print("с игровым названием:", len(names), "из", len(models))
for m in models:
    print(" ", m, "->", names.get(m, "— нет в данных"))
