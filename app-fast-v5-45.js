// Grid Scanner By ArupD — v5.45
// Fast deterministic scanner:
// RunSheet = barcode/QR ONLY
// Sort Code = 4-char GridMaster code ONLY
// Grid No = GridMaster lookup
(function(){
  'use strict';
  const DEAD_MS=4800;
  const clean=v=>String(v||'').trim();
  const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

  function clearScan(mode){
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

  function loadImage(url){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(Error('image'));i.src=url;});}
  function rotate(img,deg,maxW=1100){
    const scale=Math.min(1,maxW/img.naturalWidth);
    const w=Math.max(1,Math.round(img.naturalWidth*scale));
    const h=Math.max(1,Math.round(img.naturalHeight*scale));
    const r=((deg%360)+360)%360,c=document.createElement('canvas');
    c.width=(r===90||r===270)?h:w;c.height=(r===90||r===270)?w:h;
    const x=c.getContext('2d',{willReadFrequently:true});
    if(r===90){x.translate(c.width,0);x.rotate(Math.PI/2)}
    else if(r===180){x.translate(c.width,c.height);x.rotate(Math.PI)}
    else if(r===270){x.translate(0,c.height);x.rotate(-Math.PI/2)}
    x.drawImage(img,0,0,w,h);return c;
  }
  function crop(c,x,y,w,h){
    const sx=Math.max(0,Math.round(c.width*x)),sy=Math.max(0,Math.round(c.height*y));
    const sw=Math.min(c.width-sx,Math.round(c.width*w)),sh=Math.min(c.height-sy,Math.round(c.height*h));
    const z=document.createElement('canvas');z.width=Math.max(1,sw);z.height=Math.max(1,sh);
    z.getContext('2d',{willReadFrequently:true}).drawImage(c,sx,sy,sw,sh,0,0,sw,sh);return z;
  }
  function sharpen(c){
    const z=document.createElement('canvas');z.width=c.width;z.height=c.height;
    const g=z.getContext('2d',{willReadFrequently:true});g.drawImage(c,0,0);
    const im=g.getImageData(0,0,z.width,z.height),d=im.data;
    for(let i=0;i<d.length;i+=4){let y=.299*d[i]+.587*d[i+1]+.114*d[i+2];y=(y-128)*1.65+128;y=Math.max(0,Math.min(255,y));d[i]=d[i+1]=d[i+2]=y;}
    g.putImageData(im,0,0);return z;
  }
  function knownCodes(){return Object.keys(gridMasterCache||{}).map(norm).filter(Boolean);}
  function edit1(a,b){if(a.length!==b.length)return 99;let d=0;for(let i=0;i<a.length;i++){if(a[i]!==b[i])d++;}return d;}
  function fix4(s){
    const n=norm(s);if(n.length!==4)return n;
    return n.replace(/[ILO]/g,ch=>({I:'1',L:'1',O:'0'}[ch]||ch));
  }
  function findSort(text){
    const raw=String(text||'').toUpperCase();
    const toks=[...new Set((raw.match(/[A-Z0-9]{4,6}/g)||[]).map(norm))];
    const known=knownCodes();
    // Strict first: exact 4-char GridMaster code.
    for(const t of toks){const n=fix4(t);if(n.length===4&&known.includes(n))return n;}
    // Then exact known code of any stored length (GridMaster is the authority).
    for(const t of toks){if(known.includes(t))return t;}
    // One OCR character error only, still against GridMaster.
    let best='',bd=2;
    for(const t0 of toks){const t=fix4(t0);for(const k of known){if(k.length!==t.length)continue;const d=edit1(t,k);if(d<bd){bd=d;best=k;}}}
    return bd<=1?best:'';
  }
  function cleanRun(v){
    const s=clean(v),n=norm(s);if(!s||/^https?:\/\//i.test(s))return '';
    if(n.length<8||n.length>40)return '';
    if(knownCodes().includes(n))return '';
    return s;
  }

  let detectorPromise=null;
  async function getDetector(){
    if(detectorPromise)return detectorPromise;
    detectorPromise=(async()=>{
      if(!('BarcodeDetector' in window))return null;
      let formats=['qr_code','data_matrix','code_128','code_39','code_93','codabar','ean_13','ean_8','upc_a','upc_e','itf','pdf417','aztec'];
      try{if(BarcodeDetector.getSupportedFormats){const s=await BarcodeDetector.getSupportedFormats();formats=formats.filter(f=>s.includes(f));}}catch(e){}
      if(!formats.length)return null;
      return new BarcodeDetector({formats});
    })().catch(()=>null);
    return detectorPromise;
  }
  async function runBarcode(url,deadline){
    try{
      const d=await getDetector();if(!d||Date.now()>deadline-500)return '';
      const img=await loadImage(url);
      // Native detector is intentionally ONE full-image pass. No four-rotation loop.
      const found=await Promise.race([
        d.detect(img),new Promise((_,rej)=>setTimeout(()=>rej(Error('barcode-timeout')),700))
      ]);
      for(const it of (found||[])){const v=cleanRun(it.rawValue);if(v)return v;}
    }catch(e){}
    // Very short ZXing fallback, only if native detector failed.
    try{
      if(window.ZXingBrowser && Date.now()<deadline-1100){
        const reader=new ZXingBrowser.BrowserMultiFormatReader();
        const r=await Promise.race([
          reader.decodeFromImageUrl(url),new Promise((_,rej)=>setTimeout(()=>rej(Error('zxing-timeout')),750))
        ]);
        const v=cleanRun(r?.getText?.()||'');if(v)return v;
      }
    }catch(e){}
    return '';
  }

  async function ocrOnce(url,worker,angle,deadline){
    const img=await loadImage(url);if(Date.now()>deadline-600)return '';
    const c=rotate(img,angle,1000);
    // Whole label, slightly reduced. The GridMaster filter rejects BOM/REV/KRV/NAG etc.
    const z=sharpen(crop(c,.05,.05,.90,.90));
    try{
      const remain=Math.max(700,Math.min(1500,deadline-Date.now()-100));
      const r=await Promise.race([
        worker.recognize(z,{rotateAuto:false}),
        new Promise((_,rej)=>setTimeout(()=>rej(Error('ocr-timeout')),remain))
      ]);
      return findSort(r?.data?.text||'');
    }catch(e){return '';}
  }

  async function runScan(mode,file){
    const input=mode==='sorting'?$('#sortEmployeeId'):$('#putEmployeeId');
    const emp=clean(input.value);if(!emp){toast('Employee ID is required.');return;}
    clearScan(mode);state[mode].employeeId=emp;
    busy(true,'Reading label…');
    const deadline=Date.now()+DEAD_MS;let url='';
    try{
      url=URL.createObjectURL(file);
      const preview=mode==='sorting'?$('#sortLabelPreview'):$('#putLabelPreview');
      preview.innerHTML=`<img class="scanPreview ultraPreview" src="${url}" alt="Captured label">`;

      // These are started immediately. They never use previous scan data.
      warmGridMaster().catch(()=>{});
      const barcodeP=runBarcode(url,deadline).catch(()=> '');
      const worker=await Promise.race([
        getOcrWorker(),
        new Promise((_,rej)=>setTimeout(()=>rej(Error('Scanner is not ready. Open the camera once and wait for Scanner Ready.')),700))
      ]);

      // First OCR orientation is 0°. If barcode decoding gives a result, we use
      // its geometry only for the common sideways case. No OCR dependency on barcode.
      let sort=await ocrOnce(url,worker,0,deadline);
      if(!sort && Date.now()<deadline-1300) sort=await ocrOnce(url,worker,90,deadline);
      if(!sort && Date.now()<deadline-750) sort=await ocrOnce(url,worker,180,deadline);

      const rs=await barcodeP;
      const s=state[mode];
      s.rsId=cleanRun(rs);
      s.sortCode=sort||'';
      s.gridNo='';

      if(s.sortCode){
        const left=Math.max(300,deadline-Date.now()-100);
        try{s.gridNo=await Promise.race([
          fetchGridForSort(s.sortCode),
          new Promise(r=>setTimeout(()=>r(''),left))
        ])}catch(e){}
        if(!s.gridNo)try{s.gridNo=gridMasterCache[norm(s.sortCode)]||''}catch(e){}
      }

      showResult(mode);if(typeof styleResult==='function')styleResult(mode);
      if(!s.sortCode){toast('Sort Code not detected within 5 seconds.');return;}
      if(!s.rsId){toast('RunSheet barcode/QR not detected within 5 seconds.');return;}
      if(!s.gridNo){toast('Grid No not found for this Sort Code.');return;}
      if(mode==='sorting'){
        await saveRecord(mode,'','SORTED');toast('Sorting completed.');
      }else{
        $('#putGridCard').classList.remove('hidden');
        $('#putGridStatus').textContent='Grid loaded. Open Grid Camera to continue.';
        toast('Label processed. Scan the Grid barcode.');
      }
    }catch(e){console.error(e);toast(e.message||'Could not read the label.');}
    finally{if(url)URL.revokeObjectURL(url);busy(false)}
  }
  window.readLabel=runScan;

  // Always clear old values before a new capture and reuse the existing camera.
  const btn=$('#capturePhoto');
  if(btn){
    let busyCapture=false;
    async function cameraReady(v){const t=Date.now();while(Date.now()-t<2500){if(v.readyState>=2&&v.videoWidth)return true;try{await v.play()}catch(e){}await new Promise(r=>setTimeout(r,60));}return !!v.videoWidth;}
    btn.onclick=async()=>{
      if(busyCapture||!cameraMode)return;
      const mode=cameraMode,v=$('#labelCamera');busyCapture=true;btn.disabled=true;btn.textContent='📷 Capturing…';
      try{
        clearScan(mode);
        if(!(await cameraReady(v))){toast('Camera is not ready. Try again.');return;}
        const c=$('#captureCanvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0,c.width,c.height);
        const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.88));
        if(!blob){toast('Could not capture photo.');return;}
        if(mode==='putting')hideLabelCameraKeepStream();else closeLabelCamera();
        await runScan(mode,blob);
      }finally{busyCapture=false;btn.disabled=false;btn.textContent='📸 Capture Photo';}
    };
  }

  // Preload before the operator starts scanning. This is the key to keeping
  // recognition time short: the capture itself never starts a cold Tesseract load.
  window.addEventListener('load',()=>{
    setTimeout(()=>{try{getOcrWorker().catch(()=>{})}catch(e){}},50);
    setTimeout(()=>{try{warmGridMaster().catch(()=>{})}catch(e){}},50);
    setTimeout(()=>{try{getDetector().catch(()=>{})}catch(e){}},50);
  });
})();
