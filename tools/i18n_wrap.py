"""Оборачивает русские строковые литералы скрипта в T("...") (перевод на английской странице, assets/i18n.js)
и выписывает все такие строки в tools/i18n_strings.json (ключ — русская строка, значение — английский перевод; пустое — ещё не переведено).

python -I tools/i18n_wrap.py assets/tracker.js [assets/cabinet.js ...]       — обернуть (повторный запуск ничего не ломает)
python -I tools/i18n_wrap.py --list assets/tracker.js                         — только показать, что будет обёрнуто
Не трогает: комментарии, литералы внутри T(...), строки из SKIP (это ключи данных, а не подписи) и строки с пометкой // noT (там свой английский вариант).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STR = ROOT / "tools" / "i18n_strings.json"
CYR = re.compile(r"[А-Яа-яЁё]")
# строки-ключи данных: по ним что-то ищется/сравнивается — переводить нельзя (перевод — при показе)
SKIP = {"Раздел", "Событие", "Альянс", "Игрок", "Сервер 397"}
REGEX_PREV = set("(,=:[!&|?{};+-*%<>~^")


def tokens(src):
    """(вид, начало, конец): вид = str | com | code"""
    i, n, out = 0, len(src), []
    last_sig = ""
    while i < n:
        c = src[i]
        if src.startswith("//", i):
            j = src.find("\n", i)
            j = n if j < 0 else j
            out.append(("com", i, j)); i = j; continue
        if src.startswith("/*", i):
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append(("com", i, j)); i = j; continue
        if c in "\"'`":
            j = i + 1
            while j < n and src[j] != c:
                j += 2 if src[j] == "\\" else 1
            out.append(("str", i, j + 1)); i = j + 1; last_sig = "s"; continue
        if c == "/" and (last_sig in REGEX_PREV or last_sig in ("", "return")):
            j = i + 1; cls = False
            while j < n and (src[j] != "/" or cls):
                if src[j] == "\\": j += 2; continue
                if src[j] == "[": cls = True
                elif src[j] == "]": cls = False
                elif src[j] == "\n": break
                j += 1
            out.append(("code", i, j + 1)); i = j + 1; last_sig = "r"; continue
        if not c.isspace():
            if c.isalnum() or c in "_$":
                m = re.match(r"[A-Za-z0-9_$]+", src[i:])
                w = m.group(0)
                last_sig = "return" if w in ("return", "typeof", "case") else "w"
                out.append(("code", i, i + len(w))); i += len(w); continue
            last_sig = c
        out.append(("code", i, i + 1)); i += 1
    return out


def unq(lit):
    q = lit[0]
    body = lit[1:-1]
    if q == "`":
        return body
    return json.loads('"' + body.replace('\\' + q, q).replace('"', '\\"').replace("\\'", "'") + '"') if q == "'" else json.loads(lit)


def wrap(path, apply=True):
    src = path.read_text(encoding="utf-8")
    toks = tokens(src)
    out, found = [], []
    for k, (kind, a, b) in enumerate(toks):
        piece = src[a:b]
        ls = src.rfind("\n", 0, a) + 1
        le = src.find("\n", b)
        line = src[ls:le if le >= 0 else len(src)]
        if kind == "str" and CYR.search(piece) and piece[0] != "`" and "noT" not in line:
            before = src[max(0, a - 2):a]
            try:
                val = unq(piece)
            except Exception:
                val = None
            after = src[b:b + 40].lstrip()
            prev = src[:a].rstrip()[-1:] if src[:a].rstrip() else ""
            is_key = after.startswith(":") and prev in ("{", ",")  # ключ объекта — не подпись
            if val is not None and val not in SKIP and not is_key and not before.endswith("T("):
                found.append(val)
                piece = "T(" + piece + ")"
        out.append(piece)
    res = "".join(out)
    if apply and res != src:
        US = '(function () {\n  "use strict";'
        if "var T = window.T" not in res and US in res:
            res = res.replace(US, US + "\n  var T = function (s) { return window.T ? window.T(s) : s; };  // перевод подписей на английской странице (assets/i18n.js)", 1)
        if "var T = window.T" not in res:
            res = res.replace("(function () {", "(function () {\n  var T = function (s) { return window.T ? window.T(s) : s; };  // перевод подписей на английской странице (assets/i18n.js)", 1)
        path.write_text(res, encoding="utf-8")
    return found


def main():
    args = sys.argv[1:]
    listing = args and args[0] == "--list"
    files = [ROOT / a for a in (args[1:] if listing else args)]
    db = json.loads(STR.read_text(encoding="utf-8")) if STR.exists() else {}
    for f in files:
        got = wrap(f, apply=not listing)
        new = [s for s in got if s not in db]
        for s in got:
            db.setdefault(s, "")
        print(f"{f.name}: строк {len(got)}, новых {len(new)}")
        if listing:
            for s in got:
                print("   ", s[:140])
    if not listing:
        STR.write_text(json.dumps(db, ensure_ascii=False, indent=1), encoding="utf-8")
        print("в словаре строк:", len(db), "без перевода:", sum(1 for v in db.values() if not v))


if __name__ == "__main__":
    main()
