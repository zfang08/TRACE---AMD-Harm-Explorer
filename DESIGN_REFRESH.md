# TRACE 视觉系统改造记录 — 2026-05-11

> 一次性把 chrome 从 "slate-blue SaaS dashboard" 翻到 "Linear / Next.js / Augen 那一脉的冷峻仪器面板"。白底 + hairline 黑线 + 胶囊按钮 + 磨砂玻璃 + mono micro-badge。

---

## 一、这一轮改了什么（5 个文件）

### `frontend/index.html`
- 接入 Google Fonts：**Inter** (400/500/600)、**JetBrains Mono** (400/500)、**Fraunces** (variable: opsz/wght/SOFT/WONK)
- body 默认字体改 Inter，背景色改冷白 `#fafafa`
- 开启 `tnum` / `ss01` / `cv11` font features，默认 `letter-spacing: -0.005em`（紧排）

### `frontend/src/styles.css` — 设计 token 系统（**核心**）
完整重写。所有后续组件应该从这里取色取字，不再写死 hex。

**色板（CSS variables）**
| Token | 值 | 用途 |
|---|---|---|
| `--bg` / `--bg-2` / `--bg-3` | `#fff` / `#fafafa` / `#f4f4f5` | 背景 3 级 |
| `--ink` → `--ink-5` | `#0a0a0a` → `#d4d4d4` | 文字 5 级灰阶 |
| `--hairline` 系列 | rgba(0,0,0,0.04 ~ 0.14) | 描边 4 个层级 |
| `--surface` / `--surface-strong` | rgba(255,255,255,0.74 / 0.92) | 磨砂面板底 |
| `--accent` | `#b9341e` | rust，给 AMD severity |
| `--accent-deep` | `#7a1e10` | extreme severity |
| `--accent-steel` | `#2f4858` | stations / 水 |

**字体**
- `--font-sans: Inter`（默认）
- `--font-mono: JetBrains Mono`（数据 / 坐标 / ID）
- `--font-display: Fraunces`（splash 偶尔用，默认弃用）

**几何**
- `--radius-pill: 999px`（按钮）
- `--radius-lg: 14px`（面板）
- 其他：4 / 6 / 10 / 18 各级

**工具类**
- `.surface` — 白磨砂玻璃面板（`blur(40px) saturate(180%)` + hairline + 多层阴影）
- `.pill-badge` — Next.js 风的 mono 小标签
- `.pill-btn` — 胶囊按钮（hover / `data-active` 自动反相）
- `.font-display` / `.font-mono` — 字体切换
- `.sidebar-scroll` — 极细滚动条

### `frontend/src/components/IntroOverlay.jsx` — splash 屏
- 顶部 mono pill `PA · ANTHRACITE · 41.20°N 76.00°W`，带红色 LED 状态点
- 主标 `TRACE.` —— Inter 500 极紧排（`letter-spacing: -0.045em`），点号红色
- 中部 hairline rule + 小标 `AMD HARM ATLAS — V0.1`
- Inter tagline（不再衬线斜体）
- CTA `Open the atlas →` —— pill 形态，hover 反相填充
- 底部 4 个数据来源 mono pills

### `frontend/src/components/Sidebar.jsx`
- 套 `.surface` chrome
- **折叠时 border-radius 动画到 999px** —— 变成胶囊药丸
- Header `TRACE.` 短紧排 + 右侧 `Harm Atlas` mono pill
- 搜索框改 pill 形（focus 时 ink 描边 + 4px halo）
- 搜索结果下拉的类型标签变 pill
- `Exit` 按钮改 pill，hover 反相
- `VizToggle` 重写：圆点 LED 状态指示（带颜色 halo）+ 胶囊外形 + mono hint
- Welcome 面板：mono pill 眉头 `ATLAS · v0.1`，Inter 紧排标题

### `frontend/src/components/LayerControlPanel.jsx`
- 套 `.surface`，折叠同样变胶囊
- Header 跟 Sidebar 对齐
- **新增 `<HairlineToggle>`** — 自定义 iOS 风滑动开关（替换浏览器原生 checkbox）
- **新增 `<ViewModeRow>` 滑动 thumb 分段控件** — 黑 thumb 在 pill 轨道滑动切 2D/3D
- 计数变 mono pill badge
- 图层 legend chips 全部包成 pill
- `LAYER_LEGENDS` 颜色板：Tailwind slate/red → 新 ink+rust 系统

---

## 二、当前局限（**还没改的部分**）

下面这些组件还在用老的颜色和样式，跟新 chrome 视觉断层。**Phase 2 必须扫一遍。**

| 组件 | 现状 | 触发场景 |
|------|------|----------|
| `HarmPanel.jsx` | 老 slate 色 | 点击地图上 AMD 后的主面板 |
| `CollieryPanel.jsx` | 老 slate 色 | 点击 colliery 后 |
| `StationPanel.jsx` | 老 slate 色 | 点击 station 后 |
| `SegmentPanel.jsx` | 老 slate 色 | 点击 stream 后 |
| `PollutionSourcePanel.jsx` | 老 slate 色 | AMD source 详情 |
| `SimulateBlock.jsx` | 老 slate 色 | 多源模拟 chip 区 |
| `TopKList.jsx` | 老 slate 色 | 首页 Top 8 列表 |
| `Sparkline.jsx` | 老 slate 色 | 时间序列小图 |
| `MapView.jsx` | 地图 paint expression 全是老色板 | **地图本体的圆点 / 河流 / 柱体颜色** |

---

## 三、下一步建议（按 ROI 排序）

### Phase 2 — 视觉对齐（高 ROI / 1-2 小时）

#### 1. MapView paint colors —— **影响最大**
地图是主角，地图颜色不对所有 chrome 都白搭。把 `MapView.jsx` 里所有 `paint` 表达式扫一遍：

```
#1e293b / #0f172a 深 slate     →  #0a0a0a (var(--ink))
#7f1d1d                        →  #7a1e10 (var(--accent-deep))
#b91c1c / #dc2626              →  #b9341e (var(--accent))
#5b21b6 / #a78bfa 紫           →  #2f4858 / #94a8b6 (var(--accent-steel))
#94a3b8 灰                     →  #a3a3a3 (var(--ink-4))
```

涉及：colliery icon、AMD droplet、station diamond、stream line、3D extrusion、heatmap gradient、active path。

#### 2. 子面板批量套 token —— 5 分钟工作
用 grep 批量替换（VSCode "替换" 框可以一次性做完）：
```
#0f172a  →  var(--ink)
#1e293b  →  var(--ink)
#475569  →  var(--ink-2)
#64748b  →  var(--ink-3)
#94a3b8  →  var(--ink-4)
rgba(15,23,42, → rgba(0,0,0,
```

不重排版，光替换颜色就能让 7 个子面板瞬间不割裂。

#### 3. `TopKList` + `Sparkline` 颜色对齐
首页第一屏可见，5-10 分钟。

### Phase 3 — 体验升级（中 ROI / 3-4 小时）

#### 4. 子面板重排版 —— 套 pill-badge 模式
- 数字（流量 / pH / Fe 浓度）→ mono pill 包起来
- 关联实体（colliery id / station id / segment id）→ 用对应颜色的类型 pill
- Section 标题用 mono uppercase + hairline rule（参考 Welcome 面板里 `Intensity` 行的写法）
- 写一个就大概知道节奏，剩下复制套

#### 5. 状态栏（CAD instrument 感） —— 加分项
屏幕右下角放一个 mono 横条：
```
41.205°N · 76.012°W   z 9.4   ◐ 12,034 features
```
hairline pill 包围，跟着鼠标 / 缩放变化。**这个加上去气质从 "demo" → "tool"**。

实现：在 `MapView.jsx` 里 `map.on('mousemove', ...)` 抓 lng/lat，`map.on('zoom', ...)` 抓 zoom，存在 ref 里渲染到一个新组件 `<StatusBar>`（套 `.surface` + mono）。

#### 6. 加载 / 空状态
当前 `Loading…` 是 italic 灰字。换成：
- 骨架屏（hairline 描边的 placeholder pill）
- 或一个 mono 的 `LOADING ⋯` 带 1px 闪烁圆点

### Phase 4 — 进阶细节（看心情）

7. **微交互** — pill 按钮 hover 加 `translateY(-0.5px)`；点按回弹 `translateY(0.5px)`
8. **主题模式** — token 系统已经做好了切换准备。加一组 `[data-theme="dark"]` 覆盖 `--ink` / `--bg` 即可
9. **图标系统** — 当前用的 Unicode 三角 `▸ →`。换成 1px stroke SVG（Lucide / Phosphor thin weight）会更精致
10. **Variable font 玩法** — Fraunces 没用上 SOFT/WONK 轴。如果 splash 想留衬线点缀，可以试 `font-variation-settings: "SOFT" 100, "WONK" 1` 那种"奇怪好看"

---

## 四、设计系统 cheatsheet

新写组件 / 改老组件时，对着这张表用：

```css
/* 颜色 */
背景      :  var(--bg) / --bg-2 / --bg-3
文字      :  var(--ink) → --ink-4
描边      :  var(--hairline) / --hairline-strong
强调（红） :  var(--accent) / --accent-deep
强调（蓝） :  var(--accent-steel)

/* 字体 */
默认            :  var(--font-sans)        Inter
数据 / ID / 坐标 :  var(--font-mono)        JetBrains Mono
splash 大字     :  var(--font-display)     Fraunces

/* 圆角 */
按钮 / badge  :  999px (pill)
面板          :  var(--radius-lg)  = 14px
小卡片        :  var(--radius-md)  = 10px

/* 工具类 */
面板外壳      :  className="surface"
mono 小标签   :  className="pill-badge"
胶囊按钮      :  className="pill-btn"  + data-active="true" 反相
等宽体        :  className="font-mono"

/* 阴影 */
面板          :  var(--shadow-panel)
按钮          :  var(--shadow-pill)
```

---

## 五、视觉对标参考

之后想自己继续推、对照风格：
- **Linear** — `linear.app`
- **Next.js** — `nextjs.org`（注意 `app/page.tsx` 那个 mono badge）
- **Vercel dashboard**
- **Augen** — `augen.pro`（极简 frosted card）
- **Resend** — `resend.com`
- **Cal.com** 设置页

---

## 六、Git 状态

- 改动分支：`claude/competent-tu-f70182`（已推 GitHub）
- 已 merge 进 `main`
- 涉及 commit：`04c43d0  Redesign UI chrome to cool technical white aesthetic`
- 改动文件：5 个，+769 / -335 行

不动后端、不动数据合约、不动 simulation 粒子逻辑、不动 MapView 地图 paint（那个是 Phase 2）。
