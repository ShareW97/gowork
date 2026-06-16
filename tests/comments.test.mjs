import test from "node:test";
import assert from "node:assert/strict";
import {
  commentVariations,
  countGameVariations,
  normalizeComment,
  normalizeCommentTextStyle,
} from "../js/comments.js";

test("migrates a legacy single variation into the variations list", () => {
  const comment = normalizeComment({
    id: "note-1",
    moveNumber: 12,
    variationImage: "data:image/jpeg;base64,legacy",
    variationMoves: [{ color: "B", x: 3, y: 3 }],
  });

  assert.equal(comment.variations.length, 1);
  assert.equal(comment.variations[0].image, "data:image/jpeg;base64,legacy");
  assert.equal(comment.variations[0].baseMoveNumber, 12);
  assert.equal("variationImage" in comment, false);
});

test("counts every variation across comments", () => {
  const game = {
    comments: [
      { variations: [{ image: "one" }, { image: "two" }] },
      { variationImage: "legacy" },
    ],
  };

  assert.equal(countGameVariations(game), 3);
  assert.equal(commentVariations(game.comments[1]).length, 1);
});

test("preserves variation comments and valid board marks", () => {
  const [variation] = commentVariations({
    id: "note-2",
    variations: [
      {
        image: "image",
        text: "这里应先断再长。",
        richTextHtml: '这里应<span class="rt-bold">先断</span>再长。',
        marks: [{ x: 4, y: 4, type: "triangle" }, { type: "invalid" }],
        baseMoveNumber: 16,
      },
    ],
  });

  assert.equal(variation.text, "这里应先断再长。");
  assert.equal(variation.richTextHtml, '这里应<span class="rt-bold">先断</span>再长。');
  assert.equal(variation.baseMoveNumber, 16);
  assert.deepEqual(variation.marks, [{ x: 4, y: 4, type: "triangle", value: "" }]);
});

test("normalizes comment text style settings", () => {
  assert.deepEqual(normalizeCommentTextStyle({ size: "large", bold: true }), {
    size: "large",
    bold: true,
  });
  assert.deepEqual(normalizeCommentTextStyle({ size: "huge", bold: 1 }), {
    size: "medium",
    bold: true,
  });

  const comment = normalizeComment({
    text: "重点说明",
    richTextHtml: '<span class="rt-size-large">重点</span>说明',
    textStyle: { size: "small", bold: true },
  });
  assert.deepEqual(comment.textStyle, { size: "small", bold: true });
  assert.equal(comment.richTextHtml, '<span class="rt-size-large">重点</span>说明');
});
