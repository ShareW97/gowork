import { normalizeMarks } from "./marks.js";

const freeAnalysisTypes = new Set(["calculation", "joseki", "global"]);
const commentTextSizes = new Set(["small", "medium", "large"]);

function looksLikeFreeAnalysis(game) {
  return (
    game?.type === "free" ||
    freeAnalysisTypes.has(game?.freeAnalysisType) ||
    Array.isArray(game?.freePlacements) ||
    game?.metadata?.platform === "自由分析"
  );
}

export function commentVariations(comment) {
  if (Array.isArray(comment?.variations)) {
    return comment.variations
      .filter((variation) => variation?.image)
      .map((variation, index) => ({
        id: variation.id || `variation-${comment.id || comment.moveNumber}-${index + 1}`,
        image: variation.image,
        imagePath: variation.imagePath || "",
        moves: Array.isArray(variation.moves) ? variation.moves : [],
        marks: normalizeMarks(variation.marks),
        text: String(variation.text || ""),
        richTextHtml: String(variation.richTextHtml || ""),
        baseMoveNumber: Number.isInteger(variation.baseMoveNumber)
          ? variation.baseMoveNumber
          : Number.isInteger(comment.moveNumber)
            ? comment.moveNumber
            : 0,
      }));
  }

  if (comment?.variationImage) {
    return [
      {
        id: `legacy-${comment.id || comment.moveNumber}`,
        image: comment.variationImage,
        imagePath: "",
        moves: Array.isArray(comment.variationMoves) ? comment.variationMoves : [],
        marks: [],
        text: "",
        baseMoveNumber: Number.isInteger(comment.moveNumber) ? comment.moveNumber : 0,
      },
    ];
  }

  return [];
}

export function normalizeCommentTextStyle(style = {}) {
  return {
    size: commentTextSizes.has(style?.size) ? style.size : "medium",
    bold: Boolean(style?.bold),
  };
}

export function normalizeComment(comment = {}) {
  const { variationImage, variationMoves, ...rest } = comment;
  return {
    ...rest,
    textStyle: normalizeCommentTextStyle(comment.textStyle),
    richTextHtml: String(comment.richTextHtml || ""),
    variations: commentVariations(comment),
  };
}

export function normalizeGame(game) {
  const freeAnalysis = looksLikeFreeAnalysis(game);
  const freeAnalysisType = freeAnalysisTypes.has(game?.freeAnalysisType)
    ? game.freeAnalysisType
    : freeAnalysis
      ? "global"
      : game?.freeAnalysisType;

  return {
    ...game,
    ...(freeAnalysis
      ? {
          type: "free",
          freeAnalysisType,
          freePlacements: Array.isArray(game?.freePlacements) ? game.freePlacements : [],
        }
      : {}),
    comments: Array.isArray(game?.comments) ? game.comments.map(normalizeComment) : [],
  };
}

export function countGameVariations(game) {
  return (game?.comments || []).reduce(
    (total, comment) => total + commentVariations(comment).length,
    0,
  );
}
