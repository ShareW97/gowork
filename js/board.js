const BOARD_SIZE = 1400;
const MARGIN = 90;
const COORDINATES = "ABCDEFGHJKLMNOPQRSTUVWXYZ";

function starPoints(size) {
  if (size === 19) {
    return [3, 9, 15].flatMap((x) => [3, 9, 15].map((y) => [x, y]));
  }
  if (size === 13) {
    return [3, 6, 9].flatMap((x) => [3, 6, 9].map((y) => [x, y]));
  }
  if (size === 9) return [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
  return [];
}

function stoneGradient(context, x, y, radius, color) {
  const gradient = context.createRadialGradient(
    x - radius * 0.32,
    y - radius * 0.38,
    radius * 0.12,
    x,
    y,
    radius,
  );
  if (color === "B") {
    gradient.addColorStop(0, "#55534e");
    gradient.addColorStop(0.42, "#1f211f");
    gradient.addColorStop(1, "#070807");
  } else {
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.65, "#f1efe8");
    gradient.addColorStop(1, "#b9b7af");
  }
  return gradient;
}

function drawStone(context, x, y, radius, color) {
  context.save();
  context.shadowColor = "rgba(42, 31, 14, 0.35)";
  context.shadowBlur = radius * 0.32;
  context.shadowOffsetY = radius * 0.15;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = stoneGradient(context, x, y, radius, color);
  context.fill();
  if (color === "W") {
    context.strokeStyle = "rgba(40, 40, 35, 0.28)";
    context.lineWidth = 1.6;
    context.stroke();
  }
  context.restore();
}

function drawMark(context, mark, board, span) {
  const pointX = MARGIN + mark.x * span;
  const pointY = MARGIN + mark.y * span;
  const stoneColor = board[mark.y]?.[mark.x];
  const color = stoneColor === "B" ? "#fff6df" : "#8b2f25";
  const lineWidth = Math.max(3.5, span * 0.085);
  const size = span * 0.28;

  context.save();
  context.lineWidth = lineWidth;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineCap = "round";
  context.lineJoin = "round";

  if (mark.type === "number" || mark.type === "letter") {
    context.font = `800 ${Math.max(20, span * 0.45)}px Arial, sans-serif`;
    if (!stoneColor) {
      context.beginPath();
      context.arc(pointX, pointY, span * 0.36, 0, Math.PI * 2);
      context.fillStyle = "rgba(255, 250, 235, 0.88)";
      context.fill();
      context.strokeStyle = "rgba(117, 54, 40, 0.45)";
      context.lineWidth = Math.max(2, span * 0.04);
      context.stroke();
      context.fillStyle = "#7d3026";
    }
    context.fillText(mark.value, pointX, pointY + span * 0.02);
  } else if (mark.type === "triangle") {
    context.beginPath();
    context.moveTo(pointX, pointY - size);
    context.lineTo(pointX + size * 0.92, pointY + size * 0.68);
    context.lineTo(pointX - size * 0.92, pointY + size * 0.68);
    context.closePath();
    context.stroke();
  } else if (mark.type === "circle") {
    context.beginPath();
    context.arc(pointX, pointY, size, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

export function drawBoard(canvas, board, options = {}) {
  const size = board.length;
  const context = canvas.getContext("2d");
  canvas.width = BOARD_SIZE;
  canvas.height = BOARD_SIZE;
  const span = (BOARD_SIZE - MARGIN * 2) / (size - 1);

  context.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);
  const background = context.createLinearGradient(0, 0, BOARD_SIZE, BOARD_SIZE);
  background.addColorStop(0, "#e6bc72");
  background.addColorStop(0.5, "#d7a95e");
  background.addColorStop(1, "#c9944e");
  context.fillStyle = background;
  context.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

  context.save();
  context.globalAlpha = 0.14;
  context.strokeStyle = "#7c4f22";
  context.lineWidth = 2;
  for (let y = 18; y < BOARD_SIZE; y += 22) {
    context.beginPath();
    context.moveTo(0, y + Math.sin(y) * 2);
    context.bezierCurveTo(220, y - 5, 640, y + 6, BOARD_SIZE, y);
    context.stroke();
  }
  context.restore();

  context.strokeStyle = "#3d2f1f";
  context.fillStyle = "#3d2f1f";
  context.lineWidth = size > 19 ? 1.3 : 1.8;
  for (let index = 0; index < size; index += 1) {
    const point = MARGIN + index * span;
    context.beginPath();
    context.moveTo(MARGIN, point);
    context.lineTo(BOARD_SIZE - MARGIN, point);
    context.stroke();
    context.beginPath();
    context.moveTo(point, MARGIN);
    context.lineTo(point, BOARD_SIZE - MARGIN);
    context.stroke();
  }

  const starRadius = Math.max(3, span * 0.09);
  for (const [x, y] of starPoints(size)) {
    context.beginPath();
    context.arc(MARGIN + x * span, MARGIN + y * span, starRadius, 0, Math.PI * 2);
    context.fill();
  }

  if (options.showCoordinates !== false) {
    context.font = `500 ${Math.max(12, Math.min(20, span * 0.38))}px Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "rgba(54, 38, 20, 0.72)";
    for (let index = 0; index < size; index += 1) {
      const point = MARGIN + index * span;
      const letter = COORDINATES[index] || String(index + 1);
      const row = String(size - index);
      context.fillText(letter, point, MARGIN * 0.43);
      context.fillText(letter, point, BOARD_SIZE - MARGIN * 0.43);
      context.fillText(row, MARGIN * 0.43, point);
      context.fillText(row, BOARD_SIZE - MARGIN * 0.43, point);
    }
  }

  const radius = Math.max(8, span * 0.46);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const color = board[y][x];
      if (!color) continue;
      drawStone(context, MARGIN + x * span, MARGIN + y * span, radius, color);
    }
  }

  if (options.labels?.length) {
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `700 ${Math.max(14, span * 0.42)}px Arial, sans-serif`;
    for (const label of options.labels) {
      const color = board[label.y]?.[label.x];
      if (!color) continue;
      context.fillStyle = color === "B" ? "#f7f1e4" : "#20231f";
      context.fillText(
        String(label.number),
        MARGIN + label.x * span,
        MARGIN + label.y * span + 1,
      );
    }
  }

  if (options.lastMove && !options.lastMove.pass) {
    const { x, y, color } = options.lastMove;
    context.beginPath();
    context.arc(MARGIN + x * span, MARGIN + y * span, radius * 0.35, 0, Math.PI * 2);
    context.strokeStyle = color === "B" ? "#f2b95e" : "#b04032";
    context.lineWidth = Math.max(3, span * 0.07);
    context.stroke();
  }

  for (const mark of options.marks || []) {
    if (mark.x >= 0 && mark.y >= 0 && mark.x < size && mark.y < size) {
      drawMark(context, mark, board, span);
    }
  }
}

export function pointFromCanvasEvent(canvas, event, size) {
  const rectangle = canvas.getBoundingClientRect();
  const canvasX = ((event.clientX - rectangle.left) / rectangle.width) * BOARD_SIZE;
  const canvasY = ((event.clientY - rectangle.top) / rectangle.height) * BOARD_SIZE;
  const span = (BOARD_SIZE - MARGIN * 2) / (size - 1);
  const x = Math.round((canvasX - MARGIN) / span);
  const y = Math.round((canvasY - MARGIN) / span);
  if (x < 0 || y < 0 || x >= size || y >= size) return null;

  const distance = Math.hypot(
    canvasX - (MARGIN + x * span),
    canvasY - (MARGIN + y * span),
  );
  return distance <= span * 0.48 ? { x, y } : null;
}

export function boardDataUrl(canvas, quality = 0.95) {
  return canvas.toDataURL("image/jpeg", quality);
}
