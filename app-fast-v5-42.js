// Grid Scanner By ArupD — v5.42 — barcode-first, one-pass OCR, strict 5s cap
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
  function normalizeSortCandidate(v){
    let n=norm(v);
    if(n.length!==4)return n;
    // OCR frequently turns 1 into I/l and 5 into S on these small labels.
    // The supplied Sort Codes are letter+digit alphanumeric codes; normalize
    // only the digit position instead of changing arbitrary text.
    if(/^[A-Z]{2}[ILO0][A-Z]$/.test(n)){
      n=n.slice(0,2)+({I:'1',L:'1',O:'0','0':'0'}[n[2]]||n[2])+n[3];
    }
    if(/^[A-Z]{3}[ILO0]$/.test(n)){
      n=n.slice(0,3)+({I:'1',L:'1',O:'0','0':'0'}[n[3]]||n[3]);
    }
    return n;
  }
  function fuzzyKnownCode(raw,maxDist=2){
    const n=normalizeSortCandidate(raw), known=gridCodes();
    if(known.includes(n))return n;
    let best='',bd=99;
    const conf={I:'1',L:'1',O:'0','0':'O',S:'5','5':'S',Z:'2','2':'Z',G:'6','6':'G',T:'7','7':'T'};
    for(const k of known){
      if(k.length!==n.length)continue;
      let d=0;
      for(let i=0;i<n.length;i++){
        if(n[i]===k[i])continue;
        if(conf[n[i]]===k[i])continue;
        d++;
      }
      if(d<=maxDist && d<bd){best=k;bd=d;}
    }
    return best;
  }
  function validSortShape(v){
    v=normalizeSortCandidate(v);
    return v.length>=3&&v.length<=6&&/^[A-Z]{1,4}\d[A-Z0-9]{0,3}$/.test(v);
  }
  function spatialSort(words,w,h){
    const ws=(words||[]).map(wordInfo).filter(x=>x.text);
    const cx=w/2;

    // TYPE 2 (KRV DC FMRTS label): Sort Code is between the header and REV.
    // Look immediately above REV and allow OCR variants such as MBAI -> MSA1.
    const revs=ws.filter(x=>x.text==='REV' || lev(x.text,'REV')<=1);
    for(const rev of revs){
      const rx=(rev.x0+rev.x1)/2;
      const cand=ws.filter(x=>{
        if(x===rev || !validSortShape(x.text))return false;
        const xmid=(x.x0+x.x1)/2;
        const gap=rev.y0-x.y1;
        return Math.abs(xmid-rx)<=Math.max(110,w*.24) && gap>=-12 && gap<=Math.max(170,h*.32);
      }).sort((a,b)=>{
        const da=Math.abs(rev.y0-a.y1),db=Math.abs(rev.y0-b.y1);
        const xa=Math.abs(((a.x0+a.x1)/2)-rx),xb=Math.abs(((b.x0+b.x1)/2)-rx);
        return da-db||xa-xb;
      });
      for(const c of cand){
        const raw=normalizeSortCandidate(c.text);
        const f=fuzzyKnownCode(raw,2);
        if(f)return f;
        if(validSortShape(raw))return raw;
      }
    }

    // Same Type-2 rule when OCR did not recognize REV exactly: central mixed
    // code above the QR/RunSheet area. Prefer 4-character candidates.
    const center=ws.filter(x=>validSortShape(x.text)).map(x=>({...x,
      dist:Math.abs(((x.x0+x.x1)/2)-cx), area:(x.y0/h)
    })).filter(x=>x.dist<w*.25&&x.area>.15&&x.area<.70)
      .sort((a,b)=>(a.text.length===4?0:1)-(b.text.length===4?0:1)||a.dist-b.dist||a.area-b.area);
    for(const c of center){
      const f=fuzzyKnownCode(c.text,2); if(f)return f;
      const n=normalizeSortCandidate(c.text); if(validSortShape(n))return n;
    }

    // TYPE 1 (TG1K label): DO NOT use any left/right position rule.
    // The Sort Code is simply the bold black 4-character alphanumeric code
    // printed on this label. OCR may return it anywhere in the rotated frame.
    const four=ws.filter(x=>/^[A-Z0-9]{4}$/.test(x.text)&&/[A-Z]/.test(x.text)&&/\d|[ILO]/.test(x.text));
    for(const c of four){
      const f=fuzzyKnownCode(c.text,2); if(f)return f;
      const n=normalizeSortCandidate(c.text); if(/^[A-Z]{1,3}\d[A-Z0-9]$/.test(n))return n;
    }
    return '';
  }
  function textRuleSort(text){
    const raw=String(text||'').toUpperCase();
    const lines=raw.split(/\r?\n/).map(x=>x.replace(/[^A-Z0-9 ]/g,' ').trim()).filter(Boolean);
    for(let i=0;i<lines.length;i++){
      if(/\bREV\b/.test(lines[i])){
        const before=(lines[i-1]||'')+' '+lines[i];
        const vals=(before.match(/[A-Z0-9]{3,6}/g)||[]).map(normalizeSortCandidate);
        for(const v of vals){const f=fuzzyKnownCode(v,2);if(f)return f;}
        const mixed=vals.filter(validSortShape); if(mixed.length)return mixed[mixed.length-1];
      }
    }
    const vals=(raw.match(/[A-Z0-9]{4}/g)||[]).map(normalizeSortCandidate);
    for(const v of vals){
      const f=fuzzyKnownCode(v,2); if(f)return f;
      if(/^[A-Z]{1,3}\d[A-Z0-9]$/.test(v))return v;
    }
    return '';
  }
  function barcodeAngleDeg(item){
    try{
      const pts=item && item.cornerPoints;
      if(Array.isArray(pts) && pts.length>=2){
        let best=null,bd=0;
        for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){
          const dx=(pts[j].x||0)-(pts[i].x||0), dy=(pts[j].y||0)-(pts[i].y||0), d=dx*dx+dy*dy;
          if(d>bd){bd=d;best={dx,dy};}
        }
        if(best){let a=Math.atan2(best.dy,best.dx)*180/Math.PI; if(a<0)a+=180; return a>=45&&a<135?90:0;}
      }
      const b=item&&item.boundingBox; if(b&&b.width&&b.height) return b.height>b.width?90:0;
    }catch(e){}
    return 0;
  }
  async function detectFastBarcode(url,deadline){
    const empty={value:'',angle:null,type:''};
    try{
      const img=await loadImg(url);
      // Barcode/QR is the fastest and most reliable orientation anchor.
      if('BarcodeDetector' in window){
        let fs=['qr_code','data_matrix','code_128','code_39','code_93','codabar','ean_13','ean_8','upc_a','upc_e','itf','pdf417','aztec'];
        try{if(BarcodeDetector.getSupportedFormats){const sup=await BarcodeDetector.getSupportedFormats();fs=fs.filter(x=>sup.includes(x));}}catch(e){}
        if(fs.length){
          const d=new BarcodeDetector({formats:fs});
          for(const a of [0,90,270,180]){
            if(Date.now()>deadline-1700)break;
            try{
              const found=await d.detect(rotateCanvas(img,a,1200));
              const item=found&&found.find(x=>String(x.rawValue||'').trim());
              if(item){
                const value=String(item.rawValue||'').trim();
                if(value)return {value,angle:a,type:String(item.format||'')};
              }
            }catch(e){}
          }
        }
      }
      // Short ZXing fallback. The library is already loaded by index.html.
      if(typeof ZXingBrowser!=='undefined' && Date.now()<deadline-650){
        try{
          const reader=new ZXingBrowser.BrowserMultiFormatReader();
          const angles=[0,90,270,180];
          for(const a of angles){
            if(Date.now()>deadline-500)break;
            try{
              const c=rotateCanvas(img,a,1200);
              const data=c.toDataURL('image/jpeg',0.86);
              const im=new Image(); im.src=data; await im.decode();
              const r=await Promise.race([
                reader.decodeFromImageElement(im),
                new Promise((_,rej)=>setTimeout(()=>rej(Error('barcode-timeout')),520))
              ]);
              const value=r?.getText?.()||'';
              if(String(value).trim()) return {value:String(value).trim(),angle:a,type:'zxing'};
            }catch(e){}
          }
        }catch(e){}
      }
    }catch(e){}
    return empty;
  }
  function preferredOcrAngles(barAngle){
    if(barAngle===90)return [90,270];
    if(barAngle===270)return [270,90];
    if(barAngle===180)return [180,0];
    return [0,90,270,180];
  }
  function sortOcrCanvas(img,angle){
    const c=rotateCanvas(img,angle,1100);
    return enhance(c,Math.min(1.35,1100/Math.max(c.width,1)));
  }
  async function readSort(url,worker,preferredAngle,deadline){
    const img=await loadImg(url);
    const angles=preferredOcrAngles(Number.isFinite(preferredAngle)?preferredAngle:null);
    let best={code:'',angle:angles[0]||0,text:'',words:[],score:-1};
    for(let i=0;i<angles.length;i++){
      const a=angles[i];
      if(Date.now()>deadline-450)break;
      try{
        const region=sortOcrCanvas(img,a);
        await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
        const remain=Math.max(500,deadline-Date.now()-180);
        const r=await Promise.race([
          worker.recognize(region,{rotateAuto:false}),
          new Promise((_,rej)=>setTimeout(()=>rej(Error('ocr-timeout')),Math.min(remain,1450)))
        ]);
        const text=r.data.text||'',words=r.data.words||[];
        const code=spatialSort(words,region.width,region.height)||textRuleSort(text);
        const score=(code?1000:0)+((/\bREV\b/i.test(text))?250:0)+((text.match(/[A-Z0-9]{3,}/g)||[]).length);
        if(score>best.score)best={code:code||'',angle:a,text,words,score};
        if(code)return best;
      }catch(e){}
      // With a barcode angle, one OCR pass is the normal path. Only try the
      // next orientation when the first pass failed and there is still time.
      if(Number.isFinite(preferredAngle) && i===0 && Date.now()<deadline-1500)continue;
      if(!Number.isFinite(preferredAngle) && i>=1)break;
    }
    return best;
  }
  function runSheetRegions(c){
    return [
      enhance(cropRel(c,.05,.05,.90,.28),1.7),
      enhance(cropRel(c,.20,.18,.65,.38),1.7),
      enhance(cropRel(c,.10,.38,.80,.38),1.7),
      enhance(cropRel(c,.05,.65,.90,.30),1.7)
    ];
  }
  function extractRunSheet(text,isType1=false){
    const t=String(text||'').toUpperCase().replace(/\s+/g,'');
    // TYPE 2: printed RunSheet such as DHRXSF842538839.
    let m=t.match(/DHRX[A-Z0-9]{6,20}/); if(m)return m[0];
    if(isType1)return '';
    // Never treat a date/time as a Type-1 RunSheet ID.
    const nums=t.match(/\d{9,18}/g)||[];
    for(const n of nums){if(!/^20\d{7,10}$/.test(n))return n;}
    m=t.match(/[0-9]{2,7}[A-Z][0-9]{4,14}/); if(m)return m[0];
    return '';
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
    const s=state[mode],input=mode==='sorting'?$('#sortEmployeeId'):$('#putEmployeeId');
    s.employeeId=input.value.trim(); if(!s.employeeId){toast('Employee ID is required.');return;}
    if(mode==='putting'){$('#putGridCard')?.classList.add('hidden');$('#putGridStatus').textContent='';}
    busy(true,'Reading label…'); let url=''; const deadline=Date.now()+4700;
    try{
      url=URL.createObjectURL(file);
      const preview=mode==='sorting'?$('#sortLabelPreview'):$('#putLabelPreview');
      preview.innerHTML=`<img class="scanPreview ultraPreview" src="${url}" alt="Captured label">`;
      const gm=(typeof warmGridMaster==='function'?warmGridMaster():Promise.resolve()).catch(()=>{});
      const workerP=getOcrWorker();
      // Barcode first: it gives us orientation and, when present, the exact RunSheet ID.
      const bcode=await detectFastBarcode(url,deadline);
      if(Date.now()>deadline-700) throw Error('Scan timed out. Please capture the label closer.');
      const worker=await Promise.race([
        workerP,
        new Promise((_,rej)=>setTimeout(()=>rej(Error('OCR engine is still loading. Open the app once and wait for Scanner Ready before scanning.')),Math.max(400,deadline-Date.now()-250)))
      ]);
      const sr=await readSort(url,worker,Number.isFinite(bcode.angle)?bcode.angle:null,deadline);
      s.sortCode=sr.code||''; s.gridNo=''; s.rsId='';
      const bv=String(bcode.value||'').trim();
      // Barcode value is authoritative for RunSheet. Do not OCR a date/time into it.
      if(bv && (/^DHRX[A-Z0-9]{6,20}$/i.test(bv)||/^\d{9,18}$/.test(bv)||/^[0-9]{2,7}[A-Z][0-9]{4,14}$/i.test(bv))) s.rsId=bv;
      const isType1=!!(s.sortCode && /^[A-Z0-9]{4}$/.test(s.sortCode) && /[A-Z]/.test(s.sortCode));
      if(!s.rsId) s.rsId=extractRunSheet(sr.text||'',isType1);
      // Type 1: if barcode failed, do NOT use the printed date/time as RunSheet ID.
      // Type 2: one small focused OCR fallback may recover printed DHRX... within the cap.
      if(!s.rsId && !isType1 && Date.now()<deadline-700){
        try{
          const img=await loadImg(url),c=rotateCanvas(img,sr.angle||bcode.angle||0,1200);
          const z=enhance(cropRel(c,.05,.10,.90,.70),1.45);
          await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
          const remain=Math.max(300,deadline-Date.now()-80);
          const rr=await Promise.race([worker.recognize(z,{rotateAuto:false}),new Promise((_,rej)=>setTimeout(()=>rej(Error('rs-timeout')),Math.min(remain,700)))]);
          s.rsId=extractRunSheet(rr.data.text||'',false);
        }catch(e){}
      }
      if(s.sortCode){try{s.gridNo=await Promise.race([fetchGridForSort(s.sortCode),new Promise(r=>setTimeout(()=>r(''),650))])}catch(e){} }
      await gm;
      if(!s.gridNo && s.sortCode){try{s.gridNo=gridMasterCache[normalize(s.sortCode)]||''}catch(e){} }
      await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:''});
      showResult(mode); if(typeof styleResult==='function')styleResult(mode);
      if(!s.sortCode){toast('Sort Code not detected within 5 seconds.');return;}
      if(!s.gridNo){toast('Sort Code found. Grid is still loading.');return;}
      if(mode==='sorting'){await saveRecord(mode,'','SORTED');toast('Sorting completed.');}
      else {$('#putGridCard').classList.remove('hidden');$('#putGridStatus').textContent='Grid loaded. Open Grid Camera to continue.';toast('Label processed. Scan the Grid barcode.');}
    }catch(e){console.error(e);toast(e.message||'Could not read the label.');}
    finally{if(url)URL.revokeObjectURL(url);busy(false)}
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
