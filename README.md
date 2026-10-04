# Grid Scanner By ArupD — v5.74

This build changes the label scan path to use the **RunSheet barcode/QR location** to find the physical label first. Sort Code OCR is then performed only on the label-local area.

## Exact rules
- Type 1: RunSheet = linear barcode value first; if unreadable, use the printed 9–10 digit number below that barcode. Sort Code = the only large/bold 4-character alphanumeric text on the label.
- Type 2: RunSheet = QR value first; if unreadable, use the printed `DHRXSF...` value. Sort Code = the 4-character text directly below `KRV DC FMRTS` and above `REV`.
- Date/time and numeric-only values such as `1300` can never become Sort Code.
- OCR confusion correction (for example `TYP N`/`TYP1`) is only accepted when it matches an actual GridMaster code.
- Grid No comes only from `GridMaster` in Google Sheets.
- Processing budget is capped below 5 seconds (OCR engine loading is warmed in the background).

## Upload
Upload these files together and remove older `app-fast-v5-*.js` files except `app-fast-v5-7-base.js`:
- index.html
- app-fast-v5-73.js
- app-fast-v5-7-base.js
- shadowfax-logo.jpg
- apps_script.gs

Do not rename the current JS. The header must show **Fast Grid v5.74**.


v5.74 fix: Sort Code OCR is anchored to the detected RunSheet barcode/QR location. Type 1 reads only the label-local right/side code zone; Type 2 reads only the band above the QR between KRV_DC_FMRTS and REV. Grid No is resolved only from GridMaster with a bounded preload/direct lookup. Backend normalizes Sort Code whitespace/punctuation. Scan OCR remains bounded below 5 seconds; Grid No is never invented if GridMaster has no mapping.


v5.74 fix: Google Apps Script lookup now defines normalizeCode_, so action=lookup no longer fails. Client lookup also tries the exact Sort Code before OCR variants, and adds E/I OCR confusion handling for cases such as OMNE -> OMNI, but only accepts a variant when GridMaster contains the exact code.
