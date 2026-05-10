#!/usr/bin/env python3
"""
重抓 Acidity / Alkalinity 样本，并合并到现有 water_quality_samples.json。

为什么需要这个脚本：原 `scrape_water_quality.py` 跑 2025-05-02 那次，全部 11 个
`Acidity + Alkalinity` 批次都收到 HTTP 400，导致最关键的两个 AMD 严重程度
指标一条样本都没拿到。从失败模式（batch 2/7/12/.../52 全挂、其他都活）判断
不是 batch size 问题，而是 WQP CharacteristicName vocabulary 里 "Acidity" /
"Alkalinity" 大概率是 CharacteristicGroup 别名，不是合法 CharacteristicName。

本脚本做三件事：
  1. --probe 模式：发 1 个小请求，把 HTTP 400 的错误体打印出来，定位真名
  2. --names 自定义 CharacteristicName 列表，默认就是已知最常见的几种
  3. 全量跑完，把新拿到的样本去重后合并到 water_quality_samples.json

只用 stdlib，与原 scraper 风格一致。
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


WQP_RESULT_URL = "https://www.waterqualitydata.us/data/Result/search"
DEFAULT_START_DATE = "2015-01-01"
REQUEST_TIMEOUT = 180
RETRY_LIMIT = 3
RETRY_BACKOFF = 3.0
PAGE_DELAY_SEC = 0.6

# 候选 CharacteristicName。原 scraper 用裸 "Acidity" / "Alkalinity"，但
# WQP 词表里裸 "Acidity" 不存在（只 "Alkalinity" 存在），全都是 HTTP 400。
# 实际合法值通过 https://www.waterqualitydata.us/Codes/characteristicname?text=Acidity
# 取到，下面列出的就是 5 个 Acidity + 10 个 Alkalinity 中所有 AMD 相关的项。
# (借: Astacidae / Uric acid / Lactic acid 这些跟 AMD 无关已剔除)
DEFAULT_NAMES = [
    # Acidity (5 个全部纳入 — 不同 provider 报不同口径)
    "Acidity, (H+)",
    "Acidity, hydrogen ion (H+)",
    "Acidity, hydrogen ion (H+) as CaCO3",
    "Acidity, mineral methyl orange (as CaCO3)",
    "Acidity, total, phenolphthalein (as CaCO3)",
    # Alkalinity (10 个里挑 AMD 相关的 7 个；borate/hydroxide 太边缘略掉)
    "Alkalinity",
    "Alkalinity, total",
    "Alkalinity, bicarbonate",
    "Alkalinity, Bicarbonate as CaCO3",
    "Alkalinity, carbonate",
    "Alkalinity, Carbonate as CaCO3",
    "Alkalinity, Phenolphthalein (total hydroxide+1/2 carbonate)",
]


def _http_get(url: str, params: dict, *, accept: str = "text/csv") -> tuple[str | None, tuple[int, str] | None]:
    """
    返回 (body, error)。成功时 body 非空、error 为 None；失败时反过来。
    error = (http_code, body_excerpt)。
    """
    full = f"{url}?{urlencode(params, doseq=True)}"
    last_err: tuple[int, str] | None = None

    for attempt in range(1, RETRY_LIMIT + 1):
        try:
            req = Request(
                full,
                headers={
                    "User-Agent": "amd-retry-acidity/1.0",
                    "Accept": accept,
                    "Accept-Encoding": "gzip, deflate",
                },
            )
            with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                raw = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    import gzip
                    raw = gzip.decompress(raw)
                return raw.decode("utf-8", errors="replace"), None
        except HTTPError as exc:
            body_excerpt = ""
            try:
                body_excerpt = exc.read().decode("utf-8", errors="replace")[:600]
            except Exception:
                pass
            last_err = (exc.code, body_excerpt)
            # 4xx 不重试 — 服务器明确拒绝，重试也没用
            if 400 <= exc.code < 500:
                return None, last_err
        except URLError as exc:
            last_err = (0, repr(exc))
        if attempt < RETRY_LIMIT:
            wait = RETRY_BACKOFF * attempt
            print(f"    [retry {attempt}/{RETRY_LIMIT}] err={last_err} — sleeping {wait}s",
                  file=sys.stderr)
            time.sleep(wait)

    return None, last_err


def _to_wqp_date(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{m}-{d}-{y}"


def probe(name: str, site_ids: list[str], start_date: str) -> None:
    """单条 CharacteristicName 跑 50 个 site，看 WQP 怎么回应。"""
    chunk = site_ids[:50]
    params = {
        "siteid": chunk,
        "characteristicName": name,
        "startDateLo": _to_wqp_date(start_date),
        "mimeType": "csv",
        "zip": "no",
    }
    print(f"  probe '{name}' x {len(chunk)} sites ...", end=" ", flush=True)
    body, err = _http_get(WQP_RESULT_URL, params)
    if err is not None:
        code, msg = err
        print(f"HTTP {code}")
        if msg:
            print(f"    body: {msg[:300]}")
        return
    rows = list(csv.DictReader(io.StringIO(body)))
    print(f"OK — {len(rows)} row(s)")
    if rows:
        sample = rows[0]
        # 打印实际返回的 CharacteristicName，因为 WQP 经常对查询名做规范化
        print(f"    actual CharacteristicName(s): "
              f"{sorted({r.get('CharacteristicName', '') for r in rows})}")


def fetch_full(
    names: list[str],
    site_ids: list[str],
    start_date: str,
    batch_size: int,
) -> list[dict]:
    """对每个 CharacteristicName 全量跑所有 site_ids，按 batch_size 分块。"""
    all_rows: list[dict] = []
    for name in names:
        print(f"\n  characteristic: {name!r}")
        ok_count = 0
        fail_count = 0
        for i in range(0, len(site_ids), batch_size):
            chunk = site_ids[i : i + batch_size]
            params = {
                "siteid": chunk,
                "characteristicName": name,
                "startDateLo": _to_wqp_date(start_date),
                "mimeType": "csv",
                "zip": "no",
            }
            print(f"    batch {i}-{i+len(chunk)} ...", end=" ", flush=True)
            body, err = _http_get(WQP_RESULT_URL, params)
            if err is not None:
                code, msg = err
                print(f"FAIL HTTP {code} -- {msg[:120]}")
                fail_count += 1
                continue
            rows = list(csv.DictReader(io.StringIO(body)))
            print(f"{len(rows)} row(s)")
            ok_count += 1
            all_rows.extend(rows)
            time.sleep(PAGE_DELAY_SEC)
        print(f"  -> {name!r}: {ok_count} batch ok, {fail_count} fail, "
              f"{sum(1 for r in all_rows if r.get('CharacteristicName','').lower().startswith(name.split(',')[0].lower()))} cumulative rows")
    return all_rows


def reshape_samples(rows: list[dict]) -> list[dict]:
    out: list[dict] = []
    for r in rows:
        sid = r.get("MonitoringLocationIdentifier", "").strip()
        char = r.get("CharacteristicName", "").strip()
        if not sid or not char:
            continue
        val_raw = r.get("ResultMeasureValue", "")
        try:
            val = float(val_raw) if val_raw not in ("", None) else None
        except ValueError:
            val = None
        out.append({
            "station_id": sid,
            "characteristic": char,
            "value": val,
            "value_raw": val_raw,
            "unit": r.get("ResultMeasure/MeasureUnitCode", "").strip(),
            "sample_date": r.get("ActivityStartDate", "").strip(),
            "sample_time": r.get("ActivityStartTime/Time", "").strip(),
            "fraction": r.get("ResultSampleFractionText", "").strip(),
            "method": r.get("ResultAnalyticalMethod/MethodName", "").strip(),
            "agency": r.get("OrganizationFormalName", "").strip(),
            "activity_id": r.get("ActivityIdentifier", "").strip(),
        })
    return out


def merge_into_existing(new_samples: list[dict], path: Path) -> tuple[int, int]:
    """以 (activity_id, characteristic) 为去重键 merge。返回 (added, total_after)。"""
    existing: list[dict] = json.loads(path.read_text())
    seen = {(s.get("activity_id", ""), s.get("characteristic", "")) for s in existing}
    added = 0
    for s in new_samples:
        key = (s["activity_id"], s["characteristic"])
        if key in seen:
            continue
        existing.append(s)
        seen.add(key)
        added += 1
    path.write_text(json.dumps(existing, indent=2))
    return added, len(existing)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-dir",
        default=str(Path(__file__).resolve().parent.parent / "newData"),
        help="data/newData 目录，默认按相对路径定位。",
    )
    parser.add_argument(
        "--probe",
        action="store_true",
        help="只跑探针：每个候选名各发一个 50-site 的小请求，打印结果（含 HTTP 400 体）。",
    )
    parser.add_argument(
        "--names",
        default=None,
        help="逗号分隔的 CharacteristicName 列表；默认用 DEFAULT_NAMES。",
    )
    parser.add_argument(
        "--start-date",
        default=DEFAULT_START_DATE,
        help="ISO YYYY-MM-DD",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=200,
        help="每次请求多少个 site id（默认 200）。",
    )
    parser.add_argument(
        "--max-stations",
        type=int,
        default=None,
        help="只用前 N 个 station，做 sanity check。",
    )
    parser.add_argument(
        "--no-merge",
        action="store_true",
        help="不要写回 water_quality_samples.json，只在控制台打印结果。",
    )
    args = parser.parse_args()

    data_dir = Path(args.data_dir).resolve()
    stations_path = data_dir / "monitoring_stations.json"
    samples_path = data_dir / "water_quality_samples.json"

    if not stations_path.exists():
        print(f"找不到 {stations_path}", file=sys.stderr)
        return 1

    stations = json.loads(stations_path.read_text())
    site_ids = [s["id"] for s in stations]
    if args.max_stations:
        site_ids = site_ids[: args.max_stations]
    print(f"Stations available: {len(stations)}; using {len(site_ids)}.")

    names = (
        [n.strip() for n in args.names.split(",") if n.strip()]
        if args.names
        else DEFAULT_NAMES
    )
    print(f"CharacteristicName candidates: {names}")

    if args.probe:
        print("\n=== PROBE MODE ===")
        for name in names:
            probe(name, site_ids, args.start_date)
        return 0

    print("\n=== FULL FETCH ===")
    rows = fetch_full(names, site_ids, args.start_date, args.batch_size)
    print(f"\nTotal raw rows fetched: {len(rows)}")

    samples = reshape_samples(rows)
    print(f"After reshape: {len(samples)} sample(s).")
    if samples:
        from collections import Counter
        char_counts = Counter(s["characteristic"] for s in samples)
        print("By characteristic:")
        for ch, n in char_counts.most_common():
            print(f"  {n:>5}  {ch}")

    if args.no_merge:
        print("\n--no-merge set; not writing samples file.")
        return 0

    if not samples_path.exists():
        print(f"找不到 {samples_path}，无法 merge。", file=sys.stderr)
        return 1
    added, total = merge_into_existing(samples, samples_path)
    print(f"\nMerged: +{added} new sample(s); file now {total} total.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
