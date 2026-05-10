# `data/final/` — MVP 生产数据集

**这个文件夹里的就是前后端会直接读、做 AMD harm 故事的"成品"。**
所有文件都已统一到宾州无烟煤区 bbox（**W −76.85 / S 40.50 / E −75.20 / N 41.65**），字段命名一致、坐标系一致（WGS84）、`attach_segment_id` 已经 snap 完成。

如果要审计每一份数据是怎么从外部 API 拉下来的，看 `data/newData/` 下的三份分领域 README（`README_all.md` / `README_riversegments.md` / `coal_mining_operations.README.md`），那是入口处的"原料"文档。本 README 是出口处的"成品"文档。

## 数据来源链路

```
PA DEP / PASDA ────► amd_discharges_raw.geojson  ─┐
USGS NWIS Site Service ─► nwis_sites_raw.tsv     ─┤
EPA Water Quality Portal ─► wqp_stations_raw.csv ─┤  scrape_water_quality.py
                          ─► (Result service)    ─┤  scrape_acidity_alkalinity.py
                                                  ├──► newData/*.json (cleaned, statewide)
PA DEP Coal Mining Ops ────► coal_mining_operations.json ─┤
USGS NHD HR ────► stream_segments_slim.json ─────┘
                                                  │
                                                  ▼  finalize_data.py
                                                 final/   ◄── (本目录)
                                                  │
                                                  ▼  snap_to_segments.py
                                          attach_segment_id 填好
```

## 文件清单

| 文件 | 角色 | 条数 | 大小 |
| --- | --- | --- | --- |
| `collieries.json` | 煤矿 / 矿权点（PA DEP Coal Mining Operations，按 bbox 过滤后） | 1,320 | 331 KB |
| `pollution_sources.json` | AMD 排放点（PA DEP AML Inventory，bbox 内全量） | 630 | 398 KB |
| `monitoring_stations.json` | 水质监测站（NWIS + WQP 合并，bbox 内全量） | 2,083 | 681 KB |
| `water_quality_samples.json` | 实测水化学样本（13 个 characteristic，2015-01-05 → 2025-09-23） | 75,249 | 27.9 MB |
| `stream_segments.geojson` | NHD HR 河流网络（bbox + ftype 过滤后，转 GeoJSON FC） | 20,033 features | 11.3 MB |
| `_bbox.json` | bbox 元数据，方便其他脚本 / 后端引用 | (1 个对象) | <1 KB |

---

## 一、`collieries.json` — 煤矿 / 矿权点

来源：PA DEP Coal Mining Operations（PASDA layer 6，2026_04 版次，statewide 13,937 条）。
经 `finalize_data.py`：去 BOM、过滤 bbox（保留 1,320 条 / 9.5%）、丢哨兵坐标 51 条、`status` 归一化、字段重命名 `lat → latitude` / `lon → longitude`、加 `attach_segment_id`。

```json
{
  "id": "coll_1",
  "name": "READING ANTHRACITE W SPRING MINE",
  "operator": "WEST SPRING ENERGY LLC",
  "status": "ACTIVE",
  "latitude": 40.755,
  "longitude": -76.4906,
  "attach_segment_id": "26049981"
}
```

| 字段 | 含义 |
| --- | --- |
| `id` | 主键，格式 `coll_<OBJECTID>`。**注意** 与旧 toy `data/collieries.json` 的 `coll_1`/`coll_2` 占用同样格式但语义不同——切到 final 之后旧文件就不要再读了。 |
| `name` | 矿点 / 设施名（来自 `SITE_NAME`）。同名重复很常见，因为同一矿点可能有多条 permit 记录。 |
| `operator` | 持证人 / 运营方（来自 `CLIENT_NAM`）。bbox 内 1,385 个独特运营方，前 3：READING ANTHRACITE CO (86)、BLASCHAK ANTHRACITE CORP (57)、NORTHAMPTON FUEL SUPPLY (47)。 |
| `status` | 已归一化 → 6 种取值：`ACTIVE` / `INACTIVE` / `ABANDONED` / `RECLAMATION_COMPLETED` / `PROPOSED_NEVER_REALIZED` / `UNKNOWN`。原 raw 的 typo `'Unavaialble'` 和小写 `'Active'` 已合并。 |
| `latitude` / `longitude` | WGS84 十进制度。 |
| `attach_segment_id` | snap 到 `stream_segments.geojson` 上最近的 segment id（5 km cap）。**1,096 / 1,320 (83%) 已贴上**，其余为 null（多是不在河网上的矿权点）。 |

> ⚠️ `production_tons` / `opened_year` / `closed_year` 不在源数据里——`backend/models/colliery_model.py` 的这三个字段会一直留 None。讲故事时如需"产量驱动 marker 大小"，要从其他来源补（PA Geological Survey 历史出版物、Mine Subsidence Insurance 数据库等）。

---

## 二、`pollution_sources.json` — AMD 排放点

来源：PA DEP AML Inventory Points（PASDA），bbox 内 630 条全量保留，`finalize_data.py` 阶段无过滤——前一步 scrape 时已经按 bbox 抓的。

```json
{
  "id": "amd-816083",
  "name": "2039-07",
  "latitude": 40.6808,
  "longitude": -76.3653,
  "attach_segment_id": "26060188",
  "emission_rate": 6.0,
  "intensity": 0.006,
  "color": "#c97a3f",
  "source": { ... 出处元数据 ... }
}
```

### 顶层字段

| 字段 | 用途 |
| --- | --- |
| `id` | 主键 `amd-<sf_id>`。 |
| `name` | hover / 侧栏标题。 |
| `latitude` / `longitude` | Mapbox 上画点；前端拼 `[lon, lat]`。 |
| `attach_segment_id` | 粒子流起点河段 id。**538 / 630 (85%) 已 snap**；剩下 92 个超 5km cap，前端要 fallback 别让它们 spawn 粒子。 |
| `emission_rate` | 粒子生成速率（来自 `flow_gpm`）。**值域 1 → 840,000 跨 6 个数量级，必须做对数压缩或 cap**（建议 `Math.log10(1+rate)` 或 `min(rate, 200)`），否则瞬间撑爆 `maxParticles` (默认 1800)。 |
| `intensity` | 0–1，"污染浓度"权重。**目前 `MapView.jsx` 还没消费**——可作为 particle initial alpha / size 接入。 |
| `color` | 当前 630 条全是 `#c97a3f`（铁锈橙）。建议前端 runtime 按 `source.sf_status` 改写：`Reclamation Complete` 淡化甚至变绿，`Abandoned` 保持橙色。 |

### `source` 子对象 — 出处元数据 / 侧栏 evidence

| 字段 | 取值分布 | 用法 |
| --- | --- | --- |
| `dataset` | 固定 `"PA DEP AML Inventory Points"` | 侧栏来源标签 |
| `layer_url` | PASDA REST 服务地址 | 侧栏"原始记录"链接 |
| `sf_id` | 整数主键（PA DEP 内部 id） | 调试 / 回查用 |
| `sf_type` | `Impacted Water Source` (620) / `Waters Affected by Impacted Water Source` (8) / `AMD Ground Saturation` (2) | 分组意义有限 |
| `sf_status` | `Abandoned` (549) / `Reclamation Complete` (81) | **故事性最强**——上色或透明度区分 |
| `sf_priority` | `Priority has not been determined` (424) / `Environmental Impact` (169) / `Health or Safety Impact` (33) / `Extreme Health or Safety Impact` (4) | 驱动 marker 半径 / 外发光 |
| `problem` | 7 种 PA DEP 问题分类，如 `"14 AMD Discharge Area"` | 侧栏文字 |
| `flow_gpm_reported` | 原始 gpm 流量 | 侧栏"报告流量"；和 `emission_rate` 同值 |

---

## 三、`monitoring_stations.json` — 水质监测站

来源：USGS NWIS Site Service（968 sites）+ EPA Water Quality Portal（1,199 stations），按 station id 合并去重，bbox 内 2,083 条。

```json
{
  "id": "USGS-01536500",
  "name": "LACKAWANNA RIVER AT OLD FORGE, PA",
  "latitude": 41.4778,
  "longitude": -75.7341,
  "type": "Stream",
  "agency": "USGS Pennsylvania Water Science Center",
  "huc": "02050107",
  "attach_segment_id": "26049981",
  "drainage_area_sq_mi": 332.0,
  "altitude_ft": 528.0,
  "sources": ["WQP", "NWIS"]
}
```

| 字段 | 说明 |
| --- | --- |
| `id` | `AGENCY-NUMBER` 格式（`USGS-01536500` / `21PA_WQX-WQN0123`）。**直接 join 到 `water_quality_samples.station_id`**。 |
| `name` | 站点全名（WQP > NWIS）。 |
| `latitude` / `longitude` | WGS84 十进制度。 |
| `type` | 站点类型，**取值混杂**——NWIS-only 用 2 字母短码（`ST`/`SP`/`GW`），WQP-only 用长描述（`River/Stream` / `Stream` / `Well` / `Lake` / `Mine/Mine Discharge` / `Subsurface: Tunnel, shaft, or mine` 等共 15 种）。**消费时需归一化**，建议 lookup 表：`{"ST": "Stream", "SP": "Spring", "GW": "Groundwater", ...}`。**对 AMD 故事最相关**：21 个 `Mine/Mine Discharge` + `Subsurface: Tunnel, shaft, or mine` 站点本身就是矿坑，可作 colliery 代理证据。 |
| `agency` | 数据提供机构，10 种取值。短码 / 长名混用同上要归一化。 |
| `huc` | 8 位 HUC，bbox 内 15 个 distinct 值。**适合做"流域分组高亮"**：选中一个 colliery 时一键高亮同 HUC 站点。 |
| `attach_segment_id` | snap 到最近河段。**1,604 / 2,083 (77%) 已贴上**，p50 距离仅 53 m。剩下 479 多是 `Well` / `Lake` 这种本来就不在河上的。 |
| `drainage_area_sq_mi` / `altitude_ft` | **仅 NWIS-sourced 站点有**（约 968 / 2,083）。任何依赖它们的视觉编码都要 fallback。 |
| `sources` | `["WQP"]` (1,115) / `["NWIS"]` (884) / `["WQP","NWIS"]` (84)。**双源覆盖的 84 个最可信**。 |

⚠️ **样本覆盖只有 35%**：2,083 个 station 中只有 720 个在 2015-2025 窗口期里有 AMD-suite 样本——前端做 station 列表时要提示用户"这个站点没有数据"。

---

## 四、`water_quality_samples.json` — 实测水化学样本

来源：WQP Result service，2 次抓取合并（主 scraper 8 个特征 + `scrape_acidity_alkalinity.py` 补抓 5 个 Acidity/Alkalinity 变体）。每条记录是一次测量。

```json
{
  "station_id": "21PA_WQX-LEHESTP1",
  "characteristic": "Specific conductance",
  "value": 270.4,
  "value_raw": "270.4",
  "unit": "umho/cm",
  "sample_date": "2015-12-15",
  "sample_time": "10:48:00",
  "fraction": "",
  "method": "Specific Conductance",
  "agency": "PA DEPARTMENT OF ENVIRONMENTAL PROTECTION",
  "activity_id": "21PA_WQX-2007268"
}
```

| 字段 | 说明 |
| --- | --- |
| `station_id` | join 回 `monitoring_stations.id`。720 个 station 有数据。 |
| `characteristic` | **共 13 类**（按数量降序）：`pH` (11,541) / `Specific conductance` (11,286) / `Manganese` (7,672) / `Iron` (7,666) / `Dissolved oxygen (DO)` (7,664) / `Aluminum` (7,627) / `Temperature, water` (7,362) / `Sulfate` (5,490) / `Alkalinity, total` (3,983) / `Acidity, (H+)` (3,111) / `Alkalinity` (1,526) / `Alkalinity, carbonate` (180) / `Alkalinity, bicarbonate` (141)。AMD 严重程度建议：**`Acidity, (H+) ÷ Alkalinity, total` net 为正即 net acid**。 |
| `value` | 已 `float()` 解析；censored / 非数字时 null。 |
| `value_raw` | 原始字符串。**保留它就是为了不丢 `<0.005` / `ND` / `>500`**。聚合时记得处理 censored values（常见做法 `<DL` 用 `DL/2` 替代）。 |
| `unit` | **极不一致**——同一 characteristic 多种单位：`Iron`(`ug/L` / `mg/L` / 空 / `ug/g` / `mg/kg`)、`pH`(`None` / `std units`)、`Specific conductance`(`umho/cm` / `uS/cm @25C` / `uS/cm` / `mS/cm`)。**消费时必须归一化**（建议在后端 service 层把所有 `Iron` → `mg/L`、`Specific conductance` → `uS/cm`），固体单位（`ug/g` / `mg/kg` / `%`，多半是沉积物 / 鱼组织）建议直接丢。 |
| `sample_date` | ISO 日期，跨度 2015-01-05 → 2025-09-23（10 年，足够时序图）。 |
| `sample_time` | 当地时间 `HH:MM:SS` 或空。 |
| `fraction` | `Dissolved` / `Total` / 空。**对金属至关重要**——`Total Iron` 包含悬浮颗粒，`Dissolved Iron` 才是 AMD 急性毒性指标。后端 evidence 要么按 fraction 拆字段，要么明确只展示 Dissolved。 |
| `method` | 分析方法（如 `ICP-MS`、`Ph`）。可选展示。 |
| `agency` | 提交机构。前三：PA DEP (43,978) / USGS PA WSC (16,265) / SRBC (3,537)。 |
| `activity_id` | WQP sampling activity 主键，回查用。 |

> ⚠️ Acidity / Alkalinity 是事后通过 `scrape_acidity_alkalinity.py` 补抓——原 scraper 用裸名 `"Acidity"`/`"Alkalinity"` 全部 HTTP 400（错误信息藏在 WQP `Warning` header 里："not in the list of enumerated values"）。合法 CharacteristicName 是 `"Acidity, (H+)"` / `"Alkalinity, total"` 等，已修复。

---

## 五、`stream_segments.geojson` — 河流网络

来源：USGS NHD High Resolution（2023-12-15）。原始 199,849 段（覆盖 20 个 HUC-8），经 `finalize_data.py` 过滤 bbox + ftype 后剩 **20,033 features**。

每个 Feature：

```json
{
  "type": "Feature",
  "properties": {
    "id": "26060188",
    "name": "Jacoby Creek",
    "downstream_id": "26051564",
    "length_km": 0.098,
    "ftype": "StreamRiver",
    "huc8": "02040105"
  },
  "geometry": {
    "type": "LineString",
    "coordinates": [[-76.32, 40.81], [-76.30, 40.80], [-76.28, 40.79]]
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `properties.id` | NHD `permanent_identifier`，**纯数字字符串**（如 `"26060188"`）。pollution_sources / stations / collieries 的 `attach_segment_id` 引用这个值。 |
| `properties.name` | NHD `gnis_name`，无名小溪为 null。约 29% 河段有名字。 |
| `properties.downstream_id` | ⭐ 下游连接的 segment id；从源头跟着这个字段一路走能拼出完整流向。**已清理过 4 个 dangling 引用 + 653 个跨 bbox 边界引用全部置 null**。 |
| `properties.length_km` | 河段长度，p50 ≈ 0.18 km，p90 ≈ 1.2 km，max ≈ 38.8 km。 |
| `properties.ftype` | **`finalize_data.py` 只保留 `StreamRiver` 和 `ArtificialPath`**——后者是穿湖 / 水库的虚拟流线（拓扑连续性需要）。`Pipeline` / `Coastline` / `Connector` / `CanalDitch` 全部被丢。 |
| `properties.huc8` | 8 位 HUC，**与 monitoring_stations.huc 同字段**，可以做流域级 join。 |
| `geometry` | LineString，**3 点近似**（start / midpoint / end）。原 NHD 含每段几十到几百个点，slim 版只取 3 点把文件压到 11 MB。粒子模拟 (`polyline.js`) 沿 LineString 做线性插值，3 点足够；要在 GIS 软件里精确绘制走向请用 `data/newData/stream_segments.json`（383 MB 完整版，没有放进 final）。 |

> ⚠️ 旧 `data/stream_segments.geojson` 还在仓库里（2 段 toy LineString），后端 / 前端切到 final 之后那个文件就不要再读。

---

## 六、`_bbox.json` — bbox 元数据

```json
{
  "west": -76.85,
  "south": 40.50,
  "east": -75.20,
  "north": 41.65,
  "name": "Pennsylvania Anthracite Region"
}
```

后端做 evidence packet 时可以引用这个文件，省得 hard-code。前端 Mapbox 初始 viewport 也可以从这里 fitBounds。

---

## 七、接入到现有可视化时的注意事项

### A. 后端服务路径要改

| 服务 | 当前读 | 应改为 |
| --- | --- | --- |
| `colliery_service.py` | `data/collieries.json` (toy) | `data/final/collieries.json` |
| `station_service.py` | `data/stations.json` (toy) | `data/final/monitoring_stations.json` |
| `sample_service.py`（如有）| `data/samples.json` (toy) | `data/final/water_quality_samples.json` |
| `simulation_routes.py` | `data/stream_segments.geojson` (toy) | `data/final/stream_segments.geojson` |
| `simulation_routes.py` | `data/pollution_sources.json` | `data/final/pollution_sources.json` |
| `harm_service.py` | `data/harms.json` (toy) | （下一步生成 `data/final/harms.json`） |

### B. 字段名差异需要后端 / 前端一起改

| 原代码 | 现实 |
| --- | --- |
| `station.lat` / `station.lon` | `station.latitude` / `station.longitude` |
| `colliery.lat` / `colliery.lon` | `colliery.latitude` / `colliery.longitude` |
| `sample.parameter` | `sample.characteristic` |
| `sample.timestamp` | `sample.sample_date` + `sample.sample_time` |
| `sample.sample_id` | `sample.activity_id` |

### C. 后端 service 层应做的归一化

1. **`type` / `agency` 短码 → 长描述**：站点的 NWIS 短码 (`ST`/`SP`/`GW`/`USGS`) 在写 evidence 包前展开。
2. **`unit` 归一化**：金属一律 mg/L、电导率一律 uS/cm；丢固体单位（`ug/g` / `mg/kg` / `%`）。
3. **`fraction` 区分金属**：`Iron` / `Manganese` / `Aluminum` 必须按 `fraction == "Dissolved"` 过滤再聚合，不然 Total Iron 会显得离谱地高。
4. **censored values**：`value === null` 但 `value_raw` 非空时，按数据科学惯例用 `<DL` → `DL/2`。

### D. 前端 / 模拟器

5. `emission_rate` 范围 1–840,000 → 必须 `Math.log10(1+rate)` 或 cap。
6. `MapView.jsx` 当前只对第一个 source 跑粒子；扩到全部 538 个 snap 成功的 source 时考虑视口剔除。
7. `intensity` / `color` 按 `source.sf_status` 改写以体现"已修复 vs 未修复"对比。
8. **没 snap 上的点**（pollution: 92 / station: 479 / colliery: 224）`attach_segment_id` 是 null——前端要 fallback 让它们只画 marker、不参与粒子流 / 不画下游路径。

---

## 八、辅助脚本（在 `data/ScraperFiles/` 下）

按 pipeline 顺序：

| 脚本 | 用途 | 何时跑 |
| --- | --- | --- |
| `scrape_water_quality.py` | 主 scraper：从 NWIS + WQP 拉 stations 和 8 个 AMD 特征样本 | bbox / 时间窗口变化时 |
| `scrape_acidity_alkalinity.py` | 用合法 CharacteristicName 补抓 Acidity / Alkalinity，按 `(activity_id, characteristic)` 去重 merge | 主 scraper 之后；可加 `--probe` 仅诊断 |
| `inspect_new_data.py` | 一次性 sanity check：检查 bbox 覆盖率、字段分布、downstream id 完整性 | 队友交付新数据时跑一次 |
| `finalize_data.py` | bbox 过滤 + BOM 处理 + 字段重命名 + ftype 过滤 + 转 GeoJSON FC，落到 `data/final/` | 上游任一文件变更后 |
| `snap_to_segments.py` | 把 collieries / pollution_sources / monitoring_stations 的点 snap 到最近 stream segment，写回 `attach_segment_id` | `finalize_data.py` 之后；河网替换时用 `--force` 重 snap |
| `probe_wqp_acidity.py` | 一次性诊断：列 WQP 词表里所有合法 Acidity / Alkalinity CharacteristicName | 词表更新时再用 |

**完整重跑顺序**：`scrape_water_quality` → `scrape_acidity_alkalinity` → `inspect_new_data` → `finalize_data` → `snap_to_segments`。所有脚本都是幂等的。

---

## 九、出处审计（在 `data/newData/` 下）

| 文件 | 谁产生 | 在 final 里的对应物 |
| --- | --- | --- |
| `amd_discharges_raw.geojson` | PA DEP / PASDA REST | → `pollution_sources.json` |
| `pollution_sources.json` | scrape_water_quality 副产 | → `pollution_sources.json` (passthrough) |
| `nwis_sites_raw.tsv` | USGS NWIS | → `monitoring_stations.json` |
| `wqp_stations_raw.csv` | EPA WQP | → `monitoring_stations.json` |
| `monitoring_stations.json` | 上两者合并 | → `monitoring_stations.json` (passthrough) |
| `water_quality_samples.json` | WQP Result + Acidity 补抓 | → `water_quality_samples.json` (passthrough) |
| `coal_mining_operations.json` | PA DEP Coal Mining Ops（队友） | → `collieries.json` (filter + rename + status normalize) |
| `stream_segments_slim.json` | NHD HR（队友） | → `stream_segments.geojson` (filter + 转 GeoJSON FC) |
| `stream_segments.json`（383 MB 完整版） | NHD HR（队友） | （未进 final，留作 GIS 精绘备用） |

每份原始 README 还在 `newData/`：
- `README_all.md` — AMD 排放点 + 监测站 + 样本字段详细文档
- `README_riversegments.md` — NHD 流网详细文档
- `coal_mining_operations.README.md` — 煤矿点详细文档
