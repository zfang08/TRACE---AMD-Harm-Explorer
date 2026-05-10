## AMD Flow Visualization（Simulation）Implementation Plan

本文件把 `SIMULATION.md` 与 `simulation.text` 合并整理成一份可执行的实现计划，目标是做一个**视觉上可信、可调参、可演示**的 AMD 下游传播动画，而不是水文/化学精确模拟。

---

### 1. 项目目标（Goal）

- **做什么**：在 Mapbox 地图上，把 AMD 污染从若干“源点（source points）”沿着“河网线段（stream segments）”以**粒子流（particles）**的方式动画展示出来。
- **传达什么**：
  - AMD 从哪里进入系统（sources）
  - 污染如何沿河网下游移动（stream-constrained）
  - Harm 如何随时间向下游传播（time progression）
- **不做什么（Out of Scope）**：
  - 向量场/自由流体运动（wind-like motion）
  - 水文精确计算、地形推导流向
  - 化学反应/溶解沉淀求解
  - 后端实时模拟循环（simulation 全在前端跑）

---

### 2. MVP Definition of Done（验收标准）

MVP 完成的标准：

- 地图能正常加载（Mapbox）
- 河网线段可见（StreamSegments layer）
- 污染源点可见（Sources layer）
- 点击 Play 后，粒子**沿河段几何**向下游流动
- 粒子随时间**渐隐/消亡**
- 能调整关键参数（速度、寿命、发射率、上限、fade/jitter）且不会把应用弄崩
- 视觉表达清晰，适合 thesis/demo 展示

---

### 3. 输入/输出数据（Data Contract）

#### 3.1 Required Input Data

##### A) Stream Segments（GeoJSON LineString）

每条河段 feature 的 `properties` 至少要有：

- `id`：当前河段 id
- `downstream_id`：下游河段 id（缺失/为空表示终点）
- `name`：可选

示例（简化）：

```json
{
  "type": "Feature",
  "geometry": { "type": "LineString", "coordinates": [[-76.312, 40.802], [-76.308, 40.799]] },
  "properties": { "id": "seg_001", "downstream_id": "seg_002", "name": "Tributary A" }
}
```

##### B) Pollution Sources（JSON points）

每个 source 至少要有：

- `id`
- `name`（可选）
- `coordinates`: `[lon, lat]`
- `attach_segment_id`: 绑定到某条河段（MVP 直接指定；后续可做最近线段匹配）
- `emission_rate`: 每秒/每 tick 发射数量（或用于计算发射数量）
- `intensity`: 强度（0-1），用于颜色/密度等
- `color`: 建议直接给颜色，方便 demo

示例：

```json
[
  {
    "id": "src_001",
    "name": "AMD Outfall A",
    "coordinates": [-76.312, 40.802],
    "attach_segment_id": "seg_001",
    "emission_rate": 10,
    "intensity": 0.9,
    "color": "#ff6b00"
  }
]
```

##### C) Simulation Config（JSON）

建议保留这些可调参：

- `particleSpeed`
- `particleLife`
- `fadeRate`
- `particleSize`
- `jitter`
- `maxParticles`
- `spawnInterval`

示例：

```json
{
  "particleSpeed": 16,
  "particleLife": 10,
  "fadeRate": 0.08,
  "particleSize": 3,
  "jitter": 0.00005,
  "maxParticles": 2000,
  "spawnInterval": 0.2
}
```

#### 3.2 Expected Output（每帧粒子状态）

每帧（或每 tick）产出：

- `time`
- `particles[]`：每个粒子含 `id`、`coordinates`、`opacity`、`size`、`color`

渲染时可转为 GeoJSON points 并用 Mapbox source `setData` 更新。

---

### 4. 核心实现策略（Core Decision）

- **运动约束**：粒子只能沿 stream segment 的 LineString 坐标移动；不允许离开河网做自由漂移。
- **下游连接**：通过 `downstream_id` 形成单向图（DAG 或链），MVP 只需要沿链向下游走即可。
- **浏览器端模拟**：用 JS animation loop（`requestAnimationFrame`）驱动更新；后端仅负责数据服务（可选）。

---

### 5. 核心算法（Simulation Logic）

#### Step 1：Build Segment Graph

建立 `segmentsById`：

- `segmentsById[id] = { id, coordinates, downstreamId }`

并可预计算：

- 每段累计长度（用于 distance → coordinate 插值）
- 每段的分段长度数组（加速插值）

#### Step 2：Build Downstream Path（source → segment chain）

对每个 source：

- 从 `attach_segment_id` 开始
- 反复 follow `downstream_id`
- 遇到 null / 缺失即停止

得到：

- `sourcePath = ["seg_001", "seg_002", "seg_004", ...]`

#### Step 3：Spawn Particles

每个 tick：

- 对每个 source，按 `emission_rate` 与 `spawnInterval` 计算应生成多少粒子
- 粒子状态至少包含：
  - `sourceId`
  - `path[]`（或指向 sourcePath）
  - `segmentIndex`
  - `distanceAlongSegment`
  - `age`
  - `opacity`
  - `color`

#### Step 4：Move Particles（downstream）

每帧（dt 秒）：

- `distance += particleSpeed * dt`
- 若超过当前 segment 长度：
  - `segmentIndex += 1`
  - `distance = distance - currentLen`（或重置 0）
- 若无下一个 segment：kill particle

#### Step 5：Age & Fade

每帧：

- `age += dt`
- `opacity = max(0, opacity - fadeRate * dt)`
- 若 `age > particleLife` 或 `opacity <= 0`：kill

#### Step 6：Render（Mapbox）

每帧：

- 将每个粒子的当前位置转为 GeoJSON point feature
- `map.getSource("particles").setData(geojson)`
- 用 circle layer 渲染，支持按 `color/opacity/size` 表达

---

### 6. 渲染策略（Rendering Strategy）

#### 首选 MVP

- 使用一个 GeoJSON source（particles）+ circle layer
- 每帧更新 `setData`
- 粒子数量建议 500–3000（可通过 `maxParticles` 控制）

#### 性能优化（需要时再做）

- 预计算 segment 长度与插值缓存，避免每帧重算几何
- 复用粒子对象（对象池）
- 粒子太多时：
  - 降低 emission_rate
  - 增大 spawnInterval
  - 限制渲染粒子数
- 如果 Mapbox `setData` 不够快：
  - 再考虑 custom layer 或 canvas（第二阶段）

---

### 7. UI 控件（Controls）

最小 UI：

- Play / Pause / Reset
- sliders：
  - particleSpeed
  - emissionRate（全局倍率或逐 source）
  - maxParticles
  - fadeRate

控件位置建议放在 Sidebar（或一个小浮层）。

---

### 8. 推荐模块划分（落地到当前 React 项目）

> `simulation.text` 给的建议是纯前端工程结构；在我们 React 项目中建议按下列方式落地。

建议新增目录：

- `frontend/src/sim/`
  - `segmentGraph.js`：解析 stream GeoJSON，构建 `segmentsById` 与长度缓存
  - `sourceManager.js`：读取 sources/config，管理发射计时
  - `particleEngine.js`：粒子对象、update loop、spawn/move/fade
  - `renderParticles.js`：把粒子状态转 GeoJSON，更新 Mapbox source
  - `utils.js`：插值、距离、jitter 等

与组件的衔接：

- `MapView.jsx`
  - 加载 stream layer / sources layer
  - 初始化 particles source/layer
  - 在 `requestAnimationFrame` 中调用 engine + renderer
- `Sidebar.jsx`
  - 放 Play/Pause/Reset + sliders（可先做全局 config）

---

### 9. Implementation Priority（分阶段）

#### Phase 1：地图与静态层

- 初始化 Mapbox
- 渲染 stream segments（线层）
- 渲染 sources（点层）

#### Phase 2：河网连通性

- segment graph：`segmentsById`
- 为每个 source 构建 downstream path

#### Phase 3：粒子引擎 + 动画

- spawn + move
- 每帧更新渲染数据（GeoJSON source setData）

#### Phase 4：视觉增强与参数化

- fade + jitter
- 参数控件可调（速度/发射/上限/fade）

#### Phase 5：打磨与优化

- 清理 UI 样式
- 性能优化（缓存/对象池/降采样）
- 准备 demo 的默认参数与脚本

---

### 10. 与现有 AMD-Harm Object Model 的关系（对演示叙事有用）

本 simulation 模块的定位：

- 作为 `AMDHarm` 的**可视化表达**：把 “harm affects reaches” 从静态列表变成“随时间向下游传播”的动态叙事。
- 数据上最少需要：
  - `AMDHarm.affectedReachIds`（用于决定哪些 stream segments 被激活）
  - `sources`（可从 colliery/outfall 推导，或直接 mock）

后端不是必须参与模拟循环；只要能提供 GeoJSON/JSON 数据即可。

