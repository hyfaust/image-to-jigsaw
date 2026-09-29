/**
 * 几何层的回归测试。这里只测纯计算部分（切块轮廓），
 * DOM / canvas / 拖拽那部分要靠浏览器验证。
 *
 *   npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createPuzzle, toSvgPath } from '../js/cuts.js';

const WIDTH = 900;
const HEIGHT = 600;
const ROWS = 3;
const COLUMNS = 3;

function build(seed = 42) {
  return createPuzzle({ rows: ROWS, columns: COLUMNS, width: WIDTH, height: HEIGHT, seed });
}

/** 鞋带公式，返回带符号面积。所有块都是同一绕向，符号一致。 */
function signedArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** 射线法判断点是否在多边形内部。 */
function contains(polygon, point) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

test('splits the board into rows x columns pieces', () => {
  const grid = build();
  assert.equal(grid.pieces.length, ROWS * COLUMNS);
  assert.deepEqual(
    grid.pieces.map((piece) => `${piece.row},${piece.col}`),
    ['0,0', '0,1', '0,2', '1,0', '1,1', '1,2', '2,0', '2,1', '2,2'],
  );
  assert.equal(grid.cellW, WIDTH / COLUMNS);
  assert.equal(grid.cellH, HEIGHT / ROWS);
});

test('every outline point is a finite number', () => {
  for (const piece of build().pieces) {
    assert.ok(piece.outline.length > 8, 'outline should be a real polygon');
    for (const point of piece.outline) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y),
        `bad point on piece ${piece.row},${piece.col}: ${point.x},${point.y}`);
    }
  }
});

test('outlines stay inside the board plus the tab overhang', () => {
  const grid = build();
  const limit = grid.tabHeight + 1e-9;
  for (const piece of grid.pieces) {
    for (const point of piece.outline) {
      assert.ok(point.x >= -limit && point.x <= WIDTH + limit, `x out of range: ${point.x}`);
      assert.ok(point.y >= -limit && point.y <= HEIGHT + limit, `y out of range: ${point.y}`);
    }
  }
});

test('pieces tile the board exactly once (no gaps, no overlaps)', () => {
  const grid = build();
  const stepsX = 60;
  const stepsY = 40;
  let checked = 0;

  for (let i = 0; i < stepsX; i++) {
    for (let j = 0; j < stepsY; j++) {
      // 刻意避开格子边界和整数坐标，免得采样点正好落在轮廓线上
      const point = {
        x: ((i + 0.37) / stepsX) * WIDTH,
        y: ((j + 0.61) / stepsY) * HEIGHT,
      };
      const cover = grid.pieces.filter((piece) => contains(piece.outline, point)).length;
      assert.equal(cover, 1, `point ${point.x},${point.y} covered by ${cover} pieces`);
      checked += 1;
    }
  }

  assert.equal(checked, stepsX * stepsY);
});

test('signed areas cancel out to the whole board area', () => {
  const grid = build();
  // 榫头一凸一凹，相邻两块的面积互相抵消，总和必须正好是棋盘面积
  const total = grid.pieces.reduce((sum, piece) => sum + signedArea(piece.outline), 0);
  assert.ok(Math.abs(Math.abs(total) - WIDTH * HEIGHT) < 1e-6,
    `total area ${total} should match ${WIDTH * HEIGHT}`);
});

test('the same seed always produces the same cut', () => {
  const first = build(1234).pieces.map((piece) => piece.outline);
  const second = build(1234).pieces.map((piece) => piece.outline);
  assert.deepEqual(first, second);
});

test('different seeds produce different cuts', () => {
  const a = build(1).pieces.map((piece) => piece.outline);
  const b = build(2).pieces.map((piece) => piece.outline);
  assert.notDeepEqual(a, b);
});

test('a single row or single column has no internal edges but still tiles', () => {
  for (const shape of [{ rows: 1, columns: 4 }, { rows: 4, columns: 1 }]) {
    const grid = createPuzzle({ ...shape, width: WIDTH, height: HEIGHT, seed: 5 });
    assert.equal(grid.pieces.length, shape.rows * shape.columns);
    const total = grid.pieces.reduce((sum, piece) => sum + Math.abs(signedArea(piece.outline)), 0);
    assert.ok(Math.abs(total - WIDTH * HEIGHT) < 1e-6);
  }
});

test('toSvgPath emits a closed path', () => {
  const grid = build();
  const d = toSvgPath(grid.pieces[4].outline);
  assert.match(d, /^M-?\d+(\.\d+)? -?\d+(\.\d+)?/);
  assert.ok(d.endsWith('Z'));
  // 每个点恰好一个指令
  assert.equal(d.split('L').length - 1, grid.pieces[4].outline.length - 1);
});