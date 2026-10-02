// Grid Scanner By ArupD — v5.31 TARGETED 2-LABEL FAST READER — capture wiring fix
// Uses the two supplied label layouts as templates. OCR is done on a focused
// label band, one orientation at a time, and stops as soon as a GridMaster
// sort code is found. Barcode/QR decoding is independent of OCR.
(function(){
  "use strict";

  const clean=v=>String(v||"").trim();
  const basic=v=>String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"");

  function normCode(v){
    let s=basic(v);
    // Common OCR confusions, especially TG1K -> TGIK/TGLK and MSA1 -> MSAI.
    if(!s) return "";
    if(/^[A-Z]{1,4}[ILO0]$/.test(s)){
      const n=s.length-1;
      if(/[IL]/.test(s[n])) s=s.slice(0,n)+"1";
      else if(s[n]==="O") s=s.slice(0,n)+"0";
    }
    // If there is no digit in a 3–6 char code, treat the first likely I/L/O
    // after the letter prefix as the OCR'd digit.
    if(!/\d/.test(s) && /^[A-Z]{3,5}$/.test(s)){
      const m=s.match(/^(.*?)([ILO])([A-Z]*)$/);
      if(m) s=m[1]+(m[2]==="O"?"0":"1")+m[3];
    }
    return s;
  }

  function loadImg(url){return new Promise((resolve,reject)=>{
    const i=new Image(); i.onload=()=>resolve(i); i.onerror=()=>reject(new Error("image")); i.src=url;
  });}

  function rotateCanvas(img,deg,maxW=1280){
    const sc=Math.min(1,maxW/img.naturalWidth),w=Math.max(1,Math.round(img.naturalWidth*sc)),h=Math.max(1,Math.round(img.naturalHeight*sc));
    const r=((deg%360)+360)%360,c=document.createElement("canvas");
    c.width=(r===90||r===270)?h:w;c.height=(r===90||r===270)?w:h;
    const x=c.getContext("2d",{willReadFrequently:true});
    x.imageSmoothingEnabled=true;x.imageSmoothingQuality="high";x.save();
    if(r===90){x.translate(c.width,0);x.rotate(Math.PI/2)}
    else if(r===180){x.translate(c.width,c.height);x.rotate(Math.PI)}
    else if(r===270){x.translate(0,c.height);x.rotate(-Math.PI/2)}
    x.drawImage(img,0,0,w,h);x.restore();return c;
  }

  function cropRel(c,x,y,w,h){
    const sx=Math.max(0,Math.round(c.width*x)),sy=Math.max(0,Math.round(c.height*y));
    const sw=Math.min(c.width-sx,Math.round(c.width*w)),sh=Math.min(c.height-sy,Math.round(c.height*h));
    const z=document.createElement("canvas");z.width=Math.max(1,sw);z.height=Math.max(1,sh);
    const g=z.getContext("2d",{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality="high";
    g.drawImage(c,sx,sy,sw,sh,0,0,sw,sh);return z;
  }

  function enhance(c,scale=1.35){
    const z=document.createElement("canvas");z.width=Math.round(c.width*scale);z.height=Math.round(c.height*scale);
    const g=z.getContext("2d",{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality="high";
    g.drawImage(c,0,0,z.width,z.height);
    const im=g.getImageData(0,0,z.width,z.height),d=im.data;
    for(let p=0;p<d.length;p+=4){
      let y=.299*d[p]+.587*d[p+1]+.114*d[p+2];
      y=(y-128)*1.55+128;y=Math.max(0,Math.min(255,y));
      d[p]=d[p+1]=d[p+2]=y;
    }
    g.putImageData(im,0,0);return z;
  }

  // Both supplied labels keep the useful text inside this broad central band.
  // The crop deliberately includes both template positions: the right-side
  // TG1K-style field and the centre MSA1-style field.
  function targetCrop(c){
    const core=cropRel(c,.06,.10,.88,.80);
    return enhance(core,1.25);
  }

  function tokensFromText(text){
    const t=String(text||"").toUpperCase().replace(/[|]/g,"I");
    const arr=[];
    (t.match(/[A-Z0-9]{3,8}/g)||[]).forEach(x=>arr.push(x));
    // Also preserve compact tokens created by OCR spaces, e.g. "TG I K".
    const compact=t.replace(/[^A-Z0-9]/g,"");
    for(let i=0;i<=compact.length-3;i++) arr.push(compact.slice(i,i+6));
    return [...new Set(arr)];
  }

  function levenshtein(a,b){
    const m=a.length,n=b.length,dp=Array(n+1);for(let j=0;j<=n;j++)dp[j]=j;
    for(let i=1;i<=m;i++){let prev=dp[0];dp[0]=i;for(let j=1;j<=n;j++){const old=dp[j];dp[j]=Math.min(dp[j]+1,dp[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;}}
    return dp[n];
  }

  function directCandidates(text){
    const out=[],seen=new Set();
    const add=v=>{
      const x=normCode(v);if(!x||x.length<3||x.length>6||!/^\w+$/.test(x))return;
      if(!/^[A-Z]{1,4}\d[A-Z0-9]{0,3}$/.test(x))return;
      if(!seen.has(x)){seen.add(x);out.push(x);}
    };
    const t=String(text||"").toUpperCase();
    const labelled=t.match(/(?:SORT\s*CODE|SORTING\s*CODE|CLUSTER\s*CODE|CLUSTER)\s*[:#-]?\s*([A-Z0-9IL ]{2,10})/i);
    if(labelled)add(labelled[1]);
    (t.match(/\b[A-Z]{1,4}\s*[0-9ILO]\s*[A-Z0-9ILO]{0,3}\b/g)||[]).forEach(add);
    tokensFromText(t).forEach(add);
    return out;
  }

  function cachedCodes(){
    try{return Object.keys(gridMasterCache||{});}catch(e){return [];}
  }

  function fuzzyGridCodes(text){
    const codes=cachedCodes(); if(!codes.length)return [];
    const toks=tokensFromText(text).map(normCode).filter(Boolean);
    const scored=[];
    for(const code of codes){
      for(const tok of toks){
        if(!tok)continue;
        const d=levenshtein(tok,code);
        if(d<=1 && Math.abs(tok.length-code.length)<=1) scored.push({code,d});
      }
    }
    scored.sort((a,b)=>a.d-b.d);
    return [...new Set(scored.map(x=>x.code))].slice(0,5);
  }

  async function readSortCode(url,worker){
    const img=await loadImg(url);
    // Most phones deliver the label already close to upright. Only go to the
    // opposite orientations when needed. This is intentionally NOT a 4-way
    // full-image OCR montage, which made v5.29 both slow and inaccurate.
    for(const a of [0,90,270,180]){
      const c=targetCrop(rotateCanvas(img,a,1280));
      await worker.setParameters({tessedit_pageseg_mode:"11",tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-"});
      const r=await worker.recognize(c,{rotateAuto:false});
      const text=r.data.text||"";
      let codes=directCandidates(text);
      if(codes.length)return {code:codes[0],text};
      const fuzzy=fuzzyGridCodes(text);
      if(fuzzy.length)return {code:fuzzy[0],text};
    }
    return {code:"",text:""};
  }

  async function decodeBarcode(url){
    const add=(arr,v)=>{v=clean(v);if(v&&!arr.includes(v))arr.push(v)};
    const values=[];
    const img=await loadImg(url);
    // Native detector: first original image, then rotated image only if needed.
    try{
      if("BarcodeDetector" in window){
        let fs=["qr_code","data_matrix","aztec","pdf417","code_128","code_39","code_93","codabar","ean_13","ean_8","upc_a","upc_e","itf"];
        if(BarcodeDetector.getSupportedFormats){const sup=await BarcodeDetector.getSupportedFormats();fs=fs.filter(f=>sup.includes(f));}
        if(fs.length){
          const d=new BarcodeDetector({formats:fs});
          for(const a of [0,90,270,180]){
            const c=rotateCanvas(img,a,1200);
            try{for(const z of await d.detect(c)||[])add(values,z.rawValue);if(values.length)return values;}catch(e){}
          }
        }
      }
    }catch(e){}

    // ZXing fallback: try the likely central label first, then one full image.
    if(window.ZXingBrowser?.BrowserMultiFormatReader){
      try{
        const reader=new ZXingBrowser.BrowserMultiFormatReader();
        for(const a of [0,90,270,180]){
          const c=rotateCanvas(img,a,1000);
          const src=c.toDataURL("image/jpeg",.9),tmp=await loadImg(src);
          try{
            const r=await Promise.race([reader.decodeFromImageElement(tmp),new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),650))]);
            const v=r?.getText?.()||r?.text||"";if(v){add(values,v);return values;}
          }catch(e){}
        }
      }catch(e){}
    }
    return values;
  }

  async function processLabel(mode,file){
    const s=state[mode],input=mode==="sorting"?$("#sortEmployeeId"):$("#putEmployeeId");
    s.employeeId=input.value.trim();if(!s.employeeId){toast("Employee ID is required.");return;}
    if(mode==="putting"){$("#putGridCard")?.classList.add("hidden");$("#putGridStatus").textContent="";}
    busy(true,"Reading label...");let url="";
    try{
      url=URL.createObjectURL(file);
      const preview=mode==="sorting"?$("#sortLabelPreview"):$("#putLabelPreview");
      preview.innerHTML=`<img class="scanPreview ultraPreview" src="${url}" alt="Captured label">`;

      // Barcode and OCR are independent. Neither is allowed to block the other.
      const bp=decodeBarcode(url).catch(()=>[]);
      const worker=await getOcrWorker();
      const sr=await readSortCode(url,worker);
      const bars=await bp;

      s.sortCode="";s.gridNo="";s.rsId="";
      if(sr.code){
        s.sortCode=sr.code;
        try{s.gridNo=await fetchGridForSort(sr.code);}catch(e){
          // If the OCR candidate itself was slightly wrong, try the closest
          // GridMaster entries before declaring failure.
          const fuzzy=fuzzyGridCodes(sr.text||"");
          for(const code of fuzzy){try{s.gridNo=await fetchGridForSort(code);s.sortCode=code;break;}catch(x){}}
        }
      }
      if(bars.length)s.rsId=bars[0].replace(/\s+/g,"");

      // Printed RunSheet fallback only if barcode/QR decoding failed. Keep it
      // tiny and only use it when we already know the sort code, so normal scans
      // do not pay another OCR pass.
      if(!s.rsId && sr.code){
        const img=await loadImg(url);
        const c=targetCrop(rotateCanvas(img,0,1100));
        const r=await worker.recognize(c,{rotateAuto:true});
        const nums=(String(r.data.text||"").match(/\d[\d\s-]{6,20}/g)||[]).map(x=>x.replace(/\D/g,""));
        s.rsId=nums.find(x=>x.length>=7&&x.length<=18&&!/^20\d{6,}$/.test(x))||"";
      }

      showResult(mode);
      if(typeof styleResult==="function")styleResult(mode);

      if(!s.sortCode){
        toast("Sort Code was not detected. Move closer so the marked Sort Code area is clear.");
        return;
      }
      if(!s.gridNo){
        toast("Grid No not found for Sort Code: "+s.sortCode);return;
      }

      if(mode==="sorting"){
        await saveRecord(mode,"","SORTED");toast("Sorting completed.");
      }else{
        $("#putGridCard").classList.remove("hidden");
        $("#putGridStatus").textContent="Grid loaded. Open Grid Camera to continue.";
        toast("Label processed. Scan the Grid barcode.");
      }
    }catch(e){console.error(e);toast(e.message||"Could not read the label.");}
    finally{if(url)URL.revokeObjectURL(url);busy(false);}
  }

  function ensureNewScan(){
    const result=$("#putResult");if(!result)return;
    let b=$("#putNewScanBtn");
    if(!b){
      b=document.createElement("button");b.id="putNewScanBtn";b.className="primary big";b.textContent="↻ New Scan";
      b.style.cssText="width:100%;margin-top:10px";result.appendChild(b);
      b.onclick=()=>{
        try{stopGridScanner(true)}catch(e){}
        const s=state.putting;s.rsId="";s.sortCode="";s.gridNo="";s.label=null;
        $("#putGridCard")?.classList.add("hidden");$("#putGridStatus").textContent="";
        $("#putLabelPreview").innerHTML="";$("#putResult").innerHTML="";$("#putResult").classList.add("hidden");
        $("#putLabelBtn")?.click();
      };
    }
  }

  async function gridScanner(){
    const s=state.putting;if(!s.gridNo){toast("Grid No is not available yet.");return;}
    const status=$("#putGridStatus"),stop=$("#putStopBtn"),btn=$("#putGridBtn"),video=$("#labelCamera");
    const expected=normalize(s.gridNo);status.textContent="Starting Grid scanner...";btn.classList.add("hidden");stop.classList.remove("hidden");
    let finished=false;
    const finish=raw=>{
      if(finished)return;const value=normalize(raw);if(!value)return;
      if(value===expected){
        finished=true;try{stopGridScanner(true)}catch(e){}
        status.innerHTML=`<span class="success">✓ MATCH — ${escapeHtml(value)}</span>`;
        saveRecord("putting",value,"MATCH");
        $("#putGridCard")?.classList.add("hidden");
        ensureNewScan();
      }else{status.innerHTML=`<span class="error">✗ WRONG BARCODE — ${escapeHtml(value)} | Expected: ${escapeHtml(expected)}</span>`;if(navigator.vibrate)navigator.vibrate(70);}
    };
    try{
      $("#cameraTitle").textContent="Putting - Grid Camera";$("#cameraModal").classList.remove("hidden");$("#capturePhoto").classList.add("hidden");$("#cameraHelp").textContent="Point the camera at the Grid QR code.";
      if(cameraStream&&cameraStream.getVideoTracks().some(t=>t.readyState==="live"))video.srcObject=cameraStream;
      else{try{cameraStream?.getTracks()?.forEach(t=>t.stop())}catch(e){}cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});video.srcObject=cameraStream;}
      video.setAttribute("playsinline","");video.muted=true;await video.play();
      let nativeStarted=false;
      if("BarcodeDetector" in window){
        try{
          let fs=["qr_code","data_matrix","aztec","pdf417","code_128","code_39","code_93","codabar","ean_13","ean_8","upc_a","upc_e","itf"];
          if(BarcodeDetector.getSupportedFormats){const sup=await BarcodeDetector.getSupportedFormats();fs=fs.filter(f=>sup.includes(f));}
          if(fs.length){const d=new BarcodeDetector({formats:fs});s._nativeDetector=d;s._nativeTimer=setInterval(async()=>{if(finished||!cameraStream||!video.videoWidth)return;try{for(const z of await d.detect(video)||[]){finish(z.rawValue);if(finished)break;}}catch(e){}},100);nativeStarted=true;}
        }catch(e){}
      }
      if(!nativeStarted&&window.ZXingBrowser?.BrowserMultiFormatReader){s.scanner=new ZXingBrowser.BrowserMultiFormatReader();s.controls=await s.scanner.decodeFromVideoElement(video,r=>{if(r&&!finished)finish(r.getText?r.getText():r.text)});}
      if(!nativeStarted&&!s.scanner)throw Error("QR/barcode scanner is not available in this browser.");
    }catch(e){console.error(e);try{stopGridScanner(true)}catch(x){}status.innerHTML='<span class="error">Grid QR scanner could not start. Allow camera access and try again.</span>';}
  }

  // v5.7 binds the Capture button to its lexical readLabel() before this
  // override file loads. Merely replacing window.readLabel therefore did not
  // change what the button actually called. Rebind the button explicitly.
  window.readLabel=processLabel;
  window.startGridScanner=gridScanner;

  if (typeof captureLabelPhoto === "function") {
    $("#capturePhoto").onclick = async function(){
      if(!cameraMode) return;
      const video=$("#labelCamera");
      if(!video.videoWidth){toast("Camera is not ready yet.");return;}
      const canvas=$("#captureCanvas");
      canvas.width=video.videoWidth; canvas.height=video.videoHeight;
      const ctx=canvas.getContext("2d");
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      canvas.toBlob(async blob=>{
        if(!blob){toast("Could not capture the photo.");return;}
        const mode=cameraMode;
        if(mode === "putting") hideLabelCameraKeepStream();
        else closeLabelCamera();
        await processLabel(mode,blob);
      },"image/jpeg",0.86);
    };
  }

  // Rebind Grid button too, otherwise the old v5.7 gridScanner remains
  // attached to the button.
  $("#putGridBtn").onclick=window.startGridScanner;
})();
