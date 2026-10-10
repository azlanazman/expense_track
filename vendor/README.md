# vendor/

Third-party browser libraries, served from this repo instead of a CDN. This removes a runtime dependency on third-party hosts and lets the Content-Security-Policy in `index.html` stay limited to `'self'` for scripts that are not Firebase.

| File | Library | Version | Used by | Licence |
|---|---|---|---|---|
| `xlsx-0.18.5.full.min.js` | SheetJS (xlsx) | 0.18.5 | `js/log.js`, `js/export.js` | Apache-2.0 (`LICENSE-xlsx-Apache-2.0.txt`) |
| `tesseract-7.0.0/` (7 files, about 7 MB) | Tesseract.js 7.0.0 + tesseract.js-core 6.1.2 + English data (`4.0.0_best_int`) | 7.0.0 / 6.1.2 | `js/ocr.js` (reads screenshots on the phone; loaded only when used) | Apache-2.0 (`LICENSE-tesseract.js.md`, `LICENSE-tesseract.js-core.txt`) |

Source: the files are the unmodified `dist/` builds from the npm package `xlsx@0.18.5` (the same build the CDN served). Chart.js and the treemap plugin were removed in the Analysis redesign (Analysis now draws its own plain HTML charts).

SHA-256 (to detect accidental edits):

```
c9506197caf809a075b6dee1da0d36fb19da7158ffe8a88e7b0c96c5d8623c99  xlsx-0.18.5.full.min.js
```

```
# vendor/tesseract-7.0.0/
45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91  eng.traineddata.gz
9d7c43fb206dc9f48475228b46bf35f888fa9e6259da2e67d5a75c77049f2dc7  tesseract-core-simd-lstm.wasm.js
64871d76c75609fd5413b88a8171e2ef40deedd77d5875ba23df104b2d05eb29  tesseract.esm.min.js
576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d  worker.min.js
```

Tesseract files come from npm `tesseract.js@7.0.0` (`dist/`), `tesseract.js-core@6.1.2` (only the SIMD + LSTM build; a phone without WebAssembly SIMD cannot use screenshot reading) and `@tesseract.js-data/eng@1.0.0` (`4.0.0_best_int`). They need no CSP change: the worker is loaded from this folder (`workerBlobURL: false`).

Check with `shasum -a 256 vendor/*.js vendor/tesseract-7.0.0/*`.

## Upgrading
Fetch the new version with `npm pack <package>@<version>`, copy the file from `package/dist/` into this folder with the version in its name, update the URL in the loader (`js/log.js`, `js/export.js`), update the table and checksums above, and test the exports on localhost.

## Notes
- SheetJS 0.18.5 is the last version published to npm. It has known issues when it *parses* untrusted spreadsheet files. This app only *writes* `.xlsx` files from its own data and never reads uploads, so those issues do not apply. Do not add a feature that imports spreadsheets without moving to a newer build first.
