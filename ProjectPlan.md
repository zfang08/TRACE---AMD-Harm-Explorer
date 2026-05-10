## AMD Harm Demo 开发规划

### 1. 项目目标与核心概念

- **项目目标**
  - 用最小可行产品（MVP）清晰演示：从煤矿开采（Colliery） → AMD Harm 对象（AMDHarm） → 河流环境影响（StreamSegment）的逻辑链条。
  - 前端通过 React + Mapbox 交互地图展示；后端用 Flask 提供 REST API，读取本地 JSON / GeoJSON 数据。

- **核心对象模型（与后端 DM 对齐）**
  - **GeoEntity（抽象）**：所有带空间几何的实体基类，包含 `id`、`name`、`geometry`、`sourceRefs`。
  - **CoalUnit**：地质煤层单元（未来可扩展，用来组织多个 Colliery）。
  - **Colliery**：煤矿实体，扩展 `GeoEntity`，包含 `operator`、`status`、`productionTons`、`openedYear`、`closedYear` 等。
  - **MonitoringStation**：监测站实体，扩展 `GeoEntity`，包含 `stationCode`、`agency`、`stationType`。
  - **WaterQualitySample**：水质样本记录，连接到 `MonitoringStation`。
  - **StreamSegment（Reach）**：河流河段，扩展 `GeoEntity`，包含 `reachId`、`watershedId`、`lengthKm`、`impairedStatus`、`impairmentCause`。
  - **AMDHarm**：AMD 危害对象，聚合 `sourceCollieryIds`、`supportingStationIds`、`affectedReachIds`，并可根据样本计算 `keyMetrics` 与生成 `toEvidencePacket()`。

### 2. 项目结构与基础环境

- **目录结构**

  - `amd-harm-demo/`
    - `backend/`
      - `app.py`
      - `routes/`
        - `harm_routes.py`
        - `colliery_routes.py`
        - `station_routes.py`
      - `services/`
        - `harm_service.py`
        - `colliery_service.py`
        - `station_service.py`
      - `models/`
        - `harm_model.py`
        - `colliery_model.py`
        - `station_model.py`
    - `data/`
      - `collieries.json`
      - `stations.json`
      - `harms.json`
      - `stream_segments.geojson`
    - `frontend/`
      - `public/`
      - `src/`
        - `components/`
          - `MapView.js`
          - `Sidebar.js`
          - `HarmPanel.js`
          - `CollieryPanel.js`
        - `services/`
          - `api.js`
        - `App.js`
        - `index.js`
    - `requirements.txt`
    - `README.md`

- **基础环境规划**
  - **后端**
    - 使用 `venv` 创建虚拟环境。
    - `requirements.txt` 至少包含：`Flask`, `flask-cors`（前后端联调更方便）。
  - **前端**
    - 在 `frontend/` 使用 React 脚手架（如 Vite + React 或 CRA；实现时再具体选择）。
    - 安装 `mapbox-gl` 和基础依赖。

### 3. 数据层规划（Data Layer）

- **数据文件设计（当前实现 + 目标形态）**
  - **当前 MVP 文件**
    - **`collieries.json`**
      - 字段：`id`, `name`, `lat`, `lon`, `production_tons`（可再加 `status`、`opening_year` 等扩展字段）。
    - **`stations.json`**
      - 字段：`id`, `name`, `lat`, `lon`, `ph`, `iron`, `manganese`。
    - **`harms.json`**
      - 字段：
        - `id`
        - `name`
        - `severity`（如 `low/medium/high`）
        - `source_collieries`（colliery id 数组）
        - `supporting_stations`（station id 数组）
        - `affected_stream_segments`（stream segment id 数组）。
    - **`stream_segments.geojson`**
      - 标准 GeoJSON，`FeatureCollection`，`LineString` 为主。
      - `properties` 至少有：`id`, `name`（如 “Upper Schuylkill”），`severity`（可选）。
  - **目标 DM 对应的数据文件（可逐步演进）**
    - `coal_units.geojson`：驱动 `CoalUnit` 和 Colliery 分组（可选，后续扩展）。
    - `collieries.geojson`：用 GeoJSON 替代当前 `collieries.json`。
    - `amd_harms.geojson`：AMDHarm 空间化表示（如 harm cluster 的范围）。
    - `stations.geojson`：监测站带几何的版本（可复用现有 `stations.json` 字段）。
    - `samples.geojson`：水质样本（`WaterQualitySample`）数据源。
    - `stream_segments.geojson`：现有文件，承载 `StreamSegment / ReachObj`。

- **数据加载约定**
  - 所有 service 层函数只从 `../data/*.json` / `../data/*.geojson` 读取。
  - 读取后在内存中做简单关联（join）即可，不接数据库。

### 4. 后端规划（Flask + REST API）

#### 4.1 `app.py` 与蓝图注册

- **`backend/app.py`**
  - 创建 Flask 实例。
  - 注册三个蓝图：
    - `harm_routes`
    - `colliery_routes`
    - `station_routes`
  - 配置 CORS（允许 `http://localhost:3000` 或当前前端端口）。
  - 提供开发环境启动 `app.run(debug=True)`。

#### 4.2 Models 层（领域数据结构 / DM）

- **目标：显式建模上述类图中的对象**
  - 在 `backend/models/` 下使用 Python dataclass（或简单类）表示：
    - `GeoEntity`（抽象基类）
    - `CoalUnit`
    - `Colliery`
    - `MonitoringStation`
    - `WaterQualitySample`
    - `StreamSegment`
    - `AMDHarm`
  - MVP 阶段可继续在 service 中使用 dict；随着需求增加，可以逐步将当前 `*_model.py` 升级为真正的 DM 类定义，并为 `AMDHarm` 增加 `summarize(samples)` 与 `toEvidencePacket()` 方法。

#### 4.3 Service 层（业务逻辑）

- **`colliery_service.py`**
  - `load_collieries()`: 从 `collieries.json`（后续可改为 `collieries.geojson`）加载列表。
  - `get_colliery_by_id(id)`: 根据 id 查找。

- **`station_service.py`**
  - `load_stations()`
  - `get_station_by_id(id)`
  - 后续：增加加载单站样本的逻辑（与 `WaterQualitySample` / `samples.geojson` 关联）。

- **`harm_service.py`**
  - `load_harms()`: 从 `harms.json` 加载 Harm 列表。
  - `get_harm_by_id(harm_id)`: 根据 id 返回 Harm dict / `AMDHarm`。
  - `build_harm_evidence(harm_id)`: 组合：
    - 源煤矿信息（从 `colliery_service`）
    - 监测站信息（从 `station_service`）
    - 受影响河段（从 `stream_segments.geojson` 读取并过滤）
  - 当前实现已经基本等价于 `AMDHarm.toEvidencePacket()`，后续可抽离为独立的 `EvidenceService`。

- **后续可新增的 Service**
  - `EvidenceService`：围绕 `AMDHarm` 组装完整 evidence packet（Collieries + Stations + Samples + StreamSegments）。
  - `SampleService`（或在 `station_service` 内部）：从 `samples.geojson` 读取样本，并基于 `timeWindowStart/End` 进行过滤与统计。

#### 4.4 Routes 层（RESTful API）

- **`routes/colliery_routes.py`**
  - `GET /api/collieries`：返回所有 Collieries 基本信息（用于地图点图层）。
  - `GET /api/collieries/<id>`：返回单个 Colliery 详情 + 它关联的 Harm 概要（如 Harm id、name）。

- **`routes/harm_routes.py`**
  - `GET /api/harms`：返回所有 Harm 列表（用于 Sidebar 列表或调试）。
  - `GET /api/harms/<id>`：
    - MVP：可以返回单个 Harm 的基本信息（或兼容当前的 evidence 结构）。
  - `GET /api/harms/<id>/evidence`（计划新增，与 DM 对齐）：
    - 使用 `harm_service.build_harm_evidence` / `EvidenceService`。
    - 返回结构类似：

      ```json
      {
        "harm_id": "harm_1",
        "name": "Upper Schuylkill AMD Cluster",
        "severity": "high",
        "source_collieries": [
          { "id": "coll_1", "name": "Girardville Colliery" }
        ],
        "stations": [
          { "id": "station_1", "name": "Schuylkill Station A", "ph": 3.2, "iron": 11.4 }
        ],
        "affected_streams": [
          { "id": "seg_3", "name": "Upper Schuylkill" }
        ]
      }
      ```

- **`routes/station_routes.py`**
  - `GET /api/stations`（可选，用于调试或未来扩展）。
  - `GET /api/stations/<id>`（可选：展示单站详情）。
  - `GET /api/stations/<id>/samples`（计划新增）：
    - 返回指定监测站的 `WaterQualitySample` 列表，用于在 AMDHarm 证据中展示时间序列或统计指标。

### 5. 前端规划（React + Mapbox）

#### 5.1 前端基础架构

- **启动方式**
  - 在 `frontend/` 初始化 React 项目。
  - `public/` 包含 Map 容器的基础 HTML。
  - `src/index.js` 挂载 `App` 组件。
  - `src/services/api.js` 封装所有调用 Flask API 的函数：
    - `getCollieries()`
    - `getCollieryById(id)`
    - `getHarms()`
    - `getHarmById(id)`

#### 5.2 UI 组件规划

- **`App.js`**
  - 布局：左侧 `Sidebar`，右侧 `MapView`。
  - 管理选中状态：
    - `selectedCollieryId`
    - `selectedHarmId`
  - 接收地图点击回调，更新 Sidebar 内容。

- **`MapView.js`**
  - 初始化 Mapbox 地图：
    - `center: [-76.3, 40.8]`
    - `zoom: 8`
    - `style: "mapbox://styles/mapbox/light-v10"`
  - 从后端加载：
    - Collieries 点数据（前端转换为 GeoJSON `FeatureCollection`）。
    - Harm 触发时需高亮的 StreamSegments（调用 `GET /api/harms/<id>` 后，再加载/筛选 `stream_segments.geojson`，或由后端直接返回相关 segment 几何）。
  - 事件：
    - 在 `collieries` 图层上 `"click"`：
      - 读取 `e.features[0].properties.id` 作为 Colliery id。
      - 调用 `onCollieryClick(id)` 回调给 `App`。
    - 点击 Harm 可通过 Sidebar 控件触发，MVP 不强制在地图上点。

- **`Sidebar.js`**
  - 接收当前选中状态与数据：
    - `selectedColliery`
    - `selectedHarm`
  - 根据状态切换显示：
    - 如果选中了 Colliery：渲染 `CollieryPanel`。
    - 如果选中了 Harm：渲染 `HarmPanel`。
    - 默认展示简单说明或 Harm 列表。

- **`CollieryPanel.js`**
  - 显示：
    - Colliery 名称
    - 生产量
    - 所关联的 Harm 概要（列表 + “查看 Harm 详情”按钮）。
  - 点击 Harm 按钮 → 调用 `onHarmSelect(harmId)` → 请求 `/api/harms/<id>`。

- **`HarmPanel.js`**
  - 显示：
    - Harm 名称、严重程度。
    - 源煤矿列表（名称 + 生产量等简要信息）。
    - 监测站列表（pH / iron / manganese）。
    - 受影响河段名称列表。
  - 同时，通过 props 通知 `MapView` 高亮相关河段和站点。

### 6. 交互流程设计（Demo 场景）

- **场景 1：点击煤矿（Colliery）**
  - 地图：
    - 用户在 `collieries` 图层点击一个煤矿点。
  - 前端：
    - `MapView` 获取 `colliery_id`，调用 `/api/collieries/<id>` 或在前端已有列表中查找。
    - `App` 更新 `selectedCollieryId`，Sidebar 显示 `CollieryPanel`。
  - Sidebar：
    - 显示：
      - Colliery 名称、生产量。
      - 关联的 Harm 列表（例如 “Upper Schuylkill AMD Cluster”）。
      - “查看 Harm 详情”按钮。

- **场景 2：点击 Harm Object**
  - Sidebar：
    - 用户在 `CollieryPanel` 中点击某个 Harm。
  - 前端：
    - 调用 `GET /api/harms/<id>`。
    - `App` 设置 `selectedHarmId`，携带完整 evidence 数据传给 `HarmPanel` 和 `MapView`。
  - 地图：
    - 高亮该 Harm 关联的 `StreamSegments`（线）。
    - 可选：高亮关联的监测站点。

- **场景 3：点击监测站（Monitoring Station）**
  - 地图或 Sidebar：
    - 用户点击某个监测站点或列表项。
  - Sidebar：
    - 显示该站点的：
      - pH、铁、锰等关键指标。
      - 与 Harm 的关系（如“此站点位于 Harm_1 下游”）。
  - MVP 版本可先在 `HarmPanel` 里直接列出站点信息，无需额外点击。

### 7. 分阶段实施计划

- **阶段 0：初始化项目**
  - 创建 `amd-harm-demo/` 目录结构。
  - 建立 `backend/`、`data/`、`frontend/` 空目录。
  - 创建 `requirements.txt`、初版 `README.md`。

- **阶段 1：数据与后端 API**
  - 写出示例 `collieries.json`、`stations.json`、`harms.json`、`stream_segments.geojson`。
  - 实现 `services/*` 基础加载函数。
  - 实现 `routes/*`：
    - 完成 `GET /api/collieries`、`GET /api/harms`、`GET /api/harms/<id>`。
  - 在 Postman / 浏览器中验证 API 返回结构正确。

- **阶段 2：前端基础 UI + Mapbox**
  - 初始化 React 工程。
  - 在 `MapView.js` 中完成 Mapbox 初始化与基础地图显示。
  - 调用 `GET /api/collieries`，把煤矿点展示到地图上（circle layer）。

- **阶段 3：交互逻辑与 Sidebar**
  - 实现点击煤矿 → `CollieryPanel` 展示详情。
  - 在 `CollieryPanel` 中添加 Harm 列表和“查看 Harm”按钮。
  - 实现点击 Harm → `HarmPanel` 展示 evidence，并通知地图高亮河段。

- **阶段 4：打磨与演示优化**
  - 优化样式（简洁、易读，突出 harm 对象链路）。
  - 添加颜色编码：
    - Harm severity 显示为不同颜色。
    - 河段根据严重程度加粗/变色。
  - 将演示步骤写入 `README.md`：
    - 如何启动 backend。
    - 如何启动 frontend。
    - 演示脚本（点哪几个点可以看到完整链条）。

- **阶段 5：按 DM 扩展 Evidence 与样本（当前类图对应）**
  - 在 `models/` 中补充 `GeoEntity / CoalUnit / MonitoringStation / WaterQualitySample / StreamSegment / AMDHarm` 等 dataclass。
  - 新增或调整：
    - `GET /api/harms/<id>/evidence`：专职返回 `AMDHarm.toEvidencePacket()`。
    - `GET /api/stations/<id>/samples`：返回指定监测站的 `WaterQualitySample`。
  - 在 `HarmPanel` 中逐步使用上述新端点，展示更丰富的 evidence（时间窗口、样本统计、keyMetrics 等）。

### 8. README 与 Demo 说明规划

- **`README.md` 内容大纲**
  - **项目简介**：一句话说明 “Colliery → AMD Harm → Stream impact”。
  - **技术栈**：Flask + React + Mapbox + JSON。
  - **目录结构说明**：简要解释 `backend/`、`frontend/`、`data/` 各自职责。
  - **运行步骤**：
    - 安装 Python 依赖并启动 Flask。
    - 安装前端依赖并启动 React dev server。
  - **演示流程**：
    - 打开浏览器 → 点击煤矿 → 查看 Harm → 观察河段高亮和监测站指标。
  - **后续扩展（TODO）**：
    - 接数据库、加时间序列、添加更多统计分析等。

