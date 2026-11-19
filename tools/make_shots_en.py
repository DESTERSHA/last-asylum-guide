"""Английские экраны для английской версии сайта: результаты программ сборки (запуск с LA_LANG=en) -> assets/shots/en/<то же имя>.
Кадры — те же, что у русских экранов. Запуск после пересборки: python -I tools/make_shots_en.py"""
from pathlib import Path
from PIL import Image

O = Path("D:/la-game-files/out")
DST = Path(__file__).resolve().parent.parent / "assets/shots/en"
DST.mkdir(parents=True, exist_ok=True)
# имя на сайте: (файл результата, кадр (x, y, w, h) или None)
SRC = {
    "account-settings.webp": ("account.webp", None), "barrack.webp": ("barrack.webp", None),
    "canyon-lanes.webp": ("canyon-lanes.webp", None), "canyon-match.webp": ("canyon-match.webp", None), "canyon-reg.webp": ("canyon-reg.webp", None),
    "caravan-card.webp": ("caravan-card.webp", None), "caravan-tabs.webp": ("caravan-tabs.webp", None), "castle-up.webp": ("castle-up.webp", None),
    "chat-point.webp": ("chat-point.webp", None), "ev-cheese.webp": ("ev-cheese.webp", None), "ev-demon.webp": ("ev-demon.webp", None),
    "ev-elixir.webp": ("ev-elixir.webp", None), "ev-hunt.webp": ("ev-hunt.webp", None), "ev-shadow.webp": ("ev-shadow.webp", None),
    "ev-siege.webp": ("ev-siege.webp", None), "ev-survival.webp": ("ev-survival.webp", None), "ev-thief.webp": ("ev-thief.webp", None),
    "ev-wander.webp": ("ev-wander.webp", None), "expedition.webp": ("expedition.webp", None), "falcon.webp": ("falcon.webp", None),
    "garrison.webp": ("garrison.webp", None), "hero-window.webp": ("hero.webp", None), "kvk-map.webp": ("kvk-map.webp", None),
    "kvk-match.webp": ("kvk-match.webp", None), "kvk-points.webp": ("kvk-points.webp", None), "lab.webp": ("lab.webp", None),
    "main-hero.webp": ("main-hero.webp", None), "map-tile.webp": ("map-tile.webp", None), "rallypoint.webp": ("rallypoint.webp", None),
    "raven-equip.webp": ("raven-equip.webp", None), "raven-lv.webp": ("raven-lv.webp", None), "relics.webp": ("relics.webp", (0, 0, 900, 960)),
    "step-alliance.webp": ("step-alliance.webp", None), "step-caravan-btn.webp": ("step-caravan-btn.webp", None),
    "step-kvk-icon.webp": ("step-kvk-icon.webp", None), "step-special.webp": ("step-special.webp", None),
    "valley-map.webp": ("valley-map.webp", None), "valley-skills.webp": ("vskills.webp", None), "wall-defend.webp": ("wall.webp", None),
    # вырезки (места найдены сравнением русских экранов с полными окнами)
    "step-kvk-week.webp": ("kvk-week.webp", (0, 0, 900, 1116)), "step-kvk-royal.webp": ("kvk-royal.webp", (0, 0, 900, 1116)),
    "step-kvk-match.webp": ("kvk-match.webp", (0, 0, 900, 1116)), "hero-list.webp": ("herolist.webp", (0, 0, 900, 990)),
    "equip-replace.webp": ("equip-replace.webp", (0, 168, 900, 1236)), "map-move.webp": ("map-move.webp", (0, 0, 900, 1290)),
}
for i in range(2, 11):
    SRC[f"elx-faq-{i}.webp"] = (f"elx-faq-{i}.webp", None)
# elx-b-*.png на страницах — рисунки зданий без текста, у них английской версии не нужно
done = []
for name, (src, crop) in SRC.items():
    im = Image.open(O / src).convert("RGB")
    if crop:
        x, y, w, h = crop
        im = im.crop((x, y, x + w, y + h))
    if name.endswith(".png"):
        im.save(DST / name, optimize=True)
    else:
        im.save(DST / name, quality=88, method=6)
    done.append(name)
# подсказка Долины: в игре картинка уже английская (с опечаткой разработчиков «Cancal») — берём как есть
Image.open("D:/la-game-files/tex/faq_rs/img_rs_03.png").convert("RGB").save(DST / "valley-g3.webp", quality=88, method=6)
done.append("valley-g3.webp")
print("английских экранов:", len(done))
