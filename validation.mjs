import { fixtures } from './fixtures.mjs';
import { analyzeNotes } from './core.mjs';
import { embedNotes, MODEL } from './model.mjs';
const $ = id => document.getElementById(id);
const isRepeat = row => ['exact_repeat', 'semantic_repeat_candidate'].includes(row.status);
let record;
$('run').addEventListener('click', async () => {
  $('run').disabled = true; $('save').disabled = true;
  try {
    const texts = [...new Set(fixtures.flatMap(test => [...test.before, ...test.after]))];
    const start = new Date().toISOString();
    const modelRun = await embedNotes(texts, text => { $('status').textContent = text; });
    const lookup = new Map(texts.map((text, i) => [text, modelRun.vectors[i]]));
    const cases = fixtures.map(test => {
      const baseline = analyzeNotes(test);
      const actual = analyzeNotes({ ...test, beforeVectors: test.before.map(text => lookup.get(text)), afterVectors: test.after.map(text => lookup.get(text)) });
      return { ...test, baseline: baseline.results, actual: actual.results, passed: actual.results.every((row, i) => isRepeat(row) === (test.expected[i] === 'repeat')), baselinePassed: baseline.results.every((row, i) => isRepeat(row) === (test.expected[i] === 'repeat')) };
    });
    const totals = Object.fromEntries(['calibration', 'heldout', 'adversarial'].map(split => { const items = cases.filter(test => test.split === split); return [split, { cases: items.length, passed: items.filter(test => test.passed).length, baselinePassed: items.filter(test => test.baselinePassed).length, failedIds: items.filter(test => !test.passed).map(test => test.id) }]; }));
    record = { schema: 'readonce.model-evidence.v1', startedAt: start, completedAt: new Date().toISOString(), model: MODEL, settings: { threshold: 0.82, margin: 0.06, pooling: 'mean', normalize: true, maxTokens: 256, device: 'wasm', threads: 1, batchSize: 1 }, timing: { loadMs: modelRun.loadMs, inferenceMs: modelRun.inferenceMs, alreadyLoaded: modelRun.alreadyLoaded, uniqueNotes: texts.length }, totals, cases, caveats: ['Synthetic labels, not real-user accuracy or time savings.', 'All current originals remain visible even for wrong candidates.', 'Cosine is not a probability.', 'No threshold tuning after seeing these cases.', 'An initial batched run is retained separately; batch size changed to one after score differences were observed between app and validation contexts.'] };
    $('report').textContent = JSON.stringify(record, null, 2);
    $('summary').textContent = Object.entries(totals).map(([split, value]) => `${split}: ${value.passed}/${value.cases} matched expectations (exact baseline ${value.baselinePassed}/${value.cases})`).join(' · ');
    $('cases').replaceChildren(...cases.map(test => { const tr = document.createElement('tr'); for (const text of [test.id, test.expected.join(', '), test.actual.map(row => row.status).join(', '), test.actual.map(row => row.score?.toFixed(3) ?? '—').join(', '), test.passed ? 'Matched' : 'Miss — retained']) { const td = document.createElement('td'); td.textContent = text; tr.append(td); } tr.lastChild.className = test.passed ? 'pass' : 'fail'; return tr; }));
    $('table').hidden = false; $('save').disabled = false; $('status').textContent = 'Complete. All cases, including misses, are retained below.';
  } catch (error) { $('status').textContent = `Model checks failed: ${error.message || error}`; $('report').textContent = JSON.stringify({ error: String(error), at: new Date().toISOString() }, null, 2); }
  finally { $('run').disabled = false; }
});
$('save').addEventListener('click', () => { if (!record) return; const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2) + '\n'], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'readonce-model-evidence.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
