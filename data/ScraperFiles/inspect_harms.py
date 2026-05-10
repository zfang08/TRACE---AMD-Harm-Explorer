"""一次性 spot check：抽几条 harm 看完整结构。"""
import json, sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent / "final"
h = json.loads((ROOT / "harms.json").read_text(encoding="utf-8"))

print(f"Total harms: {len(h)}")
print()

# pick one extreme
extremes = [x for x in h if x["severity"] == "extreme"]
print(f"=== first extreme harm ({len(extremes)} total) ===")
if extremes:
    ex = extremes[0]
    print(f"id: {ex['id']}")
    print(f"name: {ex['name']}")
    print(f"severity: {ex['severity']}")
    print(f"time_window: {ex['time_window']}")
    print(f"key_metrics: {ex['key_metrics']}")
    print(f"top 3 collieries:")
    for c in ex["source_collieries"][:3]:
        print(f"  {c['distance_m']}m  {c['name'][:50]}  [{c['status']}]")
    print(f"top 3 stations:")
    for s in ex["stations"][:3]:
        print(f"  {s['name'][:40]}: pH={s['ph']}, Fe={s['iron']}, Mn={s['manganese']}, Acid={s['acidity_mgL_caco3']}, n={s['n_samples']}")
    print(f"first 3 affected streams:")
    for r in ex["affected_streams"][:3]:
        print(f"  {r['id']}: name={r['name']!r}, length_km={r['length_km']}, huc8={r['huc8']}")

print()
print("=== first low harm ===")
lows = [x for x in h if x["severity"] == "low"]
if lows:
    lo = lows[0]
    print(f"id: {lo['id']}, name: {lo['name']}")
    print(f"key_metrics: {lo['key_metrics']}")

print()
print("=== harms WITHOUT supporting stations ===")
no_st = [x for x in h if x["key_metrics"]["n_stations"] == 0]
print(f"count: {len(no_st)}")
if no_st:
    print(f"sample id: {no_st[0]['id']}, severity: {no_st[0]['severity']}, "
          f"reaches: {no_st[0]['key_metrics']['n_reaches']}")
