// Grid Scanner By ArupD — v5.29 FIELD-TEMPLATE FAST LABEL READER
// Two known label layouts: Sort Code is read from the marked text zone;
// RunSheet ID is read from the marked barcode/QR zone, with OCR fallback.
(function(){
  "use strict";

  const clean=v=>String(v||"").trim();
  const norm=v=>String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"")
    .replace(/O(?=\d)/g,"0").replace(/(?<=\d)O/g,"0")
    .replace(/I(?=\d)/g,"1").replace(/L(?=\d)/g,"1");

  function loadImg(url){return new Promise((resolve,reject)=>{
    const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error("image"));i.src=url;
  });}

  function rotateCanvas(img,deg,maxW=900){
    const sc=Math.min(1,maxW/img.naturalWidth),w=Math.max(1,Math.round(img.naturalWidth*sc)),h=Math.max(1,Math.round(img.naturalHeight*sc));
    const r=((deg%360)+360)%360,c=document.createElement("canvas");
    c.width=(r===90||r===270)?h:w;c.height=(r===90||r===270)?w:h;
    const x=c.getContext("2d",{willReadFrequently:true});x.imageSmoothingEnabled=true;x.imageSmoothingQuality="medium";x.save();
    if(r===90){x.translate(c.width,0);x.rotate(Math.PI/2)}
    else if(r===180){x.translate(c.width,c.height);x.rotate(Math.PI)}
    else if(r===270){x.translate(0,c.height);x.rotate(-Math.PI/2)}
    x.drawImage(img,0,0,w,h);x.restore();return c;
  }

  function cropRel(c,x,y,w,h){
    const sx=Math.max(0,Math.round(c.width*x)),sy=Math.max(0,Math.round(c.height*y));
    const sw=Math.min(c.width-sx,Math.round(c.width*w)),sh=Math.min(c.height-sy,Math.round(c.height*h));
    const z=document.createElement("canvas");z.width=Math.max(1,sw);z.height=Math.max(1,sh);
    const g=z.getContext("2d",{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality="high";g.drawImage(c,sx,sy,sw,sh,0,0,sw,sh);return z;
  }

  function enhance(c){
    const z=document.createElement("canvas");z.width=c.width;z.height=c.height;
    const g=z.getContext("2d",{willReadFrequently:true});g.drawImage(c,0,0);
    const im=g.getImageData(0,0,z.width,z.height),d=im.data;
    for(let p=0;p<d.length;p+=4){
      let y=.299*d[p]+.587*d[p+1]+.114*d[p+2];
      y=(y-128)*1.45+128;y=Math.max(0,Math.min(255,y));d[p]=d[p+1]=d[p+2]=y;
    }
    g.putImageData(im,0,0);return z;
  }

  function montage(crops,cols=2,cellW=520,cellH=420){
    const rows=Math.ceil(crops.length/cols),out=document.createElement("canvas");
    out.width=cellW*cols;out.height=cellH*rows;
    const g=out.getContext("2d",{willReadFrequently:true});g.fillStyle="#fff";g.fillRect(0,0,out.width,out.height);
    crops.forEach((src,i)=>{
      const sc=Math.min((cellW-8)/src.width,(cellH-8)/src.height),w=Math.max(1,Math.round(src.width*sc)),h=Math.max(1,Math.round(src.height*sc));
      g.drawImage(src,(i%cols)*cellW+(cellW-w)/2,Math.floor(i/cols)*cellH+(cellH-h)/2,w,h);
    });
    return out;
  }

  // The two supplied label types put the marked Sort Code in the middle/right
  // portion of the label. Four rotated small bands are OCR'd together in ONE
  // Tesseract pass. This is much faster than four full-label OCR passes.
  async function buildSortMontage(url){
    const img=await loadImg(url),parts=[];
    for(const a of [0,90,270,180]){
      // Use the whole captured label for each angle, but downscale it into a
      // compact 2x2 montage. One OCR pass replaces the old 4-7 sequential passes.
      parts.push(enhance(rotateCanvas(img,a,900)));
    }
    return montage(parts,2,520,390);
  }

  async function buildRunSheetMontage(url){
    const img=await loadImg(url),parts=[];
    for(const a of [0,90,270,180]){
      const c=rotateCanvas(img,a,850);
      // Includes the printed digits under the 1-D barcode on type-1 labels and
      // the QR area on type-2 labels (QR itself is handled by barcode decoding).
      parts.push(enhance(cropRel(c,.12,.18,.76,.64)));
    }
    return montage(parts,2,500,370);
  }

  function sortCandidates(text){
    const t=String(text||"").toUpperCase().replace(/[|]/g,"I"),out=[],seen=new Set();
    const add=v=>{
      const x=norm(v);
      if(/^[A-Z]{1,4}\d[A-Z0-9]{0,3}$/.test(x)&&x.length>=3&&!seen.has(x)){seen.add(x);out.push(x);}
    };
    const labelled=t.match(/(?:SORT\s*CODE|SORTING\s*CODE|CLUSTER\s*CODE|CLUSTER)\s*[:#-]?\s*([A-Z0-9IL ]{2,10})/i);
    if(labelled)add(labelled[1]);
    (t.match(/\b[A-Z]{1,4}\s*\d\s*[A-Z0-9]{0,3}\b/g)||[]).forEach(add);
    const tokens=t.split(/[^A-Z0-9]+/).filter(Boolean);
    for(let i=0;i<tokens.length;i++){
      add(tokens[i]);
      if(tokens[i+1])add(tokens[i]+tokens[i+1]);
    }
    return out;
  }

  function runSheetCandidates(text){
    const t=String(text||""),out=[],seen=new Set();
    const add=v=>{
      const d=String(v||"").replace(/\D/g,"");
      if(d.length<7||d.length>18||/^(19|20)\d{6,}$/.test(d)||seen.has(d))return;
      seen.add(d);out.push(d);
    };
    (t.match(/\d[\d\s-]{6,20}/g)||[]).forEach(add);
    return out.sort((a,b)=>(b.length===8)-(a.length===8)||b.length-a.length);
  }

  async function barcodeDecode(url){
    const result={values:[]},add=v=>{const x=clean(v);if(x&&!result.values.includes(x))result.values.push(x)};
    // Native detector first: very fast and supports QR + 1-D where Android exposes it.
    try{
      if("BarcodeDetector" in window){
        let fs=["qr_code","data_matrix","aztec","pdf417","code_128","code_39","code_93","codabar","ean_13","ean_8","upc_a","upc_e","itf"];
        if(BarcodeDetector.getSupportedFormats){const sup=await BarcodeDetector.getSupportedFormats();fs=fs.filter(f=>sup.includes(f));}
        if(fs.length){
          const d=new BarcodeDetector({formats:fs}),img=await loadImg(url);
          for(const a of [0,90,270,180]){
            const c=rotateCanvas(img,a,900);
            try{
              const found=await d.detect(c);
              for(const z of found||[])if(z.rawValue)add(z.rawValue);
              if(result.values.length) return result;
            }catch(e){}
          }
        }
      }
    }catch(e){}

    // ZXing fallback: only if native detection failed. One orientation at a time,
    // short timeout, so it cannot make the normal path slow.
    if(window.ZXingBrowser?.BrowserMultiFormatReader){
      try{
        const img=await loadImg(url),reader=new ZXingBrowser.BrowserMultiFormatReader();
        for(const a of [0,90,270,180]){
          const c=rotateCanvas(img,a,760),src=c.toDataURL("image/jpeg",.82);
          try{
            const temp=await loadImg(src);
            const r=await Promise.race([
              reader.decodeFromImageElement(temp),
              new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),500))
            ]);
            const v=r?.getText?.()||r?.text||"";if(v){add(v);return result;}
          }catch(e){}
        }
      }catch(e){}
    }
    return result;
  }

  async function ocrLabel(url,worker){
    const sortImg=await buildSortMontage(url);
    await worker.setParameters({tessedit_pageseg_mode:"11",tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-"});
    const sr=await worker.recognize(sortImg,{rotateAuto:false});
    const sort=sortCandidates(sr.data.text||"");

    // Only if the RunSheet barcode/QR is not decoded, do a second tiny OCR pass
    // for the printed number under the type-1 barcode. Type-2 RunSheet is QR.
    let rs=[];
    if(!sort.length){
      // One slightly wider pass catches difficult photos without going back to
      // four full-label OCR operations.
      const img=await loadImg(url),c=rotateCanvas(img,0,850),wide=enhance(cropRel(c,.06,.08,.88,.78));
      const r=await worker.recognize(wide,{rotateAuto:true});rs=runSheetCandidates(r.data.text||"");
    }
    return {sort,rs};
  }

  async function bestSort(codes){
    // At most 3 GridMaster lookups; stop immediately when a real mapping is found.
    const uniq=[...new Set(codes.map(norm).filter(Boolean))].slice(0,3);
    for(const code of uniq){
      try{const g=await fetchGridForSort(code);if(g)return {code,grid:g};}catch(e){}
    }
    return null;
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

  async function readLabelFast(mode,file){
    const s=state[mode],input=mode==="sorting"?$("#sortEmployeeId") : $("#putEmployeeId");
    s.employeeId=input.value.trim();if(!s.employeeId){toast("Employee ID is required.");return;}
    if(mode==="putting"){$("#putGridCard")?.classList.add("hidden");$("#putGridStatus").textContent="";}
    busy(true,"Reading label...");let url="";
    try{
      url=URL.createObjectURL(file);
      const preview=mode==="sorting"?$("#sortLabelPreview") : $("#putLabelPreview");
      preview.innerHTML=`<img class="scanPreview ultraPreview" src="${url}" alt="Captured label" loading="eager">`;

      // Start barcode/QR and OCR together. Grid lookup only starts after Sort Code is known.
      const bp=barcodeDecode(url);
      const worker=await getOcrWorker();
      const o=await ocrLabel(url,worker);
      const bar=await bp;

      s.rsId=bar.values.length?String(bar.values[0]).replace(/\s+/g,""):((o.rs&&o.rs[0])||"");
      s.sortCode="";s.gridNo="";

      const g=await bestSort(o.sort);
      if(g){s.sortCode=g.code;s.gridNo=g.grid;}

      showResult(mode);
      if(typeof styleResult==="function")styleResult(mode);

      if(!s.sortCode){
        toast(s.rsId?"RunSheet ID captured, but Sort Code was not detected.":"RunSheet ID and Sort Code were not detected.");
        return;
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

  async function startGridScannerFast(){
    const s=state.putting;if(!s.gridNo){toast("Grid No is not available yet.");return;}
    const status=$("#putGridStatus"),stop=$("#putStopBtn"),btn=$("#putGridBtn"),video=$("#labelCamera");
    const expected=norm(s.gridNo);status.textContent="Starting Grid scanner...";btn.classList.add("hidden");stop.classList.remove("hidden");
    let finished=false;
    const finish=raw=>{
      if(finished)return;const value=norm(raw);if(!value)return;
      if(value===expected){
        finished=true;
        try{stopGridScanner(true)}catch(e){}
        status.innerHTML=`<span class="success">✓ MATCH — ${escapeHtml(value)}</span>`;
        saveRecord("putting",value,"MATCH");
        // Grid step disappears. Only New Scan remains for the next label.
        $("#putGridCard")?.classList.add("hidden");
        ensureNewScan();
      }else{
        status.innerHTML=`<span class="error">✗ WRONG BARCODE — ${escapeHtml(value)} | Expected: ${escapeHtml(expected)}</span>`;
        if(navigator.vibrate)navigator.vibrate(80);
      }
    };
    try{
      $("#cameraTitle").textContent="Putting - Grid Camera";$("#cameraModal").classList.remove("hidden");
      $("#capturePhoto").classList.add("hidden");$("#cameraHelp").textContent="Point the camera at the Grid QR code.";
      if(cameraStream&&cameraStream.getVideoTracks().some(t=>t.readyState==="live"))video.srcObject=cameraStream;
      else{
        try{cameraStream?.getTracks()?.forEach(t=>t.stop())}catch(e){}
        cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});
        video.srcObject=cameraStream;
      }
      video.setAttribute("playsinline","");video.muted=true;await video.play();
      let nativeStarted=false;
      if("BarcodeDetector" in window){
        try{
          let fs=["qr_code","data_matrix","aztec","pdf417","code_128","code_39","code_93","codabar","ean_13","ean_8","upc_a","upc_e","itf"];
          if(BarcodeDetector.getSupportedFormats){const sup=await BarcodeDetector.getSupportedFormats();fs=fs.filter(f=>sup.includes(f));}
          if(fs.length){
            const d=new BarcodeDetector({formats:fs});s._nativeDetector=d;
            s._nativeTimer=setInterval(async()=>{if(finished||!cameraStream||!video.videoWidth)return;try{for(const c of await d.detect(video)||[]){finish(c.rawValue);if(finished)break;}}catch(e){}},120);
            nativeStarted=true;
          }
        }catch(e){}
      }
      if(!nativeStarted&&window.ZXingBrowser?.BrowserMultiFormatReader){
        s.scanner=new ZXingBrowser.BrowserMultiFormatReader();
        s.controls=await s.scanner.decodeFromVideoElement(video,(r)=>{if(r&&!finished)finish(r.getText?r.getText():r.text)});
      }
      if(!nativeStarted&&!s.scanner)throw Error("QR scanner is not available in this browser.");
    }catch(e){
      console.error(e);try{stopGridScanner(true)}catch(x){}
      status.innerHTML='<span class="error">Grid QR scanner could not start. Allow camera access and try again.</span>';
    }
  }

  window.readLabel=readLabelFast;
  window.startGridScanner=startGridScannerFast;
})();
