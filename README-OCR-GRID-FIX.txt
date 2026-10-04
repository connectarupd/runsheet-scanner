Grid Scanner By ArupD v5.75 - OCR validation update

Includes the previous QR mismatch build, longer bounded label processing, fail-closed Sort Code resolution, and rejection of ambiguous OCR-to-GridMaster matches. A Sort Code is confirmed only when it resolves uniquely against GridMaster.

Upload ZIP contents to the existing GitHub Pages repository root, replacing old files. Keep the existing Apps Script deployment and BACKEND_URL configuration unless your backend URL changed. After commit, hard-refresh or clear browser cache.

OCR cannot guarantee recognition of blurry/oblique labels. If a code cannot be uniquely validated, this build refuses success rather than accepting a guessed code.
