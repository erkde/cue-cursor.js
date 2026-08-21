export const normalizeWord = (word) => word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

function editDistanceAtMost1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    if ((edits += 1) > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }

  return edits + (a.length - i) + (b.length - j) <= 1;
}

function similarity(a, b) {
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4) {
    if (editDistanceAtMost1(a, b)) return 0.8;
    if (a.startsWith(b) || b.startsWith(a)) return 0.7;
  }
  return 0;
}

const MATCH = 2;
const GAP = -0.7;
const MISMATCH = -1;
const BACK_TOLERANCE = 8;

export class Matcher {
  constructor(tokens) {
    this.tokens = tokens;
    this.cursor = 0;
  }

  seek(position) {
    if (!this.tokens.length) return null;
    this.cursor = Math.max(0, Math.min(this.tokens.length - 1, Math.round(position)));
    return this.cursor;
  }

  feed(text) {
    const result = this.feedWithResult(text);
    return result.outcome === 'unmatched' ? null : result.position;
  }

  feedWithResult(text) {
    const previousPosition = this.cursor;
    const spoken = text.split(/\s+/).map(normalizeWord).filter(Boolean).slice(-14);
    if (spoken.length < 2) {
      return {
        previousPosition,
        candidatePosition: null,
        position: previousPosition,
        outcome: 'unmatched',
      };
    }

    const lo = Math.max(0, this.cursor - 25);
    const hi = Math.min(this.tokens.length, this.cursor + 90);
    const window = this.tokens.slice(lo, hi);
    if (!window.length) {
      return {
        previousPosition,
        candidatePosition: null,
        position: previousPosition,
        outcome: 'unmatched',
      };
    }

    const rowCount = spoken.length;
    const columnCount = window.length;
    let previous = new Float32Array(columnCount + 1);
    let current = new Float32Array(columnCount + 1);
    let finalCandidate = null;
    let prefixCandidate = null;

    for (let row = 1; row <= rowCount; row += 1) {
      current[0] = 0;
      let rowBest = 0;
      let rowBestColumn = -1;

      for (let column = 1; column <= columnCount; column += 1) {
        const score = similarity(spoken[row - 1], window[column - 1]);
        const diagonal = previous[column - 1] + (score > 0 ? MATCH * score : MISMATCH);
        current[column] = Math.max(0, diagonal, previous[column] + GAP, current[column - 1] + GAP);
        if (current[column] > rowBest) {
          rowBest = current[column];
          rowBestColumn = column;
        }
      }

      if (row === rowCount - 1) {
        prefixCandidate = { score: rowBest, column: rowBestColumn, words: row };
      }
      if (row === rowCount) {
        finalCandidate = { score: rowBest, column: rowBestColumn, words: row };
      }
      [previous, current] = [current, previous];
    }

    const confident = (candidate) =>
      candidate?.words >= 2 &&
      candidate.column >= 0 &&
      candidate.score >= Math.min(5, 1.6 * candidate.words);
    const candidate = confident(finalCandidate)
      ? finalCandidate
      : confident(prefixCandidate)
        ? prefixCandidate
        : null;
    if (!candidate) {
      return {
        previousPosition,
        candidatePosition: null,
        position: previousPosition,
        outcome: 'unmatched',
      };
    }

    const candidatePosition = lo + candidate.column - 1;
    if (
      candidatePosition < previousPosition &&
      previousPosition - candidatePosition <= BACK_TOLERANCE
    ) {
      return {
        previousPosition,
        candidatePosition,
        position: previousPosition,
        outcome: 'held',
      };
    }
    this.cursor = candidatePosition;
    return {
      previousPosition,
      candidatePosition,
      position: candidatePosition,
      outcome: candidatePosition === previousPosition ? 'stationary' : 'moved',
    };
  }
}
