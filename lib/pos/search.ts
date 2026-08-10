function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? Number.POSITIVE_INFINITY;
}

function isSubsequence(needle: string, value: string) {
  let index = 0;
  for (const character of value) {
    if (character === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}

function tokenScore(token: string, words: string[], normalizedText: string) {
  if (normalizedText.includes(token)) return 0;
  if (token.length < 3) return null;

  let best = Number.POSITIVE_INFINITY;
  for (const word of words) {
    const threshold = token.length >= 7 ? 2 : 1;
    const distance = editDistance(token, word);
    if (distance <= threshold) best = Math.min(best, distance);
    if (
      token.length >= 4 &&
      Math.abs(word.length - token.length) <= 2 &&
      isSubsequence(token, word)
    ) {
      best = Math.min(best, 2);
    }
  }

  return Number.isFinite(best) ? best : null;
}

/** Returns a lower-is-better relevance score, or null when the query does not match. */
export function fuzzySearchScore(query: string, values: ReadonlyArray<unknown>) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;

  const normalizedText = normalize(
    values.filter((value) => value !== null && value !== undefined).join(" "),
  );
  const words = normalizedText.split(" ").filter(Boolean);
  let score = 0;

  for (const token of normalizedQuery.split(" ")) {
    const matchScore = tokenScore(token, words, normalizedText);
    if (matchScore === null) return null;
    score += matchScore;
  }

  return score;
}

export function fuzzySearchMatches(query: string, values: ReadonlyArray<unknown>) {
  return fuzzySearchScore(query, values) !== null;
}
