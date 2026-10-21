import { parseNotes, analyzeNotes } from './core.mjs';
import { embedNotes, MODEL } from './model.mjs';

const $ = id => document.getElementById(id);
const labels = { exact_repeat: 'Exact repeat', semantic_repeat_candidate: 'Possible repeat', protected_change: 'Detail changed', needs_review: 'Read this note' };
const example = {
  before: 'Use the shared checklist when reviewing the drawing package.\nBudget for the sample is 50 USD.\nDo not publish the draft report.\nPut the long reference links in a separate appendix.',
  after: 'Review the drawing package using the shared checklist.\nBudget for the sample is 75 USD.\nPublish the draft report.\nMove lengthy reference URLs into their own appendix.\nAsk the coordinator which source version should be used.',
};
let audit;
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function counts() { for (const side of ['before', 'after']) { try { $(side + '-count').textContent = `${parseNotes($(side).value).length} notes`; } catch { $(side + '-count').textContent = 'Input exceeds a limit'; } } }
for (const side of ['before', 'after']) $(side).addEventListener('input', () => { audit = undefined; $('output').hidden = true; counts(); });
$('sample').addEventListener('click', () => { for (const side of ['before', 'after']) $(side).value = example[side]; audit = undefined; $('output').hidden = true; counts(); status('Synthetic example loaded. Compare to see both repeats and changed details.'); });
$('clear').addEventListener('click', () => { $('before').value = ''; $('after').value = ''; $('output').hidden = true; audit = undefined; counts(); status('Cleared. No note history is stored by this application.'); $('before').focus(); });

function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function render(record) {
  const { results, stats } = record.analysis;
  $('stats').replaceChildren(...[['exactRepeat', 'Exact repeats'], ['semanticRepeat', 'Possible repeats'], ['protectedChange', 'Detail changes'], ['needsReview', 'Other notes to read']].map(([key, title]) => { const box = element('div', 'stat'); box.append(element('strong', '', stats[key]), element('span', '', title)); return box; }));
  $('timing').textContent = record.mode === 'local_embeddings' ? `${stats.total} / ${stats.total} current notes retained · model wait/load ${(record.timing.loadMs / 1000).toFixed(2)} s${record.timing.alreadyLoaded ? ' (already in memory)' : ''} · inference ${(record.timing.inferenceMs / 1000).toFixed(2)} s · ${MODEL.dimensions} dimensions · CPU WASM. This is one local run, not a download or device benchmark.` : `${stats.total} / ${stats.total} current notes retained · exact-text baseline; no embeddings used.`;
  $('results').replaceChildren(...results.map(row => {
    const card = element('article', `results-card ${row.status}`);
    const top = element('div', 'result-top'); top.append(element('span', 'badge', labels[row.status]), element('span', '', row.score === null ? `Current ${row.afterIndex + 1}` : `Current ${row.afterIndex + 1} · cosine ${row.score.toFixed(3)}`));
    const quotes = element('div', 'quote-grid');
    for (const [name, text] of [[`CURRENT · ${row.afterIndex + 1}`, row.afterText], [row.beforeIndex === null ? 'EARLIER · NO MATCH' : `EARLIER REFERENCE · ${row.beforeIndex + 1}`, row.beforeText ?? 'No earlier note was matched.']]) { const box = element('div'); box.append(element('p', 'quote-label', name), element('p', 'quote', text)); quotes.append(box); }
    card.append(top, quotes, element('p', 'reason', row.reason));
    if (row.protectedChanges.length) card.append(element('pre', 'changed', row.protectedChanges.map(change => `${change.type}: ${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`).join('\n')));
    return card;
  }));
  $('output').hidden = false;
}
async function compare(useModel) {
  audit = undefined; $('output').hidden = true;
  try {
    const before = parseNotes($('before').value), after = parseNotes($('after').value);
    if (!after.length) throw new Error('Add at least one current note. Nothing has been compared.');
    const controls = ['compare', 'exact', 'sample', 'clear', 'before', 'after']; controls.forEach(id => $(id).disabled = true);
    try {
      let timing = null, analysis;
      if (useModel && before.length) {
        const result = await embedNotes([...before, ...after], status);
        timing = { loadMs: result.loadMs, inferenceMs: result.inferenceMs, alreadyLoaded: result.alreadyLoaded };
        analysis = analyzeNotes({ before, after, beforeVectors: result.vectors.slice(0, before.length), afterVectors: result.vectors.slice(before.length) });
      } else analysis = analyzeNotes({ before, after });
      audit = { schema: 'readonce.audit.v1', createdAt: new Date().toISOString(), mode: timing ? 'local_embeddings' : 'exact_text', model: timing ? MODEL : null, timing, input: { before, after }, analysis, limitations: ['Candidates are not proof of equivalence.', 'All current notes are retained.', 'Lexical guards are incomplete.', 'English prototype; model context at most 256 tokens per note.', 'Synthetic tests do not establish human time savings.'] };
      render(audit); status(`Done. ${after.length} current notes kept; review the original quotations below.`);
    } finally { controls.forEach(id => $(id).disabled = false); }
  } catch (error) { status(error.message || String(error), true); }
}
$('compare').addEventListener('click', () => compare(true));
$('exact').addEventListener('click', () => compare(false));
$('download').addEventListener('click', () => {
  if (!audit) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(audit, null, 2) + '\n'], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'readonce-audit.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
counts();
