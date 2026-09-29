/**
 * 纯几何模块：根据行列数生成带榫头（凹凸咬合）的拼图块轮廓。
 * 这里不碰 DOM，所以可以直接在 Node 里跑测试。
 * 坐标是任意长度单位，浏览器里就是 CSS 像素。
 */

// 每条边上的榫头采样点数，数值越大曲线越顺滑
const KNOB_SAMPLES = 28;

/**
 * xorshift32：小而确定的伪随机数，保证同一个 seed 每次得到同样的榫头形状。
 * 不固定种子的话，刷新一次页面所有凹凸都会重新随机，看起来很怪。
 */
function createRng(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

/**
 * 榫头外形：u 是沿边的归一化位置（-1 到 1，0 为边中点），返回 0 到 1 的相对高度。
 * 用「近似矩形的平台 + 圆角」来冒充蘑菇头，两侧几近垂直，视觉上就是拼图的凸起。
 */
function knobOffset(u) {
  const a = Math.abs(u);
  if (a >= 1) return 0;
  return Math.pow(1 - Math.pow(a, 5), 1 / 5);
}

function makeProfile(rnd, tabHeight) {
  return {
    center: 0.5 + (rnd() - 0.5) * 0.18,
    halfWidth: 0.13 + rnd() * 0.045,
    height: tabHeight * (0.85 + rnd() * 0.3),
    sign: rnd() < 0.5 ? -1 : 1,
  };
}

/**
 * 把一条边采样成折线。返回的数组第一个点是 from，最后一个是 to，
 * 中间夹着带法向偏移的榫头点。同一条边被相邻两块共用时，
 * 两块引用的是同一份点列（反向遍历），所以凹凸天然互补。
 */
function edgePoints(from, to, normal, profile) {
  const points = [{ x: from.x, y: from.y }];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const { center, halfWidth, height, sign } = profile;

  for (let i = 0; i <= KNOB_SAMPLES; i++) {
    // 用 cos 分布把采样点挤向榫头两端，那里曲率最大
    const u = -Math.cos((Math.PI * i) / KNOB_SAMPLES);
    const t = center + halfWidth * u;
    const offset = height * knobOffset(u) * sign;
    points.push({
      x: from.x + dx * t + normal.x * offset,
      y: from.y + dy * t + normal.y * offset,
    });
  }

  points.push({ x: to.x, y: to.y });
  return points;
}

function straightEdge(from, to) {
  return [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];
}

/**
 * 生成一个 rows x columns 的拼图网格。
 * 每块是一个闭合折线 outline（顺时针），坐标相对棋盘左上角，
 * 榫头会伸到格子外面，所以渲染时四周要留出 tabHeight 的余量。
 */
export function createPuzzle({ rows, columns, width, height, seed = 1 }) {
  const cellW = width / columns;
  const cellH = height / rows;
  const tabHeight = Math.min(cellW, cellH) * 0.2;
  const rnd = createRng(seed);

  // 内部横边：第 r 行与 r+1 行之间，共 (rows-1)*columns 条，方向统一为从左到右
  const hEdges = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < columns; c++) {
      const y = (r + 1) * cellH;
      hEdges.push(edgePoints(
        { x: c * cellW, y },
        { x: (c + 1) * cellW, y },
        { x: 0, y: 1 },
        makeProfile(rnd, tabHeight),
      ));
    }
  }

  // 内部竖边：第 c 列与 c+1 列之间，共 rows*(columns-1) 条，方向统一为从上到下
  const vEdges = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns - 1; c++) {
      const x = (c + 1) * cellW;
      vEdges.push(edgePoints(
        { x, y: r * cellH },
        { x, y: (r + 1) * cellH },
        { x: 1, y: 0 },
        makeProfile(rnd, tabHeight),
      ));
    }
  }

  const pieces = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const x0 = c * cellW;
      const y0 = r * cellH;
      const x1 = x0 + cellW;
      const y1 = y0 + cellH;
      const topLeft = { x: x0, y: y0 };
      const topRight = { x: x1, y: y0 };
      const bottomRight = { x: x1, y: y1 };
      const bottomLeft = { x: x0, y: y1 };

      // 顺时针绕一圈：上 → 右 → 下 → 左。内部边直接复用上面生成的点列，
      // 反向行进的那一侧用 reverse()，两端自然衔接。
      const top = r === 0
        ? straightEdge(topLeft, topRight)
        : hEdges[(r - 1) * columns + c].slice();
      const right = c === columns - 1
        ? straightEdge(topRight, bottomRight)
        : vEdges[r * (columns - 1) + c].slice();
      const bottom = r === rows - 1
        ? straightEdge(bottomRight, bottomLeft)
        : hEdges[r * columns + c].slice().reverse();
      const left = c === 0
        ? straightEdge(bottomLeft, topLeft)
        : vEdges[r * (columns - 1) + (c - 1)].slice().reverse();

      const outline = [...top, ...right.slice(1), ...bottom.slice(1), ...left.slice(1)];
      outline.pop();

      pieces.push({ row: r, col: c, outline });
    }
  }

  return { pieces, cellW, cellH, tabHeight, width, height };
}

/**
 * 折线转 SVG path 字符串，用来给元素加 clip-path。
 * 加了 clip-path 之后，画布上的透明区域就不再响应鼠标，
 * 否则会误抓到相邻块边上那块透明的地方。坐标保留两位小数就够了。
 */
export function toSvgPath(points) {
  const n = (value) => Math.round(value * 100) / 100;
  let d = `M${n(points[0].x)} ${n(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    d += `L${n(points[i].x)} ${n(points[i].y)}`;
  }
  return `${d}Z`;
}