# Third-party notices

ReadOnce is a new application begun on 21 October 2026. Its comparison engine, UI, fixtures and writing are new. Only general-purpose licensed dependencies are reused from an existing local distribution; no earlier competition application's logic or interface is copied.

- **Hugging Face Transformers.js 3.8.1** — Apache-2.0. Full license: `vendor/LICENSE`. Official repository: https://github.com/huggingface/transformers.js
- **Xenova/all-MiniLM-L6-v2** — Apache-2.0 according to the retained model card at `models/Xenova/all-MiniLM-L6-v2/README.md`. ONNX export of `sentence-transformers/all-MiniLM-L6-v2`. Pinned revision `751bff37182d3f1213fa05d7196b954e230abad9`. Apache-2.0 text is also retained at `vendor/LICENSE`. Model card: https://huggingface.co/Xenova/all-MiniLM-L6-v2
- **Microsoft ONNX Runtime Web 1.22.0-dev.20250409-89f8206ba4** — MIT, copyright Microsoft Corporation. Full license: `vendor/onnx/LICENSE`. Official repository: https://github.com/microsoft/onnxruntime

Original asset URLs, sizes and SHA-256 values are retained in `third-party-assets.json`. The q8 model weight is 22,972,370 bytes, SHA-256 `afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1`. These dependencies keep their own licenses; the application's MIT license does not relicense them.
