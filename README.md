# Grid Scanner By ArupD v5.2

Android Grid Camera fix.

This version avoids opening two camera streams at the same time. It requests camera permission once, selects the rear camera when available, and then lets ZXing own the camera stream for barcode scanning.

GitHub Pages should be served over HTTPS.


Version 5.3: Grid Camera rewritten to open the video stream directly and decode the existing video element, avoiding Android deviceId/double-camera conflicts.


## v5.4 speed update
- OCR worker is initialized in the background so repeat label scans start faster.
- First-time GridMaster lookup no longer waits for the full-table preload; it uses a direct lookup immediately.
