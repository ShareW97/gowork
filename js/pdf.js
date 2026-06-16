import { commentVariations, normalizeCommentTextStyle } from "./comments.js";

const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const OUTPUT_SCALE = 1.5;
const PDF_WIDTH = 595.28;
const PDF_HEIGHT = 841.89;
const FOREST = "#173f34";
const FOREST_DEEP = "#0f332b";
const GOLD = "#c49a55";
const GOLD_SOFT = "#e5d3ad";
const INK = "#18352d";
const MUTED = "#65716c";
const PAPER = "#f7f5ef";
const BRAND_NAME = "弈棋无限";
const BRAND_EN = "YI·GO";
const BRAND_MARK_URL = "./assets/logo-yiqi-infinite-mark.png";
const PDF_MIME_TYPE = "application/pdf";
const DOWNLOAD_URL_REVOKE_DELAY = 60_000;
const FREE_ANALYSIS_TITLES = {
  calculation: "题目讲解",
  joseki: "招法讲解",
  global: "推理 · 精讲",
};
let brandMarkPromise = null;

function createPage() {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH * OUTPUT_SCALE;
  canvas.height = PAGE_HEIGHT * OUTPUT_SCALE;
  const context = canvas.getContext("2d");
  context.scale(OUTPUT_SCALE, OUTPUT_SCALE);
  context.fillStyle = PAPER;
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  const wash = context.createRadialGradient(1040, 90, 0, 1040, 90, 620);
  wash.addColorStop(0, "rgba(194, 151, 79, 0.2)");
  wash.addColorStop(1, "rgba(194, 151, 79, 0)");
  context.fillStyle = wash;
  context.fillRect(0, 0, PAGE_WIDTH, 720);

  context.save();
  context.globalAlpha = 0.12;
  context.fillStyle = "#b9ab8d";
  for (let index = 0; index < 150; index += 1) {
    const x = (index * 73) % PAGE_WIDTH;
    const y = (index * 137) % PAGE_HEIGHT;
    context.fillRect(x, y, 1.2, 1.2);
  }
  context.restore();
  return { canvas, context };
}

function drawHeader(context, label = "棋局分析评价报告") {
  context.fillStyle = INK;
  context.fillRect(0, 0, PAGE_WIDTH, 18);
  context.font = "600 24px Arial, sans-serif";
  context.fillStyle = "#66726d";
  context.fillText(label, 82, 82);
  context.fillStyle = GOLD;
  context.fillRect(82, 106, 48, 4);
}

function drawFooter(context, pageNumber) {
  context.strokeStyle = "#dedbd1";
  context.beginPath();
  context.moveTo(82, PAGE_HEIGHT - 86);
  context.lineTo(PAGE_WIDTH - 82, PAGE_HEIGHT - 86);
  context.stroke();
  context.fillStyle = "#88918d";
  context.font = "20px Arial, sans-serif";
  context.fillText(`${BRAND_NAME} · ${BRAND_EN}`, 82, PAGE_HEIGHT - 48);
  context.textAlign = "right";
  context.fillText(String(pageNumber).padStart(2, "0"), PAGE_WIDTH - 82, PAGE_HEIGHT - 48);
  context.textAlign = "left";
}

function loadBrandMark() {
  brandMarkPromise ||= loadImage(BRAND_MARK_URL).catch(() => null);
  return brandMarkPromise;
}

function roundedRect(context, x, y, width, height, radius, fill, stroke) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  if (fill) {
    context.fillStyle = fill;
    context.fill();
  }
  if (stroke) {
    context.strokeStyle = stroke;
    context.stroke();
  }
}

function drawCenteredText(context, text, x, y, width, lineHeight, maxLines = 1) {
  const lines = linesForText(context, text, width).slice(0, maxLines);
  lines.forEach((line, index) => {
    context.fillText(line, x + width / 2, y + index * lineHeight);
  });
}

function drawGoldRule(context, x, y, width) {
  context.strokeStyle = GOLD;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + width * 0.43, y);
  context.moveTo(x + width * 0.57, y);
  context.lineTo(x + width, y);
  context.stroke();
  context.beginPath();
  context.arc(x + width / 2, y, 8, 0, Math.PI * 2);
  context.fillStyle = GOLD;
  context.fill();
}

function drawBrandSeal(context, x, y, size, dark = false) {
  context.save();
  context.strokeStyle = dark ? GOLD_SOFT : FOREST;
  context.lineWidth = 4;
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(x + size * 0.22, y + size * 0.38);
  context.lineTo(x + size * 0.78, y + size * 0.38);
  context.moveTo(x + size * 0.22, y + size * 0.62);
  context.lineTo(x + size * 0.78, y + size * 0.62);
  context.moveTo(x + size * 0.38, y + size * 0.22);
  context.lineTo(x + size * 0.38, y + size * 0.78);
  context.moveTo(x + size * 0.62, y + size * 0.22);
  context.lineTo(x + size * 0.62, y + size * 0.78);
  context.stroke();
  context.fillStyle = dark ? GOLD_SOFT : FOREST;
  for (const [sx, sy] of [
    [0.38, 0.38],
    [0.62, 0.38],
    [0.38, 0.62],
    [0.62, 0.62],
  ]) {
    context.beginPath();
    context.arc(x + size * sx, y + size * sy, size * 0.055, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawBrandLogoTile(context, image, x, y, size, dark = false) {
  if (!image) {
    drawBrandSeal(context, x, y, size, dark);
    return;
  }
  roundedRect(
    context,
    x,
    y,
    size,
    size,
    dark ? 20 : 15,
    dark ? "rgba(255,255,255,0.96)" : "#ffffff",
    dark ? "rgba(229,211,173,0.45)" : "rgba(23,63,52,0.12)",
  );
  context.save();
  context.beginPath();
  context.roundRect(x + 7, y + 7, size - 14, size - 14, dark ? 15 : 11);
  context.clip();
  context.drawImage(image, x + 7, y + 7, size - 14, size - 14);
  context.restore();
}

function drawElegantRail(context, label = BRAND_EN, brandMark = null) {
  context.fillStyle = FOREST_DEEP;
  context.fillRect(0, 0, 292, 545);
  const railGradient = context.createLinearGradient(0, 0, 292, 545);
  railGradient.addColorStop(0, "rgba(255,255,255,0.05)");
  railGradient.addColorStop(1, "rgba(0,0,0,0.16)");
  context.fillStyle = railGradient;
  context.fillRect(0, 0, 292, 545);

  drawBrandLogoTile(context, brandMark, 72, 78, 102, true);
  context.fillStyle = GOLD_SOFT;
  context.font = "700 35px Georgia, 'Songti SC', serif";
  context.fillText(BRAND_NAME, 72, 255);
  context.font = "600 21px Georgia, serif";
  context.fillText(BRAND_EN, 72, 294);
  context.fillStyle = GOLD;
  context.fillRect(72, 342, 66, 4);
  context.font = "700 20px Arial, sans-serif";
  context.fillText(label, 72, 390);
}

function drawElegantLandscape(context) {
  context.save();
  context.globalAlpha = 0.28;
  const gradient = context.createLinearGradient(0, PAGE_HEIGHT - 300, 0, PAGE_HEIGHT);
  gradient.addColorStop(0, "rgba(23,63,52,0)");
  gradient.addColorStop(1, "rgba(23,63,52,0.28)");
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(0, PAGE_HEIGHT);
  context.lineTo(0, PAGE_HEIGHT - 120);
  context.bezierCurveTo(160, PAGE_HEIGHT - 245, 265, PAGE_HEIGHT - 105, 410, PAGE_HEIGHT - 190);
  context.bezierCurveTo(575, PAGE_HEIGHT - 285, 740, PAGE_HEIGHT - 105, 910, PAGE_HEIGHT - 170);
  context.bezierCurveTo(1040, PAGE_HEIGHT - 225, 1140, PAGE_HEIGHT - 120, PAGE_WIDTH, PAGE_HEIGHT - 185);
  context.lineTo(PAGE_WIDTH, PAGE_HEIGHT);
  context.closePath();
  context.fill();
  context.restore();
}

function linesForText(context, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text || "").split(/\r?\n/)) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const character of paragraph) {
      const candidate = line + character;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = character;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawLines(context, lines, x, y, lineHeight, color = "#2d3935") {
  context.fillStyle = color;
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    if (!source) {
      reject(new Error("Missing image source"));
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

async function loadImageOrNull(source) {
  try {
    return await loadImage(source);
  } catch {
    return null;
  }
}

function drawImageCard(context, image, x, y, size, label) {
  roundedRect(context, x, y, size, size + 58, 20, "#ffffff", "#dedbd1");
  context.save();
  context.beginPath();
  context.roundRect(x + 10, y + 10, size - 20, size - 20, 14);
  context.clip();
  if (image) {
    context.drawImage(image, x + 10, y + 10, size - 20, size - 20);
  } else {
    drawFallbackBoard(context, x + 10, y + 10, size - 20);
    context.fillStyle = "rgba(255, 250, 240, 0.82)";
    context.fillRect(x + 10, y + size - 64, size - 20, 54);
    context.textAlign = "center";
    context.font = "700 18px Arial, sans-serif";
    context.fillStyle = FOREST;
    context.fillText("图片未找到 · 已保留讲解位置", x + size / 2, y + size - 30);
    context.textAlign = "left";
  }
  context.restore();
  context.font = "600 22px Arial, sans-serif";
  context.fillStyle = "#6b7772";
  context.fillText(label, x + 20, y + size + 38);
}

function drawContainedImage(context, image, x, y, width, height, background = "#fffaf0") {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  if (!imageWidth || !imageHeight) {
    context.drawImage(image, x, y, width, height);
    return;
  }
  context.fillStyle = background;
  context.fillRect(x, y, width, height);
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function drawFallbackBoard(context, x, y, size) {
  const margin = size * 0.08;
  const span = (size - margin * 2) / 18;
  context.save();
  const boardGradient = context.createLinearGradient(x, y, x + size, y + size);
  boardGradient.addColorStop(0, "#ead09a");
  boardGradient.addColorStop(1, "#c99855");
  context.fillStyle = boardGradient;
  context.fillRect(x, y, size, size);
  context.strokeStyle = "rgba(70,45,18,0.55)";
  context.lineWidth = 1.4;
  for (let index = 0; index < 19; index += 1) {
    const point = margin + index * span;
    context.beginPath();
    context.moveTo(x + margin, y + point);
    context.lineTo(x + size - margin, y + point);
    context.stroke();
    context.beginPath();
    context.moveTo(x + point, y + margin);
    context.lineTo(x + point, y + size - margin);
    context.stroke();
  }
  context.fillStyle = "rgba(50,34,16,0.68)";
  for (const star of [3, 9, 15]) {
    for (const starY of [3, 9, 15]) {
      context.beginPath();
      context.arc(x + margin + star * span, y + margin + starY * span, 4, 0, Math.PI * 2);
      context.fill();
    }
  }
  const stones = [
    [3, 3, "B"],
    [4, 3, "W"],
    [3, 4, "B"],
    [15, 4, "W"],
    [16, 4, "B"],
    [15, 15, "B"],
    [14, 15, "W"],
    [10, 9, "W"],
    [9, 10, "B"],
  ];
  for (const [sx, sy, color] of stones) {
    context.beginPath();
    context.arc(x + margin + sx * span, y + margin + sy * span, span * 0.42, 0, Math.PI * 2);
    context.fillStyle = color === "B" ? "#171916" : "#f8f4ea";
    context.fill();
    context.strokeStyle = color === "B" ? "#171916" : "#9f9787";
    context.stroke();
  }
  context.restore();
}

function drawBoardPreview(context, image, x, y, width, height, label = "对局图示") {
  roundedRect(context, x, y, width, height + 54, 18, "#fffaf0", GOLD_SOFT);
  context.save();
  context.beginPath();
  context.roundRect(x + 10, y + 10, width - 20, height - 20, 10);
  context.clip();
  if (image) {
    drawContainedImage(context, image, x + 10, y + 10, width - 20, height - 20);
  } else {
    const fallbackSize = Math.min(width - 20, height - 20);
    drawFallbackBoard(
      context,
      x + (width - fallbackSize) / 2,
      y + (height - fallbackSize) / 2,
      fallbackSize,
    );
  }
  context.restore();
  context.textAlign = "center";
  context.font = "500 19px Georgia, 'Songti SC', serif";
  context.fillStyle = "#8b6c36";
  context.fillText(label, x + width / 2, y + height + 33);
  context.textAlign = "left";
}

async function coverPreviewImage(game) {
  const source = game.comments?.[0]?.screenshot;
  return await loadImageOrNull(source);
}

function drawInfoRow(context, label, value, x, y, width = 480) {
  context.font = "500 22px Arial, sans-serif";
  context.fillStyle = "#88918d";
  context.fillText(label, x, y);
  context.font = "600 28px Arial, sans-serif";
  context.fillStyle = "#233a32";
  const lines = linesForText(context, value || "未填写", width);
  drawLines(context, lines.slice(0, 2), x, y + 38, 34);
}

function freeReportInfo(game) {
  const info = game.freeAnalysisInfo || {};
  return {
    calculation: {
      assignmentName: info.calculation?.assignmentName || "",
      problemType: info.calculation?.problemType || "",
      problemCount: info.calculation?.problemCount || "",
      difficulty: info.calculation?.difficulty || "",
    },
    joseki: {
      variationName: info.joseki?.variationName || "",
      difficulty: info.joseki?.difficulty || "",
      keyPoints: info.joseki?.keyPoints || "",
    },
    global: {
      analysisType: info.global?.analysisType || "",
      difficulty: info.global?.difficulty || "",
      keyPoints: info.global?.keyPoints || "",
    },
  };
}

function isFreeAnalysisReport(game) {
  return (
    game?.type === "free" ||
    Object.hasOwn(FREE_ANALYSIS_TITLES, game?.freeAnalysisType) ||
    Array.isArray(game?.freePlacements) ||
    game?.metadata?.platform === "自由分析"
  );
}

function freeReportType(game) {
  return Object.hasOwn(FREE_ANALYSIS_TITLES, game?.freeAnalysisType) ? game.freeAnalysisType : "global";
}

function drawElegantInfoTable(context, rows, x, y, width, rowHeight = 86) {
  roundedRect(context, x, y, width, rows.length * rowHeight, 16, "rgba(255,254,250,0.72)", GOLD_SOFT);
  rows.forEach((row, index) => {
    const rowY = y + index * rowHeight;
    if (index) {
      context.strokeStyle = "#e5dac4";
      context.beginPath();
      context.moveTo(x, rowY);
      context.lineTo(x + width, rowY);
      context.stroke();
    }
    context.fillStyle = FOREST;
    context.beginPath();
    context.arc(x + 28, rowY + rowHeight / 2, 6, 0, Math.PI * 2);
    context.fill();
    context.font = "600 21px Arial, sans-serif";
    context.fillStyle = INK;
    context.fillText(row.label, x + 48, rowY + 37);
    context.font = "500 20px Arial, sans-serif";
    context.fillStyle = "#4f5d58";
    const lines = linesForText(context, row.value || "未填写", width - 60);
    drawLines(context, lines.slice(0, 2), x + 48, rowY + 66, 24, "#4f5d58");
  });
}

function drawTeacherQuote(context, game, x, y, width) {
  const firstComment = game.comments?.[0]?.text || "教师点评内容将在这里汇总展示，帮助学生快速回顾本份报告的核心判断。";
  roundedRect(context, x, y, width, 220, 18, "rgba(255,254,250,0.82)", GOLD_SOFT);
  context.fillStyle = FOREST;
  context.fillRect(x, y, 168, 54);
  context.fillStyle = "#fffaf0";
  context.font = "700 24px Arial, sans-serif";
  context.fillText("教师点评", x + 30, y + 36);
  context.fillStyle = GOLD;
  context.font = "700 66px Georgia, serif";
  context.fillText("“", x + 36, y + 122);
  context.font = "400 23px Arial, sans-serif";
  const lines = linesForText(context, firstComment, width - 180).slice(0, 4);
  drawLines(context, lines, x + 120, y + 94, 34, "#3d4a45");
  context.textAlign = "right";
  context.fillStyle = GOLD;
  context.font = "700 50px Georgia, serif";
  context.fillText("”", x + width - 34, y + 176);
  context.textAlign = "left";
}

function drawCoverSummary(context, game, x, y, width, label) {
  roundedRect(context, x, y, width, 112, 20, "#eee9dd", null);
  context.fillStyle = INK;
  context.font = "700 38px Arial, sans-serif";
  context.fillText(String(game.comments.length).padStart(2, "0"), x + 36, y + 68);
  context.fillStyle = MUTED;
  context.font = "500 22px Arial, sans-serif";
  context.fillText(`条教师点评已归档 · ${label}`, x + 104, y + 66);
}

async function makeCalculationCover(game) {
  const { canvas, context } = createPage();
  const info = freeReportInfo(game).calculation;
  const preview = await coverPreviewImage(game);
  const brandMark = await loadBrandMark();

  context.fillStyle = "#f8f6ef";
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  const glow = context.createRadialGradient(1040, 120, 0, 1040, 120, 690);
  glow.addColorStop(0, "rgba(196, 154, 85, 0.18)");
  glow.addColorStop(0.6, "rgba(196, 154, 85, 0.05)");
  glow.addColorStop(1, "rgba(248, 246, 239, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, PAGE_WIDTH, 720);

  const drawCalcCard = (label, value, x, y, width, height = 128, dark = false) => {
    roundedRect(
      context,
      x,
      y,
      width,
      height,
      24,
      dark ? FOREST_DEEP : "rgba(255,253,248,0.92)",
      dark ? "rgba(80,202,205,0.28)" : "#e4ded0",
    );
    context.fillStyle = dark ? "rgba(223,250,250,0.72)" : MUTED;
    context.font = "800 19px Arial, sans-serif";
    context.fillText(label, x + 28, y + 43);
    context.fillStyle = dark ? "#fffdf8" : INK;
    context.font = "800 29px Arial, 'Songti SC', sans-serif";
    drawLines(context, linesForText(context, value || "未填写", width - 56).slice(0, 2), x + 28, y + 90, 34, dark ? "#fffdf8" : INK);
  };

  context.fillStyle = GOLD;
  context.font = "800 18px Arial, sans-serif";
  context.fillText("YI·GO TRAINING SYSTEM", 78, 102);

  drawBrandLogoTile(context, brandMark, 78, 138, 86);
  context.fillStyle = INK;
  context.font = "800 35px Georgia, 'Songti SC', serif";
  context.fillText(BRAND_NAME, 178, 176);
  context.fillStyle = "#7b8781";
  context.font = "800 17px Arial, sans-serif";
  context.fillText(BRAND_EN, 180, 207);
  context.fillStyle = GOLD;
  context.fillRect(180, 222, 58, 3);

  context.fillStyle = INK;
  context.font = "800 82px Georgia, 'Songti SC', serif";
  context.fillText("计算解析报告", 78, 324);
  context.fillStyle = "#596963";
  context.font = "600 27px Arial, 'Songti SC', sans-serif";
  context.fillText("以算路、题型与难度为核心的围棋计算训练归档", 82, 386);

  const boardX = 78;
  const boardY = 492;
  const boardSize = 660;
  drawBoardPreview(context, preview, boardX, boardY, boardSize, boardSize, "题目局面预览");

  const infoX = 788;
  const infoW = 374;
  drawCalcCard("作业名称", info.assignmentName || "未填写作业名称", infoX, 492, infoW, 128);
  drawCalcCard("题目类型", info.problemType || "未填写", infoX, 660, infoW, 128);
  drawCalcCard("题目数量", info.problemCount || "未填写", infoX, 828, 174, 128);
  drawCalcCard("题目难度", info.difficulty || "未填写", infoX + 200, 828, 174, 128);

  roundedRect(context, infoX, 1018, infoW, 162, 28, FOREST_DEEP, "rgba(80,202,205,0.32)");
  context.fillStyle = "rgba(223,250,250,0.72)";
  context.font = "800 22px Arial, sans-serif";
  context.fillText("点评归档", infoX + 36, 1078);
  context.fillStyle = "#fffdf8";
  context.font = "800 60px Georgia, serif";
  context.fillText(String(game.comments.length).padStart(2, "0"), infoX + 36, 1144);
  context.fillStyle = "rgba(223,250,250,0.76)";
  context.font = "800 20px Arial, sans-serif";
  context.fillText(`完成日期 · ${game.metadata.date || "未填写"}`, infoX + 136, 1141);

  const quoteX = 78;
  const quoteY = 1292;
  const quoteWidth = PAGE_WIDTH - 156;
  roundedRect(context, quoteX, quoteY, quoteWidth, 172, 28, "rgba(255,253,248,0.84)", "#e4ded0");
  roundedRect(context, quoteX + 38, quoteY + 40, 7, 92, 4, GOLD, null);
  context.fillStyle = "rgba(196,154,85,0.22)";
  context.font = "700 62px Georgia, serif";
  context.fillText("“", quoteX + 64, quoteY + 96);
  context.fillStyle = INK;
  context.font = "700 34px Georgia, 'Songti SC', serif";
  context.fillText("一子一思考，一步一成长。", quoteX + 130, quoteY + 72);
  context.fillText("失败不气馁，复盘再起航。", quoteX + 130, quoteY + 126);

  drawFooter(context, 1);
  return canvas;
}

async function makeJosekiCover(game) {
  const { canvas, context } = createPage();
  const info = freeReportInfo(game).joseki;
  const preview = await coverPreviewImage(game);
  const brandMark = await loadBrandMark();

  context.fillStyle = "#f8f6ef";
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  const glow = context.createRadialGradient(1040, 120, 0, 1040, 120, 690);
  glow.addColorStop(0, "rgba(196, 154, 85, 0.18)");
  glow.addColorStop(0.6, "rgba(196, 154, 85, 0.05)");
  glow.addColorStop(1, "rgba(248, 246, 239, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, PAGE_WIDTH, 720);

  const drawJosekiCard = (label, value, x, y, width, height = 128, maxLines = 2) => {
    roundedRect(context, x, y, width, height, 24, "rgba(255,253,248,0.92)", "#e4ded0");
    context.fillStyle = MUTED;
    context.font = "800 19px Arial, sans-serif";
    context.fillText(label, x + 28, y + 43);
    context.fillStyle = INK;
    context.font = "800 29px Arial, 'Songti SC', sans-serif";
    drawLines(context, linesForText(context, value || "未填写", width - 56).slice(0, maxLines), x + 28, y + 90, 34, INK);
  };

  context.fillStyle = GOLD;
  context.font = "800 18px Arial, sans-serif";
  context.fillText("YI·GO REVIEW SYSTEM", 78, 102);

  drawBrandLogoTile(context, brandMark, 78, 138, 86);
  context.fillStyle = INK;
  context.font = "800 35px Georgia, 'Songti SC', serif";
  context.fillText(BRAND_NAME, 178, 176);
  context.fillStyle = "#7b8781";
  context.font = "800 17px Arial, sans-serif";
  context.fillText(BRAND_EN, 180, 207);
  context.fillStyle = GOLD;
  context.fillRect(180, 222, 58, 3);

  context.fillStyle = INK;
  context.font = "800 82px Georgia, 'Songti SC', serif";
  context.fillText("定式变化报告", 78, 324);

  const boardX = 78;
  const boardY = 492;
  const boardSize = 660;
  drawBoardPreview(context, preview, boardX, boardY, boardSize, boardSize, "定式局面预览");

  const infoX = 788;
  const infoW = 374;
  drawJosekiCard("变化名称", info.variationName || "未填写变化名称", infoX, 492, infoW, 128);
  drawJosekiCard("难易程度", info.difficulty || "未填写", infoX, 660, 174, 128);
  drawJosekiCard("棋盘规格", `${game.parsed.size} 路`, infoX + 200, 660, 174, 128);
  drawJosekiCard("关键点", info.keyPoints || "未填写关键点", infoX, 828, infoW, 150, 3);

  roundedRect(context, infoX, 1018, infoW, 162, 28, FOREST_DEEP, "rgba(80,202,205,0.32)");
  context.fillStyle = "rgba(223,250,250,0.72)";
  context.font = "800 22px Arial, sans-serif";
  context.fillText("点评归档", infoX + 36, 1078);
  context.fillStyle = "#fffdf8";
  context.font = "800 60px Georgia, serif";
  context.fillText(String(game.comments.length).padStart(2, "0"), infoX + 36, 1144);
  context.fillStyle = "rgba(223,250,250,0.76)";
  context.font = "800 20px Arial, sans-serif";
  context.fillText(`行棋 · ${game.parsed.moves.length} 手`, infoX + 136, 1141);

  const quoteX = 78;
  const quoteY = 1292;
  const quoteWidth = PAGE_WIDTH - 156;
  roundedRect(context, quoteX, quoteY, quoteWidth, 172, 28, "rgba(255,253,248,0.84)", "#e4ded0");
  roundedRect(context, quoteX + 38, quoteY + 40, 7, 92, 4, GOLD, null);
  context.fillStyle = "rgba(196,154,85,0.22)";
  context.font = "700 62px Georgia, serif";
  context.fillText("“", quoteX + 64, quoteY + 96);
  context.fillStyle = INK;
  context.font = "700 34px Georgia, 'Songti SC', serif";
  context.fillText("定式通变化，变化见方向。", quoteX + 130, quoteY + 72);
  context.fillText("一手明要点，全局有章法。", quoteX + 130, quoteY + 126);

  drawFooter(context, 1);
  return canvas;
}

async function makeGlobalCover(game) {
  const { canvas, context } = createPage();
  const info = freeReportInfo(game).global;
  const preview = await coverPreviewImage(game);
  const brandMark = await loadBrandMark();

  context.fillStyle = "#f8f6ef";
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  const glow = context.createRadialGradient(1040, 120, 0, 1040, 120, 690);
  glow.addColorStop(0, "rgba(196, 154, 85, 0.18)");
  glow.addColorStop(0.6, "rgba(196, 154, 85, 0.05)");
  glow.addColorStop(1, "rgba(248, 246, 239, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, PAGE_WIDTH, 720);

  const drawGlobalCard = (label, value, x, y, width, height = 128, maxLines = 2) => {
    roundedRect(context, x, y, width, height, 24, "rgba(255,253,248,0.92)", "#e4ded0");
    context.fillStyle = MUTED;
    context.font = "800 19px Arial, sans-serif";
    context.fillText(label, x + 28, y + 43);
    context.fillStyle = INK;
    context.font = "800 29px Arial, 'Songti SC', sans-serif";
    drawLines(context, linesForText(context, value || "未填写", width - 56).slice(0, maxLines), x + 28, y + 90, 34, INK);
  };

  context.fillStyle = GOLD;
  context.font = "800 18px Arial, sans-serif";
  context.fillText("YI·GO REVIEW SYSTEM", 78, 102);

  drawBrandLogoTile(context, brandMark, 78, 138, 86);
  context.fillStyle = INK;
  context.font = "800 35px Georgia, 'Songti SC', serif";
  context.fillText(BRAND_NAME, 178, 176);
  context.fillStyle = "#7b8781";
  context.font = "800 17px Arial, sans-serif";
  context.fillText(BRAND_EN, 180, 207);
  context.fillStyle = GOLD;
  context.fillRect(180, 222, 58, 3);

  context.fillStyle = INK;
  context.font = "800 82px Georgia, 'Songti SC', serif";
  context.fillText("全局分析报告", 78, 324);

  const boardX = 78;
  const boardY = 492;
  const boardSize = 660;
  drawBoardPreview(context, preview, boardX, boardY, boardSize, boardSize, "全局局面预览");

  const infoX = 788;
  const infoW = 374;
  drawGlobalCard("分析类型", info.analysisType || "未填写分析类型", infoX, 492, infoW, 128);
  drawGlobalCard("难易程度", info.difficulty || "未填写", infoX, 660, 174, 128);
  drawGlobalCard("棋盘规格", `${game.parsed.size} 路`, infoX + 200, 660, 174, 128);
  drawGlobalCard("关键点", info.keyPoints || "未填写关键点", infoX, 828, infoW, 150, 3);

  roundedRect(context, infoX, 1018, infoW, 162, 28, FOREST_DEEP, "rgba(80,202,205,0.32)");
  context.fillStyle = "rgba(223,250,250,0.72)";
  context.font = "800 22px Arial, sans-serif";
  context.fillText("点评归档", infoX + 36, 1078);
  context.fillStyle = "#fffdf8";
  context.font = "800 60px Georgia, serif";
  context.fillText(String(game.comments.length).padStart(2, "0"), infoX + 36, 1144);
  context.fillStyle = "rgba(223,250,250,0.76)";
  context.font = "800 20px Arial, sans-serif";
  context.fillText(`行棋 · ${game.parsed.moves.length} 手`, infoX + 136, 1141);

  const quoteX = 78;
  const quoteY = 1292;
  const quoteWidth = PAGE_WIDTH - 156;
  roundedRect(context, quoteX, quoteY, quoteWidth, 172, 28, "rgba(255,253,248,0.84)", "#e4ded0");
  roundedRect(context, quoteX + 38, quoteY + 40, 7, 92, 4, GOLD, null);
  context.fillStyle = "rgba(196,154,85,0.22)";
  context.font = "700 62px Georgia, serif";
  context.fillText("“", quoteX + 64, quoteY + 96);
  context.fillStyle = INK;
  context.font = "700 34px Georgia, 'Songti SC', serif";
  context.fillText("全局见方向，细节定胜负。", quoteX + 130, quoteY + 72);
  context.fillText("一盘一总结，判断更清明。", quoteX + 130, quoteY + 126);

  drawFooter(context, 1);
  return canvas;
}

const richTextMetrics = {
  small: { fontSize: 21, lineHeight: 31 },
  medium: { fontSize: 24, lineHeight: 35 },
  large: { fontSize: 29, lineHeight: 42 },
};

function richTextRuns(text, html, fallbackStyle = {}) {
  const fallback = normalizeCommentTextStyle(fallbackStyle);
  if (!html || typeof document === "undefined") {
    return [{ text: text || "未填写点评内容。", style: fallback }];
  }

  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  const runs = [];
  const walk = (node, style) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) runs.push({ text: node.textContent, style });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName === "BR") {
      runs.push({ text: "\n", style });
      return;
    }

    const nextStyle = { ...style };
    if (node.classList.contains("rt-size-small")) nextStyle.size = "small";
    if (node.classList.contains("rt-size-medium")) nextStyle.size = "medium";
    if (node.classList.contains("rt-size-large")) nextStyle.size = "large";
    if (node.classList.contains("rt-bold")) nextStyle.bold = true;
    if (node.classList.contains("rt-normal")) nextStyle.bold = false;
    [...node.childNodes].forEach((child) => walk(child, nextStyle));
  };

  [...template.content.childNodes].forEach((node) => walk(node, fallback));
  return runs.length ? runs : [{ text: text || "未填写点评内容。", style: fallback }];
}

function setRichRunFont(context, style) {
  const safeStyle = normalizeCommentTextStyle(style);
  const metrics = richTextMetrics[safeStyle.size];
  context.font = `${safeStyle.bold ? 700 : 400} ${metrics.fontSize}px Arial, sans-serif`;
  return metrics;
}

function sameRunStyle(a, b) {
  return a.size === b.size && a.bold === b.bold;
}

function appendRun(line, text, style) {
  if (!text) return;
  const previous = line.at(-1);
  if (previous && sameRunStyle(previous.style, style)) previous.text += text;
  else line.push({ text, style: { ...style } });
}

function wrapRichText(context, runs, width) {
  const lines = [[]];
  let currentWidth = 0;
  for (const run of runs) {
    const style = normalizeCommentTextStyle(run.style);
    setRichRunFont(context, style);
    for (const char of String(run.text)) {
      if (char === "\n") {
        lines.push([]);
        currentWidth = 0;
        continue;
      }
      const charWidth = context.measureText(char).width;
      if (currentWidth && currentWidth + charWidth > width) {
        lines.push([]);
        currentWidth = 0;
      }
      appendRun(lines.at(-1), char, style);
      currentWidth += charWidth;
    }
  }
  return lines.filter((line) => line.length);
}

function lineHeightForRichLine(line) {
  return Math.max(...line.map((run) => richTextMetrics[normalizeCommentTextStyle(run.style).size].lineHeight), 35);
}

function drawRichLine(context, line, x, y) {
  let cursorX = x;
  for (const run of line) {
    setRichRunFont(context, run.style);
    context.fillText(run.text, cursorX, y);
    cursorX += context.measureText(run.text).width;
  }
}

function drawTextCard(context, x, y, width, height, title, text, meta = "", options = {}) {
  const normalizedOptions = typeof meta === "object" && meta ? meta : options;
  const metaText = typeof meta === "string" ? meta : "";
  const lines = Array.isArray(text)
    ? text
    : wrapRichText(
        context,
        richTextRuns(text, normalizedOptions.richTextHtml, normalizedOptions.textStyle),
        width - 52,
      );

  roundedRect(context, x, y, width, height, 20, "#ffffff", "#dedbd1");
  context.fillStyle = "#c49a55";
  context.font = "700 21px Arial, sans-serif";
  context.fillText(title, x + 26, y + 42);
  if (metaText) {
    context.textAlign = "right";
    context.fillStyle = "#84908b";
    context.font = "500 17px Arial, sans-serif";
    context.fillText(metaText, x + width - 26, y + 42);
    context.textAlign = "left";
  }
  context.fillStyle = "#2d3935";
  let cursorY = y + 86;
  const bottom = y + height - 30;
  for (let index = 0; index < lines.length; index += 1) {
    const lineHeight = lineHeightForRichLine(lines[index]);
    if (cursorY > bottom) return lines.slice(index);
    drawRichLine(context, lines[index], x + 26, cursorY);
    cursorY += lineHeight;
  }
  return [];
}

export function freeCommentPageTitle(game, comment, suffix = "") {
  if (isFreeAnalysisReport(game)) return FREE_ANALYSIS_TITLES[freeReportType(game)];
  return `第 ${comment.moveNumber} 手${suffix || "局面"}`;
}

function drawVariationRow(context, variation, number, y) {
  drawImageCard(
    context,
    variation.loadedImage,
    82,
    y,
    560,
    `变化图 ${String(number).padStart(2, "0")}`,
  );
  return drawTextCard(
    context,
    680,
    y,
    478,
    618,
    `变化图 ${String(number).padStart(2, "0")} 点评`,
    variation.text || "未填写该变化图点评。",
    `起点第 ${variation.baseMoveNumber} 手 · ${variation.moves.length} 手 · ${variation.marks.length} 个标记`,
    { richTextHtml: variation.richTextHtml },
  );
}

async function makeCover(game) {
  const freeReport = isFreeAnalysisReport(game);
  const reportType = freeReportType(game);
  if (freeReport && reportType === "calculation") {
    return await makeCalculationCover(game);
  }
  if (freeReport && reportType === "joseki") {
    return await makeJosekiCover(game);
  }
  if (freeReport && reportType === "global") {
    return await makeGlobalCover(game);
  }

  const { canvas, context } = createPage();
  const preview = await coverPreviewImage(game);
  const brandMark = await loadBrandMark();

  context.fillStyle = "#f8f6ef";
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  const glow = context.createRadialGradient(1040, 120, 0, 1040, 120, 690);
  glow.addColorStop(0, "rgba(196, 154, 85, 0.18)");
  glow.addColorStop(0.6, "rgba(196, 154, 85, 0.05)");
  glow.addColorStop(1, "rgba(248, 246, 239, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, PAGE_WIDTH, 720);

  const drawGameCard = (label, value, x, y, width, height = 128) => {
    roundedRect(context, x, y, width, height, 24, "rgba(255,253,248,0.92)", "#e4ded0");
    context.fillStyle = MUTED;
    context.font = "800 19px Arial, sans-serif";
    context.fillText(label, x + 28, y + 43);
    context.fillStyle = INK;
    context.font = "800 29px Arial, 'Songti SC', sans-serif";
    drawLines(context, linesForText(context, value || "未填写", width - 56).slice(0, 2), x + 28, y + 90, 34, INK);
  };

  context.fillStyle = GOLD;
  context.font = "800 18px Arial, sans-serif";
  context.fillText("YI·GO REVIEW SYSTEM", 78, 102);

  drawBrandLogoTile(context, brandMark, 78, 138, 86);
  context.fillStyle = INK;
  context.font = "800 35px Georgia, 'Songti SC', serif";
  context.fillText(BRAND_NAME, 178, 176);
  context.fillStyle = "#7b8781";
  context.font = "800 17px Arial, sans-serif";
  context.fillText(BRAND_EN, 180, 207);
  context.fillStyle = GOLD;
  context.fillRect(180, 222, 58, 3);

  context.fillStyle = INK;
  context.font = "800 82px Georgia, 'Songti SC', serif";
  context.fillText(freeReport ? "全局分析报告" : "棋局分析报告", 78, 324);
  if (freeReport) {
    context.fillStyle = "#596963";
    context.font = "600 27px Arial, 'Songti SC', sans-serif";
    context.fillText("围绕全局判断、布局方向与中盘攻防完成教学归档", 82, 386);
  }

  const boardX = 78;
  const boardY = 492;
  const boardSize = 660;
  drawBoardPreview(context, preview, boardX, boardY, boardSize, boardSize, freeReport ? "全局局面预览" : "对局局面预览");
  if (freeReport) {
    const playerLine = "自由分析 · 全局判断";
    context.textAlign = "center";
    context.fillStyle = MUTED;
    context.font = "600 22px Arial, 'Songti SC', sans-serif";
    linesForText(context, playerLine, boardSize - 40)
      .slice(0, 2)
      .forEach((line, index) => context.fillText(line, boardX + boardSize / 2, boardY + boardSize + 74 + index * 30));
    context.textAlign = "left";
  }

  const infoX = 788;
  const infoW = 374;
  drawGameCard(freeReport ? "分析日期" : "对弈时间", game.metadata.date || "未填写", infoX, 492, infoW, 128);
  drawGameCard(freeReport ? "分析平台" : "对弈平台", game.metadata.platform || "未填写", infoX, 660, infoW, 128);
  drawGameCard(freeReport ? "分析类型" : "对局结果", freeReport ? "全局分析" : game.metadata.result || "未填写", infoX, 828, 174, 128);
  drawGameCard("棋盘规格", `${game.parsed.size} 路`, infoX + 200, 828, 174, 128);

  roundedRect(context, infoX, 1018, infoW, 162, 28, FOREST_DEEP, "rgba(80,202,205,0.32)");
  context.fillStyle = "rgba(223,250,250,0.72)";
  context.font = "800 22px Arial, sans-serif";
  context.fillText("点评归档", infoX + 36, 1078);
  context.fillStyle = "#fffdf8";
  context.font = "800 60px Georgia, serif";
  context.fillText(String(game.comments.length).padStart(2, "0"), infoX + 36, 1144);
  context.fillStyle = "rgba(223,250,250,0.76)";
  context.font = "800 20px Arial, sans-serif";
  context.fillText(`${freeReport ? "行棋" : "主分支"} · ${game.parsed.moves.length} 手`, infoX + 136, 1141);

  const quoteX = 78;
  const quoteY = 1292;
  const quoteWidth = PAGE_WIDTH - 156;
  roundedRect(context, quoteX, quoteY, quoteWidth, 172, 28, "rgba(255,253,248,0.84)", "#e4ded0");
  roundedRect(context, quoteX + 38, quoteY + 40, 7, 92, 4, GOLD, null);
  context.fillStyle = "rgba(196,154,85,0.22)";
  context.font = "700 62px Georgia, serif";
  context.fillText("“", quoteX + 64, quoteY + 96);
  context.fillStyle = INK;
  context.font = "700 34px Georgia, 'Songti SC', serif";
  context.fillText("一局一复盘，一手一提升。", quoteX + 130, quoteY + 72);
  context.fillText("胜负皆养分，思考见成长。", quoteX + 130, quoteY + 126);

  drawFooter(context, 1);
  return canvas;
}

async function makeCommentPages(game, comment, index, startPage) {
  const screenshot = await loadImageOrNull(comment.screenshot);
  const variations = await Promise.all(
    commentVariations(comment).map(async (variation) => ({
      ...variation,
      loadedImage: await loadImageOrNull(variation.image),
    })),
  );
  const pages = [];
  const continuationNotes = [];

  {
    const { canvas, context } = createPage();
    drawHeader(context, `点评 ${String(index + 1).padStart(2, "0")}`);
    context.fillStyle = "#17352d";
    context.font = "700 52px Arial, sans-serif";
    context.fillText(freeCommentPageTitle(game, comment), 82, 220);
    context.fillStyle = "#78837f";
    context.font = "400 23px Arial, sans-serif";
    context.fillText("教师点评记录", 84, 266);

    if (variations.length) {
      drawImageCard(context, screenshot, 82, 315, 560, "原局面截图");
      const mainOverflow = drawTextCard(
        context,
        680,
        315,
        478,
        618,
        "教师点评",
        comment.text,
        `${variations.length} 张变化图`,
        { textStyle: comment.textStyle, richTextHtml: comment.richTextHtml },
      );
      if (mainOverflow.length) {
        continuationNotes.push({ title: "教师点评 · 续", lines: mainOverflow });
      }
      const variationOverflow = drawVariationRow(context, variations[0], 1, 970);
      if (variationOverflow.length) {
        continuationNotes.push({
          title: "变化图 01 点评 · 续",
          lines: variationOverflow,
        });
      }
    } else {
      drawImageCard(context, screenshot, 250, 315, 740, "原局面截图");
      const mainOverflow = drawTextCard(
        context,
        82,
        1125,
        PAGE_WIDTH - 164,
        430,
        "教师点评",
        comment.text,
        "未提交变化图",
        { textStyle: comment.textStyle, richTextHtml: comment.richTextHtml },
      );
      if (mainOverflow.length) {
        continuationNotes.push({ title: "教师点评 · 续", lines: mainOverflow });
      }
    }
    drawFooter(context, startPage + pages.length);
    pages.push(canvas);
  }

  for (let offset = 1; offset < variations.length; offset += 2) {
    const group = variations.slice(offset, offset + 2);
    const { canvas, context } = createPage();
    drawHeader(context, `点评 ${String(index + 1).padStart(2, "0")} · 变化图`);
    context.fillStyle = "#17352d";
    context.font = "700 48px Arial, sans-serif";
    context.fillText(freeCommentPageTitle(game, comment, "教学变化"), 82, 220);
    context.fillStyle = "#78837f";
    context.font = "400 23px Arial, sans-serif";
    context.fillText(`共 ${variations.length} 张变化图 · 图片与点评对应归档`, 84, 266);

    if (group.length === 1) {
      const number = offset + 1;
      drawImageCard(
        context,
        group[0].loadedImage,
        170,
        315,
        900,
        `变化图 ${String(number).padStart(2, "0")} · 高清局面`,
      );
      const overflow = drawTextCard(
        context,
        82,
        1280,
        PAGE_WIDTH - 164,
        300,
        `变化图 ${String(number).padStart(2, "0")} 点评`,
        group[0].text || "未填写该变化图点评。",
        `起点第 ${group[0].baseMoveNumber} 手 · ${group[0].moves.length} 手 · ${group[0].marks.length} 个标记`,
        { richTextHtml: group[0].richTextHtml },
      );
      if (overflow.length) {
        continuationNotes.push({
          title: `变化图 ${String(number).padStart(2, "0")} 点评 · 续`,
          lines: overflow,
        });
      }
    } else {
      group.forEach((variation, groupIndex) => {
        const number = offset + groupIndex + 1;
        const overflow = drawVariationRow(context, variation, number, groupIndex ? 970 : 315);
        if (overflow.length) {
          continuationNotes.push({
            title: `变化图 ${String(number).padStart(2, "0")} 点评 · 续`,
            lines: overflow,
          });
        }
      });
    }
    drawFooter(context, startPage + pages.length);
    pages.push(canvas);
  }

  for (let offset = 0; offset < continuationNotes.length; offset += 2) {
    const group = continuationNotes.slice(offset, offset + 2);
    const { canvas, context } = createPage();
    drawHeader(context, `点评 ${String(index + 1).padStart(2, "0")} · 文字续页`);
    context.fillStyle = "#17352d";
    context.font = "700 44px Arial, sans-serif";
    context.fillText(freeCommentPageTitle(game, comment, "补充点评"), 82, 220);
    group.forEach((note, noteIndex) => {
      drawTextCard(
        context,
        82,
        noteIndex ? 970 : 315,
        PAGE_WIDTH - 164,
        610,
        note.title,
        note.lines,
      );
    });
    drawFooter(context, startPage + pages.length);
    pages.push(canvas);
  }

  return pages;
}

function stringBytes(value) {
  return new TextEncoder().encode(value);
}

function dataUrlBytes(dataUrl) {
  const binary = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function concatBytes(parts, totalLength) {
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function canvasesToPdf(canvases) {
  const parts = [];
  const offsets = [0];
  let length = 0;
  const add = (part) => {
    const bytes = typeof part === "string" ? stringBytes(part) : part;
    parts.push(bytes);
    length += bytes.length;
  };
  const addObject = (id, bodyParts) => {
    offsets[id] = length;
    add(`${id} 0 obj\n`);
    bodyParts.forEach(add);
    add("\nendobj\n");
  };

  add("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  addObject(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  const pageIds = canvases.map((_, index) => 3 + index * 3);
  addObject(2, [`<< /Type /Pages /Count ${canvases.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`]);

  canvases.forEach((canvas, index) => {
    const pageId = 3 + index * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const imageBytes = dataUrlBytes(canvas.toDataURL("image/jpeg", 0.96));
    const content = `q\n${PDF_WIDTH} 0 0 ${PDF_HEIGHT} 0 0 cm\n/Im0 Do\nQ`;
    const contentLength = stringBytes(content).length;

    addObject(pageId, [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] `,
      `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    ]);
    addObject(contentId, [`<< /Length ${contentLength} >>\nstream\n${content}\nendstream`]);
    addObject(imageId, [
      `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} `,
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
      imageBytes,
      "\nendstream",
    ]);
  });

  const xrefOffset = length;
  add(`xref\n0 ${offsets.length}\n`);
  add("0000000000 65535 f \n");
  for (let index = 1; index < offsets.length; index += 1) {
    add(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
  }
  add(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return new Blob([concatBytes(parts, length)], { type: PDF_MIME_TYPE });
}

export function ensurePdfFilename(filename = "围棋教学报告.pdf") {
  const safeName = String(filename || "围棋教学报告.pdf")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\.+$/g, "");
  const baseName = safeName || "围棋教学报告";
  return /\.pdf$/i.test(baseName) ? baseName : `${baseName}.pdf`;
}

function downloadBlob(blob, filename) {
  const pdfBlob = blob?.type === PDF_MIME_TYPE ? blob : new Blob([blob], { type: PDF_MIME_TYPE });
  const safeFilename = ensurePdfFilename(filename);
  const url = URL.createObjectURL(pdfBlob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeFilename;
  anchor.type = PDF_MIME_TYPE;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_REVOKE_DELAY);
}

export async function createGameReportFile(game) {
  const freeReport = isFreeAnalysisReport(game);
  const reportType = freeReportType(game);
  const pages = [await makeCover(game)];
  for (let index = 0; index < game.comments.length; index += 1) {
    pages.push(...(await makeCommentPages(game, game.comments[index], index, pages.length + 1)));
  }
  const blob = canvasesToPdf(pages);
  const reportName =
    freeReport && reportType === "calculation"
      ? "计算解析"
      : freeReport && reportType === "joseki"
        ? "定式变化"
        : freeReport
          ? "全局分析"
          : "棋局分析评价";
  return {
    blob,
    filename: ensurePdfFilename(reportName),
  };
}

export async function exportGameReport(game) {
  const { blob, filename } = await createGameReportFile(game);
  downloadBlob(blob, filename);
}
