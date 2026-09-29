/**
 * 单块拼图的渲染与拖拽。
 * 每块是一张自己的 canvas：用块轮廓 clip 之后，只把该块对应的那块图画进去。
 */

import { toSvgPath } from './cuts.js';

// 画布四周留白系数，必须大于 1，否则伸出去的榫头会被切掉
const PAD_RATIO = 1.4;

let zCounter = 1;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * 造一块拼图。返回的元素已经画好图、裁好形状，但还没放到棋盘位置。
 * 返回值里的 pad 是画布留白，定位时需要它来对齐：target = 棋盘原点 + 格子偏移 - pad。
 */
export function createPiece({ piece, image, board, cellW, cellH, tabHeight, highlighted }) {
  const pad = Math.ceil(tabHeight * PAD_RATIO);
  const width = Math.ceil(cellW) + pad * 2;
  const height = Math.ceil(cellH) + pad * 2;

  const canvas = document.createElement('canvas');
  canvas.className = 'piece';
  // 把格子坐标标在 DOM 上，调试和自动化测试都能直接认出这是哪一块
  canvas.dataset.row = String(piece.row);
  canvas.dataset.col = String(piece.col);

  // 按设备像素比放大画布，否则高分屏上块边缘会发虚
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  // 轮廓原本是棋盘坐标系，这里挪到本块画布的局部坐标系
  const local = piece.outline.map((point) => ({
    x: point.x - piece.col * cellW + pad,
    y: point.y - piece.row * cellH + pad,
  }));

  const path = new Path2D();
  path.moveTo(local[0].x, local[0].y);
  for (let i = 1; i < local.length; i++) {
    path.lineTo(local[i].x, local[i].y);
  }
  path.closePath();

  // CSS 的 clip-path 用的是 CSS 像素，和上面的局部坐标一致
  canvas.style.clipPath = `path("${toSvgPath(local)}")`;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  ctx.save();
  ctx.clip(path);
  // 整张图按棋盘尺寸铺开，clip 之后留下的正好是本块该有的部分
  ctx.drawImage(
    image,
    pad - piece.col * cellW,
    pad - piece.row * cellH,
    board.width,
    board.height,
  );
  ctx.restore();

  ctx.save();
  ctx.clip(path);
  if (highlighted) {
    ctx.fillStyle = 'rgba(255, 214, 10, 0.28)';
    ctx.fillRect(0, 0, width, height);
  }
  // 描边被 clip 掉一半，于是得到一圈内描边，正好当块与块之间的分缝
  ctx.strokeStyle = highlighted ? 'rgba(255, 214, 10, 0.95)' : 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = highlighted ? 5 : 2;
  ctx.stroke(path);
  ctx.restore();

  return { el: canvas, pad, width, height };
}

/**
 * 给一块拼图接上拖拽。落点距离目标位置小于 snapDistance 就吸附并锁定。
 */
export function makeDraggable(el, { target, snapDistance, area, onPlace }) {
  let currentLeft = parseFloat(el.style.left) || 0;
  let currentTop = parseFloat(el.style.top) || 0;
  let startLeft = 0;
  let startTop = 0;
  let startX = 0;
  let startY = 0;
  let dragging = false;

  el.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || el.classList.contains('piece--placed')) return;
    dragging = true;
    el.setPointerCapture(event.pointerId);
    el.classList.add('piece--dragging');
    el.style.zIndex = String(++zCounter);
    startX = event.clientX;
    startY = event.clientY;
    startLeft = currentLeft;
    startTop = currentTop;
    event.preventDefault();
  });

  el.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    // 允许拖出边缘一点，但至少留一半在游玩区内，免得找不回来
    const halfW = el.offsetWidth / 2;
    const halfH = el.offsetHeight / 2;
    currentLeft = clamp(startLeft + event.clientX - startX, -halfW, area.width - halfW);
    currentTop = clamp(startTop + event.clientY - startY, -halfH, area.height - halfH);
    el.style.left = `${currentLeft}px`;
    el.style.top = `${currentTop}px`;
  });

  const finish = (event) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('piece--dragging');
    if (el.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId);
    }
    // 用记下来的浮点位置比对，不用 offsetLeft，它会把坐标取整、造成对不齐
    if (Math.hypot(currentLeft - target.left, currentTop - target.top) <= snapDistance) {
      currentLeft = target.left;
      currentTop = target.top;
      el.style.left = `${currentLeft}px`;
      el.style.top = `${currentTop}px`;
      el.classList.add('piece--placed');
      onPlace();
    }
  };

  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
}