# Jigsaw Puzzle

一张图片 → 一个纯静态的拼图网站。没有框架、没有构建步骤、没有依赖。

- **切块规格可配**：`rows` / `columns` 想切 3x4 还是 5x5 都行
- **真·榫头咬合**：每块都有随机的凹凸边，不是方格切片
- **可标记高亮块**：指定某一块发光提示（`glow`），或直接预置锁定当起点（`locked`）
- **原图预览开关**：`showPreview` 控制棋盘上是否显示半透明参考底图
- **拼完可下载原图**：拼好后顶栏的 `Download` 按钮亮起，下载的是**原始图片文件本身**
  （不是棋盘截图，不带网格线也不带切缝）
- **多图切换**：`config.json` 里放几张图就有几个拼图，顶栏自动出现缩略图选择器

## 目录结构

```
.
├─ index.html          页面骨架
├─ style.css           全部样式
├─ config.json         唯一的配置入口
├─ js/
│  ├─ app.js           读配置 → 建局面 → 接交互
│  ├─ cuts.js          纯几何：算带榫头的块轮廓（不碰 DOM，可被 Node 测试）
│  ├─ config.js        配置后处理：套 defaults、校验、解析高亮（纯逻辑，可测）
│  ├─ piece.js         单块渲染 + 拖拽 + 吸附
│  └─ ui.js            计时 / 进度 / 预览开关 / 下载按钮 / 拼图选择器
├─ images/             图片放这里
└─ test/
   ├─ geometry.test.mjs   几何测试（Node）
   ├─ config.test.mjs     配置测试（Node）
   └─ render-check.html   浏览器自检页面
```

## 快速开始

页面对 `fetch` 和 ES module 有依赖，**不能直接双击 `index.html`**（`file://` 会被浏览器拦掉），
必须走 HTTP。随便挑一条：

```bash
# Python
python -m http.server 8177

# 或者 Node
npx serve .
```

然后打开 `http://localhost:8177/`。

## 配置

`config.json`：

```json
{
  "defaults": {
    "rows": 4,
    "columns": 5,
    "seed": 1234,
    "showPreview": true,
    "snapDistance": 24
  },
  "puzzles": [
    { "image": "images/sample-a.png", "highlight": { "row": 1, "col": 2, "mode": "glow" } },
    { "image": "images/sample-b.png", "rows": 3, "columns": 3, "highlight": { "mode": "locked" } }
  ]
}
```

**`defaults` 是所有拼图共用的默认值。** 每条拼图只写 `image` 就能套上整套设置；
某张图需要不一样，就单独写那个字段（**整体覆盖**默认值）。

也就是说：加一张图 = 加一行 `{ "image": "..." }`，不用把设置再抄一遍。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `image` | 是 | 图片路径，相对 `index.html` |
| `rows` / `columns` | 视情况 | 切成几行几列，正整数。这一条没写、`defaults` 里也没有就会报错 |
| `seed` | 否 | 默认 `1`。决定榫头的随机形状；**同一个 seed 形状永远一样**，不固定的话每次刷新凹凸都变。⚠️ 多张图共用一个 `seed` 会让它们的榫头形状**完全相同**，想要花样就逐张改 |
| `highlight` | 否 | 高亮块，见下。**不写就没有高亮** |
| `showPreview` | 否 | 默认 `false`。`true` 时棋盘上叠加半透明原图参考 |
| `snapDistance` | 否 | 默认 `24`。落点离目标多少像素内自动吸附 |

### highlight（高亮块）

```json
"highlight": { "row": 1, "col": 2, "mode": "glow" }   // 指定某一块
"highlight": { "mode": "locked" }                     // 随机挑一块
"highlight": null                                     // 不要高亮（直接删掉这个字段也行）
```

坐标从 `0` 开始，`row` 是行号、`col` 是列号。**不写 `row`/`col` 就是随机挑一块**，
每次开局（包括点 `Restart`、切换拼图）都会重新随机。

| `mode` | 效果 |
| --- | --- |
| `glow`（默认） | 该块描边发光 + 黄色蒙层，仍然可以拖，玩家自己找位置 |
| `locked` | 该块一开始就摆在正确位置且不可拖动，当作起步锚点；进度也会从 1 开始算 |

注意从 `defaults` 继承时是**整体覆盖**：如果 `defaults` 里写了 `highlight`，
某张图想改成别的高亮写法，就得把整个对象写全（或者写 `null` 表示这张不要高亮）。

### 换成自己的图

1. 把图片丢进 `images/`
2. 改 `config.json` 里的 `image`

想放几张图就写几个对象，顶栏会出现缩略图按钮切换。目前仓库里的
`sample-a.png` / `sample-b.png` 是两张占位图（几何图形），**换成你自己的图后可以删掉**。

## 部署

整个目录拷到哪里都行，纯静态：

- GitHub Pages：推到仓库，Settings → Pages 选分支
- Netlify / Vercel / Cloudflare Pages：拖目录即可
- 对象存储 + CDN：把文件传上去

没有构建产物，源码即产物。

## 测试

```bash
npm test
```

跑 `test/*.test.mjs`，全部在 Node 里跑，不需要浏览器。

几何层（`geometry.test.mjs`）：

- 块数、坐标有限性、轮廓不越界
- **完美铺满**：2400 个采样点，每个点必须被且只被一块覆盖（无缝隙、无重叠）
- **面积抵消**：榫头一凸一凹，所有块的有符号面积之和必须正好等于棋盘面积
- 同一个 seed 结果一致、不同 seed 结果不同
- 单行 / 单列等退化情形

配置层（`config.test.mjs`）：

- `defaults` 继承、单条覆盖、`highlight: null` 关掉高亮、没有 `defaults` 时行为不变
- 随机高亮始终落在网格内、给了坐标就原样保留、`1x1` 时收敛到唯一那格
- 校验报错：缺 `image`、缺 `rows`/`columns`、高亮越界、只给了半个坐标、`mode` 拼错

浏览器侧的自检页面（起本地服务后打开 `/test/render-check.html`）：

- 把 canvas 的像素和几何轮廓逐点比对（5 万多个采样点，透明/不透明必须和轮廓完全一致）
- 每块正中间的像素必须等于源图对应位置，确认切图没有错位
- 高亮确实改变了画面、`clip-path` 已挂上、顶栏控件的点击与计数行为
- 下载按钮：拼完前禁用、拼完后解锁、点击时链接指向的是原始图片文件
- 拖拽全流程（合成 pointer 事件）：落在吸附范围内会归位并回调、超出范围不吸附、
  拖出边界会被夹住、已经归位的块不能再被拖走

> 合成 pointer 事件没有真实指针，`setPointerCapture` 会抛异常，所以自检页面里把这三个
> 方法临时替换掉了。也就是说**验证的是拖拽/吸附/夹取的逻辑**，`setPointerCapture`
> 本身是浏览器行为，没有被自动化覆盖。

## 已知限制

- **必须走 HTTP 打开**，`file://` 不行（见上文）
- **改窗口大小或旋转屏幕不会重建棋局**：块的坐标是加载时算好的。需要重排就点 `Restart`
- **没有旋转块**：所有块都是正立的，不做 90° 旋转玩法
- **没有存档**：刷新即重来
- **预览是半透明底图**，不是独立的参考窗口
- **下载依赖同源**：`download` 属性对跨域 URL 是无效的。图片放本地 `images/` 没问题；
  如果把 `image` 指到别的域名的 CDN，按钮会退化成"打开图片"而不是下载
- 规格别开太大：`10x10` 就是 100 张 canvas，帧率会明显下降
- **改完 `config.json` 没生效就强刷一下**：页面用 `cache: 'no-cache'` 请求配置，正常情况下会重新校验；
  但 `python -m http.server` 的 `Last-Modified` 只有秒级精度，同一秒内连改两次有可能拿到旧的那份
- 界面文案是英文（遵循全局的语言规范）；要改就直接编辑 `index.html`

## 实现要点

- 每块是**一张自己的 canvas**：用块轮廓 `clip()` 之后，只把该块对应的那部分图画进去；
  块与块之间的接缝靠一圈被裁掉一半的内描边（`stroke`）自然形成
- 每块还挂了同样的轮廓作为 **CSS `clip-path: path()`**：画布的透明角落本来也会响应鼠标，
  加上它之后点击测试才会跟着形状走，否则会误抓到相邻块的空白角
- 网格的**内部边只生成一次**，相邻两块引用同一份点列（一侧反向遍历），
  所以凹凸天然互补，不存在"两边都凸"或对不齐的问题
- 拖拽用 Pointer Events + `setPointerCapture`，配合 `touch-action: none`，触屏上不会和页面滚动打架
- 目标位置用**浮点**记录比对，不用 `offsetLeft`（它会把坐标取整，导致吸附后块之间出现 1px 缝）