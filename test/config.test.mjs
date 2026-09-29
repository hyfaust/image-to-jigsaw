/**
 * config.json 后处理逻辑的回归测试（套用 defaults、校验、随机高亮）。
 *
 *   npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeDefaults, resolveHighlight, validatePuzzle } from '../js/config.js';

test('an image-only entry inherits every default', () => {
  const merged = mergeDefaults(
    { rows: 4, columns: 5, seed: 9, showPreview: true, snapDistance: 24 },
    [{ image: 'a.png' }],
  );
  assert.deepEqual(merged, [{
    image: 'a.png', rows: 4, columns: 5, seed: 9, showPreview: true, snapDistance: 24,
  }]);
});

test('a field written on the puzzle replaces the default outright', () => {
  const merged = mergeDefaults({ rows: 4, showPreview: true }, [{ image: 'a.png', rows: 3 }]);
  assert.equal(merged[0].rows, 3);
  assert.equal(merged[0].showPreview, true);
});

test('highlight is replaced rather than merged, and null clears it', () => {
  const merged = mergeDefaults({ highlight: { mode: 'locked' } }, [
    { image: 'a.png' },
    { image: 'b.png', highlight: { row: 1, col: 1 } },
    { image: 'c.png', highlight: null },
  ]);
  assert.deepEqual(merged[0].highlight, { mode: 'locked' }, 'no highlight key inherits the default');
  assert.deepEqual(merged[1].highlight, { row: 1, col: 1 }, 'an explicit highlight replaces the default');
  assert.equal(merged[2].highlight, null, 'null switches the highlight off');
});

test('a config without defaults is left untouched', () => {
  const puzzles = [{ image: 'a.png', rows: 2, columns: 2 }];
  assert.deepEqual(mergeDefaults(undefined, puzzles), puzzles);
});

test('resolveHighlight keeps an explicit cell and its mode', () => {
  assert.deepEqual(
    resolveHighlight({ row: 2, col: 3, mode: 'locked' }, 4, 5),
    { row: 2, col: 3, mode: 'locked' },
  );
});

test('resolveHighlight falls back to the glow mode', () => {
  assert.equal(resolveHighlight({ row: 0, col: 0 }, 4, 5).mode, 'glow');
});

test('resolveHighlight picks a random cell inside the grid when none is given', () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const picked = resolveHighlight({ mode: 'glow' }, 4, 5);
    assert.ok(Number.isInteger(picked.row) && picked.row >= 0 && picked.row < 4, `row=${picked.row}`);
    assert.ok(Number.isInteger(picked.col) && picked.col >= 0 && picked.col < 5, `col=${picked.col}`);
    seen.add(`${picked.row},${picked.col}`);
  }
  assert.ok(seen.size > 5, `expected variety across runs, only saw ${seen.size} cells`);
});

test('an empty highlight object still means a random glow piece', () => {
  const picked = resolveHighlight({}, 2, 3);
  assert.equal(picked.mode, 'glow');
  assert.ok(picked.row >= 0 && picked.row < 2 && picked.col >= 0 && picked.col < 3);
});

test('a random highlight collapses to the only cell on a 1x1 grid', () => {
  assert.deepEqual(resolveHighlight({ mode: 'glow' }, 1, 1), { row: 0, col: 0, mode: 'glow' });
});

test('no highlight at all resolves to null', () => {
  assert.equal(resolveHighlight(null, 4, 5), null);
  assert.equal(resolveHighlight(undefined, 4, 5), null);
});

test('validatePuzzle accepts an entry that defaults fill in', () => {
  assert.doesNotThrow(() => validatePuzzle({ image: 'a.png', rows: 4, columns: 5 }, 0));
});

test('validatePuzzle accepts a highlight with no cell (random)', () => {
  assert.doesNotThrow(() => validatePuzzle({ image: 'a.png', rows: 4, columns: 5, highlight: { mode: 'locked' } }, 0));
  assert.doesNotThrow(() => validatePuzzle({ image: 'a.png', rows: 4, columns: 5, highlight: {} }, 0));
});

test('validatePuzzle accepts a missing highlight', () => {
  assert.doesNotThrow(() => validatePuzzle({ image: 'a.png', rows: 2, columns: 2 }, 0));
  assert.doesNotThrow(() => validatePuzzle({ image: 'a.png', rows: 2, columns: 2, highlight: null }, 0));
});

test('validatePuzzle rejects a missing image', () => {
  assert.throws(() => validatePuzzle({ rows: 2, columns: 2 }, 0), /puzzles\[0\]\.image is required/);
  assert.throws(() => validatePuzzle({ image: '', rows: 2, columns: 2 }, 0), /image is required/);
});

test('validatePuzzle points at rows/columns that defaults never supplied', () => {
  assert.throws(() => validatePuzzle({ image: 'a.png' }, 1), /puzzles\[1\]\.rows must be a positive integer/);
  assert.throws(() => validatePuzzle({ image: 'a.png', rows: 2 }, 1), /puzzles\[1\]\.columns/);
  assert.throws(() => validatePuzzle({ image: 'a.png', rows: 0, columns: 2 }, 1), /rows/);
  assert.throws(() => validatePuzzle({ image: 'a.png', rows: 2.5, columns: 2 }, 1), /rows/);
});

test('validatePuzzle rejects a highlight cell outside the grid', () => {
  assert.throws(
    () => validatePuzzle({ image: 'a.png', rows: 2, columns: 2, highlight: { row: 2, col: 0 } }, 0),
    /out of the 2x2 grid|outside the 2x2 grid/,
  );
  assert.throws(
    () => validatePuzzle({ image: 'a.png', rows: 2, columns: 2, highlight: { row: 0, col: -1 } }, 0),
    /2x2 grid/,
  );
});

test('validatePuzzle rejects half a coordinate pair', () => {
  assert.throws(
    () => validatePuzzle({ image: 'a.png', rows: 2, columns: 2, highlight: { row: 1 } }, 0),
    /both row and col/,
  );
  assert.throws(
    () => validatePuzzle({ image: 'a.png', rows: 2, columns: 2, highlight: { row: 1.5, col: 1 } }, 0),
    /both row and col/,
  );
});

test('validatePuzzle rejects an unknown highlight mode', () => {
  assert.throws(
    () => validatePuzzle({ image: 'a.png', rows: 2, columns: 2, highlight: { mode: 'shine' } }, 0),
    /mode must be "glow" or "locked"/,
  );
});