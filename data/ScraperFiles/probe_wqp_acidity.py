"""列出 WQP CharacteristicName 词表里所有以 'Acidity' / 'Alkalinity' 开头的合法值。"""
from urllib.request import Request, urlopen
from urllib.parse import urlencode
import json

CODES = "https://www.waterqualitydata.us/Codes/characteristicname"

def fetch(prefix):
    full = f"{CODES}?{urlencode({'text': prefix, 'mimeType': 'json'})}"
    req = Request(full, headers={"User-Agent": "amd-probe/1.0",
                                  "Accept": "application/json"})
    with urlopen(req, timeout=60) as r:
        data = json.loads(r.read().decode("utf-8"))
    matches = [c for c in data.get("codes", [])
               if c.get("value", "").lower().startswith(prefix.lower())]
    return matches

for prefix in ("Acidity", "Alkalinity"):
    print(f"\n=== {prefix} ===")
    rows = fetch(prefix)
    for c in rows:
        print(f"  {c.get('value')!r:<55s} providers={c.get('providers')}")
    print(f"  ({len(rows)} match(es))")
