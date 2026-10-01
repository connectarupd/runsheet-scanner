// Grid Scanner By ArupD — v5.15 RunSheet barcode/save fix.
// Load this AFTER app-fast-v5-14.js.

(function(){
  "use strict";

  function v15Normalize(v){
    return String(v || "").trim();
  }

  async function v15DecodeRunSheetBarcode(file, objectUrl){
    const variants = [];

    // Build many barcode-friendly crops from the captured photo.
    try{
      const img = new Image();
      img.src = objectUrl;
      await img.decode();

      const W = img.naturalWidth, H = img.naturalHeight;

      const add = (sx, sy, sw, sh, angle, threshold) => {
        const maxW = 1800;
        const scale = Math.min(1, maxW / sw);
        const w = Math.max(1, Math.round(sw * scale));
        const h = Math.max(1, Math.round(sh * scale));

        const c = document.createElement("canvas");
        c.width = angle % 180 === 0 ? w : h;
        c.height = angle % 180 === 0 ? h : w;

        const ctx = c.getContext("2d", {willReadFrequently:true});
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.save();

        if(angle === 90){
          ctx.translate(c.width, 0);
          ctx.rotate(Math.PI / 2);
        }else if(angle === 180){
          ctx.translate(c.width, c.height);
          ctx.rotate(Math.PI);
        }else if(angle === 270){
          ctx.translate(0, c.height);
          ctx.rotate(-Math.PI / 2);
        }

        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        ctx.restore();

        if(threshold){
          const data = ctx.getImageData(0,0,c.width,c.height);
          const d = data.data;
          for(let i=0;i<d.length;i+=4){
            const y = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
            const q = y > threshold ? 255 : 0;
            d[i]=d[i+1]=d[i+2]=q;
          }
          ctx.putImageData(data,0,0);
        }

        variants.push(c.toDataURL("image/jpeg",0.96));
      };

      // Full image + several likely barcode bands.
      const bands = [
        [0,0,W,H],
        [0,0,W,Math.round(H*.30)],
        [0,Math.round(H*.15),W,Math.round(H*.40)],
        [0,Math.round(H*.30),W,Math.round(H*.45)],
        [0,Math.round(H*.45),W,Math.round(H*.40)],
        [0,Math.round(H*.65),W,Math.round(H*.35)]
      ];

      for(const b of bands){
        add(...b,0,0);
        add(...b,90,0);
        add(...b,0,160);
      }
    }catch(e){}

    // Native BarcodeDetector on the original image.
    try{
      if("BarcodeDetector" in window){
        let formats = [
          "code_128","code_39","code_93","codabar",
          "ean_13","ean_8","upc_a","upc_e","itf",
          "qr_code","data_matrix","pdf417"
        ];

        if(BarcodeDetector.getSupportedFormats){
          const supported = await BarcodeDetector.getSupportedFormats();
          formats = formats.filter(f => supported.includes(f));
        }

        if(formats.length){
          const detector = new BarcodeDetector({formats});
          const img = new Image();
          img.src = objectUrl;
          await img.decode();

          const found = await detector.detect(img);
          const value = found?.find(x => x.rawValue)?.rawValue || "";
          if(v15Normalize(value)) return v15Normalize(value);
        }
      }
    }catch(e){}

    // ZXing fallback: try every crop with enough time to decode.
    try{
      const reader = new ZXingBrowser.BrowserMultiFormatReader();

      for(const src of variants){
        try{
          let result = null;

          if(typeof reader.decodeFromImageUrl === "function"){
            result = await Promise.race([
              reader.decodeFromImageUrl(src),
              new Promise((_,reject)=>
                setTimeout(()=>reject(new Error("barcode-timeout")),1200)
              )
            ]);
          }else{
            const img = new Image();
            img.src = src;
            await img.decode();

            result = await Promise.race([
              reader.decodeFromImageElement(img),
              new Promise((_,reject)=>
                setTimeout(()=>reject(new Error("barcode-timeout")),1200)
              )
            ]);
          }

          const value = result?.getText?.() || "";
          if(v15Normalize(value)) return v15Normalize(value);
        }catch(e){}
      }
    }catch(e){}

    return "";
  }

  async function v15ReadLabel(mode, file){
    const s = state[mode];
    const employeeInput =
      mode === "sorting" ? $("#sortEmployeeId") : $("#putEmployeeId");

    s.employeeId = employeeInput.value.trim();

    if(!s.employeeId){
      toast("Employee ID is required.");
      return;
    }

    busy(true, "Reading label...");
    let url = "";

    try{
      url = URL.createObjectURL(file);

      const preview =
        mode === "sorting" ? $("#sortLabelPreview") : $("#putLabelPreview");

      preview.innerHTML =
        `<img class="scanPreview" src="${url}" alt="Captured label" loading="eager">`;

      // IMPORTANT v5.15:
      // Barcode and OCR run together, but we WAIT for the barcode before
      // showing/saving the final result. This prevents RunSheet ID from
      // arriving after the Google Sheet record was already saved.
      const barcodePromise = v15DecodeRunSheetBarcode(file, url);

      const worker = await getOcrWorker();

      $("#busyText").textContent = "Reading label...";

      const fastCanvas = await makeFastOcrCanvas(url, 900, 0.78);
      let ocr = await worker.recognize(fastCanvas, {rotateAuto:false});
      let f = extractFields(ocr.data.text, "");

      if(!f.sortCode){
        $("#busyText").textContent = "Reading label again...";
        await worker.setParameters({tessedit_pageseg_mode:"6"});

        const fullCanvas = await makeFallbackOcrCanvas(url, 1000);
        ocr = await worker.recognize(fullCanvas, {rotateAuto:false});
        f = extractFields(ocr.data.text, "");

        await worker.setParameters({tessedit_pageseg_mode:"11"});
      }

      Object.assign(s, f);

      if(!s.sortCode){
        throw new Error(
          "Sort Code was not detected. Please capture the label closer and keep the Sort Code visible."
        );
      }

      $("#busyText").textContent = "Reading RunSheet barcode...";

      // Wait for the actual barcode result.
      const barcodeValue = await barcodePromise;

      if(barcodeValue){
        s.rsId = barcodeValue;
      }

      // If the barcode could not be decoded, retain an OCR RunSheet ID only
      // when the label itself visibly contains one.
      if(!s.rsId && f.rsId){
        s.rsId = f.rsId;
      }

      $("#busyText").textContent = "Loading Grid...";
      s.gridNo = await fetchGridForSort(s.sortCode);

      showResult(mode);

      if(mode === "sorting"){
        // RunSheet ID is now already inside s.rsId before saveRecord().
        await saveRecord(mode, "", "SORTED");
        addNewScanButton(mode);

        if(s.rsId){
          toast("Sorting completed. RunSheet ID captured.");
        }else{
          toast("Sorting completed, but RunSheet barcode was not detected.");
        }
      }else{
        $("#putGridCard").classList.remove("hidden");
        $("#putGridStatus").textContent =
          s.rsId
            ? "Grid loaded. RunSheet ID captured. Open Grid Camera to continue."
            : "Grid loaded. RunSheet barcode was not detected. Open Grid Camera to continue.";

        if(s.rsId){
          toast("Label processed. RunSheet ID captured.");
        }else{
          toast("Label processed, but RunSheet barcode was not detected.");
        }
      }

    }catch(e){
      console.error(e);
      toast(e.message || "Could not read the label.");
    }finally{
      if(url) URL.revokeObjectURL(url);
      busy(false);
    }
  }

  // Replace the v5.14 reader with the fixed v5.15 reader.
  window.readLabel = v15ReadLabel;

  // Also expose the decoder for easy browser-console testing if needed.
  window.decodeRunSheetBarcodeV15 = v15DecodeRunSheetBarcode;

})();
