"""一次性数据 sanity check：coal_mining_operations 和 stream_segments_slim。"""
import json, sys
from collections import Counter
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent / "newData"

ANTHRACITE = (-76.85, 40.50, -75.20, 41.65)  # W, S, E, N

def in_bbox(lon, lat):
    return ANTHRACITE[0] <= lon <= ANTHRACITE[2] and ANTHRACITE[1] <= lat <= ANTHRACITE[3]

# ---------- coal_mining_operations.json ----------
print("=== coal_mining_operations.json ===")
with open(ROOT / "coal_mining_operations.json", encoding="utf-8-sig") as f:
    cm = json.load(f)
print(f"Total: {len(cm)}")
print("status distribution:")
for k, v in Counter(r.get("status", "") for r in cm).most_common():
    print(f"  {v:>5}  {k!r}")
lons = [r["lon"] for r in cm]
lats = [r["lat"] for r in cm]
print(f"lon range: {min(lons):.3f} -> {max(lons):.3f}")
print(f"lat range: {min(lats):.3f} -> {max(lats):.3f}")
ab = [r for r in cm if in_bbox(r["lon"], r["lat"])]
print(f"in anthracite bbox: {len(ab)} ({len(ab)/len(cm)*100:.1f}%)")
print(f"unique site names: {len(set(r['name'] for r in cm))}")
print(f"unique operators: {len(set(r['operator'] for r in cm))}")
print("top 5 operators (in anthracite bbox):")
for k, v in Counter(r["operator"] for r in ab).most_common(5):
    print(f"  {v:>4}  {k}")
print(f"id format sample: {[r['id'] for r in cm[:3]]}")

# ---------- stream_segments_slim.json ----------
print("\n=== stream_segments_slim.json ===")
print("loading 68 MB ...")
with open(ROOT / "stream_segments_slim.json", encoding="utf-8-sig") as f:
    ss = json.load(f)
print(f"Total: {len(ss)}")
print("ftype:")
for k, v in Counter(r.get("ftype", "") for r in ss).most_common():
    print(f"  {v:>7}  {k!r}")
print("huc8 distribution (top 12):")
for k, v in Counter(r.get("huc8", "") for r in ss).most_common(12):
    print(f"  {v:>7}  {k}")
named = sum(1 for r in ss if r.get("name"))
print(f"named: {named} ({named/len(ss)*100:.1f}%)")
has_ds = sum(1 for r in ss if r.get("downstream_id"))
print(f"has downstream: {has_ds} ({has_ds/len(ss)*100:.1f}%)")
mids = [r["midpoint"] for r in ss if r.get("midpoint")]
lons = [m[0] for m in mids]
lats = [m[1] for m in mids]
print(f"midpoint lon: {min(lons):.3f} -> {max(lons):.3f}")
print(f"midpoint lat: {min(lats):.3f} -> {max(lats):.3f}")
ab_ss = [r for r in ss if r.get("midpoint") and in_bbox(r["midpoint"][0], r["midpoint"][1])]
print(f"in anthracite bbox (by midpoint): {len(ab_ss)} ({len(ab_ss)/len(ss)*100:.1f}%)")
lens = sorted([r["length_km"] for r in ss if r.get("length_km") is not None])
print(f"length_km: n={len(lens)}, p50={lens[len(lens)//2]:.3f}, p90={lens[int(len(lens)*0.9)]:.3f}, p99={lens[int(len(lens)*0.99)]:.3f}, max={lens[-1]:.3f}")
print(f"sample id format: {[r['id'] for r in ss[:3]]}")

# downstream id integrity
ids = set(r["id"] for r in ss)
ds_ids = set(r["downstream_id"] for r in ss if r.get("downstream_id"))
missing = ds_ids - ids
print(f"downstream_ids referenced but not in corpus: {len(missing)} (of {len(ds_ids)} unique referenced)")
if missing:
    print(f"  sample missing ids: {list(missing)[:5]}")

# Anthracite-only downstream integrity
ab_ids = set(r["id"] for r in ab_ss)
ab_ds = set(r["downstream_id"] for r in ab_ss if r.get("downstream_id"))
ab_missing = ab_ds - ab_ids
print(f"if we filter to anthracite bbox: {len(ab_missing)} of {len(ab_ds)} downstream_ids point outside the filtered set ({len(ab_missing)/max(len(ab_ds),1)*100:.1f}%)")
