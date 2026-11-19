"""Сборка сайта: src/<page>.html (содержимое страницы) -> <page>.html (шапка, меню, подвал).
Запуск из корня репозитория:  python tools/build.py
"""
import hashlib
import json
import os
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

# (файл, значок из assets/game, подпись в меню, подпись в меню EN — игровые слова из английских текстов игры)
PAGES = [
    ("server", "ev-throne", "Сервер 397", "Server 397"),
    ("news", "ev-royal", "Важные новости", "Important News"),
    ("chat", "alliance", "Чат", "Chat"),
    ("index", "go-hq", "Главная", "Home"),
    ("kvk", "ev-kvk", "КвК", "Kingdom War"),
    ("duel", "ev-duel", "Дуэль", "Alliance Duel"),
    ("events", "ev-special", "События", "Events"),
    ("heroes", "hero/arthur", "Герои", "Heroes"),
    ("models", "ev-wander", "Модели", "Models"),
    ("squads", "c-squad", "Отряды", "Squads"),
    ("gear", "go-gear", "Снаряжение", "Gear"),
    ("raven", "ev-raven", "Ворон", "Raven"),
    ("rules", "btn-caravan", "Правила", "Rules"),
    ("glossary", "btn-search", "Слова", "Glossary"),
    ("tips", "diamond", "Фишки", "Tips"),
    ("cabinet", "diamond", "Кабинет", "My page"),
]
# английская страница = src/en/<файл>.html -> <файл>.en.html (рядом с русской, чтобы все пути к картинкам и данным работали как есть)
UI = {
    "ru": {"tagline": "гайд альянса · сервер 397", "nav": "Разделы", "cab_title": "Кабинет: избранные разделы, события, альянсы и игроки", "cab": "Кабинет",
           "clock_title": "Разница между временем сервера и московским — 5 часов. На сервере время меньше.", "srv": "в игре", "msk": "Москва", "top": "Наверх",
           "foot1": "<b>Гайд альянса сервера 397</b> · обновлён 15.11.2026. Фанатский гайд, к разработчикам игры отношения не имеет. Значки и картинки — из самой игры и от сообщества игроков.",
           "foot2": "Разница между временем сервера и московским — 5 часов, на сервере время меньше: когда в Москве 17:00, на сервере 12:00. Новый игровой день начинается в 05:00 по Москве. Если что-то в игре поменялось — верь игре и напиши лидеру, поправим.",
           "switch": "EN", "switch_title": "English version",
           "credit": "Сайт сделала <b>[SLAV] DESTERSHA</b>",
           "sup_t": "Поддержать проект", "sup_d": "Сайт бесплатный и без рекламы. Если он вам помогает — можно поддержать автора добровольным пожертвованием, любой суммой.",
           "sup_btn": "Поддержать на Boosty", "sup_head": "Поддержать", "sup_note": "Картой любой страны, сумма — в вашей валюте. Для доната нужен вход на Boosty.", "sup_crypto": "Криптовалюта", "sup_copy": "нажмите, чтобы скопировать", "sup_qr": "Наведите камеру телефона, чтобы открыть страницу поддержки"},
    "en": {"tagline": "alliance guide · kingdom 397", "nav": "Sections", "cab_title": "My page: saved sections, events, alliances and players", "cab": "My page",
           "clock_title": "Server time is 5 hours behind Moscow time.", "srv": "server", "msk": "Moscow", "top": "Back to top",
           "foot1": "<b>Kingdom 397 alliance guide</b> · updated 15.11.2026. A fan-made guide, not affiliated with the game developers. Icons and images come from the game itself and from the player community.",
           "foot2": "Server time is 5 hours behind Moscow time: when it is 17:00 in Moscow, it is 12:00 on the server. A new game day starts at 05:00 Moscow time. If something in the game has changed, trust the game and tell the alliance leader — we will fix it.",
           "switch": "RU", "switch_title": "Русская версия",
           "credit": "Site made by <b>[SLAV] DESTERSHA</b>",
           "sup_t": "Support the project", "sup_d": "The site is free and has no ads. If it helps you, you can support the author with a voluntary donation of any amount.",
           "sup_btn": "Support on Boosty", "sup_head": "Support", "sup_note": "Any country's card, the amount is shown in your currency. A Boosty account is needed to donate.", "sup_crypto": "Crypto", "sup_copy": "tap to copy", "sup_qr": "Point your phone camera here to open the support page"},
}
# «Поддержать проект» в подвале каждой страницы (русской и английской). Пока поля пустые — блока на сайте нет.
# boosty — страница доната: одна ссылка для всех стран, Boosty сам показывает сумму в валюте посетителя
# (проверила владелица 19.11: у иностранцев платёж сразу в их валюте, ей приходит с автоконвертацией);
# qr — QR-код этой страницы (выдал сам Boosty); crypto — адреса кошельков {"USDT (TRC-20)": "адрес", "TON": "адрес"}.
SUPPORT = {"boosty": "https://boosty.to/destersha/donate", "crypto": {}, "qr": "assets/icons/boosty-qr.png"}
# показывается в двух местах (её решение 19.11 «оба оставь»): кнопка «♥ Поддержать» в шапке и блок с пояснением и QR-кодом в подвале
if os.environ.get("LA_SUPPORT_PREVIEW"):  # только для снимка-примера у себя: заглушки
    SUPPORT = {"boosty": "#", "qr": "", "crypto": {"USDT (TRC-20)": "TXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", "TON": "UQXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"}}


def support_html(ui, lang):
    s = SUPPORT
    if not (s["boosty"] or s["crypto"]):
        return ""
    btns = f'<a class="btn pri" href="{s["boosty"]}" target="_blank" rel="noopener">{ui["sup_btn"]}</a>' if s["boosty"] else ""
    cr = ""
    if s["crypto"]:
        cr = (f'<details class="sup-crypto"><summary>{ui["sup_crypto"]}</summary>' +
              "".join(f'<div><span>{k}</span><code title="{ui["sup_copy"]}" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.textContent);this.classList.add(\'ok\')">{v}</code></div>' for k, v in s["crypto"].items()) +
              "</details>")
    qr = f'<img class="sup-qr" src="{s["qr"]}" alt="QR" width="84" height="84" loading="lazy" title="{ui["sup_qr"]}">' if s.get("qr") and s["boosty"] else ""
    note = f'<small>{ui["sup_note"]}</small>' if s["boosty"] else ""
    return f'<div class="sup"><div class="sup-txt"><b>♥ {ui["sup_t"]}</b><span>{ui["sup_d"]}</span>{note}</div><div class="sup-btns">{btns}</div>{qr}{cr}</div>'

HIDDEN = {"cabinet"}  # страницы без пункта в меню (кабинет открывается из шапки)
TEMPLATE = """<!doctype html>
<html lang="{lang}">
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
{alt}
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
  <a class="logo" href="{home}"><img src="assets/icons/art-doctor.jpg" alt=""><span><b>Last Asylum: Plague</b><small>{tagline}</small></span></a>
  <nav class="main" aria-label="{navl}">
{nav}
  </nav>
  <a class="cab-link" href="{cabhref}" title="{cab_title}"><span class="ic">★</span><span data-acc-name>{cab}</span><i data-fav-count></i></a>
  {supbtn}
  {switch}
  <div class="clock" title="{clock_title}"><div><b data-clock="srv">--:--</b><span>{srv}</span></div><div><b data-clock="msk">--:--</b><span>{msk}</span></div></div>
</div></header>
<main>
{content}
</main>
<footer class="foot">
  {support}
  <p>{foot1}</p>
  <p>{foot2}</p>
  <p class="foot-credit">{credit}</p>
</footer>
<button class="totop" id="toTop" aria-label="{top}">↑</button>
{dict}<script src="assets/i18n.js?v={ver}"></script>
<script src="assets/app.js?v={ver}"></script>
<script src="assets/fav.js?v={ver}"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
<script src="assets/auth-config.js?v={ver}"></script>
<script src="assets/auth.js?v={ver}"></script>
<script src="assets/translate.js?v={ver}"></script>
<script src="assets/notice.js?v={ver}"></script>
<script src="assets/peek.js?v={ver}"></script>
<script src="assets/pairgrid.js?v={ver}"></script>
<script src="assets/mason.js?v={ver}"></script>
</body>
</html>
"""


def page_file(slug, lang):
    return f"{slug}.en.html" if lang == "en" else f"{slug}.html"


def nav_html(current, lang, have_en):
    out = []
    for slug, icon, name, name_en in PAGES:
        if slug in HIDDEN:
            continue
        cls = ' class="on" aria-current="page"' if slug == current else ""
        href = page_file(slug, "en" if lang == "en" and slug in have_en else "ru")
        out.append(f'    <a href="{href}"{cls}><img src="assets/game/{icon}.png" alt="">{name_en if lang == "en" else name}</a>')
    return "\n".join(out)


SCRIPT_V = re.compile(r'(assets/[A-Za-z0-9_.-]+\.js)\?v=[A-Za-z0-9]+')
_VER = {}


def file_ver(rel):
    if rel not in _VER:
        f = ROOT / rel
        _VER[rel] = hashlib.sha1(f.read_bytes()).hexdigest()[:10] if f.exists() else "0"
    return _VER[rel]


PAGE_LINK = re.compile(r'(href=")([a-z0-9]+)\.html([#?"])')
SHOT = re.compile(r'(assets/shots/)([A-Za-z0-9_.-]+\.(?:webp|png|jpg))')


def localize_en(html, have_en):
    """английская страница: ссылки на страницы — на их английские версии (если есть), экраны игры — английские (если готовы)"""
    html = PAGE_LINK.sub(lambda m: m.group(1) + (page_file(m.group(2), "en") if m.group(2) in have_en else m.group(2) + ".html") + m.group(3), html)
    return SHOT.sub(lambda m: m.group(1) + ("en/" + m.group(2) if (ROOT / "assets/shots/en" / m.group(2)).exists() else m.group(2)), html)


def write_dict():
    """словарь подписей скриптов RU -> EN (tools/i18n_strings.json, переведённые строки) -> assets/i18n-dict.js (грузится только на английских страницах)"""
    src = ROOT / "tools" / "i18n_strings.json"
    d = {k: v for k, v in json.loads(src.read_text(encoding="utf-8")).items() if v} if src.exists() else {}
    (ROOT / "assets" / "i18n-dict.js").write_text("window.LA_I18N_EXTRA = " + json.dumps(d, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    return len(d)


def main():
    print("словарь подписей EN:", write_dict(), "строк")
    h = hashlib.sha1()
    for f in ("assets/style.css", "assets/app.js", "assets/fav.js", "assets/theme.css", "assets/peek.js", "assets/pairgrid.js", "assets/mason.js", "assets/gearcalc.js", "assets/tracker.js", "assets/auth.js", "assets/auth-config.js", "assets/cabinet.js", "assets/i18n.js", "assets/i18n-dict.js", "assets/news.js", "assets/notice.js", "assets/chat.js", "assets/translate.js"):
        h.update((ROOT / f).read_bytes())
    ver = h.hexdigest()[:10]
    have_en = {slug for slug, *_ in PAGES if (SRC / "en" / f"{slug}.html").exists()}
    for slug, *_ in PAGES:
        for lang in ("ru", "en"):
            if lang == "en" and slug not in have_en:
                continue
            raw = (SRC / ("en/" if lang == "en" else "") / f"{slug}.html").read_text(encoding="utf-8")
            m = re.match(r"\s*<!--(\{.*?\})-->\s*", raw, re.S)
            if not m:
                raise SystemExit(f"{lang}/{slug}: нет заголовка <!--{{json}}-->")
            meta = json.loads(m.group(1))
            ui = UI[lang]
            content = raw[m.end():]
            other = "ru" if lang == "en" else "en"
            enlist = f'<meta name="la-en" content="{",".join(sorted(have_en))}">'
            if slug in have_en:
                sw = f'<a class="lang-sw" href="{page_file(slug, other)}" hreflang="{other}" lang="{other}" title="{ui["switch_title"]}" data-lang-sw="{other}">{ui["switch"]}</a>'
                alt = enlist + f'\n<link rel="alternate" hreflang="ru" href="{slug}.html">\n<link rel="alternate" hreflang="en" href="{slug}.en.html">'
            else:
                sw, alt = "", enlist
            if lang == "en":
                content = localize_en(content, have_en)
            # скрипты страниц (tracker.js, chat.js, news.js…): метка версии = отпечаток самого файла.
            # Раньше метки были вписаны руками (?v=26, ?v=191126a) и не менялись — браузер на ПК держал старый скрипт (20.11: чат на ПК со старым скриптом)
            content = SCRIPT_V.sub(lambda m: m.group(1) + "?v=" + file_ver(m.group(1)), content)
            home = page_file("index", "en" if lang == "en" and "index" in have_en else "ru")
            cabhref = page_file("cabinet", "en" if lang == "en" and "cabinet" in have_en else "ru")
            fields = {k: v for k, v in ui.items() if k not in ("nav", "switch", "switch_title") and not k.startswith("sup_")}
            fields["support"] = support_html(ui, lang)
            fields["supbtn"] = (f'<a class="sup-head" href="{SUPPORT["boosty"]}" target="_blank" rel="noopener" title="{ui["sup_d"]} {ui["sup_note"]}">'
                                f'<span class="ic">♥</span><span class="tx">{ui["sup_head"]}</span></a>') if SUPPORT["boosty"] else ""
            html = TEMPLATE.format(title=meta["title"], desc=meta["desc"], ver=ver, nav=nav_html(slug, lang, have_en), content=content,
                                   lang=lang, alt=alt, home=home, dict=(f'<script src="assets/i18n-dict.js?v={ver}"></script>\n' if lang == "en" else ""), cabhref=cabhref, switch=sw, navl=ui["nav"], **fields)
            out = ROOT / page_file(slug, lang)
            out.write_text(html, encoding="utf-8")
            print(f"ok {out.name}  {len(html):>7} байт")


if __name__ == "__main__":
    main()
