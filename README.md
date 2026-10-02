Grid Scanner By ArupD v5.43

Logic:
- RunSheet ID comes ONLY from a barcode/QR decode. It is never taken from OCR/date/time text.
- Sort Code comes from the bold 4-character mixed code on the label, validated against GridMaster.
- Type 1 has no left/right positional rule.
- Type 2 uses the same GridMaster validation, so unrelated KRV/BOM/REV text is rejected unless it exists in GridMaster.
- Every scan clears the previous result before processing.
- OCR and GridMaster warm in the background after page load.
- Label processing has a hard ~4.8 second recognition budget.
