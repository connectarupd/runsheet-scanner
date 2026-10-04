Sort Grid Scanner by ArupD - QR Grid Scan Fix

Updated:
- Native camera detector explicitly enables QR Code and Data Matrix formats.
- When a decoded Grid value differs from expected Grid, the app immediately displays GRID MISMATCH and vibrates once per distinct wrong value.
- Scanner stays active after mismatch so the associate can scan the correct Grid.
- On exact match, scanner stops and records MATCH.

Install:
Upload/replace the files in this ZIP in the existing GitHub repository root.
Keep your existing style.css if present; this archive did not include a style.css file.
Keep index.html, app-fast-v5-7-base.js, app-fast-v5-73.js, shadowfax-logo.jpg and apps_script.gs together.
The Apps Script URL in this package is the URL supplied in this chat.

Note:
This fixes QR format support and mismatch feedback in the frontend. Test on the actual phone and ensure the QR encodes the expected grid text (for example, C2).
