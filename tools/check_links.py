"""Проверка собранного сайта: все внутренние ссылки и якоря существуют, все картинки отвечают 200.
Запуск из корня:  python tools/check_links.py
"""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
pages = sorted(p for p in ROOT.glob("*.html"))
ids = {}
for p in pages:
    ids[p.name] = set(re.findall(r'\bid="([^"]+)"', p.read_text(encoding="utf-8")))

bad = 0
imgs = set()
for p in pages:
    html = p.read_text(encoding="utf-8")
    for href in re.findall(r'href="([^"]+)"', html):
        if href.startswith(("http", "data:", "mailto:")) or href.startswith("assets/"):
            continue
        page, _, anchor = href.partition("#")
        page = page or p.name
        if page not in ids:
            print(f"НЕТ СТРАНИЦЫ: {p.name} -> {href}")
            bad += 1
        elif anchor and anchor not in ids[page]:
            print(f"НЕТ ЯКОРЯ:    {p.name} -> {href}")
            bad += 1
    imgs.update(re.findall(r'<img[^>]+src="(https?://[^"]+)"', html))

UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36"
for u in sorted(imgs):
    r = subprocess.run(["curl", "-s", "-o", "/dev/null", "-m", "25", "-A", UA, "-e", "https://example.github.io/",
                        "-w", "%{http_code} %{content_type}", u], capture_output=True, text=True)
    code = r.stdout.strip()
    ok = code.startswith("200") and "image" in code
    if not ok:
        bad += 1
    print(("ok  " if ok else "ПЛОХО ") + code + "  " + u)

print(f"\nстраниц: {len(pages)}, картинок: {len(imgs)}, проблем: {bad}")
sys.exit(1 if bad else 0)
