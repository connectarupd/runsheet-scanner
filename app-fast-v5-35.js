// Grid Scanner By ArupD — v5.35 — camera-ready fix + v5.33 OCR/barcode logic
// Focus: the two supplied label layouts. Sort Code is validated against GridMaster.
(function(){
  "use strict";
  const clean=v=>String(v||"").trim();
  const norm=v=>String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"");

  function loadImg(url){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error("image"));i.src=url;});}
  function rotateCanvas(img,deg,maxW=1500){
    const sc=Math.min(1,maxW/img.naturalWidth),w=Math.max(1,Math.round(img.naturalWidth*sc)),h=Math.max(1,Math.round(img.naturalHeight*sc));
    const r=((deg%360)+360)%360,c=document.createElement("canvas");
    c.width=(r===90||r===270)?h:w;c.height=(r===90||r===270)?w:h;
    const x=c.getContext("2d",{willReadFrequently:true});x.imageSmoothingEnabled=true;x.imageSmoothingQuality="high";x.save();
    if(r===90){x.translate(c.width,0);x.rotate(Math.PI/2)}else if(r===180){x.translate(c.width,c.height);x.rotate(Math.PI)}else if(r===270){x.translate(0,c.height);x.rotate(-Math.PI/2)}
    x.drawImage(img,0,0,w,h);x.restore();return c;
  }
  function cropRel(c,x,y,w,h){
    const sx=Math.max(0,Math.round(c.width*x)),sy=Math.max(0,Math.round(c.height*y));
    const sw=Math.min(c.width-sx,Math.round(c.width*w)),sh=Math.min(c.height-sy,Math.round(c.height*h));
    const z=document.createElement("canvas");z.width=Math.max(1,sw);z.height=Math.max(1,sh);
    const g=z.getContext("2d",{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality="high";g.drawImage(c,sx,sy,sw,sh,0,0,sw,sh);return z;
  }
  function enhance(c,scale=1.25){
    const z=document.createElement("canvas");z.width=Math.round(c.width*scale);z.height=Math.round(c.height*scale);
    const g=z.getContext("2d",{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality="high";g.drawImage(c,0,0,z.width,z.height);
    const im=g.getImageData(0,0,z.width,z.height),d=im.data;
    for(let p=0;p<d.length;p+=4){let y=.299*d[p]+.587*d[p+1]+.114*d[p+2];y=(y-128)*1.45+128;y=Math.max(0,Math.min(255,y));d[p]=d[p+1]=d[p+2]=y;}
    g.putImageData(im,0,0);return z;
  }
  function tokens(text){
    const t=String(text||"").toUpperCase().replace(/[|]/g,"I");
    const a=t.match(/[A-Z0-9]{3,10}/g)||[];return [...new Set(a)];
  }
  function gridCodes(){try{return Object.keys(gridMasterCache||{}).map(norm).filter(Boolean)}catch(e){return []}}
  function lev(a,b){const m=a.length,n=b.length,d=Array(n+1);for(let j=0;j<=n;j++)d[j]=j;for(let i=1;i<=m;i++){let p=d[0];d[0]=i;for(let j=1;j<=n;j++){const q=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]===b[j-1]?0:1));p=q;}}return d[n]}
  function candidateCodes(text){
    const t=String(text||"").toUpperCase().replace(/[^A-Z0-9\s:#-]/g," ");
    const out=[],seen=new Set();
    const add=v=>{v=norm(v);if(v.length<3||v.length>6||!/^[A-Z]{1,4}\d[A-Z0-9]{0,3}$/.test(v))return;if(!seen.has(v)){seen.add(v);out.push(v)}};
    (t.match(/\b[A-Z]{1,4}\s*[0-9ILO]\s*[A-Z0-9ILO]{0,3}\b/g)||[]).forEach(add);
    tokens(t).forEach(add);
    // Common OCR confusions: FK02/TG1K/W11 style codes.
    const known=gridCodes();
    if(known.length){
      for(const k of known){for(const tok of tokens(t).map(norm)){if(Math.abs(tok.length-k.length)<=1&&lev(tok,k)<=1)add(k);}}
    }
    return out;
  }
  async function validatedSort(text){
    const direct=candidateCodes(text),known=gridCodes();
    for(const c of direct) if(known.includes(c)) return c;
    const candidates=direct.slice(0,6);
    if(!candidates.length)return "";
    const checks=await Promise.all(candidates.map(async c=>{try{await fetchGridForSort(c);return c}catch(e){return ""}}));
    return checks.find(Boolean)||"";
  }
  function ocrRegions(c){
    // Broad enough to cover BOTH supplied layouts after rotation.
    return [
      enhance(c,1.0),
      enhance(cropRel(c,.05,.05,.90,.42),1.35),
      enhance(cropRel(c,.05,.28,.90,.44),1.35),
      enhance(cropRel(c,.05,.55,.90,.40),1.35)
    ];
  }
  function extractFastSort(text){
    const t=String(text||'').toUpperCase().replace(/[^A-Z0-9\s:#-]/g,' ');
    const known=gridCodes(); const toks=(t.match(/[A-Z0-9]{3,6}/g)||[]).map(norm); const candidates=[];
    const add=v=>{v=norm(v);if(v.length>=3&&v.length<=6&&/^[A-Z]{1,4}\d[A-Z0-9]{0,3}$/.test(v)&&!candidates.includes(v))candidates.push(v)};
    (t.match(/\b[A-Z]{1,4}\s*[0-9ILO]\s*[A-Z0-9ILO]{0,3}\b/g)||[]).forEach(add); toks.forEach(add);
    for(const c of candidates) if(known.includes(c)) return c;
    let best='',bd=99; for(const k of known) for(const tok of toks){if(Math.abs(tok.length-k.length)>1)continue;const d=lev(tok,k);if(d<=1&&d<bd){best=k;bd=d;}}
    return best;
  }
  function fastCanvas(img,deg,maxW=900){return cropRel(rotateCanvas(img,deg,maxW),.03,.04,.94,.92)}
  async function readSort(url,worker,preferredAngle,deadline){
    const img=await loadImg(url),order=[]; if(Number.isFinite(preferredAngle))order.push(preferredAngle); for(const a of [0,90,270,180])if(!order.includes(a))order.push(a);
    let last='';
    for(const a of order){if(Date.now()>deadline-250)break;try{
      const region=fastCanvas(img,a,900); await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-'});
      const remaining=Math.max(500,deadline-Date.now()-80);
      const r=await Promise.race([worker.recognize(region,{rotateAuto:false}),new Promise((_,rej)=>setTimeout(()=>rej(Error('ocr-timeout')),Math.min(remaining,1200)))]);
      last=r.data.text||''; const code=extractFastSort(last); if(code)return {code,angle:a,text:last};
    }catch(e){}}
    return {code:'',angle:order[0]??0,text:last};
  }
  async function barcode(url,preferredAngle,deadline){
    const img=await loadImg(url),angles=[]; if(Number.isFinite(preferredAngle))angles.push(preferredAngle); for(const a of [0,90,270,180])if(!angles.includes(a))angles.push(a);
    if('BarcodeDetector' in window){try{
      let fs=['qr_code','data_matrix','aztec','pdf417','code_128','code_39','code_93','codabar','ean_13','ean_8','upc_a','upc_e','itf'];
      if(BarcodeDetector.getSupportedFormats){const s=await BarcodeDetector.getSupportedFormats();fs=fs.filter(x=>s.includes(x));}
      if(fs.length){const d=new BarcodeDetector({formats:fs}); for(const a of angles){if(Date.now()>deadline-120)break;try{const found=await d.detect(rotateCanvas(img,a,1000))||[];const v=found.map(x=>String(x.rawValue||'').trim()).find(Boolean);if(v)return {values:[v],angle:a};}catch(e){}}}
    }catch(e){}
    }
    return {values:[],angle:null};
  }
  function runSheetRegions(c){
    return [
      enhance(cropRel(c,.05,.05,.90,.28),1.7),
      enhance(cropRel(c,.20,.18,.65,.38),1.7),
      enhance(cropRel(c,.10,.38,.80,.38),1.7),
      enhance(cropRel(c,.05,.65,.90,.30),1.7)
    ];
  }
  function extractRunSheet(text){
    const t=String(text||"").toUpperCase().replace(/\s+/g,"");
    let m=t.match(/DHRX[A-Z0-9]{5,20}/);if(m)return m[0];
    // Mixed printed IDs such as 246C53603.
    m=t.match(/[0-9]{2,7}[A-Z][0-9]{4,14}/);if(m)return m[0];
    // Numeric printed RunSheet IDs are allowed only when reasonably long.
    m=t.match(/\b[0-9]{6,18}\b/);if(m)return m[0];
    return "";
  }
  async function printedRunSheet(url,worker,preferredAngle){
    const img=await loadImg(url),order=[];if(Number.isFinite(preferredAngle))order.push(preferredAngle);for(const a of [0,90,270,180])if(!order.includes(a))order.push(a);
    for(const a of order){const c=rotateCanvas(img,a,1400);await worker.setParameters({tessedit_pageseg_mode:"7",tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"});for(const z of runSheetRegions(c)){try{const r=await worker.recognize(z,{rotateAuto:false});const id=extractRunSheet(r.data.text||"");if(id)return id;}catch(e){}}}
    return "";
  }
  async function processLabel33(mode,file){
    const s=state[mode],input=mode==='sorting'?$('#sortEmployeeId'):$('#putEmployeeId'); s.employeeId=input.value.trim(); if(!s.employeeId){toast('Employee ID is required.');return;}
    if(mode==='putting'){$('#putGridCard')?.classList.add('hidden');$('#putGridStatus').textContent='';}
    busy(true,'Reading label...'); let url=''; const deadline=Date.now()+4800;
    try{
      url=URL.createObjectURL(file); const preview=mode==='sorting'?$('#sortLabelPreview'):$('#putLabelPreview'); preview.innerHTML=`<img class="scanPreview ultraPreview" src="${url}" alt="Captured label">`;
      const gm=(typeof warmGridMaster==='function'?warmGridMaster():Promise.resolve()).catch(()=>{});
      const workerP=getOcrWorker(); const bp=barcode(url,null,deadline).catch(()=>({values:[],angle:null}));
      const worker=await Promise.race([workerP,new Promise((_,rej)=>setTimeout(()=>rej(Error('OCR engine is still loading. Please try again.')),1700))]);
      const sr=await readSort(url,worker,null,deadline); s.sortCode=sr.code||''; s.gridNo=''; s.rsId='';
      const bars=await Promise.race([bp,Promise.resolve({values:[],angle:null})]); if(bars.values.length)s.rsId=bars.values[0];
      if(!s.rsId){const compact=String(sr.text||'').toUpperCase().replace(/\s+/g,''); let m=compact.match(/DHRX[A-Z0-9]{5,20}/);if(m)s.rsId=m[0]; if(!s.rsId){m=compact.match(/[0-9]{2,7}[A-Z][0-9]{4,14}/);if(m)s.rsId=m[0];} if(!s.rsId){m=compact.match(/\b[0-9]{7,18}\b/);if(m)s.rsId=m[0];}}
      await gm; if(s.sortCode){try{s.gridNo=await fetchGridForSort(s.sortCode)}catch(e){}}
      await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:''}); showResult(mode); if(typeof styleResult==='function')styleResult(mode);
      if(!s.sortCode){toast('Sort Code not detected within 5 seconds. Keep the full label inside the frame.');return;}
      if(!s.gridNo){toast('Grid No not found for Sort Code: '+s.sortCode);return;}
      if(mode==='sorting'){await saveRecord(mode,'','SORTED');toast('Sorting completed.');} else {$('#putGridCard').classList.remove('hidden');$('#putGridStatus').textContent='Grid loaded. Open Grid Camera to continue.';toast('Label processed. Scan the Grid barcode.');}
    }catch(e){console.error(e);toast(e.message||'Could not read the label.');} finally {if(url)URL.revokeObjectURL(url);busy(false)}
  }
  window.readLabel=processLabel33;
  // v5.35: Android camera may need a short time after getUserMedia/play()
  // before videoWidth/videoHeight become available. Never fail immediately.
  if(typeof captureLabelPhoto==="function"){
    const btn=$("#capturePhoto");
    let waiting=false;
    async function waitForVideoReady(video,ms=6000){
      const start=Date.now();
      while(Date.now()-start<ms){
        if(video.readyState>=2 && video.videoWidth>0 && video.videoHeight>0) return true;
        try{await video.play();}catch(e){}
        await new Promise(r=>setTimeout(r,120));
      }
      return video.videoWidth>0 && video.videoHeight>0;
    }
    btn.onclick=async function(){
      if(waiting || !cameraMode)return;
      const video=$("#labelCamera");
      waiting=true; btn.disabled=true; btn.textContent="📷 Camera ready...";
      const ok=await waitForVideoReady(video,6000);
      if(!ok){
        waiting=false; btn.disabled=false; btn.textContent="📸 Capture Photo";
        toast("Camera is still starting. Please wait 1 second and try again.");
        return;
      }
      const canvas=$("#captureCanvas");
      canvas.width=video.videoWidth; canvas.height=video.videoHeight;
      const ctx=canvas.getContext("2d"); ctx.drawImage(video,0,0,canvas.width,canvas.height);
      canvas.toBlob(async blob=>{
        waiting=false; btn.disabled=false; btn.textContent="📸 Capture Photo";
        if(!blob){toast("Could not capture the photo.");return;}
        const mode=cameraMode;
        if(mode==="putting")hideLabelCameraKeepStream();else closeLabelCamera();
        await processLabel33(mode,blob);
      },"image/jpeg",.92);
    };
  }
})();
