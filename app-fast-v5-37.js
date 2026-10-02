// Grid Scanner By ArupD — v5.37 — deterministic two-label positional OCR + 5s deadline
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
  function wordInfo(w){
    const b=w&&w.bbox||{}; const text=norm(w&&w.text||'');
    return {text,x0:+b.x0||0,y0:+b.y0||0,x1:+b.x1||0,y1:+b.y1||0,conf:+(w&&w.confidence||0)};
  }
  function spatialSort(words,w,h){
    const ws=(words||[]).map(wordInfo).filter(x=>x.text);
    const known=gridCodes();
    const valid=v=>/^[A-Z]{1,4}\d[A-Z0-9]{0,3}$/.test(v)&&v.length>=3&&v.length<=6;
    const centerX=w/2;
    // Label type #1: the Sort Code is between the header KRV DC FMRTS and REV.
    const revs=ws.filter(x=>x.text==='REV');
    for(const rev of revs){
      const cand=ws.filter(x=>{
        if(x.text==='REV'||!valid(x.text)) return false;
        const cx=(x.x0+x.x1)/2, rx=(rev.x0+rev.x1)/2;
        const overlap=Math.max(0,Math.min(x.x1,rev.x1)-Math.max(x.x0,rev.x0));
        const nearX=Math.abs(cx-rx)<=Math.max((rev.x1-rev.x0)*2.2,w*.13)||overlap>0;
        const gap=rev.y0-x.y1;
        return nearX && gap>=-Math.max(8,h*.015) && gap<=h*.22;
      }).sort((a,b)=>{
        const da=rev.y0-a.y1, db=rev.y0-b.y1;
        const ka=known.includes(a.text)?0:1, kb=known.includes(b.text)?0:1;
        return ka-kb || Math.abs(((a.x0+a.x1)/2)-((rev.x0+rev.x1)/2))-Math.abs(((b.x0+b.x1)/2)-((rev.x0+rev.x1)/2)) || da-db;
      });
      if(cand.length)return cand[0].text;
    }
    // If REV itself is missed by OCR, use the physical center-column rule for label #1.
    // This rejects side-column codes such as KRV1 and keeps the code sitting under the header.
    const centerKnown=ws.filter(x=>known.includes(x.text)&&valid(x.text)).map(x=>({...x,dist:Math.abs(((x.x0+x.x1)/2)-centerX)}));
    const mid=centerKnown.filter(x=>x.y0>h*.25 && x.y1<h*.78 && Math.abs(((x.x0+x.x1)/2)-centerX)<w*.23).sort((a,b)=>a.dist-b.dist || a.y0-b.y0);
    if(mid.length)return mid[0].text;
    // Label type #2: a final/bold 4-character mixed code. Prefer GridMaster-valid codes.
    const four=ws.filter(x=>x.text.length===4&&/[A-Z]/.test(x.text)&&/\d/.test(x.text));
    const knownFour=four.filter(x=>known.includes(x.text)).sort((a,b)=>Math.abs(((a.x0+a.x1)/2)-centerX)-Math.abs(((b.x0+b.x1)/2)-centerX) || b.y1-a.y1);
    if(knownFour.length)return knownFour[0].text;
    return '';
  }
  function fuzzyGridFour(raw){
    const n=norm(raw), known=gridCodes();
    if(known.includes(n))return n;
    if(n.length!==4)return '';
    const conf={ '0':'O', 'O':'0', '1':'I', 'I':'1', '5':'S', 'S':'5', '2':'Z', 'Z':'2', '6':'G', 'G':'6', '7':'T', 'T':'7' };
    let best='',bd=99;
    for(const k of known){
      if(k.length!==4)continue;
      let d=0;
      for(let i=0;i<4;i++){ if(n[i]===k[i])continue; if(conf[n[i]]===k[i])continue; d++; }
      // One extra OCR swap is allowed for the common T/1 and I/1 confusion.
      if(d<=2 && d<bd){best=k;bd=d;}
    }
    return best;
  }
  async function targetedSortFromRev(region,words,worker,deadline){
    const ws=(words||[]).map(wordInfo).filter(x=>x.text), rev=ws.find(x=>x.text==='REV');
    if(!rev || Date.now()>deadline-500) return '';
    // The user's label #1 rule: code is physically between KRV DC FMRTS and REV,
    // i.e. immediately above REV. OCR only that narrow band so side-column codes
    // such as KRV1 cannot win.
    const cx=(rev.x0+rev.x1)/2, rw=Math.max(40,rev.x1-rev.x0);
    const x=Math.max(0,cx-rw*2.8), y=Math.max(0,rev.y0-Math.max(150,region.height*.15));
    const w=Math.min(region.width-x,Math.max(100,rw*5.6)), h=Math.min(region.height-y,Math.max(65,rev.y0-y+8));
    const z=enhance(cropRel(region,x/region.width,y/region.height,w/region.width,h/region.height),2.0);
    try{
      await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
      const remain=Math.max(300,deadline-Date.now()-80);
      const r=await Promise.race([worker.recognize(z,{rotateAuto:false}),new Promise((_,rej)=>setTimeout(()=>rej(Error('target-timeout')),Math.min(remain,700)))]);
      const code=extractFastSort(r.data.text||'');
      if(code)return code;
      const raw=String(r.data.text||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
      const known=gridCodes();
      const four=raw.match(/[A-Z]{1,4}[0-9][A-Z0-9]{0,3}/g)||[];
      for(const c of four){const n=norm(c);const f=fuzzyGridFour(n);if(f)return f}
    }catch(e){}
    return '';
  }
  async function targetedFourCode(region,worker,deadline){
    if(Date.now()>deadline-500)return '';
    // Label #2 rule: the final bold 4-character mixed alpha/numeric code is the Sort Code.
    // OCR the lower/right label area first; only accept a code present in GridMaster.
    const zones=[
      cropRel(region,.30,.18,.65,.72),
      cropRel(region,.05,.10,.90,.85)
    ];
    const known=gridCodes();
    for(const z0 of zones){
      if(Date.now()>deadline-350)break;
      const z=enhance(z0,1.8);
      try{
        await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
        const remain=Math.max(300,deadline-Date.now()-60);
        const r=await Promise.race([worker.recognize(z,{rotateAuto:false}),new Promise((_,rej)=>setTimeout(()=>rej(Error('four-timeout')),Math.min(remain,700)))]);
        const raw=String(r.data.text||'').toUpperCase();
        const vals=(raw.match(/[A-Z0-9]{4}/g)||[]).map(norm).filter(v=>/^[A-Z0-9]{4}$/.test(v));
        const knownVals=vals.map(v=>fuzzyGridFour(v)).filter(Boolean);
        if(knownVals.length)return knownVals[knownVals.length-1];
      }catch(e){}
    }
    return '';
  }

  async function readSort(url,worker,preferredAngle,deadline){
    const img=await loadImg(url),order=[]; if(Number.isFinite(preferredAngle))order.push(preferredAngle); for(const a of [0,90,270,180])if(!order.includes(a))order.push(a);
    let last='', lastWords=[];
    for(const a of order){
      if(Date.now()>deadline-700)break;
      try{
        const region=fastCanvas(img,a,1000);
        await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-'});
        const remaining=Math.max(600,deadline-Date.now()-100);
        const r=await Promise.race([worker.recognize(region,{rotateAuto:false}),new Promise((_,rej)=>setTimeout(()=>rej(Error('ocr-timeout')),Math.min(remaining,1050)))]);
        last=r.data.text||''; lastWords=r.data.words||[];
        // 1) Highest priority: positional rule around REV.
        let code=spatialSort(lastWords,region.width,region.height);
        if(code)return {code,angle:a,text:last,words:lastWords};
        if(/\bREV\b/i.test(last) || lastWords.some(w=>norm(w.text)==='REV')){
          code=await targetedSortFromRev(region,lastWords,worker,deadline);
          if(code)return {code,angle:a,text:last,words:lastWords};
        }
        // 2) Label #2: final bold 4-character code. Only accept GridMaster codes.
        code=await targetedFourCode(region,worker,deadline);
        if(code)return {code,angle:a,text:last,words:lastWords};
        // 3) Generic fallback, but only GridMaster-valid values.
        code=extractFastSort(last);
        if(code)return {code,angle:a,text:last,words:lastWords};
      }catch(e){}
    }
    return {code:'',angle:order[0]??0,text:last,words:lastWords};
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
  async function printedRunSheetFast(url,worker,angle,deadline){
    if(Date.now()>deadline-500)return '';
    try{
      const img=await loadImg(url), c=rotateCanvas(img,Number.isFinite(angle)?angle:0,1200);
      // Label #2: number printed directly under the linear barcode. Try the central
      // barcode/text band first, then a broader band. One OCR pass per zone only.
      const zones=[
        cropRel(c,.18,.16,.70,.48),
        cropRel(c,.05,.05,.90,.55)
      ];
      for(const z0 of zones){
        if(Date.now()>deadline-300)break;
        const z=enhance(z0,1.7);
        await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
        const remain=Math.max(250,deadline-Date.now()-50);
        const r=await Promise.race([worker.recognize(z,{rotateAuto:false}),new Promise((_,rej)=>setTimeout(()=>rej(Error('rs-timeout')),Math.min(remain,650)))]);
        const raw=String(r.data.text||'').toUpperCase().replace(/\s+/g,'');
        let m=raw.match(/\b\d{9,10}\b/); if(m)return m[0];
        m=raw.match(/[0-9]{2,7}[A-Z][0-9]{4,14}/); if(m)return m[0];
      }
    }catch(e){}
    return '';
  }

  async function processLabel33(mode,file){
    const s=state[mode],input=mode==='sorting'?$('#sortEmployeeId'):$('#putEmployeeId'); s.employeeId=input.value.trim(); if(!s.employeeId){toast('Employee ID is required.');return;}
    if(mode==='putting'){$('#putGridCard')?.classList.add('hidden');$('#putGridStatus').textContent='';}
    busy(true,'Reading label...'); let url=''; const deadline=Date.now()+4800;
    try{
      url=URL.createObjectURL(file); const preview=mode==='sorting'?$('#sortLabelPreview'):$('#putLabelPreview'); preview.innerHTML=`<img class="scanPreview ultraPreview" src="${url}" alt="Captured label">`;
      const gm=(typeof warmGridMaster==='function'?warmGridMaster():Promise.resolve()).catch(()=>{});
      const workerP=getOcrWorker();
      const bp=barcode(url,null,deadline).catch(()=>({values:[],angle:null}));
      const worker=await Promise.race([workerP,new Promise((_,rej)=>setTimeout(()=>rej(Error('OCR engine is still loading. Please try again.')),1500))]);
      const sr=await readSort(url,worker,null,deadline);
      s.sortCode=sr.code||''; s.gridNo=''; s.rsId='';
      // Barcode gets a real short wait; previous version accidentally returned an empty
      // barcode result immediately. Keep it bounded so total label processing stays <=5s.
      const bars=await Promise.race([bp,new Promise(r=>setTimeout(()=>r({values:[],angle:null}),850))]);
      if(bars.values.length){
        const bv=String(bars.values[0]||'').trim();
        if(/^DHRX[A-Z0-9]{5,20}$/i.test(bv)||/^\d{7,18}$/.test(bv)||/^\d{2,7}[A-Z]\d{4,14}$/i.test(bv))s.rsId=bv;
      }
      // Printed RunSheet rules: label #1 has DHRXSF... under REV/KRV; label #2 has
      // 9-10 digit number below its barcode. OCR text from the same fast pass is used first.
      if(!s.rsId){const compact=String(sr.text||'').toUpperCase().replace(/\s+/g,''); let m=compact.match(/DHRX[A-Z0-9]{5,20}/);if(m)s.rsId=m[0]; if(!s.rsId){m=compact.match(/\b\d{9,10}\b/);if(m)s.rsId=m[0];} if(!s.rsId){m=compact.match(/[0-9]{2,7}[A-Z][0-9]{4,14}/);if(m)s.rsId=m[0];}}
      if(!s.rsId) s.rsId=await printedRunSheetFast(url,worker,sr.angle,deadline);
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
