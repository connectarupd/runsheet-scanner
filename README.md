# Grid Scanner v5.60

Critical fix: v5.59 had a JavaScript runtime error in spatial Sort Code selection (`anchor` was undefined). That error caused Sort Code OCR to return blank every time even when OCR saw the label.

Rules:
- Type 1: large/bold 4-character alphanumeric code is Sort Code.
- Type 2: 4-character code directly below `KRV DC FMRTS` and above `REV` is Sort Code.
- RunSheet: barcode/QR first; fallback rules remain unchanged.
- Grid No comes only from GridMaster.
- Processing target remains fast; first-time OCR model loading may take longer.

Upload together: index.html, app-fast-v5-60.js, app-fast-v5-7-base.js, shadowfax-logo.jpg, apps_script.gs.
Do not keep old v5.59/v5.58 app JS files referenced by index.html.
