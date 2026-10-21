const LIMITS = Object.freeze({ maxNotes: 50, maxLineLength: 500, maxInputLength: 16000 });
const FACT_TYPES = ['numbers', 'dates', 'negations', 'statuses', 'identifiers'];

// Exact matching deliberately does not remove punctuation, identifiers or numbers.
function normalizeExact(text) {
  return text.replace(/\s+/gu, ' ').trim().toLowerCase();
}

function checkText(text, label) {
  if (typeof text !== 'string') throw new TypeError(`${label} must be a string.`);
  if (text.length > LIMITS.maxInputLength) {
    throw new RangeError(`${label} exceeds ${LIMITS.maxInputLength} characters; nothing was truncated.`);
  }
}

export function parseNotes(text) {
  checkText(text, 'Input');
  const lines = text.split(/\r\n|\n|\r/u);
  if (lines.some(line => line.length > LIMITS.maxLineLength)) {
    throw new RangeError(`A line exceeds ${LIMITS.maxLineLength} characters; nothing was truncated.`);
  }
  const notes = lines.filter(line => line.trim().length > 0);
  if (notes.length > LIMITS.maxNotes) {
    throw new RangeError(`Input exceeds ${LIMITS.maxNotes} nonblank notes; nothing was truncated.`);
  }
  return notes;
}

function inputNotes(value, label) {
  if (typeof value === 'string') return parseNotes(value);
  if (!Array.isArray(value)) throw new TypeError(`${label} must be text or an array of note strings.`);
  if (value.length > LIMITS.maxNotes) throw new RangeError(`${label} exceeds ${LIMITS.maxNotes} notes.`);
  for (const note of value) {
    if (typeof note !== 'string') throw new TypeError(`${label} contains a non-string note.`);
    if (!note.trim() || /[\r\n]/u.test(note)) {
      throw new TypeError(`${label} array items must each be one nonblank line.`);
    }
    if (note.length > LIMITS.maxLineLength) throw new RangeError(`${label} contains an overlong line.`);
  }
  checkText(value.join('\n'), label);
  return value.slice();
}

function matches(text, pattern, transform = normalizeExact) {
  return Array.from(text.matchAll(pattern), match => transform(match[0])).sort();
}

// These are conservative lexical guards, not a parser or proof of equivalence.
// Multiplicity is retained: deleting one of two quantities remains a change.
export function protectedFacts(text) {
  if (typeof text !== 'string') throw new TypeError('A protected-fact input must be a string.');
  const months = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  const datePattern = new RegExp(`\\b(?:\\d{4}-\\d{1,2}-\\d{1,2}(?:[T ]\\d{1,2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:?\\d{2})?)?|\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?|${months}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\d{1,2}(?:st|nd|rd|th)?\\s+${months}\\.?(?:\\s+\\d{4})?)\\b`, 'giu');
  return {
    numbers: matches(text, /(?:[$€£¥]\s*)?[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s*%)?/gu,
      token => normalizeExact(token).replace(/,/gu, '').replace(/\s+/gu, '')),
    dates: matches(text, datePattern).concat(matches(text, /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/giu)).sort(),
    negations: matches(text, /\b(?:no|not|never|without|neither|nor|cannot|unless)\b|\b[a-z]+n['’]t\b/giu),
    statuses: matches(text, /\b(?:pending|submitted|accepted|approved|rejected|declined|failed|failure|success|succeeded|successful|paid|unpaid|complete|completed|incomplete|open|closed|enabled|disabled|active|inactive|paused|cancelled|canceled|scheduled|delayed|blocked|waiting|verified|unverified|passed|merged|expired|available|unavailable|funded|unfunded|shipped|delivered|ready|draft|ongoing)\b/giu),
    identifiers: matches(text, /\b(?:[A-Z]{2,}[A-Z0-9]*(?:[-_][A-Z0-9]+)*|[A-Z]+[-_]\d+[A-Z0-9_-]*)\b/gu),
  };
}

function factChanges(before, after) {
  return FACT_TYPES.filter(type => JSON.stringify(before[type]) !== JSON.stringify(after[type]))
    .map(type => ({ type, before: before[type], after: after[type] }));
}

function unitVector(row, label) {
  if (!(Array.isArray(row) || (ArrayBuffer.isView(row) && !(row instanceof DataView)))) {
    throw new TypeError(`${label} must be a numeric vector.`);
  }
  if (!row.length) throw new RangeError(`${label} is empty.`);
  let scale = 0;
  for (const number of row) {
    if (typeof number !== 'number' || !Number.isFinite(number)) {
      throw new TypeError(`${label} contains a non-finite or nonnumeric value.`);
    }
    scale = Math.max(scale, Math.abs(number));
  }
  if (scale === 0) throw new RangeError(`${label} is a zero vector.`);
  const scaled = Array.from(row, number => number / scale);
  const norm = Math.sqrt(scaled.reduce((sum, number) => sum + number * number, 0));
  return scaled.map(number => number / norm);
}

function validateVectors(beforeVectors, afterVectors, beforeCount, afterCount) {
  const noBefore = beforeVectors == null;
  const noAfter = afterVectors == null;
  if (noBefore && noAfter) return { before: null, after: null, dimension: null };
  if (noBefore || noAfter) throw new TypeError('Supply both vector sets, or omit both for exact-only matching.');
  if (!Array.isArray(beforeVectors) || !Array.isArray(afterVectors)) {
    throw new TypeError('Vector sets must be arrays.');
  }
  if (beforeVectors.length !== beforeCount || afterVectors.length !== afterCount) {
    throw new RangeError('Vector counts must match the parsed nonblank note counts.');
  }
  const before = beforeVectors.map((row, index) => unitVector(row, `beforeVectors[${index}]`));
  const after = afterVectors.map((row, index) => unitVector(row, `afterVectors[${index}]`));
  const dimension = before[0]?.length ?? after[0]?.length ?? null;
  if ([...before, ...after].some(row => row.length !== dimension)) {
    throw new RangeError('All vectors must have the same nonzero dimension.');
  }
  return { before, after, dimension };
}

function cosine(left, right) {
  const dot = left.reduce((sum, number, index) => sum + number * right[index], 0);
  return Math.max(-1, Math.min(1, dot));
}

export function analyzeNotes({ before = '', after = '', beforeVectors, afterVectors, threshold = 0.82, margin = 0.06 } = {}) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError('threshold must be a finite number between 0 and 1.');
  }
  if (!Number.isFinite(margin) || margin < 0 || margin > 2) {
    throw new RangeError('margin must be a finite number between 0 and 2.');
  }
  const prior = inputNotes(before, 'before');
  const current = inputNotes(after, 'after');
  // Validate even exact-repeat vectors: invalid supplied AI output must be visible.
  const vectors = validateVectors(beforeVectors, afterVectors, prior.length, current.length);
  const priorFacts = prior.map(protectedFacts);
  const normalizedPrior = prior.map(normalizeExact);
  const used = new Set();
  const stats = { total: current.length, exactRepeat: 0, semanticRepeat: 0, protectedChange: 0, needsReview: 0 };

  const results = current.map((afterText, afterIndex) => {
    const base = { afterIndex, afterText, beforeIndex: null, beforeText: null, score: null, status: 'needs_review', reason: '', protectedChanges: [] };
    const exactIndices = normalizedPrior.flatMap((text, index) => text === normalizeExact(afterText) ? [index] : []);
    if (exactIndices.length) {
      const available = exactIndices.find(index => !used.has(index));
      const index = available ?? exactIndices[0];
      const result = { ...base, beforeIndex: index, beforeText: prior[index], score: vectors.before ? cosine(vectors.before[index], vectors.after[afterIndex]) : null };
      if (available === undefined) {
        stats.needsReview++;
        return { ...result, reason: 'The exact prior note is already reserved by an earlier current note; no second match was assigned.' };
      }
      used.add(index);
      stats.exactRepeat++;
      return { ...result, status: 'exact_repeat', reason: 'Identical after folding whitespace and case only; no model score was required.' };
    }
    if (!prior.length || !vectors.before) {
      stats.needsReview++;
      return { ...base, reason: prior.length ? 'No embeddings supplied; this note is not an exact repeat.' : 'No prior notes are available for comparison.' };
    }
    const ranked = prior.map((_, index) => ({ index, score: cosine(vectors.before[index], vectors.after[afterIndex]) }))
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const best = ranked[0];
    const changes = factChanges(priorFacts[best.index], protectedFacts(afterText));
    const result = { ...base, beforeIndex: best.index, beforeText: prior[best.index], score: best.score, protectedChanges: changes };
    if (used.has(best.index)) {
      stats.needsReview++;
      return { ...result, reason: 'The best prior note is already reserved; it is shown as a reference, not assigned again.' };
    }
    if (best.score < threshold) {
      stats.needsReview++;
      return { ...result, reason: 'The best cosine score is below the configured threshold.' };
    }
    if (ranked.length > 1 && (best.score === ranked[1].score || best.score - ranked[1].score < margin)) {
      stats.needsReview++;
      return { ...result, reason: 'The best and runner-up scores are too close; the match is ambiguous.' };
    }
    if (changes.length) {
      stats.protectedChange++;
      return { ...result, status: 'protected_change', reason: 'Protected lexical facts differ; retain this current note for review despite its high score.' };
    }
    used.add(best.index);
    stats.semanticRepeat++;
    return { ...result, status: 'semantic_repeat_candidate', reason: 'High, separated similarity and equal protected lexical facts suggest a repeat; this is not proof of equivalence.' };
  });

  return { results, stats, config: { threshold, margin, ...LIMITS, vectorDimension: vectors.dimension, modelScoresAvailable: vectors.before !== null } };
}
