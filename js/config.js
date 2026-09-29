/**
 * config.json 的后处理：套用 defaults、校验、解析高亮块。
 * 全是纯逻辑，不碰 DOM，所以能在 Node 里直接测。
 */

/**
 * 把顶层的 defaults 套到每个拼图上。
 * 是浅合并：拼图自己写的字段整体覆盖默认值，方便「一堆图共用一套设置，
 * 只有某一两张图需要个别调整」。
 */
export function mergeDefaults(defaults, puzzles) {
  const base = defaults ?? {};
  return puzzles.map((puzzle) => ({ ...base, ...puzzle }));
}

/**
 * 解析高亮块。
 * 写了 row/col 就用指定的那一块；只写了 mode（或者什么都不写）就随机挑一块 ——
 * 也就是说 `"highlight": { "mode": "locked" }` = 每次开局随机锁一块当起点。
 */
export function resolveHighlight(spec, rows, columns) {
  if (!spec) return null;
  const mode = spec.mode ?? 'glow';
  const cell = Number.isInteger(spec.row) && Number.isInteger(spec.col)
    ? { row: spec.row, col: spec.col }
    : { row: Math.floor(Math.random() * rows), col: Math.floor(Math.random() * columns) };
  return { ...cell, mode };
}

/** config.json 是手写的，属于系统边界，所以逐项检查并给出能直接照着改的报错。 */
export function validatePuzzle(puzzle, index) {
  const where = `config.json: puzzles[${index}]`;
  if (!puzzle || typeof puzzle.image !== 'string' || puzzle.image === '') {
    throw new Error(`${where}.image is required`);
  }
  for (const key of ['rows', 'columns']) {
    if (!Number.isInteger(puzzle[key]) || puzzle[key] < 1) {
      throw new Error(`${where}.${key} must be a positive integer (set it here or in "defaults")`);
    }
  }
  if (puzzle.highlight) {
    const { row, col, mode = 'glow' } = puzzle.highlight;
    const hasCell = row !== undefined || col !== undefined;
    if (hasCell && (!Number.isInteger(row) || !Number.isInteger(col))) {
      throw new Error(`${where}.highlight needs both row and col as integers — or neither, to pick a random piece`);
    }
    if (Number.isInteger(row) && (row < 0 || row >= puzzle.rows || col < 0 || col >= puzzle.columns)) {
      throw new Error(`${where}.highlight is outside the ${puzzle.rows}x${puzzle.columns} grid`);
    }
    if (mode !== 'glow' && mode !== 'locked') {
      throw new Error(`${where}.highlight.mode must be "glow" or "locked"`);
    }
  }
}