"""Страница «Модели»: все 3D-модели из assets/models/<группа>/*.glb (картинка рядом — <имя>.webp).
python -I tools/make_models_page.py  → src/models.html"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
M = ROOT / "assets" / "models"
NAMES = json.loads((M / "names.json").read_text(encoding="utf-8")) if (M / "names.json").exists() else {}
NAMES["boss_48"] = "Знать скверны / Осквернённая графиня"  # та же модель — босс события «День охоты Селии»
GROUPS = [
    ("boss", "Боссы", "Боссы событий и карты мира: появление, атака, навык, смерть."),
    ("monster", "Монстры", "Обычные противники на карте и в событиях."),
    ("raven", "Ворон", "Облики ворона."),
    ("citynpc", "Солдаты города", "Солдаты и знамёна у зданий города."),
    ("npc", "Жители и NPC", "Больные в клинике, жители, рабочие, посетители таверны — со всеми их движениями."),
    ("other", "Знамёна, повозки и прочее", "Знамёна, повозки, воздушный шар, ящики и другие предметы мира."),
]


TYPES = {  # слово в имени файла -> по-русски
    "bingren": "Больной", "cleaner": "Уборщик", "cunmin": "Житель деревни", "drinker": "Посетитель таверны", "goldwaiter": "Официант",
    "gongren": "Рабочий", "hugong": "Санитарка", "laoshu": "Крыса", "reader": "Читатель", "shenfu": "Священник", "thinker": "Мыслитель",
    "tiaojiushi": "Бармен", "shibing": "Солдат", "xiaoguai": "Заражённый", "monster": "Заражённый житель", "jushuwang": "Крысиный вожак",
    "xgzf_qizi": "Знаменосец", "bing_box": "Ледяная глыба", "dilei": "Ловушка", "feiting_gonghuimache": "Повозка альянса", "qizi": "Флаг",
    "reqiqiu_luche": "Тыквенная повозка", "reqiqiu_mache": "Повозка", "xunluobing": "Патрульный", "zhanqi": "Знамя", "zhanji": "Облик ворона", "world_": "Логово на карте",
}


def label(g, key):
    if key in NAMES:
        return NAMES[key]
    n = re.findall(r"\d+", key)
    num = (" " + n[-1].lstrip("0")) if n else ""
    for k in sorted(TYPES, key=len, reverse=True):
        if key.startswith(k):
            t = TYPES[k]
            if key.endswith("_ill"):
                t = "Раненый солдат"
            if g == "citynpc" and k == "shibing":
                t = "Солдат города"
            return t
    base = {"boss": "Босс карты мира", "monster": "Монстр", "raven": "Облик ворона", "citynpc": "Солдат города", "npc": "Житель", "other": "Предмет"}[g]
    return base


parts, lists = [], {}
total = 0
for g, title, sub in GROUPS:
    d = M / g
    if not d.exists():
        continue
    items = []
    for f in sorted(d.glob("*.glb")):
        thumb = f.with_suffix(".webp")
        items.append([f"assets/models/{g}/{f.name}", label(g, f.stem), f"assets/models/{g}/{thumb.name}" if thumb.exists() else ""])
    if not items:
        continue
    seen = {}
    for it in items:
        seen[it[1]] = seen.get(it[1], 0) + 1
    cnt = {}
    for it in items:
        if seen[it[1]] > 1:
            cnt[it[1]] = cnt.get(it[1], 0) + 1
            if not re.search(r"\d$", it[1]):
                it[1] = it[1] + " " + str(cnt[it[1]])
    total += len(items)
    lists[g] = items
    parts.append(f'''<section class="band {'soft ' if len(parts) % 2 else ''}pad" id="{g}">
  <div class="eyebrow">{len(items)} моделей</div>
  <h2>{title}</h2>
  <p class="sub">{sub}</p>
  <div class="m3d" data-list="{g}"></div>
</section>''')

nav = " ".join(f'<a class="btn" href="#{g}">{t}</a>' for g, t, _ in GROUPS if g in lists)
html = f'''<!--{{"title":"3D-модели игры: боссы, монстры, ворон, жители | Last Asylum: Plague","desc":"Все 3D-модели Last Asylum: Plague из файлов игры — боссы, монстры, ворон, солдаты, жители и предметы — со всеми их движениями: атака, навык, ходьба, смерть."}}-->
<div class="wrap">
  <div class="hero">
    <div>
      <div class="kick"><img src="assets/game/ev-wander.png" alt="">Модели</div>
      <h1>Все 3D-модели игры</h1>
      <p class="lead">{total} моделей прямо из файлов игры. Крути мышкой или пальцем, колёсиком приближай, кнопками под моделью включай движения. Герои — на странице «Герои».</p>
      <div class="btns"><a class="btn pri" href="heroes.html#h3d-sec">Герои в 3D</a>{nav}</div>
    </div>
  </div>
</div>

{chr(10).join(parts)}
<script>window.M3D_LISTS=window.M3D_LISTS||{{}};Object.assign(window.M3D_LISTS,{json.dumps(lists, ensure_ascii=False, separators=(",", ":"))});</script>
<script type="module" src="https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js"></script>
<script src="assets/viewer3d.js?v=3" defer></script>
'''
(ROOT / "src" / "models.html").write_text(html, encoding="utf-8")
print("моделей на странице:", total, {k: len(v) for k, v in lists.items()})
