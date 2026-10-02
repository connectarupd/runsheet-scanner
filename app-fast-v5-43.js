// Grid Scanner By ArupD — v5.44
// Deterministic 2-label logic: barcode = RunSheet, bold 4-char GridMaster code = Sort Code.
(function(){
  'use strict';
  const clean=v=>String(v||'').trim();
  const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const DEAD_MS=4800;
  const OCR_MS=3000;

  function resetScan(mode){
    const s=state[mode];
    s.label=null; s.rsId=''; s.sortCode=''; s.gridNo='';
    const box=mode==='sorting'?$('#sortResult'):$('#putResult');
    if(box){box.classList.add('hidden');box.innerHTML='';}
    const prev=mode==='sorting'?$('#sortLabelPreview'):$('#putLabelPreview');
    if(prev) prev.innerHTML='';
    if(mode==='putting'){
      $('#putGridCard')?.classList.add('hidden');
      $('#putGridStatus').textContent='';
    }
  }

  function loadImg(url){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('image'));i.src=url;});}
  function rotateCanvas(img,deg,maxW=1200){
    const sc=Math.min(1,maxW/img.naturalWidth),w=Math.max(1,Math.round(img.naturalWidth*sc)),h=Math.max(1,Math.round(img.naturalHeight*sc));
    const r=((deg%360)+360)%360,c=document.createElement('canvas');
    c.width=(r===90||r===270)?h:w;c.height=(r===90||r===270)?w:h;
    const x=c.getContext('2d',{willReadFrequently:true});
    x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.save();
    if(r===90){x.translate(c.width,0);x.rotate(Math.PI/2)}
    else if(r===180){x.translate(c.width,c.height);x.rotate(Math.PI)}
    else if(r===270){x.translate(0,c.height);x.rotate(-Math.PI/2)}
    x.drawImage(img,0,0,w,h);x.restore();return c;
  }
  function cropRel(c,x,y,w,h){
    const sx=Math.max(0,Math.round(c.width*x)),sy=Math.max(0,Math.round(c.height*y));
    const sw=Math.min(c.width-sx,Math.round(c.width*w)),sh=Math.min(c.height-sy,Math.round(c.height*h));
    const z=document.createElement('canvas');z.width=Math.max(1,sw);z.height=Math.max(1,sh);
    const g=z.getContext('2d',{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(c,sx,sy,sw,sh,0,0,sw,sh);return z;
  }
  function enhance(c,scale=1.35){
    const z=document.createElement('canvas');z.width=Math.round(c.width*scale);z.height=Math.round(c.height*scale);
    const g=z.getContext('2d',{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(c,0,0,z.width,z.height);
    const im=g.getImageData(0,0,z.width,z.height),d=im.data;
    for(let p=0;p<d.length;p+=4){let y=.299*d[p]+.587*d[p+1]+.114*d[p+2];y=(y-128)*1.55+128;y=Math.max(0,Math.min(255,y));d[p]=d[p+1]=d[p+2]=y;}
    g.putImageData(im,0,0);return z;
  }
  function gridCodes(){try{return Object.keys(gridMasterCache||{}).map(norm).filter(Boolean)}catch(e){return []}}
  function lev(a,b){const m=a.length,n=b.length,d=Array(n+1);for(let j=0;j<=n;j++)d[j]=j;for(let i=1;i<=m;i++){let p=d[0];d[0]=i;for(let j=1;j<=n;j++){const q=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]===b[j-1]?0:1));p=q;}}return d[n]}
  function normalizeCandidate(v){
    let n=norm(v);
    if(n.length===4){
      if(/^[A-Z]{2}[ILO0][A-Z]$/.test(n)) n=n.slice(0,2)+({I:'1',L:'1',O:'0','0':'0'}[n[2]]||n[2])+n[3];
      if(/^[A-Z]{3}[ILO0]$/.test(n)) n=n.slice(0,3)+({I:'1',L:'1',O:'0','0':'0'}[n[3]]||n[3]);
    }
    return n;
  }
  function fuzzyKnown(raw){
    const n=normalizeCandidate(raw),known=gridCodes();
    if(known.includes(n))return n;
    let best='',bd=99;
    const conf={I:'1',L:'1',O:'0','0':'O',S:'5','5':'S',Z:'2','2':'Z',G:'6','6':'G',T:'7','7':'T'};
    for(const k of known){if(k.length!==n.length)continue;let d=0;for(let i=0;i<n.length;i++){if(n[i]===k[i])continue;if(conf[n[i]]===k[i])continue;d++;}if(d<=1&&d<bd){best=k;bd=d;}}
    return best;
  }
  function extractSort(text){
    const raw=String(text||'').toUpperCase().replace(/[^A-Z0-9\s]/g,' ');
    const toks=[...new Set((raw.match(/[A-Z0-9]{3,6}/g)||[]).map(norm))];
    // FIRST: only a 4-character mixed token. No left/right position rule.
    const four=toks.filter(v=>v.length===4 && /[A-Z]/.test(v) && /\d|[ILO]/.test(v));
    for(const v of four){const f=fuzzyKnown(v);if(f)return f;}
    // Then any known GridMaster code with one OCR error.
    for(const v of toks){const f=fuzzyKnown(v);if(f)return f;}
    return '';
  }
  function barcodeAngle(item){
    try{
      const p=item?.cornerPoints;if(Array.isArray(p)&&p.length>=2){let dx=0,dy=0,bd=0;for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){const x=(p[j].x||0)-(p[i].x||0),y=(p[j].y||0)-(p[i].y||0),d=x*x+y*y;if(d>bd){bd=d;dx=x;dy=y;}}let a=Math.atan2(dy,dx)*180/Math.PI;if(a<0)a+=180;return a>=45&&a<135?90:0;}
      const b=item?.boundingBox;if(b?.width&&b?.height)return b.height>b.width?90:0;
    }catch(e){} return 0;
  }
  function cleanBarcode(v){
    const s=clean(v); if(!s || /^https?:\/\//i.test(s)) return '';
    const n=norm(s);
    if(n.length<5 || n.length>40) return '';
    // Do not accept the visible Sort Code as RunSheet.
    if(gridCodes().includes(n)) return '';
    return s;
  }
  async function nativeBarcode(url,deadline){
    if(!('BarcodeDetector' in window))return {value:'',angle:null};
    try{
      let fs=['qr_code','data_matrix','code_128','code_39','code_93','codabar','ean_13','ean_8','upc_a','upc_e','itf','pdf417','aztec'];
      if(BarcodeDetector.getSupportedFormats)fs=fs.filter(x=>BarcodeDetector.getSupportedFormats().then?true:true);
      if(BarcodeDetector.getSupportedFormats){const sup=await BarcodeDetector.getSupportedFormats();fs=fs.filter(x=>sup.includes(x));}
      if(!fs.length)return {value:'',angle:null};
      const d=new BarcodeDetector({formats:fs}),img=await loadImg(url);
      for(const a of [0,90,270,180]){
        if(Date.now()>deadline-450)break;
        try{const found=await d.detect(rotateCanvas(img,a,1000));for(const it of (found||[])){const v=cleanBarcode(it.rawValue);if(v)return {value:v,angle:a};}}catch(e){}
      }
    }catch(e){}
    return {value:'',angle:null};
  }
  async function zxingBarcode(url,deadline){
    if(!window.ZXingBrowser || Date.now()>deadline-700)return {value:'',angle:null};
    try{
      const reader=new ZXingBrowser.BrowserMultiFormatReader();
      const img=await loadImg(url);
      for(const a of [0,90,270,180]){
        if(Date.now()>deadline-650)break;
        const c=rotateCanvas(img,a,1000);const src=c.toDataURL('image/jpeg',.86);
        try{
          const r=await Promise.race([reader.decodeFromImageUrl(src),new Promise((_,rej)=>setTimeout(()=>rej(Error('timeout')),550))]);
          const v=cleanBarcode(r?.getText?.()||'');if(v)return {value:v,angle:a};
        }catch(e){}
      }
    }catch(e){}
    return {value:'',angle:null};
  }
  async function detectRunSheetBarcode(url,deadline){
    const n=await nativeBarcode(url,deadline); if(n.value)return n;
    return await zxingBarcode(url,deadline);
  }
  async function ocrSort(url,worker,deadline){
    const img=await loadImg(url);
    // Sort Code OCR is independent of RunSheet barcode orientation.
    // Type-1 labels can be sideways/upside-down, so never use barcode angle as OCR angle.
    const angles=[0,90,270,180];
    let best='';
    for(const a of angles){
      if(Date.now()>Math.min(deadline,Date.now()+OCR_MS)-500) break;
      const c=rotateCanvas(img,a,900);
      // The label is normally near the centre. One compact pass keeps the scan fast.
      const z0=cropRel(c,.08,.08,.84,.84);
      const z=enhance(z0,1.15);
      try{
        await worker.setParameters({
          tessedit_pageseg_mode:'11',
          preserve_interword_spaces:'0',
          tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        });
        const remain=Math.max(550,Math.min(900,deadline-Date.now()-80));
        const r=await Promise.race([
          worker.recognize(z,{rotateAuto:false}),
          new Promise((_,rej)=>setTimeout(()=>rej(Error('ocr-timeout')),remain))
        ]);
        const code=extractSort(r.data.text||'');
        if(code)return code;
      }catch(e){}
      if(Date.now()>deadline-500)break;
    }
    return best;
  }
  async function processLabel(mode,file){
    const s=state[mode],input=mode==='sorting'?$('#sortEmployeeId'):$('#putEmployeeId');
    s.employeeId=clean(input.value); if(!s.employeeId){toast('Employee ID is required.');return;}
    resetScan(mode); s.employeeId=clean(input.value);
    busy(true,'Reading label…');
    const deadline=Date.now()+DEAD_MS; let url='';
    try{
      url=URL.createObjectURL(file);
      const preview=mode==='sorting'?$('#sortLabelPreview'):$('#putLabelPreview');
      preview.innerHTML=`<img class="scanPreview ultraPreview" src="${url}" alt="Captured label">`;

      // IMPORTANT: barcode and OCR run IN PARALLEL. Barcode detection must never block Sort Code OCR.
      const gridWarm=warmGridMaster().catch(()=>{});
      const barcodeP=detectRunSheetBarcode(url,deadline).catch(()=>({value:'',angle:null}));
      const worker=await Promise.race([
        getOcrWorker(),
        new Promise((_,rej)=>setTimeout(()=>rej(Error('Scanner is still starting. Wait for Scanner Ready once, then scan.')),Math.max(300,deadline-Date.now()-300)))
      ]);
      const sortP=ocrSort(url,worker,deadline).catch(()=> '');

      // Give both recognition jobs the same deadline. Never reuse previous scan data.
      const [barcode,sortCode]=await Promise.all([barcodeP,sortP]);
      s.rsId=cleanBarcode(barcode?.value||'');
      s.sortCode=sortCode||'';
      s.gridNo='';

      if(s.sortCode){
        try{s.gridNo=await Promise.race([
          fetchGridForSort(s.sortCode),
          new Promise(r=>setTimeout(()=>r(''),500))
        ])}catch(e){}
      }
      await gridWarm;
      if(!s.gridNo && s.sortCode){
        try{s.gridNo=gridMasterCache[normalize(s.sortCode)]||''}catch(e){}
      }
      showResult(mode); if(typeof styleResult==='function')styleResult(mode);
      if(!s.sortCode){toast('Sort Code not detected.');return;}
      if(!s.rsId){toast('RunSheet barcode not detected.');return;}
      if(!s.gridNo){toast('Grid No not found for this Sort Code.');return;}
      if(mode==='sorting'){await saveRecord(mode,'','SORTED');toast('Sorting completed.');}
      else {$('#putGridCard').classList.remove('hidden');$('#putGridStatus').textContent='Grid loaded. Open Grid Camera to continue.';toast('Label processed. Scan the Grid barcode.');}
    }catch(e){console.error(e);toast(e.message||'Could not read the label.');}
    finally{if(url)URL.revokeObjectURL(url);busy(false)}
  }
  window.readLabel=processLabel;

  // Capture patch: clear old data BEFORE every new photo and wait for video readiness.
  if(typeof captureLabelPhoto==='function'){
    const btn=$('#capturePhoto'); let waiting=false;
    async function ready(video,ms=3500){const t=Date.now();while(Date.now()-t<ms){if(video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0)return true;try{await video.play()}catch(e){}await new Promise(r=>setTimeout(r,80));}return video.videoWidth>0&&video.videoHeight>0;}
    btn.onclick=async function(){if(waiting||!cameraMode)return;const video=$('#labelCamera'),mode=cameraMode;waiting=true;btn.disabled=true;btn.textContent='📷 Capturing…';const ok=await ready(video);if(!ok){waiting=false;btn.disabled=false;btn.textContent='📸 Capture Photo';toast('Camera is not ready. Try again.');return;}resetScan(mode);const canvas=$('#captureCanvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0,canvas.width,canvas.height);canvas.toBlob(async blob=>{waiting=false;btn.disabled=false;btn.textContent='📸 Capture Photo';if(!blob){toast('Could not capture photo.');return;}if(mode==='putting')hideLabelCameraKeepStream();else closeLabelCamera();await processLabel(mode,blob)},'image/jpeg',.90)};
  }

  window.addEventListener('load',()=>{
    // Warm OCR + GridMaster immediately so scan time is spent on recognition only.
    try{getOcrWorker().catch(()=>{})}catch(e){}
    try{warmGridMaster().catch(()=>{})}catch(e){}
  });
})();

