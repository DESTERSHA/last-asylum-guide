"""Сверка разметки русской и английской страницы: одинаковые теги в том же порядке (без учёта текста и подписей в атрибутах)."""
import re
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
ATTR = re.compile(r'\b(alt|title|placeholder|aria-label|data-title|data-hint)="[^"]*"')
def tags(p):
    s = p.read_text(encoding="utf-8")
    s = re.sub(r"^\s*<!--\{.*?\}-->", "", s, flags=re.S)
    return [ATTR.sub(lambda m: m.group(1) + '=""', t) for t in re.findall(r"<[^>]+>", s)]
for slug in sys.argv[1:]:
    a, b = tags(ROOT / "src" / f"{slug}.html"), tags(ROOT / "src" / "en" / f"{slug}.html")
    bad = [(i, x, y) for i, (x, y) in enumerate(zip(a, b)) if x != y]
    print(slug, "тегов RU", len(a), "EN", len(b), "расхождений", len(bad) + abs(len(a) - len(b)))
    for i, x, y in bad[:5]:
        print("   ", i, "RU:", x[:120]); print("   ", i, "EN:", y[:120])
