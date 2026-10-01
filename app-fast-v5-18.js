// Grid Scanner By ArupD — v5.17 fast + tolerant Sort Code OCR.
// Load AFTER app-fast-v5-16.js.
(function(){
  "use strict";

  const norm=v=>String(v||"").trim();

  // Normalize common OCR mistakes only for Sort-Code-like tokens.
  function normalizeSortToken(token){
    let x=String(token||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(!x) return "";
    // Common OCR confusions: 0/O, 1/I/L. Keep changes conservative.
    if(/[A-Z]/.test(x) && /[0-9]/.test(x)){
      x=x.replace(/O(?=\d)/g,"0").replace(/(?<=\d)O/g,"0");
      x=x.replace(/I(?=\d)/g,"1").replace(/L(?=\d)/g,"1");
    }
    return x;
  }

  function sortCandidatesFromText(text){
    const raw=String(text||"").toUpperCase().replace(/[|]/g,"I");
    const out=[]; const seen=new Set();
    const add=v=>{
      const x=normalizeSortToken(v);
      // Expected GridMaster-style code: 1-4 letters, then a digit, then up to 3 alphanumerics.
      if(!/^[A-Z]{1,4}\d[A-Z0-9]{0,3}$/.test(x)) return;
      if(!seen.has(x)){seen.add(x);out.push(x);}
    };

    // Prefer text immediately following a Sort Code label.
    const labeled=raw.match(/SORT(?:ING)?\s*CODE\s*[:#\-]?\s*([A-Z0-9IL O]{1,10})/i);
    if(labeled) add(labeled[1]);
    const labeled2=raw.match(/SORT\s*[:#\-]?\s*([A-Z0-9IL O]{1,10})/i);
    if(labeled2) add(labeled2[1]);

    // Then scan compact OCR tokens. This catches spaces inserted inside a code.
    const compact=raw.replace(/\s+/g," ");
    const pieces=compact.split(/[^A-Z0-9]+/).filter(Boolean);
    for(let i=0;i<pieces.length;i++){
      add(pieces[i]);
      if(i+1<pieces.length) add(pieces[i]+pieces[i+1]);
    }

    // Last pass: contiguous candidates directly from OCR text.
    const matches=raw.match(/[A-Z]{1,4}[0-9][A-Z0-9]{0,3}/g)||[];
    matches.forEach(add);
    return out;
  }

  async function fastSortOCR(url,worker){
    // One small/fast OCR pass first. PSM 11 is good for sparse labels.
    await worker.setParameters({
      tessedit_pageseg_mode:"11",
      tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-"
    });
    const c=await makeFastOcrCanvas(url,760,0.82);
    const o=await worker.recognize(c,{rotateAuto:false});
    return {text:o.data.text||"", candidates:sortCandidatesFromText(o.data.text||"")};
  }

  async function oneRotatedSortOCR(url,worker,angle){
    try{
      const c=await new Promise((resolve,reject)=>{
        const img=new Image();
        img.onload=()=>{
          const scale=Math.min(1,1000/img.naturalWidth);
          const w=Math.max(1,Math.round(img.naturalWidth*scale));
          const h=Math.max(1,Math.round(img.naturalHeight*scale));
          const out=document.createElement("canvas");
          out.width=(angle===90||angle===270)?h:w;
          out.height=(angle===90||angle===270)?w:h;
          const ctx=out.getContext("2d",{willReadFrequently:true});
          ctx.imageSmoothingEnabled=true;
          ctx.imageSmoothingQuality="medium";
          ctx.save();
          if(angle===90){ctx.translate(out.width,0);ctx.rotate(Math.PI/2);}
          else if(angle===270){ctx.translate(0,out.height);ctx.rotate(-Math.PI/2);}
          else {ctx.translate(out.width,out.height);ctx.rotate(Math.PI);}
          ctx.drawImage(img,0,0,w,h); ctx.restore(); resolve(out);
        };
        img.onerror=()=>reject(new Error("image"));
        img.src=url;
      });
      await worker.setParameters({tessedit_pageseg_mode:"11",tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-"});
      const o=await worker.recognize(c,{rotateAuto:false});
      return {text:o.data.text||"",candidates:sortCandidatesFromText(o.data.text||"")};
    }catch(e){return {text:"",candidates:[]};}
  }

  async function findGridForCandidates(candidates){
    if(typeof fetchGridForSort!=="function") return {code:"",grid:""};
    for(const code of candidates){
      try{
        const grid=await fetchGridForSort(code);
        if(grid) return {code,grid};
      }catch(e){}
    }
    return {code:"",grid:""};
  }

  async function v17ReadLabel(mode,file){
    const s=state[mode];
    const employeeInput=mode==="sorting"?$("#sortEmployeeId"):
      $("#putEmployeeId");
    s.employeeId=employeeInput.value.trim();
    if(!s.employeeId){toast("Employee ID is required.");return;}

    busy(true,"Reading label...");
    let url="";
    try{
      url=URL.createObjectURL(file);
      const preview=mode==="sorting"?$("#sortLabelPreview"):
        $("#putLabelPreview");
      preview.innerHTML=`<img class="scanPreview" src="${url}" alt="Captured label" loading="eager">`;

      // Barcode starts immediately in parallel with OCR.
      const barcodePromise=(async()=>{
        try{
          if(typeof window.decodeRunSheetBarcodeV15==="function")
            return norm(await window.decodeRunSheetBarcodeV15(file,url));
        }catch(e){}
        return "";
      })();

      const worker=await getOcrWorker();
      let candidates=[];
      let rawText="";

      // FAST PATH: one reduced-resolution OCR pass.
      try{
        $("#busyText").textContent="Reading Sort Code...";
        const r=await fastSortOCR(url,worker);
        candidates=r.candidates; rawText=r.text;
      }catch(e){}

      // If not found, try only the two useful rotated orientations first.
      if(!candidates.length){
        $("#busyText").textContent="Checking label orientation...";
        for(const angle of [90,270]){
          const r=await oneRotatedSortOCR(url,worker,angle);
          rawText += "\n"+r.text;
          candidates.push(...r.candidates);
          if(candidates.length) break;
        }
      }

      // Final normal-orientation fallback, only when still missing.
      if(!candidates.length){
        try{
          $("#busyText").textContent="Reading Sort Code again...";
          await worker.setParameters({tessedit_pageseg_mode:"6",tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-"});
          const full=await makeFallbackOcrCanvas(url,950);
          const o=await worker.recognize(full,{rotateAuto:false});
          rawText += "\n"+(o.data.text||"");
          candidates=sortCandidatesFromText(rawText);
        }catch(e){}
      }

      // Barcode can complete independently of Sort Code OCR.
      $("#busyText").textContent="Reading RunSheet barcode...";
      const barcodeValue=await barcodePromise;
      if(barcodeValue) s.rsId=barcodeValue;
      if(!s.rsId){
        try{
          const f=extractFields(rawText,"");
          if(f&&f.rsId) s.rsId=f.rsId;
        }catch(e){}
      }

      // Validate OCR candidates against GridMaster. This avoids accepting garbage OCR.
      $("#busyText").textContent="Checking Sort Code...";
      const gridResult=await findGridForCandidates(candidates);
      s.sortCode=gridResult.code;
      s.gridNo=gridResult.grid||"";

      if(!s.sortCode){
        showResult(mode);
        toast(s.rsId
          ? "RunSheet ID captured, but Sort Code was not detected."
          : "RunSheet barcode was not detected and Sort Code was not detected.");
        return;
      }

      showResult(mode);
      if(mode==="sorting"){
        await saveRecord(mode,"","SORTED");
        if(typeof addNewScanButton==="function") addNewScanButton(mode);
        toast(s.rsId?"Sorting completed. RunSheet ID captured.":"Sorting completed, but RunSheet barcode was not detected.");
      }else{
        $("#putGridCard").classList.remove("hidden");
        $("#putGridStatus").textContent=s.rsId
          ? "Grid loaded. RunSheet ID captured. Open Grid Camera to continue."
          : "Grid loaded. RunSheet barcode was not detected. Open Grid Camera to continue.";
        toast(s.rsId?"Label processed. RunSheet ID captured.":"Label processed, but RunSheet barcode was not detected.");
      }
    }catch(e){
      console.error(e);
      toast(e.message||"Could not read the label.");
    }finally{
      if(url) URL.revokeObjectURL(url);
      busy(false);
    }
  }

  window.readLabel=v17ReadLabel;
})();


  // v5.18: faster/stronger RunSheet barcode detection at any label angle.
  // Native BarcodeDetector is tried on original + rotated canvases before the
  // slower ZXing fallback inherited from v5.15.
  async function v18NativeBarcode(objectUrl){
    try{
      if(!("BarcodeDetector" in window)) return "";
      let formats=["code_128","code_39","code_93","codabar","ean_13","ean_8","upc_a","upc_e","itf","qr_code","data_matrix","pdf417"];
      if(BarcodeDetector.getSupportedFormats){
        const supported=await BarcodeDetector.getSupportedFormats();
        formats=formats.filter(f=>supported.includes(f));
      }
      if(!formats.length) return "";
      const detector=new BarcodeDetector({formats});
      const img=new Image(); img.src=objectUrl; await img.decode();
      const W=img.naturalWidth,H=img.naturalHeight;

      const make=(angle, crop)=>new Promise((resolve,reject)=>{
        const [sx,sy,sw,sh]=crop;
        const maxW=1600, scale=Math.min(1,maxW/sw);
        const w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale));
        const c=document.createElement("canvas");
        c.width=(angle===90||angle===270)?h:w;
        c.height=(angle===90||angle===270)?w:h;
        const ctx=c.getContext("2d",{willReadFrequently:true});
        ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality="high";
        ctx.save();
        if(angle===90){ctx.translate(c.width,0);ctx.rotate(Math.PI/2)}
        else if(angle===180){ctx.translate(c.width,c.height);ctx.rotate(Math.PI)}
        else if(angle===270){ctx.translate(0,c.height);ctx.rotate(-Math.PI/2)}
        ctx.drawImage(img,sx,sy,sw,sh,0,0,w,h); ctx.restore();
        resolve(c);
      });

      const crops=[
        [0,0,W,H],
        [0,0,W,Math.round(H*.42)],
        [0,Math.round(H*.18),W,Math.round(H*.50)],
        [0,Math.round(H*.35),W,Math.round(H*.45)],
        [Math.round(W*.05),Math.round(H*.10),Math.round(W*.90),Math.round(H*.80)]
      ];
      const angles=[0,90,270,180];
      // Fast path: full label at each orientation.
      for(const angle of angles){
        const c=await make(angle,crops[0]);
        try{
          const found=await detector.detect(c);
          const value=found?.find(x=>x.rawValue)?.rawValue||"";
          if(value) return v15Normalize(value);
        }catch(e){}
      }
      // Only if the full-frame pass fails, try a few focused bands.
      for(const crop of crops.slice(1)){
        for(const angle of [0,90,270]){
          const c=await make(angle,crop);
          try{
            const found=await detector.detect(c);
            const value=found?.find(x=>x.rawValue)?.rawValue||"";
            if(value) return v15Normalize(value);
          }catch(e){}
        }
      }
    }catch(e){}
    return "";
  }

  const _v17ReadLabel=window.readLabel;
  window.readLabel=async function(mode,file){
    // Keep v5.17 OCR logic, but replace its barcode promise with a native
    // rotation-aware detector first, then the v5.15 ZXing fallback.
    const originalDecode=window.decodeRunSheetBarcodeV15;
    const original=window.decodeRunSheetBarcodeV15;
    window.decodeRunSheetBarcodeV15=async function(f,u){
      const fast=await v18NativeBarcode(u);
      if(fast) return fast;
      return original(f,u);
    };
    try{return await _v17ReadLabel(mode,file)}
    finally{window.decodeRunSheetBarcodeV15=originalDecode||original;}
  };
