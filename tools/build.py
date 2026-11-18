"""Сборка сайта: src/<page>.html (содержимое страницы) -> <page>.html (шапка, меню, подвал).
Запуск из корня репозитория:  python tools/build.py
"""
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

# (файл, значок из assets/game, подпись в меню)
PAGES = [
    ("server", "ev-throne", "Сервер 397"),
    ("index", "go-hq", "Главная"),
    ("kvk", "ev-kvk", "КвК"),
    ("duel", "ev-duel", "Дуэль"),
    ("events", "ev-special", "События"),
    ("heroes", "hero/arthur", "Герои"),
    ("models", "ev-wander", "Модели"),
    ("squads", "c-squad", "Отряды"),
    ("gear", "go-gear", "Снаряжение"),
    ("raven", "ev-raven", "Ворон"),
    ("rules", "btn-caravan", "Правила"),
    ("glossary", "btn-search", "Слова"),
    ("tips", "diamond", "Фишки"),
    ("cabinet", "diamond", "Кабинет"),
]

HIDDEN = {"cabinet"}  # страницы без пункта в меню (кабинет открывается из шапки)
TEMPLATE = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="assets/art/hero-index.webp">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="assets/game/ev-kvk.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&family=Unbounded:wght@600;700;800&family=PT+Serif:wght@700&display=swap&subset=cyrillic" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css?v={ver}">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap&subset=cyrillic" rel="stylesheet">
<link rel="stylesheet" href="assets/theme.css?v={ver}">
<script>(function(){{try{{var q=location.search.match(/[?&]design=(old|new)/);if(q)localStorage.setItem("la_design",q[1]);if(localStorage.getItem("la_design")!=="old")document.documentElement.classList.add("t-ap");if(/[?&]embed=1/.test(location.search))document.documentElement.classList.add("embed")}}catch(e){{document.documentElement.classList.add("t-ap")}}}})()</script>
</head>
<body>
<header class="site-head"><div class="wrap hdr">
  <a class="logo" href="index.html"><img src="assets/icons/art-doctor.jpg" alt=""><span><b>Last Asylum: Plague</b><small>гайд альянса · сервер 397</small></span></a>
  <nav class="main" aria-label="Разделы">
{nav}
  </nav>
  <a class="cab-link" href="cabinet.html" title="Кабинет: избранные разделы, события, альянсы и игроки"><span class="ic">★</span><span data-acc-name>Кабинет</span><i data-fav-count></i></a>
  <div class="clock" title="Разница между временем сервера и московским — 5 часов. На сервере время меньше."><div><b data-clock="srv">--:--</b><span>в игре</span></div><div><b data-clock="msk">--:--</b><span>Москва</span></div></div>
</div></header>
<main>
{content}
</main>
<footer class="foot">
  <p><b>Гайд альянса сервера 397</b> · обновлён 15.11.2026. Фанатский гайд, к разработчикам игры отношения не имеет. Значки и картинки — из самой игры и от сообщества игроков.</p>
  <p>Разница между временем сервера и московским — 5 часов, на сервере время меньше: когда в Москве 17:00, на сервере 12:00. Новый игровой день начинается в 05:00 по Москве. Если что-то в игре поменялось — верь игре и напиши лидеру, поправим.</p>
</footer>
<button class="totop" id="toTop" aria-label="Наверх">↑</button>
<script src="assets/app.js?v={ver}"></script>
<script src="assets/fav.js?v={ver}"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
<script src="assets/auth-config.js?v={ver}"></script>
<script src="assets/auth.js?v={ver}"></script>
<script src="assets/peek.js?v={ver}"></script>
<script src="assets/pairgrid.js?v={ver}"></script>
<script src="assets/mason.js?v={ver}"></script>
</body>
</html>
"""


def nav_html(current):
    out = []
    for slug, icon, name in PAGES:
        if slug in HIDDEN:
            continue
        cls = ' class="on" aria-current="page"' if slug == current else ""
        out.append(f'    <a href="{slug}.html"{cls}><img src="assets/game/{icon}.png" alt="">{name}</a>')
    return "\n".join(out)


def main():
    h = hashlib.sha1()
    for f in ("assets/style.css", "assets/app.js", "assets/fav.js", "assets/theme.css", "assets/peek.js", "assets/pairgrid.js", "assets/mason.js", "assets/gearcalc.js", "assets/tracker.js", "assets/auth.js", "assets/auth-config.js", "assets/cabinet.js"):
        h.update((ROOT / f).read_bytes())
    ver = h.hexdigest()[:10]
    for slug, _, _ in PAGES:
        raw = (SRC / f"{slug}.html").read_text(encoding="utf-8")
        m = re.match(r"\s*<!--(\{.*?\})-->\s*", raw, re.S)
        if not m:
            raise SystemExit(f"{slug}: нет заголовка <!--{{json}}-->")
        meta = json.loads(m.group(1))
        html = TEMPLATE.format(title=meta["title"], desc=meta["desc"], ver=ver, nav=nav_html(slug), content=raw[m.end():])
        (ROOT / f"{slug}.html").write_text(html, encoding="utf-8")
        print(f"ok {slug}.html  {len(html):>7} байт")


if __name__ == "__main__":
    main()
