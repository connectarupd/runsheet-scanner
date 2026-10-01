# Grid Scanner By ArupD v5.2

Android Grid Camera fix.

This version avoids opening two camera streams at the same time. It requests camera permission once, selects the rear camera when available, and then lets ZXing own the camera stream for barcode scanning.

GitHub Pages should be served over HTTPS.


Version 5.3: Grid Camera rewritten to open the video stream directly and decode the existing video element, avoiding Android deviceId/double-camera conflicts.


## v5.5 speed update
- OCR worker is initialized in the background so repeat label scans start faster.
- First-time GridMaster lookup no longer waits for the full-table preload; it uses a direct lookup immediately.


### v5.5 speed update
- Fast OCR first pass on a reduced upper label region.
- Full-image OCR is used only when Sort Code is not found.
- Removed rotateAuto from the normal path.


Version 5.6: Android camera handoff fix. The Putting workflow keeps the label camera stream alive after capture and reuses the same stream for the Grid barcode scan, avoiding the getUserMedia release/reopen race.


Version 5.7: Grid scanning reuses the exact existing label-camera video stream; native BarcodeDetector is preferred so the grid scanner never opens a second camera stream.
