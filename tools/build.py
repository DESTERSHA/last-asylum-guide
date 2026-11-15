"""Сборка сайта: src/<page>.html (только содержимое) -> <page>.html (с шапкой, меню и подвалом).
Запуск из корня репозитория:  python tools/build.py
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

PAGES = [
    ("index", "🏠", "Главная"),
    ("heroes", "🦸", "Прокачка героев"),
    ("squads", "⚔️", "Отряды 1–4"),
    ("gear", "🛡️", "Снаряжение"),
    ("duel", "🤝", "Дуэль альянсов"),
    ("rules", "📜", "Правила сервера"),
    ("kvk", "👑", "КвК — Война королевств"),
    ("glossary", "📖", "Игровые термины"),
    ("tips", "💡", "Фишки и мощь"),
]

TEMPLATE = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta name="theme-color" content="#0e1210">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🐀</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Russo+One&display=swap&subset=cyrillic" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css?v={ver}">
</head>
<body>
<header class="topbar"><div class="topbar-in">
  <button class="icon-btn menu-btn" id="menuBtn" aria-expanded="false" aria-controls="sidenav" aria-label="Разделы">☰<span class="lbl"> Разделы</span></button>
  <a class="logo" href="index.html"><span class="logo-mark">🐀</span><span class="logo-text">Last Asylum: Plague<small>гайд альянса · на русском</small></span></a>
  <span class="spacer"></span>
  <button class="icon-btn" id="themeBtn" title="Светлая / тёмная тема" aria-label="Сменить тему">☀️</button>
</div></header>
<div class="layout">
<nav class="sidenav" id="sidenav" aria-label="Разделы">
{nav}
</nav>
<main>
{content}
{pager}
<div class="foot">
  <p>Гайд альянса сервера 397 · обновлён 15.11.2026. Фанатский, к разработчикам игры отношения не имеет. Если что-то не совпадает с игрой — верь игре и напиши лидеру, поправим.</p>
</div>
</main>
</div>
<button class="icon-btn totop" id="toTop" aria-label="Наверх">↑</button>
<script src="assets/app.js?v={ver}"></script>
</body>
</html>
"""


def nav_html(current):
    out = []
    for i, (slug, ico, name) in enumerate(PAGES):
        cls = ' class="active" aria-current="page"' if slug == current else ""
        num = ico if i == 0 else str(i)
        out.append(f'<a href="{slug}.html"{cls}><span class="num">{num}</span>{name}</a>')
    return "\n".join(out)


def pager_html(current):
    idx = [p[0] for p in PAGES].index(current)
    parts = []
    if idx > 0:
        s, _, n = PAGES[idx - 1]
        parts.append(f'<a class="prev" href="{s}.html"><small>← Назад</small>{n}</a>')
    if idx < len(PAGES) - 1:
        s, _, n = PAGES[idx + 1]
        parts.append(f'<a class="next" href="{s}.html"><small>Дальше →</small>{n}</a>')
    return '<nav class="pager">' + "".join(parts) + "</nav>"


def main():
    import hashlib
    h = hashlib.sha1()
    for f in ("assets/style.css", "assets/app.js"):
        h.update((ROOT / f).read_bytes())
    ver = h.hexdigest()[:10]  # меняется при каждой правке стилей/скрипта — браузеры не держат старое
    for slug, _, _ in PAGES:
        raw = (SRC / f"{slug}.html").read_text(encoding="utf-8")
        m = re.match(r"\s*<!--(\{.*?\})-->\s*", raw, re.S)
        if not m:
            raise SystemExit(f"{slug}: нет заголовка <!--{{json}}-->")
        meta = json.loads(m.group(1))
        content = raw[m.end():]
        html = TEMPLATE.format(
            title=meta["title"], desc=meta["desc"], ver=ver,
            nav=nav_html(slug), content=content, pager=pager_html(slug),
        )
        (ROOT / f"{slug}.html").write_text(html, encoding="utf-8")
        print(f"ok {slug}.html  {len(html):>7} байт")


if __name__ == "__main__":
    main()
