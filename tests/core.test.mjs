import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNotes, protectedFacts, analyzeNotes } from '../core.mjs';

const compare = (before, after, extra = {}) => analyzeNotes({
  before: [before], after: [after], beforeVectors: [[1, 0]], afterVectors: [[1, 0]], ...extra,
});

test('parsing retains original quotes and ignores only blank records', () => {
  assert.deepEqual(parseNotes('  <img src=x onerror=bad()>  \r\n\r\nNO rewrite.\n'), ['  <img src=x onerror=bad()>  ', 'NO rewrite.']);
  assert.deepEqual(parseNotes(' \n\t'), []);
});

test('input limits throw instead of silently truncating', () => {
  assert.equal(parseNotes(Array.from({ length: 50 }, (_, i) => `Note ${i}`).join('\n')).length, 50);
  assert.throws(() => parseNotes(Array(51).fill('note').join('\n')), /50/);
  assert.throws(() => parseNotes('x'.repeat(501)), /500/);
  assert.throws(() => parseNotes('x'.repeat(16001)), /16000/);
  assert.throws(() => analyzeNotes({ before: [], after: ['one\ntwo'] }), /one nonblank line/);
});

test('exact matching folds whitespace and case, but never punctuation', () => {
  const exact = analyzeNotes({ before: ['  READY:   same note. '], after: ['ready: same note.'] });
  assert.equal(exact.results[0].status, 'exact_repeat');
  assert.equal(exact.results[0].score, null);
  assert.equal(analyzeNotes({ before: ['same note.'], after: ['same note!'] }).results[0].status, 'needs_review');
});

test('changed amounts survive even identical embedding vectors', () => {
  const result = compare('Budget is 10 USD.', 'Budget is 11 USD.');
  assert.equal(result.results[0].status, 'protected_change');
  assert.ok(result.results[0].protectedChanges.some(change => change.type === 'numbers'));
  assert.equal(result.stats.protectedChange, 1);
  assert.equal(result.stats.semanticRepeat, 0);
});

test('negation, status, date and uppercase identifier changes survive high similarity', () => {
  const cases = [
    ['The draft was approved.', 'The draft was not approved.', 'negations'],
    ['The report is pending.', 'The report is approved.', 'statuses'],
    ['Ship on October 25, 2026.', 'Ship on October 26, 2026.', 'dates'],
    ['Review on Monday.', 'Review on Tuesday.', 'dates'],
    ['Use REQ_ALPHA for the handoff.', 'Use REQ_BETA for the handoff.', 'identifiers'],
  ];
  for (const [before, after, type] of cases) {
    const result = compare(before, after).results[0];
    assert.equal(result.status, 'protected_change', type);
    assert.ok(result.protectedChanges.some(change => change.type === type), type);
    assert.equal(result.afterText, after);
  }
});

test('protected facts retain multiplicity and contractions', () => {
  assert.deepEqual(protectedFacts('10 then 10').numbers, ['10', '10']);
  assert.ok(protectedFacts("It doesn't run; it cannot run without approval.").negations.includes("doesn't"));
  assert.notDeepEqual(protectedFacts('10 then 10').numbers, protectedFacts('10').numbers);
});

test('a high separated paraphrase can be a candidate without claiming certainty', () => {
  const result = analyzeNotes({
    before: ['The team reviewed the launch checklist.', 'A bird landed on a fence.'],
    after: ['The launch checklist was reviewed by the team.'],
    beforeVectors: [[1, 0], [0, 1]], afterVectors: [[1, 0]],
  });
  assert.equal(result.results[0].status, 'semantic_repeat_candidate');
  assert.match(result.results[0].reason, /not proof/);
  assert.equal(result.stats.semanticRepeat, 1);
});

test('close runner-up scores and low scores remain reviewable', () => {
  const ambiguous = analyzeNotes({ before: ['First earlier note.', 'Another earlier note.'], after: ['A current note.'], beforeVectors: [[1, 0], [1, 0]], afterVectors: [[1, 0]] });
  assert.equal(ambiguous.results[0].status, 'needs_review');
  assert.match(ambiguous.results[0].reason, /ambiguous/);
  const tiedWithoutMargin = analyzeNotes({ before: ['First earlier note.', 'Another earlier note.'], after: ['A current note.'], beforeVectors: [[1, 0], [1, 0]], afterVectors: [[1, 0]], margin: 0 });
  assert.equal(tiedWithoutMargin.results[0].status, 'needs_review');
  assert.equal(compare('A red item.', 'A blue item.', { afterVectors: [[0, 1]] }).results[0].status, 'needs_review');
});

test('a prior note is reserved once, with no fallback match invented', () => {
  const result = analyzeNotes({ before: ['An earlier description.'], after: ['A first paraphrase.', 'A second paraphrase.'], beforeVectors: [[1, 0]], afterVectors: [[1, 0], [1, 0]] });
  assert.deepEqual(result.results.map(row => row.status), ['semantic_repeat_candidate', 'needs_review']);
  assert.match(result.results[1].reason, /already reserved/);
  assert.equal(result.stats.semanticRepeat, 1);
  const exact = analyzeNotes({ before: ['same'], after: ['same', 'SAME'] });
  assert.deepEqual(exact.results.map(row => row.status), ['exact_repeat', 'needs_review']);
});

test('every current original appears once, in order, including untrusted markup', () => {
  const after = ['  <script>alert("sample")</script>  ', 'Second original: 10 USD.', 'THIRD.'];
  const result = analyzeNotes({ before: ['Nothing relevant.'], after });
  assert.deepEqual(result.results.map(row => row.afterText), after);
  assert.deepEqual(result.results.map(row => row.afterIndex), [0, 1, 2]);
  assert.equal(result.stats.total, after.length);
  assert.equal(result.stats.needsReview, 3);
});

test('non-finite, zero, missing, inconsistent and wrong-count vectors throw', () => {
  for (const row of [[NaN, 0], [Infinity, 1], [0, 0], [], ['1', 0]]) {
    assert.throws(() => compare('same', 'same', { afterVectors: [row] }));
  }
  assert.throws(() => compare('before', 'after', { afterVectors: [[1]] }), /dimension/);
  assert.throws(() => compare('before', 'after', { afterVectors: [] }), /counts/);
  assert.throws(() => compare('before', 'after', { afterVectors: undefined }), /both vector sets/);
  assert.throws(() => analyzeNotes({ before: ['one', 'two'], after: [], beforeVectors: [[1, 0], [1, 0, 0]], afterVectors: [] }), /dimension/);
});

test('finite extreme-scale vectors produce real finite cosine scores', () => {
  for (const magnitude of [1e308, 1e-300]) {
    const result = compare('A prior description.', 'A different description.', { beforeVectors: [new Float64Array([magnitude, magnitude])], afterVectors: [[magnitude, magnitude]] });
    assert.ok(Number.isFinite(result.results[0].score));
    assert.ok(Math.abs(result.results[0].score - 1) < 1e-12);
  }
});

test('empty input and no-prior input do not fabricate matches or scores', () => {
  assert.deepEqual(analyzeNotes().stats, { total: 0, exactRepeat: 0, semanticRepeat: 0, protectedChange: 0, needsReview: 0 });
  const result = analyzeNotes({ before: [], after: ['Keep this.'], beforeVectors: [], afterVectors: [[1, 0]] });
  assert.equal(result.results[0].beforeIndex, null);
  assert.equal(result.results[0].score, null);
  assert.equal(result.results[0].status, 'needs_review');
});

test('invalid configuration fails visibly', () => {
  assert.throws(() => analyzeNotes({ threshold: NaN }), /threshold/);
  assert.throws(() => analyzeNotes({ margin: -1 }), /margin/);
});
