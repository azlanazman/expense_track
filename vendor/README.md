# vendor/

Third-party browser libraries, served from this repo instead of a CDN. This removes a runtime dependency on third-party hosts and lets the Content-Security-Policy in `index.html` stay limited to `'self'` for scripts that are not Firebase.

| File | Library | Version | Used by | Licence |
|---|---|---|---|---|
| `xlsx-0.18.5.full.min.js` | SheetJS (xlsx) | 0.18.5 | `js/log.js`, `js/export.js` | Apache-2.0 (`LICENSE-xlsx-Apache-2.0.txt`) |

Source: the files are the unmodified `dist/` builds from the npm package `xlsx@0.18.5` (the same build the CDN served). Chart.js and the treemap plugin were removed in the Analysis redesign (Analysis now draws its own plain HTML charts).

SHA-256 (to detect accidental edits):

```
c9506197caf809a075b6dee1da0d36fb19da7158ffe8a88e7b0c96c5d8623c99  xlsx-0.18.5.full.min.js
```

Check with `shasum -a 256 vendor/*.js`.

## Upgrading
Fetch the new version with `npm pack <package>@<version>`, copy the file from `package/dist/` into this folder with the version in its name, update the URL in the loader (`js/log.js`, `js/export.js`), update the table and checksums above, and test the exports on localhost.

## Notes
- SheetJS 0.18.5 is the last version published to npm. It has known issues when it *parses* untrusted spreadsheet files. This app only *writes* `.xlsx` files from its own data and never reads uploads, so those issues do not apply. Do not add a feature that imports spreadsheets without moving to a newer build first.
