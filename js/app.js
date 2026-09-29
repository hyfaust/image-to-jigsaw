/**
 * 主流程：读 config.json → 载入图片 → 摆好棋盘和散落的块 → 接上交互。
 */

import { createPuzzle } from './cuts.js';
import { createPiece, makeDraggable } from './piece.js';
import { mergeDefaults, resolveHighlight, validatePuzzle } from './config.js';
import { createDownloadButton, createStats, renderPicker, setPreview } from './ui.js';

// 棋盘最多占游玩区的比例，剩下的地方留给散落的碎块
const BOARD_FIT_W = 0.5;
const BOARD_FIT_H = 0.62;
// 判断「两块有没有叠在一起」时允许的轻微交叠
const OVERLAP_TOLERANCE = 4;

const els = {
  playfield: document.getElementById('playfield'),
  board: document.getElementById('board'),
  ghost: document.getElementById('board-ghost'),
  picker: document.getElementById('picker'),
  timer: document.getElementById('timer'),
  progress: document.getElementById('progress'),
  previewToggle: document.getElementById('preview-toggle'),
  download: document.getElementById('download'),
  restart: document.getElementById('restart'),
  banner: document.getElementById('banner'),
};

const stats = createStats(els.timer, els.progress);
const state = { puzzles: [], index: 0, buildToken: 0 };
const download = createDownloadButton(els.download, () => state.puzzles[state.index].image);

function showBanner(text, kind = '') {
  els.banner.textContent = text;
  els.banner.className = kind ? `banner banner--${kind}` : 'banner';
  els.banner.hidden = !text;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Cannot load image: ${src}`));
    image.src = src;
  });
}

function shuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 两个矩形的分离度（按中心点算）。大于 0 表示没有重叠。 */
function separation(a, b) {
  const gapX = Math.abs(a.x - b.x) - (a.w + b.w) / 2;
  const gapY = Math.abs(a.y - b.y) - (a.h + b.h) / 2;
  return Math.max(gapX, gapY);
}

/**
 * 给一块挑个散落位置：随便撒，但尽量别压在其他块上，也别正好落在目标位置
 * （那样看起来像已经放好了）。挑不出来时退回「已知最宽松」的那个位置。
 */
function pickScatterSpot({ w, h, area, target, taken, snapDistance }) {
  const maxX = Math.max(0, area.width - w);
  const maxY = Math.max(0, area.height - h);
  let best = { x: maxX / 2, y: maxY / 2 };
  let bestGap = -Infinity;

  for (let attempt = 0; attempt < 80; attempt++) {
    const x = Math.random() * maxX;
    const y = Math.random() * maxY;
    const center = { x: x + w / 2, y: y + h / 2, w, h };

    if (Math.abs(center.x - target.x) < snapDistance * 2
      && Math.abs(center.y - target.y) < snapDistance * 2) {
      continue;
    }

    const gap = taken.length
      ? Math.min(...taken.map((other) => separation(center, other)))
      : Infinity;
    if (gap > OVERLAP_TOLERANCE) return { x, y };
    if (gap > bestGap) {
      bestGap = gap;
      best = { x, y };
    }
  }

  return best;
}

async function build(index) {
  // 连续切换拼图时，旧的异步流程要能被认出来并放弃
  const token = ++state.buildToken;
  const cfg = state.puzzles[index];

  stats.stop();
  download.setReady(false);
  showBanner('');

  let image;
  try {
    image = await loadImage(cfg.image);
  } catch (error) {
    if (token === state.buildToken) showBanner(error.message, 'error');
    return;
  }
  if (token !== state.buildToken) return;

  const { rows, columns } = cfg;
  const snapDistance = cfg.snapDistance ?? 24;
  const area = { width: els.playfield.clientWidth, height: els.playfield.clientHeight };

  // 棋盘按图片原始比例等比缩放，塞进游玩区中间
  const fit = Math.min(
    (area.width * BOARD_FIT_W) / image.naturalWidth,
    (area.height * BOARD_FIT_H) / image.naturalHeight,
  );
  const boardW = Math.max(60, Math.round(image.naturalWidth * fit));
  const boardH = Math.max(60, Math.round(image.naturalHeight * fit));
  const boardX = Math.round((area.width - boardW) / 2);
  const boardY = Math.round((area.height - boardH) / 2);

  els.board.style.left = `${boardX}px`;
  els.board.style.top = `${boardY}px`;
  els.board.style.width = `${boardW}px`;
  els.board.style.height = `${boardH}px`;
  els.ghost.src = cfg.image;
  setPreview(els.previewToggle, els.board, cfg.showPreview === true);

  const grid = createPuzzle({ rows, columns, width: boardW, height: boardH, seed: cfg.seed ?? 1 });
  const highlight = resolveHighlight(cfg.highlight, rows, columns);

  els.playfield.querySelectorAll('.piece').forEach((element) => element.remove());

  const items = shuffle(grid.pieces).map((piece) => {
    const marked = highlight !== null && highlight.row === piece.row && highlight.col === piece.col;
    const built = createPiece({
      piece,
      image,
      board: { width: boardW, height: boardH },
      cellW: grid.cellW,
      cellH: grid.cellH,
      tabHeight: grid.tabHeight,
      highlighted: marked,
    });
    return {
      ...built,
      piece,
      target: {
        left: boardX + piece.col * grid.cellW - built.pad,
        top: boardY + piece.row * grid.cellH - built.pad,
      },
      locked: marked && highlight.mode === 'locked',
    };
  });

  const taken = [];
  let placedCount = 0;

  const finishPuzzle = () => {
    stats.stop();
    download.setReady(true);
    showBanner(`Solved in ${els.timer.textContent}`, 'done');
  };

  for (const item of items) {
    els.playfield.append(item.el);

    if (item.locked) {
      // 锁定的高亮块直接摆在正确位置上，玩家不用管它
      item.el.style.left = `${item.target.left}px`;
      item.el.style.top = `${item.target.top}px`;
      item.el.classList.add('piece--placed', 'piece--locked');
      placedCount += 1;
      continue;
    }

    const spot = pickScatterSpot({
      w: item.width,
      h: item.height,
      area,
      target: {
        x: item.target.left + item.width / 2,
        y: item.target.top + item.height / 2,
      },
      taken,
      snapDistance,
    });
    item.el.style.left = `${spot.x}px`;
    item.el.style.top = `${spot.y}px`;
    taken.push({ x: spot.x + item.width / 2, y: spot.y + item.height / 2, w: item.width, h: item.height });

    makeDraggable(item.el, {
      target: item.target,
      snapDistance,
      area,
      onPlace() {
        item.el.classList.add('piece--snap');
        item.el.addEventListener('animationend', () => item.el.classList.remove('piece--snap'), { once: true });
        if (stats.placed()) finishPuzzle();
      },
    });
  }

  stats.begin(grid.pieces.length, placedCount);
  // 1x1 之类「开局就已经全放好」的极端配置，别让它卡在永远不触发完成的状态
  if (placedCount === grid.pieces.length) finishPuzzle();
  renderPicker(els.picker, state.puzzles, index, selectPuzzle);
}

function selectPuzzle(index) {
  state.index = index;
  build(index).catch((error) => showBanner(error.message, 'error'));
}

async function boot() {
  let data;
  try {
    const response = await fetch('config.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`config.json: HTTP ${response.status}`);
    data = await response.json();
  } catch (error) {
    showBanner(`Cannot read config.json (${error.message}). Serve this folder over HTTP, not file://.`, 'error');
    return;
  }

  if (!Array.isArray(data.puzzles) || data.puzzles.length === 0) {
    showBanner('config.json: "puzzles" must be a non-empty array', 'error');
    return;
  }

  const puzzles = mergeDefaults(data.defaults, data.puzzles);
  try {
    puzzles.forEach(validatePuzzle);
  } catch (error) {
    showBanner(error.message, 'error');
    return;
  }

  state.puzzles = puzzles;
  els.restart.addEventListener('click', () => selectPuzzle(state.index));
  els.previewToggle.addEventListener('click', () => {
    setPreview(els.previewToggle, els.board, els.previewToggle.dataset.visible !== 'true');
  });

  selectPuzzle(0);
}

boot();