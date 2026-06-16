import test from "node:test";
import assert from "node:assert/strict";
import { canvasesToPdf, ensurePdfFilename, freeCommentPageTitle } from "../js/pdf.js";

const comment = { moveNumber: 42 };

test("uses teaching titles for free analysis comment pages", () => {
  assert.equal(freeCommentPageTitle({ type: "free", freeAnalysisType: "calculation" }, comment), "题目讲解");
  assert.equal(freeCommentPageTitle({ type: "free", freeAnalysisType: "joseki" }, comment), "招法讲解");
  assert.equal(freeCommentPageTitle({ type: "free", freeAnalysisType: "global" }, comment), "推理 · 精讲");
});

test("keeps move-number titles for imported game analysis", () => {
  assert.equal(freeCommentPageTitle({ type: "game" }, comment), "第 42 手局面");
  assert.equal(freeCommentPageTitle({ type: "game" }, comment, "教学变化"), "第 42 手教学变化");
});

test("keeps free analysis page headers strict after page two", () => {
  assert.equal(
    freeCommentPageTitle({ type: "free", freeAnalysisType: "calculation" }, comment, "教学变化"),
    "题目讲解",
  );
  assert.equal(
    freeCommentPageTitle({ type: "free", freeAnalysisType: "joseki" }, comment, "补充点评"),
    "招法讲解",
  );
  assert.equal(
    freeCommentPageTitle({ type: "free", freeAnalysisType: "global" }, comment, "教学变化"),
    "推理 · 精讲",
  );
});

test("recognizes legacy free-analysis archives without a type field", () => {
  assert.equal(freeCommentPageTitle({ freeAnalysisType: "calculation" }, comment), "题目讲解");
  assert.equal(freeCommentPageTitle({ freeAnalysisType: "joseki" }, comment), "招法讲解");
  assert.equal(freeCommentPageTitle({ metadata: { platform: "自由分析" } }, comment), "推理 · 精讲");
});

test("normalizes report downloads as pdf filenames", () => {
  assert.equal(ensurePdfFilename("棋局分析评价"), "棋局分析评价.pdf");
  assert.equal(ensurePdfFilename("计算解析.PDF"), "计算解析.PDF");
  assert.equal(ensurePdfFilename("棋局/分析:*报告"), "棋局-分析-报告.pdf");
});

test("builds a real pdf blob from canvas images", async () => {
  const blob = canvasesToPdf([
    {
      width: 1,
      height: 1,
      toDataURL: () => "data:image/jpeg;base64,/9j/2w==",
    },
  ]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const header = Buffer.from(bytes.slice(0, 5)).toString("latin1");
  const trailer = Buffer.from(bytes.slice(-5)).toString("latin1");
  assert.equal(blob.type, "application/pdf");
  assert.equal(header, "%PDF-");
  assert.equal(trailer, "%%EOF");
});
