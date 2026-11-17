"""Скопировать собранные модели из D:/la-game-files/render/aglb/<группа>/ в assets/models/<группа>/ и вывести список для снимков-превью."""
import json
import shutil
from pathlib import Path

SRC = Path("D:/la-game-files/render/aglb")
DST = Path(__file__).resolve().parent.parent / "assets" / "models"
out = []
for g in ("boss", "monster", "raven", "citynpc", "npc", "other"):
    d = SRC / g
    if not d.exists():
        continue
    (DST / g).mkdir(parents=True, exist_ok=True)
    for f in sorted(d.glob("*.glb")):
        if f.stat().st_size < 4096:  # пустышки без сетки
            continue
        shutil.copy2(f, DST / g / f.name)
        out.append(f"assets/models/{g}/{f.name}")
(Path(__file__).resolve().parent.parent / "drafts" / "shotlist.json").write_text(json.dumps(out), encoding="utf-8")
print("скопировано:", len(out), "моделей,", round(sum(p.stat().st_size for p in DST.rglob("*.glb")) / 1e6, 1), "МБ")
