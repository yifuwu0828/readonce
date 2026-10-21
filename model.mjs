import { env, pipeline } from './vendor/transformers.web.js';

export const MODEL = Object.freeze({
  id: 'Xenova/all-MiniLM-L6-v2',
  revision: '751bff37182d3f1213fa05d7196b954e230abad9',
  dtype: 'q8', dimensions: 384, runtime: 'Transformers.js 3.8.1',
});
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL('./models/', import.meta.url).pathname;
env.backends.onnx.wasm.wasmPaths = new URL('./vendor/onnx/', import.meta.url).href;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
let extractorPromise;
let loaded = false;

export async function embedNotes(notes, progress = () => {}) {
  if (!notes.length) return { vectors: [], loadMs: 0, inferenceMs: 0, alreadyLoaded: loaded };
  const alreadyLoaded = loaded;
  const start = performance.now();
  if (!extractorPromise) {
    progress('Loading the local model and CPU runtime…');
    extractorPromise = pipeline('feature-extraction', MODEL.id, { dtype: 'q8', device: 'wasm' });
  }
  let extractor;
  try { extractor = await extractorPromise; }
  catch (error) { extractorPromise = undefined; throw error; }
  loaded = true;
  const loadMs = performance.now() - start;
  progress(`Embedding ${notes.length} notes locally…`);
  const inferenceStart = performance.now();
  // q8 dynamic quantization can change a score when unrelated notes change
  // the batch. Encode one note at a time so the same pair is reproducible.
  const vectors = [];
  for (const [index, note] of notes.entries()) {
    progress(`Embedding note ${index + 1} of ${notes.length} locally…`);
    const output = await extractor([note], { pooling: 'mean', normalize: true, truncation: true, max_length: 256 });
    vectors.push(output.tolist()[0]);
  }
  if (vectors.length !== notes.length || vectors.some(row => row.length !== MODEL.dimensions)) {
    throw new Error('The model returned unexpected dimensions; no comparison was produced.');
  }
  return { vectors, loadMs, inferenceMs: performance.now() - inferenceStart, alreadyLoaded };
}
