const SGF_COORDS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function readPropertyValue(source, state) {
  let value = "";
  state.index += 1;

  while (state.index < source.length) {
    const character = source[state.index];
    if (character === "]") {
      state.index += 1;
      return value;
    }
    if (character === "\\") {
      state.index += 1;
      if (source[state.index] === "\r" && source[state.index + 1] === "\n") {
        state.index += 2;
        continue;
      }
      if (source[state.index] === "\n" || source[state.index] === "\r") {
        state.index += 1;
        continue;
      }
      if (state.index < source.length) value += source[state.index++];
      continue;
    }
    value += character;
    state.index += 1;
  }

  throw new Error("SGF 属性值缺少结束括号");
}

function skipWhitespace(source, state) {
  while (state.index < source.length && /\s/.test(source[state.index])) {
    state.index += 1;
  }
}

function parseNode(source, state) {
  const properties = {};
  state.index += 1;

  while (state.index < source.length) {
    skipWhitespace(source, state);
    if (!/[A-Za-z]/.test(source[state.index] || "")) break;

    let identifier = "";
    while (/[A-Za-z]/.test(source[state.index] || "")) {
      identifier += source[state.index++].toUpperCase();
    }

    skipWhitespace(source, state);
    const values = [];
    while (source[state.index] === "[") {
      values.push(readPropertyValue(source, state));
      skipWhitespace(source, state);
    }
    if (!values.length) throw new Error(`SGF 属性 ${identifier} 缺少值`);
    properties[identifier] = [...(properties[identifier] || []), ...values];
  }

  return properties;
}

function parseGameTree(source, state) {
  skipWhitespace(source, state);
  if (source[state.index] !== "(") throw new Error("SGF 棋谱必须以“(”开始");
  state.index += 1;

  const sequence = [];
  const children = [];
  skipWhitespace(source, state);
  while (source[state.index] === ";") {
    sequence.push(parseNode(source, state));
    skipWhitespace(source, state);
  }
  while (source[state.index] === "(") {
    children.push(parseGameTree(source, state));
    skipWhitespace(source, state);
  }

  if (source[state.index] !== ")") throw new Error("SGF 棋谱分支缺少结束括号");
  state.index += 1;
  return { sequence, children };
}

function collectMainBranch(tree) {
  const nodes = [...tree.sequence];
  let branch = tree.children[0];
  while (branch) {
    nodes.push(...branch.sequence);
    branch = branch.children[0];
  }
  return nodes;
}

function coordFromSgf(value, size) {
  if (!value || value.length < 2) return { x: -1, y: -1, pass: true };
  const x = SGF_COORDS.indexOf(value[0]);
  const y = SGF_COORDS.indexOf(value[1]);
  if (x < 0 || y < 0 || x >= size || y >= size) return { x: -1, y: -1, pass: true };
  return { x, y, pass: false };
}

function setupCoordinates(values = [], size) {
  return values
    .map((value) => coordFromSgf(value, size))
    .filter((coord) => !coord.pass);
}

export function parseSgf(source) {
  if (!source || !source.trim()) throw new Error("SGF 文件内容为空");

  const state = { index: 0 };
  const collection = [];
  skipWhitespace(source, state);
  while (state.index < source.length) {
    collection.push(parseGameTree(source, state));
    skipWhitespace(source, state);
  }
  if (!collection.length) throw new Error("没有在文件中找到棋局");

  const nodes = collectMainBranch(collection[0]);
  if (!nodes.length) throw new Error("棋谱中没有有效节点");

  const root = nodes[0];
  const sizeValue = root.SZ?.[0]?.split(":")[0];
  const size = Math.max(2, Math.min(25, Number.parseInt(sizeValue || "19", 10) || 19));
  const moves = [];

  for (const node of nodes) {
    const color = node.B ? "B" : node.W ? "W" : null;
    if (!color) continue;
    const value = node[color]?.[0] ?? "";
    moves.push({
      color,
      ...coordFromSgf(value, size),
      comment: node.C?.[0] || "",
    });
  }

  return {
    size,
    moves,
    setup: {
      black: setupCoordinates(root.AB, size),
      white: setupCoordinates(root.AW, size),
    },
    info: {
      blackName: root.PB?.[0] || "黑方",
      blackRank: root.BR?.[0] || "",
      whiteName: root.PW?.[0] || "白方",
      whiteRank: root.WR?.[0] || "",
      date: root.DT?.[0] || "",
      result: root.RE?.[0] || "",
      event: root.EV?.[0] || "",
      place: root.PC?.[0] || "",
      komi: root.KM?.[0] || "",
      rules: root.RU?.[0] || "",
    },
  };
}

function neighbors(x, y, size) {
  return [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ].filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < size && ny < size);
}

function groupAt(board, x, y) {
  const size = board.length;
  const color = board[y]?.[x];
  if (!color) return { stones: [], liberties: 0 };

  const stack = [[x, y]];
  const seen = new Set();
  const liberties = new Set();
  const stones = [];

  while (stack.length) {
    const [cx, cy] = stack.pop();
    const key = `${cx},${cy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    stones.push([cx, cy]);

    for (const [nx, ny] of neighbors(cx, cy, size)) {
      if (!board[ny][nx]) liberties.add(`${nx},${ny}`);
      else if (board[ny][nx] === color) stack.push([nx, ny]);
    }
  }

  return { stones, liberties: liberties.size };
}

export function createInitialBoard(size, setup = { black: [], white: [] }) {
  const board = Array.from({ length: size }, () => Array(size).fill(null));
  for (const point of setup.black || []) board[point.y][point.x] = "B";
  for (const point of setup.white || []) board[point.y][point.x] = "W";
  return board;
}

export function cloneBoard(board) {
  return board.map((row) => [...row]);
}

export function playMove(board, move, { rejectIllegal = false } = {}) {
  const next = cloneBoard(board);
  if (move.pass) return { board: next, captures: 0, legal: true };

  const { x, y, color } = move;
  if (!next[y] || next[y][x] || !color) {
    return { board: next, captures: 0, legal: false };
  }

  next[y][x] = color;
  const opponent = color === "B" ? "W" : "B";
  let captures = 0;

  for (const [nx, ny] of neighbors(x, y, next.length)) {
    if (next[ny][nx] !== opponent) continue;
    const group = groupAt(next, nx, ny);
    if (group.liberties === 0) {
      captures += group.stones.length;
      for (const [gx, gy] of group.stones) next[gy][gx] = null;
    }
  }

  const ownGroup = groupAt(next, x, y);
  if (ownGroup.liberties === 0 && captures === 0) {
    if (rejectIllegal) return { board: cloneBoard(board), captures: 0, legal: false };
    for (const [gx, gy] of ownGroup.stones) next[gy][gx] = null;
  }

  return { board: next, captures, legal: true };
}

export function buildPositions(game) {
  const positions = [createInitialBoard(game.size, game.setup)];
  for (const move of game.moves) {
    positions.push(playMove(positions.at(-1), move).board);
  }
  return positions;
}

