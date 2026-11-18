"""Подставляет перевод фраз, которые ТОЧНО совпадают с игровой строкой (словарь D:/la-game-files/lang/glossary_ru_en.tsv).
python -I tools/page_autofill.py <slug> [--maxlen 60]"""
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
G = {}
for line in Path("D:/la-game-files/lang/glossary_ru_en.tsv").read_text(encoding="utf-8").splitlines():
    p = line.split("\t")
    if len(p) >= 2:
        G.setdefault(p[0], p[1])
slug = sys.argv[1]
maxlen = int(sys.argv[sys.argv.index("--maxlen") + 1]) if "--maxlen" in sys.argv else 60
fp = ROOT / "tools" / "pages" / f"{slug}.json"
rows = json.loads(fp.read_text(encoding="utf-8"))
n = 0
for r in rows:
    if not r[1] and len(r[0]) <= maxlen and r[0] in G:
        r[1] = G[r[0]]; n += 1
fp.write_text(json.dumps(rows, ensure_ascii=False, indent=0), encoding="utf-8")
print(slug, "подставлено из игры:", n, "осталось:", sum(1 for r in rows if not r[1]))
