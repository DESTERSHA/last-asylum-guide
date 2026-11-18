"""Перевод страницы без переписывания разметки.

python -I tools/page_i18n.py extract <slug>   -> tools/pages/<slug>.json : [["русская фраза (HTML)", ""], ...]
python -I tools/page_i18n.py apply <slug>     -> src/en/<slug>.html из src/<slug>.html, фразы заменены переводом
python -I tools/page_i18n.py todo <slug>      -> сколько фраз без перевода

Фраза = подряд идущие текст и строчные теги (b, a, span, img…) между блочными тегами (p, li, h2, div…),
плюс подписи в атрибутах блочных тегов (alt, title, placeholder, aria-label) и заголовок страницы <!--{json}-->.
Порядок и количество фраз определяются русской страницей; при её правке — снова extract (переводы сохранятся по тексту).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CYR = re.compile(r"[А-Яа-яЁё]")
INLINE = {"b", "i", "strong", "em", "a", "span", "small", "br", "code", "u", "mark", "sup", "sub", "img", "s", "kbd", "abbr", "wbr", "q"}
TOKEN = re.compile(r"(<!--.*?-->|<script\b.*?</script>|<style\b.*?</style>|<[^>]+>)", re.S)
JSSTR = re.compile(r'"([^"<>]*?[А-Яа-яЁё][^"<>]*?)"')  # русские строки во встроенных списках <script> (названия моделей, героев)
ATTR = re.compile(r'\b(alt|title|placeholder|aria-label|data-title|data-hint)="([^"]*)"')


def tag_name(t):
    m = re.match(r"</?\s*([a-zA-Z0-9]+)", t)
    return m.group(1).lower() if m else ""


def parts(html):
    """[(вид, текст)]: вид = run (фраза) | attr | raw"""
    toks = [t for t in TOKEN.split(html) if t]
    out, run = [], []

    def flush():
        if not run:
            return
        s = "".join(run)
        run.clear()
        lead = s[:len(s) - len(s.lstrip())]
        trail = s[len(s.rstrip()):]
        core = s.strip()
        if lead:
            out.append(("raw", lead))
        if core:
            out.append(("run" if CYR.search(re.sub(r"<[^>]+>", "", core)) or ATTR.search(core) and CYR.search(core) else "raw", core))
        if trail:
            out.append(("raw", trail))

    for t in toks:
        if t.startswith("<") and not t.startswith("<!--") and not t.startswith("<script") and not t.startswith("<style"):
            if tag_name(t) in INLINE:
                run.append(t)
                continue
            flush()
            # подписи в атрибутах блочного тега
            pos = 0
            for m in ATTR.finditer(t):
                if CYR.search(m.group(2)):
                    out.append(("raw", t[pos:m.start(2)]))
                    out.append(("attr", m.group(2)))
                    pos = m.end(2)
            out.append(("raw", t[pos:]))
        elif t.startswith("<script") and "src=" not in t.split(">", 1)[0] and CYR.search(t):
            flush()
            pos = 0
            for m in JSSTR.finditer(t):
                out.append(("raw", t[pos:m.start(1)]))
                out.append(("js", m.group(1)))
                pos = m.end(1)
            out.append(("raw", t[pos:]))
        elif t.startswith("<"):
            flush()
            out.append(("raw", t))
        else:
            run.append(t)
    flush()
    return out


def split_meta(src):
    m = re.match(r"\s*<!--(\{.*?\})-->\s*", src, re.S)
    return json.loads(m.group(1)), src[m.end():]


def extract(slug):
    src = (ROOT / "src" / f"{slug}.html").read_text(encoding="utf-8")
    meta, body = split_meta(src)
    fp = ROOT / "tools" / "pages" / f"{slug}.json"
    old = {a: b for a, b in json.loads(fp.read_text(encoding="utf-8"))} if fp.exists() else {}
    items = [meta["title"], meta["desc"]] + [t for k, t in parts(body) if k in ("run", "attr", "js")]
    seen, rows = set(), []
    for t in items:
        if t in seen:
            continue
        seen.add(t)
        rows.append([t, old.get(t, "")])
    fp.parent.mkdir(exist_ok=True)
    fp.write_text(json.dumps(rows, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{slug}: фраз {len(rows)}, без перевода {sum(1 for r in rows if not r[1])}, символов {sum(len(r[0]) for r in rows)}")


def apply(slug):
    src = (ROOT / "src" / f"{slug}.html").read_text(encoding="utf-8")
    meta, body = split_meta(src)
    tr = {a: b for a, b in json.loads((ROOT / "tools" / "pages" / f"{slug}.json").read_text(encoding="utf-8"))}
    miss = [k for k, v in tr.items() if not v]
    if miss:
        raise SystemExit(f"{slug}: без перевода {len(miss)} фраз, первая: {miss[0][:120]}")
    out = []
    for k, t in parts(body):
        out.append(tr[t] if k in ("run", "attr") else tr[t].replace('"', "'") if k == "js" else t)
    em = {"title": tr[meta["title"]], "desc": tr[meta["desc"]]}
    (ROOT / "src" / "en").mkdir(exist_ok=True)
    res = "<!--" + json.dumps(em, ensure_ascii=False) + "-->\n" + "".join(out)
    left = [m.group(0) for m in re.finditer(r"[А-Яа-яЁё][^<>\"]{0,40}", re.sub(r"<script\b.*?</script>", "", res, flags=re.S))]
    (ROOT / "src" / "en" / f"{slug}.html").write_text(res, encoding="utf-8")
    print(f"{slug}: собрано src/en/{slug}.html; осталось русских кусков: {len(left)}" + (f" — {left[:5]}" if left else ""))


if __name__ == "__main__":
    cmd, slug = sys.argv[1], sys.argv[2]
    if cmd == "extract":
        extract(slug)
    elif cmd == "apply":
        apply(slug)
    elif cmd == "fill":
        # fill <slug> <файл.json со списком переводов> — заполняет первые пустые фразы по порядку
        fp = ROOT / "tools" / "pages" / f"{slug}.json"
        rows = json.loads(fp.read_text(encoding="utf-8"))
        add = json.loads(Path(sys.argv[3]).read_text(encoding="utf-8"))
        empty = [r for r in rows if not r[1]]
        if len(add) > len(empty):
            raise SystemExit(f"переводов {len(add)} больше, чем пустых фраз {len(empty)}")
        for r, v in zip(empty, add):
            r[1] = v
        fp.write_text(json.dumps(rows, ensure_ascii=False, indent=0), encoding="utf-8")
        print(slug, "заполнено", len(add), "осталось", len(empty) - len(add))
    elif cmd == "show":
        # show <slug> [N] — следующие N фраз без перевода (по умолчанию 60) в файл tools/pages/_next.txt
        n = int(sys.argv[3]) if len(sys.argv) > 3 else 60
        rows = json.loads((ROOT / "tools" / "pages" / f"{slug}.json").read_text(encoding="utf-8"))
        nxt = [r[0] for r in rows if not r[1]][:n]
        (ROOT / "tools" / "pages" / "_next.txt").write_text("\n".join(f"{i}\t{t}" for i, t in enumerate(nxt)), encoding="utf-8")
        print(slug, "в _next.txt", len(nxt))
    elif cmd == "todo":
        rows = json.loads((ROOT / "tools" / "pages" / f"{slug}.json").read_text(encoding="utf-8"))
        print(slug, "без перевода:", sum(1 for r in rows if not r[1]), "из", len(rows))
