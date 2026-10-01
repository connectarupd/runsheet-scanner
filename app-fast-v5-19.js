// Grid Scanner By ArupD — v5.19 orientation-free label + stronger RunSheet decode.
// Load AFTER v5.18. Fixed v5.19 build: orientation-safe barcode + OCR fallback.
(function(){
  "use strict";

  const clean=v=>String(v||"").trim();

  function loadImage(url){
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve(img); img.onerror=()=>reject(new Error("image")); img.src=url;
    });
  }

  function rotatedCanvas(img, angle, maxW=1500){
    const scale=Math.min(1,maxW/img.naturalWidth);
    const w=Math.max(1,Math.round(img.naturalWidth*scale));
    const h=Math.max(1,Math.round(img.naturalHeight*scale));
    const a=((angle%360)+360)%360;
    const c=document.createElement("canvas");
    c.width=(a===90||a===270)?h:w;
    c.height=(a===90||a===270)?w:h;
    const ctx=c.getContext("2d",{willReadFrequently:true});
    ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality="high";
    ctx.save();
    if(a===90){ctx.translate(c.width,0);ctx.rotate(Math.PI/2)}
    else if(a===180){ctx.translate(c.width,c.height);ctx.rotate(Math.PI)}
    else if(a===270){ctx.translate(0,c.height);ctx.rotate(-Math.PI/2)}
    ctx.drawImage(img,0,0,w,h); ctx.restore();
    return c;
  }

  async function nativeDecode(img){
    try{
      if(!("BarcodeDetector" in window)) return "";
      let formats=["code_128","code_39","code_93","codabar","ean_13","ean_8","upc_a","upc_e","itf","qr_code","data_matrix","pdf417"];
      if(BarcodeDetector.getSupportedFormats){
        const ok=await BarcodeDetector.getSupportedFormats();
        formats=formats.filter(x=>ok.includes(x));
      }
      if(!formats.length) return "";
      const detector=new BarcodeDetector({formats});
      for(const angle of [0,90,270,180]){
        const c=rotatedCanvas(img,angle,1800);
        try{
          const found=await detector.detect(c);
          const v=found?.find(x=>x.rawValue)?.rawValue||"";
          if(v) return clean(v);
        }catch(e){}
      }
    }catch(e){}
    return "";
  }

  async function zxingDecode(img){
    try{
      const Z=window.ZXingBrowser||window.ZXing;
      if(!Z) return "";
      const Reader=Z.BrowserMultiFormatReader||Z.BrowserMultiFormatReader;
      if(!Reader) return "";
      const reader=new Reader();
      for(const angle of [0,90,270,180,45,315,135,225]){
        const c=rotatedCanvas(img,angle,1800);
        try{
          const r=await reader.decodeFromCanvas(c);
          const v=r?.getText ? r.getText() : (r?.text||"");
          if(v) return clean(v);
        }catch(e){}
      }
    }catch(e){}
    return "";
  }

  async function barcodeDigitsFallback(img, worker){
    // Last-resort human-readable barcode-number OCR. It is deliberately used
    // only after real barcode decoders fail, and prefers the longest digit run.
    try{
      await worker.setParameters({
        tessedit_pageseg_mode:"11",
        tessedit_char_whitelist:"0123456789"
      });
      const candidates=[];
      for(const angle of [0,90,270,180]){
        const c=rotatedCanvas(img,angle,1500);
        const o=await worker.recognize(c,{rotateAuto:false});
        const t=String(o.data.text||"");
        const normalized=t.replace(/[^0-9]/g,"");
        const runs=t.match(/(?:\d[\s-]?){6,18}/g)||[];
        for(const x of runs){
          const d=x.replace(/\D/g,"");
          if(d.length>=6) candidates.push(d);
        }
        if(normalized.length>=6) candidates.push(normalized);
      }
      candidates.sort((a,b)=>b.length-a.length);
      return candidates[0]||"";
    }catch(e){return "";}
  }

  async function robustRunSheet(file,url){
    const img=await loadImage(url);
    let v=await nativeDecode(img);
    if(v) return v;
    v=await zxingDecode(img);
    if(v) return v;
    // If real barcode decoding is unavailable, recover the printed barcode
    // number so RunSheet ID is not left blank on a clear label.
    try{
      const worker=await getOcrWorker();
      v=await barcodeDigitsFallback(img,worker);
      if(v) return v;
    }catch(e){}
    return "";
  }

  const previousRead=window.readLabel;
  window.readLabel=async function(mode,file){
    // v5.18 already handles Sort Code, but its barcode fallback depends on
    // browser support. Temporarily replace that decoder with the robust one.
    const old=window.decodeRunSheetBarcodeV15;
    window.decodeRunSheetBarcodeV15=robustRunSheet;
    try{
      return await previousRead(mode,file);
    }finally{
      window.decodeRunSheetBarcodeV15=old;
    }
  };
})();
