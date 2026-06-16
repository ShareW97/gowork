function letterForIndex(index) {
  let result = "";
  let current = index;
  do {
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);
  return result;
}

function indexForLetter(value) {
  let result = 0;
  for (const character of String(value || "").toUpperCase()) {
    const code = character.charCodeAt(0) - 64;
    if (code < 1 || code > 26) return -1;
    result = result * 26 + code;
  }
  return result - 1;
}

function nextValue(marks, type) {
  if (type === "number") {
    const values = marks
      .filter((mark) => mark.type === type)
      .map((mark) => Number.parseInt(mark.value, 10))
      .filter(Number.isFinite);
    return String((values.length ? Math.max(...values) : 0) + 1);
  }
  if (type === "letter") {
    const values = marks
      .filter((mark) => mark.type === type)
      .map((mark) => indexForLetter(mark.value))
      .filter((value) => value >= 0);
    return letterForIndex((values.length ? Math.max(...values) : -1) + 1);
  }
  return "";
}

export function normalizeMarks(marks) {
  return Array.isArray(marks)
    ? marks
        .filter(
          (mark) =>
            Number.isInteger(mark?.x) &&
            Number.isInteger(mark?.y) &&
            ["number", "letter", "triangle", "circle"].includes(mark?.type),
        )
        .map((mark) => ({
          x: mark.x,
          y: mark.y,
          type: mark.type,
          value: String(mark.value || ""),
        }))
    : [];
}

export function toggleBoardMark(marks, point, type) {
  const normalized = normalizeMarks(marks);
  const existingIndex = normalized.findIndex(
    (mark) => mark.x === point.x && mark.y === point.y,
  );
  if (existingIndex >= 0 && normalized[existingIndex].type === type) {
    normalized.splice(existingIndex, 1);
    return normalized;
  }
  if (existingIndex >= 0) normalized.splice(existingIndex, 1);
  normalized.push({
    ...point,
    type,
    value: nextValue(normalized, type),
  });
  return normalized;
}
