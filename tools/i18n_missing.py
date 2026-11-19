"""Какие подписи T("...") в скриптах ещё без английского перевода (нет ни в tools/i18n_strings.json, ни во встроенном словаре assets/i18n.js).
python -I tools/i18n_missing.py assets/news.js assets/cabinet.js ...  -> печатает и пишет C:/tmp/i18n_missing.json"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
d = json.loads((ROOT / "tools/i18n_strings.json").read_text(encoding="utf-8"))
base = (ROOT / "assets/i18n.js").read_text(encoding="utf-8")
LIT = re.compile(r'''T\((["'])((?:\\.|(?!\1).)*)\1\)''')
miss = []
for f in sys.argv[1:]:
    s = (ROOT / f).read_text(encoding="utf-8")
    for m in LIT.finditer(s):
        raw = m.group(2)
        val = json.loads('"' + raw.replace('"', '\\"').replace("\\'", "'") + '"') if "\\" in raw else raw
        if not re.search("[А-Яа-яЁё]", val) or d.get(val) or json.dumps(val, ensure_ascii=False) in base or val in miss:
            continue
        miss.append(val)
Path("C:/tmp/i18n_missing.json").write_text(json.dumps(miss, ensure_ascii=False, indent=0), encoding="utf-8")
print(len(miss), "без перевода")
for x in miss:
    print(repr(x))
