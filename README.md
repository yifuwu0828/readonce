# ReadOnce

**Spot the repeat. Keep the change.** Compare two short sets of English notes with a local open-weight sentence model, without deleting or rewriting any current note.

This is a new application started on **21 October 2026**. [Try the public demo](https://yifuwu0828.github.io/readonce/), open the [actual-model checks page](https://yifuwu0828.github.io/readonce/validation.html), or inspect the [public source](https://github.com/yifuwu0828/readonce). There is no customer, award or income. The application, comparison logic, fixtures and writing are new; only licensed general-purpose model/runtime files are reused.

## Run locally

From this directory, use an existing Python 3 installation:

```sh
python -m http.server 8773 --bind 127.0.0.1
```

Open `http://127.0.0.1:8773/`. No package installation, account, API key or paid service is required. Use a modern browser with WebAssembly and import-map support. `file://` is not supported. All required model and runtime files are included; the first load can still read roughly 37 MB from this server. That is not an offline-install claim.

1. Load the synthetic example, or paste one short note per line into each box.
2. Choose **Compare with local AI**. The pinned MiniLM model embeds each note in the browser using CPU WASM. Choose **Exact-text baseline** to compare without embeddings.
3. Read the current and earlier quotes. A possible repeat is a suggestion to inspect, not permission to skip a factual check.
4. Download the full audit JSON. It includes every current original, reference, cosine, reason, configuration and run timing.

## How a match is decided

- Exact matches fold whitespace and case only. No punctuation or numbers are stripped.
- For other notes, choose the highest cosine against earlier notes. Require cosine **≥ 0.82** and a best-versus-runner-up gap **≥ 0.06**; tied matches remain reviewable.
- Compare lexical facts: quantities, recognized dates/weekdays, negation, a fixed status-word list and uppercase identifiers. A difference prevents a semantic-repeat label.
- Reserve each earlier note at most once, in current-note order. A reused reference stays visible for audit but is not assigned again. This greedy approach is deliberately simple; it is not global optimal alignment.
- Keep every current note in its original order. No summary, deletion, renaming, text rewrite or automatic approval follows a match.

Model: `Xenova/all-MiniLM-L6-v2`, q8, 384 dimensions, revision `751bff37182d3f1213fa05d7196b954e230abad9`; Transformers.js 3.8.1 and ONNX Runtime Web CPU WASM. Mean pooling, normalized embeddings, one note per inference call, at most 256 tokens per note. The UI shows real model-wait/load and inference timing separately.

## Actual verification — including the miss

Run engine checks with the existing Node.js runtime:

```sh
node --test tests/core.test.mjs
```

**14 tests passed** in the recorded host run. They cover input limits, original quotes, changed amounts/negation/status/dates/identifiers, ambiguity, match reuse, empty inputs, extreme finite values and invalid vectors. The model is not mocked as proof of its real behavior; these tests isolate engine rules using explicit vectors.

Open `/validation.html` and choose **Run actual model checks** for real inference. The fixtures and threshold were written before the first inference run. Final recorded results:

| Synthetic split | Actual local model + guards | Exact-only baseline |
| --- | --- | --- |
| Calibration, 4 cases | 4/4 matched authored expectations | 0/4 |
| Held out, 12 cases | 12/12 matched authored expectations | 10/12 |
| Adversarial role swap, 1 case | **0/1** | 1/1 |

The 12 held-out cases contain 13 current notes because one probes repeated reuse. These are small authored fixtures, not a representative accuracy estimate, a user study or measured human time savings.

The adversarial example is important: “Alice reviews the report written by Bob” and “Bob reviews the report written by Alice” receive a cosine of about **0.979** and an incorrect possible-repeat suggestion. Their relationship changed; the current guards do not understand that. Both originals are retained. Do not use this tool for financial, legal, safety or approval decisions.

An initial batched run is retained in `evidence/initial-batched-model-run.json` (calibration 3/4, held-out 12/12, adversarial 0/1). Scores differed between that batch and the app's smaller batch. The final implementation encodes one note at a time for consistent pair scores across these contexts; thresholds and fixture labels were not tuned. `evidence/model-run.json` is the final actual run. Its calibration pairs match their scores in `evidence/demo-audit.json` where the same notes appear. Timings are single local runs with retained assets, not download, mobile-device or cold-start benchmarks.

Other checked behavior: the empty current box returns a visible error; an HTML/script-shaped synthetic note is rendered as plain text with no inserted image/script element; the actual downloaded audit retained all three input notes exactly. Desktop and 390 CSS-pixel iframe layouts were visually inspected, including sample and baseline interaction. This is not a physical mobile-device test.

## Privacy and limitations

The application has no upload endpoint, analytics, note history or persistent note storage. Model access is restricted to local assets and the page CSP limits connections to its own origin. This was checked by reviewing code/configuration and the actual local HTTP requests, not by an independent packet capture. A hosted copy still relies on its host, browser and installed extensions; use non-sensitive inputs.

English is the supported prototype language. Unknown names, reordered roles, causality, units written out in words, subtle modality, sentence structure, unrecognized identifiers and text beyond the model's token limit can fool it. Lexical guards can also reject harmless paraphrases. Matching is greedy, and changing earlier-note order can matter. No automatic hiding is implemented.

## Files and licenses

`core.mjs` is the pure comparison engine; `model.mjs` loads and runs the real model; `app.mjs` renders original text safely; `validation.mjs` runs frozen synthetic cases. `tests/mobile.html` is a development viewport harness. Evidence contains only synthetic examples and local verification output.

Original application code is MIT licensed. Model/runtime dependencies retain their own licenses and attribution. See [THIRD_PARTY.md](THIRD_PARTY.md) and [third-party-assets.json](third-party-assets.json) for source URLs, immutable revision, hashes and notices. No private conversation, credential, wallet material or user document is part of this project.
