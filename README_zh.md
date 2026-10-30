# Jigsaw Puzzle

[English](README.md) | [简体中文](README_zh.md)

---

把任意图片变成可玩的拼图网站——完全静态，无框架、无构建步骤、无运行时依赖。

## 功能

- **网格可配置** — 任意 `rows` × `columns` 布局。
- **真正的榫头咬合** — 每块都有随机的榫头和凹槽，不是方格切片。
- **高亮或锁定某一块** — 让一块发光作为提示，或直接预置到正确位置作为起步锚点。
- **可选参考图** — 在棋盘上叠加原图的半透明副本。
- **拼好后下载原图** — 顶栏按钮下载源图片文件，而不是截图。
- **多图切换** — `config.json` 里每张图一条配置；顶栏显示缩略图选择器。

## 目录结构

```text
index.html      页面入口
style.css       全部样式
config.json     唯一配置文件
launcher.py     可选启动器（配置 / 预览 / 部署）
js/             页面逻辑
images/         拼图图片
test/           Node 测试和浏览器自检页面
```

## 快速开始

页面依赖 `fetch` 和 ES module，通过 `file://` 直接打开 `index.html` 无法工作。请用 HTTP 提供目录：

```bash
# Python
python -m http.server 8177

# 或者 Node
npx serve .
```

然后打开 <http://localhost:8177/>。

### 可选启动器

`launcher.py` 只使用 Python 标准库：

```bash
python launcher.py            # 交互菜单
python launcher.py config     # 用系统默认编辑器打开 config.json
python launcher.py preview    # 本地启动服务并打开浏览器
python launcher.py deploy     # 更新 gh-pages 并强制推送
```

- `preview` 优先在随机空闲端口使用 `npx live-server`，支持自动刷新。如果 npx 不存在或 live-server 启动失败，则回退到 `python -m http.server`。
- `deploy` 把站点文件复制进临时 `gh-pages` 工作树，amend 已有提交（或创建孤儿分支），然后执行 `git push -f`。它部署的是当前工作区内容，因此不需要先提交。强制推送会覆盖远程 `gh-pages` 历史。

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

`defaults` 对所有拼图生效。每条拼图继承全部默认值，只覆盖自己声明的字段，所以加一张图只需要一条 `{ "image": "..." }` 配置。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `image` | 是 | 图片路径，相对于 `index.html`。 |
| `rows` / `columns` | 视情况 | 网格尺寸，正整数。除非由 `defaults` 提供，否则必填。 |
| `seed` | 否 | 默认 `1`。控制随机榫头形状；相同 seed 总是生成相同形状。共用 seed 的多张拼图会得到完全相同的榫头形状。 |
| `highlight` | 否 | 高亮块，见下文。省略则不启用高亮。 |
| `showPreview` | 否 | 默认 `false`。为 `true` 时在棋盘上叠加原图的半透明副本。 |
| `snapDistance` | 否 | 默认 `24`。拼图块自动吸附的就位距离（像素）。 |

### 高亮

```json
"highlight": { "row": 1, "col": 2, "mode": "glow" }   // 指定某一块
"highlight": { "mode": "locked" }                     // 随机选一块
"highlight": null                                     // 不启用高亮
```

坐标从 0 开始：`row` 是行索引，`col` 是列索引。省略 `row`/`col` 时，每次新开局都会随机选择一块，包括点击 `Restart` 和切换拼图。

| 模式 | 效果 |
| --- | --- |
| `glow`（默认） | 该块获得发光描边和黄色蒙层，仍然可以拖动。 |
| `locked` | 该块一开始就在正确位置且不可拖动，作为起步锚点。进度从 1 开始。 |

`highlight` 按整个对象替换。如果 `defaults` 定义过高亮，而某条拼图需要不同的高亮，就要写完整的对象（或用 `null` 为该拼图关闭高亮）。

### 换成自己的图片

1. 把图片放进 `images/`。
2. 把 `config.json` 里该拼图的 `image` 字段指向它。

每张图片加一个对象即可生成多个拼图；顶栏会显示缩略图选择器。仓库自带的 `sample-a.png` 和 `sample-b.png` 是占位图，添加自己的图片后可以删除。

## 部署

站点是纯静态的，目录可以放在任何地方提供服务：

- **GitHub Pages** — 推送仓库，在 Settings → Pages 里选择分支。
- **Netlify / Vercel / Cloudflare Pages** — 上传或连接目录。
- **对象存储 + CDN** — 直接上传文件。

没有构建产物；源码就是可部署产物。

## 测试

```bash
npm test
```

运行 Node 下的几何与配置测试。浏览器自检：启动本地服务后打开 `/test/render-check.html`。

## 已知限制

- **必须走 HTTP** — `file://` 无法工作。
- **调整窗口大小或旋转屏幕不会重建棋盘** — 拼图块位置在加载时算好。需要重新布局请点 `Restart`。
- **没有旋转块，也没有存档** — 拼图块始终正立，刷新即开始新一局。
- **下载要求图片同源** — `download` 属性对跨域 URL 无效。`images/` 下的本地图片正常；CDN URL 会退化为打开图片。
- **大网格开销明显** — 每块都是一张独立 canvas，`10x10` 之类的网格会明显降低帧率。

## 许可证

GNU General Public License v3.0 — 见 [LICENSE](LICENSE)。