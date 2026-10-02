// Grid Scanner By ArupD — v5.47
// Deterministic label templates based on the user's marked regions.
// Type 1: RunSheet = linear barcode at top; Sort Code = bold code at right (e.g. TG1K).
// Type 2: RunSheet = QR at center; Sort Code = bold center code (e.g. MSA1).
// Never use date/time or unrelated small text as RunSheet/Sort Code.
(function(){
'use strict';
const DEAD_MS=4800;
const TYPE1_SORT=[.56,.28,.38,.34];
const TYPE2_SORT=[.43,.24,.24,.27];
const TYPE1_BAR=[.08,.20,.84,.44];
const TYPE2_QR=[.30,.43,.40,.42];
const clean=v=>String(v||'').trim();
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

function clearScan(mode){
 const s=state[mode]; s.label=null;s.rsId='';s.sortCode='';s.gridNo='';
 const box=mode==='sorting'?$('#sortResult'):$('#putResult'); if(box){box.classList.add('hidden');box.innerHTML='';}
 const prev=mode==='sorting'?$('#sortLabelPreview'):$('#putLabelPreview'); if(prev)prev.innerHTML='';
 if(mode==='putting'){$('#putGridCard')?.classList.add('hidden');$('#putGridStatus').textContent='';}
}
function loadImage(url){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(Error('image'));i.src=url;});}
function rotate(img,deg,maxW=1200){
 const scale=Math.min(1,maxW/img.naturalWidth),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
 const r=((deg%360)+360)%360,c=document.createElement('canvas');c.width=(r===90||r===270)?h:w;c.height=(r===90||r===270)?w:h;
 const x=c.getContext('2d',{willReadFrequently:true});
 if(r===90){x.translate(c.width,0);x.rotate(Math.PI/2)} else if(r===180){x.translate(c.width,c.height);x.rotate(Math.PI)} else if(r===270){x.translate(0,c.height);x.rotate(-Math.PI/2)}
 x.drawImage(img,0,0,w,h);return c;
}
function crop(c,x,y,w,h){
 const sx=Math.max(0,Math.round(c.width*x)),sy=Math.max(0,Math.round(c.height*y));
 const sw=Math.min(c.width-sx,Math.round(c.width*w)),sh=Math.min(c.height-sy,Math.round(c.height*h));
 const z=document.createElement('canvas');z.width=Math.max(1,sw);z.height=Math.max(1,sh);z.getContext('2d',{willReadFrequently:true}).drawImage(c,sx,sy,sw,sh,0,0,sw,sh);return z;
}
function prep(c,scale=1.7){
 const z=document.createElement('canvas');z.width=Math.round(c.width*scale);z.height=Math.round(c.height*scale);
 const g=z.getContext('2d',{willReadFrequently:true});g.imageSmoothingEnabled=true;g.drawImage(c,0,0,z.width,z.height);
 const im=g.getImageData(0,0,z.width,z.height),d=im.data;
 for(let i=0;i<d.length;i+=4){let y=.299*d[i]+.587*d[i+1]+.114*d[i+2];y=(y-128)*1.55+128;y=Math.max(0,Math.min(255,y));d[i]=d[i+1]=d[i+2]=y;}
 g.putImageData(im,0,0);return z;
}
function knownCodes(){return Object.keys(gridMasterCache||{}).map(norm).filter(Boolean);}
function edit1(a,b){if(a.length!==b.length)return 99;let d=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])d++;return d;}
function fix4(s){return norm(s).replace(/[ILO]/g,ch=>({I:'1',L:'1',O:'0'}[ch]||ch));}
function findSort(text){
 const raw=String(text||'').toUpperCase();
 const toks=[...new Set((raw.match(/[A-Z0-9]{4,6}/g)||[]).map(norm))];
 const known=knownCodes();
 for(const t of toks){const n=fix4(t);if(n.length===4&&known.includes(n))return n;}
 for(const t of toks)if(known.includes(t))return t;
 let best='',bd=2;
 for(const t0 of toks){const t=fix4(t0);for(const k of known){if(k.length!==t.length)continue;const d=edit1(t,k);if(d<bd){bd=d;best=k;}}}
 if(bd<=1)return best;
 const mixed=toks.filter(t=>t.length===4&&/[A-Z]/.test(t)&&/\d/.test(t)&&/^[A-Z0-9]{4}$/.test(t));
 return mixed[0]||'';
}

function findSortStrict(text){
 const raw=String(text||'').toUpperCase();
 const toks=[...new Set((raw.match(/[A-Z0-9]{4,5}/g)||[]).map(norm))];
 const known=knownCodes();
 for(const t of toks){const n=fix4(t);if(n.length===4&&known.includes(n))return n;}
 for(const t of toks)if(known.includes(t))return t;
 return '';
}

// The marked label regions, expressed as fractions of an upright label frame.
// Multiple templates are searched in one OCR job, so we do not waste 4 serial OCR passes.
const T1_SORT=TYPE1_SORT;
const T1_BAR=TYPE1_BAR;
const T2_SORT=TYPE2_SORT;
const T2_QR=TYPE2_QR;

function buildSortMontage(img){
 const rots=[0,90,180,270], pieces=[];
 for(const a of rots){const c=rotate(img,a,1050);pieces.push({c:prep(crop(c,...T1_SORT)),type:1,angle:a});pieces.push({c:prep(crop(c,...T2_SORT)),type:2,angle:a});}
 const W=520,H=190, m=document.createElement('canvas');m.width=W*2;m.height=H*4;const g=m.getContext('2d');
 pieces.forEach((p,i)=>{const x=(i%2)*W,y=Math.floor(i/2)*H;g.fillStyle='#fff';g.fillRect(x,y,W,H);g.drawImage(p.c,x,y,W,H);});
 return {canvas:m,pieces};
}
async function readSortTemplate(img,worker,deadline,templateHint=0){
 if(Date.now()>deadline-700)return {sort:'',template:0};
 const specs=templateHint===1?[{spec:T1_SORT,type:1}]:templateHint===2?[{spec:T2_SORT,type:2}]:[{spec:T1_SORT,type:1},{spec:T2_SORT,type:2}];
 const rots=[0,90,180,270];
 const pieces=[];
 for(const a of rots){
  const c=rotate(img,a,1050);
  for(const q of specs) pieces.push({c:prep(crop(c,...q.spec),1.9),type:q.type,angle:a});
 }
 const W=430,H=210,m=document.createElement('canvas');m.width=W*2;m.height=H*Math.ceil(pieces.length/2);
 const g=m.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,m.width,m.height);
 pieces.forEach((p,i)=>{const x=(i%2)*W,y=Math.floor(i/2)*H;g.drawImage(p.c,x,y,W,H);});
 try{
  const remain=Math.max(700,Math.min(2200,deadline-Date.now()-80));
  const r=await Promise.race([worker.recognize(m,{rotateAuto:false}),new Promise((_,rej)=>setTimeout(()=>rej(Error('ocr-timeout')),remain))]);
  const text=r?.data?.text||'';
  let sort=findSortStrict(text);
  if(!sort)sort=findSort(text);
  let template=templateHint||0;
  if(!template&&sort){
   // Known codes are authoritative; choose the template whose crop is most likely to contain it.
   // With the two supported labels, Type 2's center crop is checked first because it is the
   // only place where MSA1-style codes occur.
   template=knownCodes().includes(norm(sort)) && /MSA1/i.test(sort)?2:1;
  }
  return {sort,template,text};
 }catch(e){return {sort:'',template:templateHint||0,text:''};}
}

let detectorPromise=null;
async function getDetector(){
 if(detectorPromise)return detectorPromise;
 detectorPromise=(async()=>{
  if(!('BarcodeDetector' in window))return null;
  let formats=['qr_code','data_matrix','code_128','code_39','code_93','codabar','ean_13','ean_8','upc_a','upc_e','itf','pdf417','aztec'];
  try{if(BarcodeDetector.getSupportedFormats){const s=await BarcodeDetector.getSupportedFormats();formats=formats.filter(f=>s.includes(f));}}catch(e){}
  if(!formats.length)return null;return new BarcodeDetector({formats});
 })().catch(()=>null);return detectorPromise;
}
function validRS(v){const s=clean(v),n=norm(s);if(!s||n.length<7||n.length>40||knownCodes().includes(n)||/^https?:/i.test(s))return '';return s;}
async function nativeRotatedBarcodes(img,deadline){
 try{
  const d=await getDetector();if(!d)return {value:'',format:'',template:0};
  const rots=[0,90,180,270];
  const arr=await Promise.all(rots.map(async a=>{
   if(Date.now()>deadline-900)return null;
   try{const c=rotate(img,a,1200);const r=await Promise.race([d.detect(c),new Promise((_,rej)=>setTimeout(()=>rej(Error('t')),800))]);
    for(const it of (r||[])){const v=validRS(it.rawValue);if(v){const f=String(it.format||'').toLowerCase();return {value:v,format:f,template:(f==='qr_code'||f==='data_matrix'||f==='aztec')?2:1};}}
   }catch(e){} return null;
  }));
  return arr.find(Boolean)||{value:'',format:'',template:0};
 }catch(e){return {value:'',format:'',template:0};}
}

async function zxingCanvas(canvas,deadline){
 try{if(!window.ZXingBrowser||Date.now()>deadline-500)return '';const Reader=window.ZXingBrowser.BrowserMultiFormatReader;const reader=new Reader();
  const r=await Promise.race([reader.decodeFromCanvas(canvas),new Promise((_,rej)=>setTimeout(()=>rej(Error('zxing-timeout')),700))]);
  return validRS(r?.getText?.()||'');
 }catch(e){return '';}
}
async function targetedBarcode(img,template,deadline){
 const rots=[0,90,180,270];
 // Native detector has already tried all rotations. ZXing now gets only the marked region,
 // not the entire photo, keeping the fallback short.
 const regs=template===1?[T1_BAR,T1_BAR]:[T2_QR,T2_QR];
 for(let i=0;i<rots.length && Date.now()<deadline-500;i++){
  const c=rotate(img,rots[i],1300);
  const cropSpec=template===1?T1_BAR:T2_QR;
  const z=prep(crop(c,...cropSpec),1.35);
  const v=await zxingCanvas(z,deadline);if(v)return v;
 }
 return '';
}

async function runScan(mode,file){
 const input=mode==='sorting'?$('#sortEmployeeId'):$('#putEmployeeId'),emp=clean(input.value);
 if(!emp){toast('Employee ID is required.');return;}
 clearScan(mode);state[mode].employeeId=emp;busy(true,'Reading label…');
 const deadline=Date.now()+DEAD_MS;let url='';
 try{
  url=URL.createObjectURL(file);const img=await loadImage(url);
  const preview=mode==='sorting'?$('#sortLabelPreview'):$('#putLabelPreview');preview.innerHTML=`<img class="scanPreview ultraPreview" src="${url}" alt="Captured label">`;
  warmGridMaster().catch(()=>{});
  const workerP=getOcrWorker().catch(()=>null);
  const barcodeP=nativeRotatedBarcodes(img,deadline);
  const worker=await Promise.race([workerP,new Promise((_,rej)=>setTimeout(()=>rej(Error('Scanner is still warming up. Open the camera once before scanning.')),1200))]);
  if(!worker)throw Error('Scanner is still warming up. Open the camera once before scanning.');
  const barcode=await barcodeP;
  const templateHint=barcode?.template||0;
  const sortInfo=await readSortTemplate(img,worker,deadline,templateHint);
  const s=state[mode];
  s.rsId=validRS(barcode?.value)||'';
  s.sortCode=sortInfo.sort||'';
  s.gridNo='';
  // Short targeted fallback: only scan the region belonging to the detected/selected label type.
  // Never spend the remaining budget cycling both templates blindly.
  if(!s.rsId && Date.now()<deadline-850){
   s.rsId=await targetedBarcode(img,sortInfo.template||templateHint||1,deadline);
  }
  if(s.sortCode){
   const left=Math.max(250,deadline-Date.now()-100);
   try{s.gridNo=await Promise.race([fetchGridForSort(s.sortCode),new Promise(r=>setTimeout(()=>r(''),left))])}catch(e){}
   if(!s.gridNo)try{s.gridNo=gridMasterCache[norm(s.sortCode)]||''}catch(e){}
  }
  showResult(mode);if(typeof styleResult==='function')styleResult(mode);
  if(!s.sortCode){toast('Sort Code not detected within 5 seconds.');return;}
  if(!s.rsId){toast('RunSheet barcode/QR not detected within 5 seconds.');return;}
  if(!s.gridNo){toast('Grid No not found for this Sort Code.');return;}
  if(mode==='sorting'){await saveRecord(mode,'','SORTED');toast('Sorting completed.');}
  else{$('#putGridCard').classList.remove('hidden');$('#putGridStatus').textContent='Grid loaded. Open Grid Camera to continue.';toast('Label processed. Scan the Grid barcode.');}
 }catch(e){console.error(e);toast(e.message||'Could not read the label.');}
 finally{if(url)URL.revokeObjectURL(url);busy(false)}
}
window.readLabel=runScan;

const btn=$('#capturePhoto');
if(btn){let busyCapture=false;
 async function cameraReady(v){const t=Date.now();while(Date.now()-t<2500){if(v.readyState>=2&&v.videoWidth)return true;try{await v.play()}catch(e){}await new Promise(r=>setTimeout(r,60));}return !!v.videoWidth;}
 btn.onclick=async()=>{if(busyCapture||!cameraMode)return;const mode=cameraMode,v=$('#labelCamera');busyCapture=true;btn.disabled=true;btn.textContent='📷 Capturing…';
  try{clearScan(mode);if(!(await cameraReady(v))){toast('Camera is not ready. Try again.');return;}const c=$('#captureCanvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0,c.width,c.height);const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.90));if(!blob){toast('Could not capture photo.');return;}if(mode==='putting')hideLabelCameraKeepStream();else closeLabelCamera();await runScan(mode,blob);}
  finally{busyCapture=false;btn.disabled=false;btn.textContent='📸 Capture Photo';}
 };
}
window.addEventListener('load',()=>{setTimeout(()=>{try{getOcrWorker().catch(()=>{})}catch(e){}},50);setTimeout(()=>{try{warmGridMaster().catch(()=>{})}catch(e){}},50);setTimeout(()=>{try{getDetector().catch(()=>{})}catch(e){}},50);});
})();
