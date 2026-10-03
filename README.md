Grid Scanner By ArupD — v5.52

FIXES
- Removes the v5.50/v5.51 resolveSort runtime dependency from the scan path.
- Uses an inline resolver in runScan, so the label flow cannot fail with “resolveSort is not defined”.
- Keeps Type-1 TG1K and Type-2 MSA1 focused OCR templates.
- Keeps native + ZXing RunSheet barcode/QR fallback.
- Saves Sorting records to local history and Google Apps Script using text/plain POST; sendBeacon is a fallback if fetch fails.
- Hard label-processing budget remains about 4.8 seconds after OCR is warmed.

UPLOAD
Delete/replace the old app/index files. The repository should contain only this app version plus the logo/base file.
After deployment, the header MUST say: Sorting & Putting • Fast Grid v5.52
If it says v5.50 or v5.51, the new index has not been deployed.
