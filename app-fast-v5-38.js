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
    const valid4=v=>/^[A-Z0-9]{4}$/.test(v)&&/[A-Z]/.test(v)&&/\d/.test(v);
    const validCode=v=>/^[A-Z]{1,4}\d[A-Z0-9]{0,3}$/.test(v)&&v.length>=3&&v.length<=6;
    const cx=w/2;
    // TYPE 2: KRV DC FMRTS ... [SORT CODE] ... REV ... KRV ... [RUNSHEET]
    // The sort code is physically between the header and REV. Do NOT require GridMaster
    // here; detection must work even if the network/cache is unavailable.
    const revs=ws.filter(x=>x.text==='REV');
    for(const rev of revs){
      const rx=(rev.x0+rev.x1)/2;
      const cand=ws.filter(x=>{
        if(x.text==='REV'||!validCode(x.text)) return false;
        const xmid=(x.x0+x.x1)/2;
        const xnear=Math.abs(xmid-rx)<=Math.max(100,w*.18);
        const gap=rev.y0-x.y1;
        return xnear && gap>=-8 && gap<=Math.max(150,h*.30);
      }).sort((a,b)=>{
        const da=Math.abs(rev.y0-a.y1), db=Math.abs(rev.y0-b.y1);
        const xa=Math.abs(((a.x0+a.x1)/2)-rx), xb=Math.abs(((b.x0+b.x1)/2)-rx);
        return da-db || xa-xb;
      });
      if(cand.length)return cand[0].text;
    }
    // If REV was not recognized, the Type-2 sort code is the short mixed code in the
    // central column, above the QR/RunSheet area. Prefer 4 chars and central position.
    const center=ws.filter(x=>validCode(x.text)).map(x=>({...x,
      dist:Math.abs(((x.x0+x.x1)/2)-cx),
      area:(x.y0/h)
    })).filter(x=>x.dist<w*.22 && x.area>.18 && x.area<.68)
      .sort((a,b)=>(a.text.length===4?0:1)-(b.text.length===4?0:1)||a.dist-b.dist||a.area-b.area);
    if(center.length)return center[0].text;

    // TYPE 1: the bold black 4-character code (e.g. TG1K) is the Sort Code.
    // It is normally on the right side of the label. Do not require GridMaster.
    const four=ws.filter(x=>valid4(x.text));
    const right=four.filter(x=>((x.x0+x.x1)/2)>w*.50).sort((a,b)=>{
      const ay=Math.abs(((a.y0+a.y1)/2)-h*.50), by=Math.abs(((b.y0+b.y1)/2)-h*.50);
      return ay-by;
    });
    if(right.length)return right[0].text;
    if(four.length)return four[0].text;
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
    if(Date.now()>deadline-450)return '';
    // TYPE 1: the bold 4-character code is the Sort Code. OCR the right half first.
    const zones=[
      cropRel(region,.48,.18,.48,.64),
      cropRel(region,.30,.08,.68,.82)
    ];
    for(const z0 of zones){
      if(Date.now()>deadline-300)break;
      try{
        const z=enhance(z0,2.0);
        await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
        const remain=Math.max(250,deadline-Date.now()-40);
        const r=await Promise.race([
          worker.recognize(z,{rotateAuto:false}),
          new Promise((_,rej)=>setTimeout(()=>rej(Error('four-timeout')),Math.min(remain,600)))
        ]);
        const vals=(String(r.data.text||'').toUpperCase().match(/[A-Z0-9]{4}/g)||[]).map(norm);
        const mixed=vals.filter(v=>/^[A-Z0-9]{4}$/.test(v)&&/[A-Z]/.test(v)&&/\d/.test(v));
        if(mixed.length)return mixed[0];
      }catch(e){}
    }
    return '';
  }

  function textRuleSort(text){
    const raw=String(text||'').toUpperCase();
    const lines=raw.split(/\r?\n/).map(x=>x.replace(/[^A-Z0-9 ]/g,' ').trim()).filter(Boolean);
    // TYPE 2: code immediately before REV in the OCR stream.
    for(let i=0;i<lines.length;i++){
      if(/\bREV\b/.test(lines[i])){
        const before=(lines[i-1]||'')+' '+lines[i];
        const vals=(before.match(/[A-Z0-9]{3,6}/g)||[]).map(norm);
        const mixed=vals.filter(v=>/^[A-Z]{1,4}\d[A-Z0-9]{0,3}$/.test(v));
        if(mixed.length)return mixed[mixed.length-1];
      }
    }
    // TYPE 1: bold black four-character alphanumeric code.
    const vals=(raw.match(/[A-Z0-9]{4}/g)||[]).map(norm).filter(v=>/[A-Z]/.test(v)&&/\d/.test(v));
    if(vals.length)return vals[vals.length-1];
    return '';
  }
  async function readSort(url,worker,preferredAngle,deadline){
    const img=await loadImg(url),order=[];
    if(Number.isFinite(preferredAngle))order.push(preferredAngle);
    for(const a of [0,90,270,180])if(!order.includes(a))order.push(a);
    let best={code:'',angle:order[0]??0,text:'',words:[],score:-1};
    for(const a of order){
      if(Date.now()>deadline-1000)break;
      try{
        const region=fastCanvas(img,a,1200);
        await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-'});
        const remaining=Math.max(550,deadline-Date.now()-80);
        const r=await Promise.race([
          worker.recognize(region,{rotateAuto:false}),
          new Promise((_,rej)=>setTimeout(()=>rej(Error('ocr-timeout')),Math.min(remaining,850)))
        ]);
        const text=r.data.text||'', words=r.data.words||[];
        let code=spatialSort(words,region.width,region.height);
        if(!code)code=textRuleSort(text);
        const score=(code?1000:0)+((/\bREV\b/i.test(text))?200:0)+(String(text).match(/[A-Z0-9]{3,}/g)||[]).length;
        if(code)return {code,angle:a,text,words};
        if(score>best.score)best={code:'',angle:a,text,words,score};
      }catch(e){}
    }
    // One focused retry only, using the most informative orientation found above.
    if(Date.now()<deadline-350){
      try{
        const region=fastCanvas(img,best.angle,1400);
        let code=await targetedSortFromRev(region,best.words,worker,deadline);
        if(!code)code=await targetedFourCode(region,worker,deadline);
        if(!code)code=textRuleSort(best.text);
        if(code)return {code,angle:best.angle,text:best.text,words:best.words};
      }catch(e){}
    }
    return best;
  }
  async function barcode(url,preferredAngle,deadline){
    const img=await loadImg(url),angles=[];
    if(Number.isFinite(preferredAngle))angles.push(preferredAngle);
    for(const a of [0,90,270,180])if(!angles.includes(a))angles.push(a);
    if('BarcodeDetector' in window){try{
      let fs=['qr_code','data_matrix','aztec','pdf417','code_128','code_39','code_93','codabar','ean_13','ean_8','upc_a','upc_e','itf'];
      if(BarcodeDetector.getSupportedFormats){const s=await BarcodeDetector.getSupportedFormats();fs=fs.filter(x=>s.includes(x));}
      if(fs.length){const d=new BarcodeDetector({formats:fs});
        for(const a of angles){if(Date.now()>deadline-350)break;try{
          const found=await d.detect(rotateCanvas(img,a,1200))||[];
          const v=found.map(x=>String(x.rawValue||'').trim()).find(Boolean);
          if(v)return {values:[v],angle:a};
        }catch(e){}}
      }
    }catch(e){}
    }
    // Short ZXing fallback for devices where BarcodeDetector does not decode this label.
    if(typeof ZXingBrowser!=='undefined' && Date.now()<deadline-500){try{
      const reader=new ZXingBrowser.BrowserMultiFormatReader();
      const r=await Promise.race([
        reader.decodeFromImageElement(img),
        new Promise((_,rej)=>setTimeout(()=>rej(Error('barcode-timeout')),700))
      ]);
      const v=r?.getText?.()||''; if(v.trim())return {values:[v.trim()],angle:null};
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
    const t=String(text||'').toUpperCase().replace(/\s+/g,'');
    // TYPE 2: printed RunSheet under REV/KRV, e.g. DHRXSF842538839.
    let m=t.match(/DHRX[A-Z0-9]{6,20}/); if(m)return m[0];
    // TYPE 1: 9-10 digit number below the barcode.
    const nums=t.match(/\d{9,10}/g)||[]; if(nums.length)return nums[0];
    // Some labels may print an alphanumeric barcode value.
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
    busy(true,'Reading label...'); let url=''; const deadline=Date.now()+4800;
    try{
      url=URL.createObjectURL(file);
      const preview=mode==='sorting'?$('#sortLabelPreview'):$('#putLabelPreview');
      preview.innerHTML=`<img class="scanPreview ultraPreview" src="${url}" alt="Captured label">`;
      // Start everything together. OCR worker is pre-warmed by page load; barcode is best-effort.
      const gm=(typeof warmGridMaster==='function'?warmGridMaster():Promise.resolve()).catch(()=>{});
      const workerP=getOcrWorker();
      const bp=barcode(url,null,deadline).catch(()=>({values:[],angle:null}));
      const worker=await Promise.race([workerP,new Promise((_,rej)=>setTimeout(()=>rej(Error('OCR engine is still loading. Please try again.')),1200))]);
      const sr=await readSort(url,worker,null,deadline);
      s.sortCode=sr.code||''; s.gridNo=''; s.rsId='';

      // Barcode gets a bounded wait, never the source of a long delay.
      const bars=await Promise.race([bp,new Promise(r=>setTimeout(()=>r({values:[],angle:null}),900))]);
      if(bars.values.length){
        const bv=String(bars.values[0]||'').trim();
        if(/^DHRX[A-Z0-9]{6,20}$/i.test(bv)||/^\d{9,18}$/.test(bv)||/^\d{2,7}[A-Z]\d{4,14}$/i.test(bv))s.rsId=bv;
      }
      // Printed RunSheet from the OCR pass first.
      if(!s.rsId){s.rsId=extractRunSheet(sr.text||'');}
      // If Type-2 DHRX was not visible in the main OCR, do one focused center/lower pass.
      if(!s.rsId && Date.now()<deadline-550){
        try{
          const img=await loadImg(url), c=rotateCanvas(img,sr.angle||0,1200);
          const z=enhance(cropRel(c,.20,.35,.60,.50),1.8);
          await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
          const remain=Math.max(250,deadline-Date.now()-40);
          const rr=await Promise.race([worker.recognize(z,{rotateAuto:false}),new Promise((_,rej)=>setTimeout(()=>rej(Error('rs-focus-timeout')),Math.min(remain,650)))]);
          s.rsId=extractRunSheet(rr.data.text||'');
        }catch(e){}
      }
      // Grid lookup happens AFTER visual detection. Detection itself never depends on GridMaster.
      if(s.sortCode){try{s.gridNo=await fetchGridForSort(s.sortCode)}catch(e){} }
      await gm;
      if(!s.gridNo && s.sortCode){try{s.gridNo=await fetchGridForSort(s.sortCode)}catch(e){} }
      await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:''});
      showResult(mode); if(typeof styleResult==='function')styleResult(mode);
      if(!s.sortCode){toast('Sort Code not detected. Keep the whole label inside the frame.');return;}
      if(!s.gridNo){toast('Grid No not found for Sort Code: '+s.sortCode);return;}
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
