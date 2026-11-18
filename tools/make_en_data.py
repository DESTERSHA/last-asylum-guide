"""Английские копии данных: data/<имя>.json -> data/<имя>.en.json. Все русские строки — по словарю игры (точное совпадение),
недостающие — из EXTRA (тоже игровые слова: «Наручи (UR)» = UR Gauntlets). Строку без перевода не пропускаем — останавливаемся."""
import json
import re
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
CYR = re.compile("[А-Яа-яЁё]")
G = {}
for line in Path("D:/la-game-files/lang/glossary_ru_en.tsv").read_text(encoding="utf-8").splitlines():
    p = line.split("\t")
    if len(p) >= 2:
        G.setdefault(p[0], p[1])
EXTRA = {"Наручи": "Gauntlets", "Сапоги": "Boots", "Противоядие": "Antitoxin"}  # «Противоядие» в словаре первым попадается «Antitoxin +» (подпись награды) — у предмета просто Antitoxin
miss = set()
def tr(s):
    if not isinstance(s, str) or not CYR.search(s):
        return s
    v = EXTRA.get(s) or G.get(s)
    if v is None:
        miss.add(s)
        return s
    return v
def walk(o):
    if isinstance(o, dict):
        return {tr(k): walk(v) for k, v in o.items()}
    if isinstance(o, list):
        return [walk(v) for v in o]
    return tr(o)
for name in ("gear", "adventure", "heroes"):
    d = json.loads((ROOT / "data" / f"{name}.json").read_text(encoding="utf-8"))
    (ROOT / "data" / f"{name}.en.json").write_text(json.dumps(walk(d), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
if miss:
    raise SystemExit("нет перевода: " + ", ".join(sorted(miss)))
print("готово: data/gear.en.json, adventure.en.json, heroes.en.json")
