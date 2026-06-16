import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMarks, toggleBoardMark } from "../js/marks.js";

test("numbers and letters are assigned in sequence", () => {
  let marks = toggleBoardMark([], { x: 1, y: 1 }, "number");
  marks = toggleBoardMark(marks, { x: 2, y: 2 }, "number");
  marks = toggleBoardMark(marks, { x: 3, y: 3 }, "letter");

  assert.deepEqual(
    marks.map(({ type, value }) => [type, value]),
    [["number", "1"], ["number", "2"], ["letter", "A"]],
  );
});

test("clicking the same mark type again removes it", () => {
  let marks = toggleBoardMark([], { x: 4, y: 5 }, "triangle");
  marks = toggleBoardMark(marks, { x: 4, y: 5 }, "triangle");
  assert.deepEqual(marks, []);
});

test("letter marks keep increasing after an earlier mark is removed", () => {
  let marks = toggleBoardMark([], { x: 1, y: 1 }, "letter");
  marks = toggleBoardMark(marks, { x: 2, y: 2 }, "letter");
  marks = toggleBoardMark(marks, { x: 1, y: 1 }, "letter");
  marks = toggleBoardMark(marks, { x: 3, y: 3 }, "letter");

  assert.deepEqual(marks.map((mark) => mark.value), ["B", "C"]);
});

test("normalization ignores invalid marker data", () => {
  assert.deepEqual(normalizeMarks([{ x: 1, y: 2, type: "circle" }, { type: "bad" }]), [
    { x: 1, y: 2, type: "circle", value: "" },
  ]);
});
