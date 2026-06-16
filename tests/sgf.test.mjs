import test from "node:test";
import assert from "node:assert/strict";
import { buildPositions, parseSgf, playMove } from "../js/sgf.js";

test("parses metadata and follows the first SGF branch", () => {
  const sgf =
    "(;GM[1]FF[4]SZ[9]PB[Alpha]PW[Beta]RE[B+R]AB[aa];B[cc];W[dc](;B[dd])(;B[ee]))";
  const game = parseSgf(sgf);

  assert.equal(game.size, 9);
  assert.equal(game.info.blackName, "Alpha");
  assert.equal(game.info.result, "B+R");
  assert.deepEqual(game.setup.black, [{ x: 0, y: 0, pass: false }]);
  assert.deepEqual(
    game.moves.map(({ color, x, y }) => [color, x, y]),
    [["B", 2, 2], ["W", 3, 2], ["B", 3, 3]],
  );
});

test("reconstructs captures", () => {
  const board = [
    [null, "B", null],
    ["B", "W", null],
    [null, "B", null],
  ];
  const result = playMove(board, { color: "B", x: 2, y: 1, pass: false });

  assert.equal(result.captures, 1);
  assert.equal(result.board[1][1], null);
});

test("builds one position for every move plus the initial board", () => {
  const game = parseSgf("(;SZ[9];B[aa];W[bb];B[])");
  assert.equal(buildPositions(game).length, 4);
});
