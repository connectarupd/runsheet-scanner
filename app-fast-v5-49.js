// Grid Scanner By ArupD — v5.49
// Deterministic label templates based on the user's marked regions.
// Type 1: RunSheet = linear barcode at top; Sort Code = bold code at right (e.g. TG1K).
// Type 2: RunSheet = QR at center; Sort Code = bold center code (e.g. MSA1).
// Never use date/time or unrelated small text as RunSheet/Sort Code.
(function(){
'use strict';
const DEAD_MS=4800;
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
function sortTokens(text){
 const raw=String(text||'').toUpperCase();
 return [...new Set((raw.match(/[A-Z0-9]{4,6}/g)||[]).map(norm))];
}
function findSortCandidates(text){
 const toks=sortTokens(text),known=knownCodes(),out=[];
 // Exact GridMaster matches first.
 for(const t of toks){const n=fix4(t);if(n.length===4&&known.includes(n))out.push({code:n,score:100});}
 for(const t of toks){if(known.includes(t)&&!out.some(x=>x.code===t))out.push({code:t,score:99});}
 // One-character OCR correction against GridMaster.
 for(const t0 of toks){const t=fix4(t0);for(const k of known){if(k.length!==t.length)continue;const d=edit1(t,k);if(d<=1&&!out.some(x=>x.code===k))out.push({code:k,score:90-d});}}
 // If GridMaster is still warming, retain plausible 4-char mixed tokens.
 for(const t of toks){const n=fix4(t);if(n.length===4&&/[A-Z]/.test(n)&&/\d/.test(n)&&/^[A-Z0-9]{4}$/.test(n)&&!out.some(x=>x.code===n))out.push({code:n,score:10});}
 return out;
}

// The user's two label layouts. These coordinates are relative to the captured label,
// not the phone UI. Every rotation is tested in one OCR montage.
const T1_SORT=[.53,.34,.43,.34];
const T1_BAR =[.10,.27,.72,.38];
const T2_SORT=[.34,.31,.40,.28];
const T2_QR  =[.36,.47,.38,.34];

function buildSortMontage(img){
 const rots=[0,90,180,270],pieces=[];
 for(const a of rots){
  const c=rotate(img,a,1050);
  pieces.push({c:prep(crop(c,...T1_SORT),1.8),type:1,angle:a});
  pieces.push({c:prep(crop(c,...T2_SORT),1.8),type:2,angle:a});
 }
 const W=520,H=190,m=document.createElement('canvas');m.width=W*2;m.height=H*4;
 const g=m.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,m.width,m.height);
 pieces.forEach((p,i)=>{const x=(i%2)*W,y=Math.floor(i/2)*H;g.drawImage(p.c,x,y,W,H);});
 return {canvas:m,pieces};
}
async function readSortTemplate(img,worker,deadline){
 if(Date.now()>deadline-900)return {sort:'',template:0,text:'',candidates:[]};
 const {canvas,pieces}=buildSortMontage(img);
 try{
  const remain=Math.max(1000,Math.min(1900,deadline-Date.now()-100));
  const r=await Promise.race([
   worker.recognize(canvas,{rotateAuto:false}),
   new Promise((_,rej)=>setTimeout(()=>rej(Error('ocr-timeout')),remain))
  ]);
  const text=r?.data?.text||'';
  const candidates=findSortCandidates(text);
  // Tesseract word boxes let us associate a candidate with the template cell when available.
  const words=Array.isArray(r?.data?.words)?r.data.words:[];
  for(const w of words){
   const t=fix4(w?.text||'');
   if(t.length!==4||!/[A-Z]/.test(t)||!/\d/.test(t))continue;
   const x=Number(w?.bbox?.x0||0), y=Number(w?.bbox?.y0||0);
   const col=x>=W?1:0, row=Math.min(3,Math.max(0,Math.floor(y/H)));
   const idx=row*2+col, type=(idx%2===0)?1:2;
   const c=candidates.find(q=>q.code===t); if(c)c.type=type;
  }
  const best=candidates.find(c=>c.score>=90)||candidates[0];
  return {sort:best?.code||'',template:best?.type||0,text,candidates};
 }catch(e){return {sort:'',template:0,text:'',candidates:[]};}
}

async function lookupSortDirect(code,deadline){
 const key=norm(code); if(!key)return '';
 if(gridMasterCache[key])return String(gridMasterCache[key]);
 if(Date.now()>deadline-550)return '';
 try{
  const left=Math.max(250,Math.min(850,deadline-Date.now()-80));
  const ctrl=new AbortController(),tm=setTimeout(()=>ctrl.abort(),left);
  const r=await fetch(masterUrl+'?action=lookup&sortCode='+encodeURIComponent(key)+'&_='+Date.now(),{cache:'no-store',signal:ctrl.signal});
  clearTimeout(tm); const data=await r.json();
  if(data?.ok&&data?.gridNo){gridMasterCache[key]=String(data.gridNo).trim();saveGridCache();return gridMasterCache[key];}
 }catch(e){}
 return '';
}
async function resolveSort(info,deadline){
 const candidates=Array.isArray(info?.candidates)?info.candidates:[];
 // Try the OCR-selected code first, then every plausible 4-char candidate in parallel.
 const ordered=[...new Map(candidates.map(c=>[norm(c.code),c])).values()].slice(0,8);
 for(const c of ordered){if(gridMasterCache[norm(c.code)])return {code:norm(c.code),grid:gridMasterCache[norm(c.code)],type:c.type||0};}
 if(!ordered.length)return {code:'',grid:'',type:0};
 const jobs=ordered.map(c=>lookupSortDirect(c.code,deadline).then(grid=>({code:norm(c.code),grid,type:c.type||0,score:c.score||0})));
 try{
  const results=await Promise.all(jobs);
  const hit=results.filter(x=>x.grid).sort((a,b)=>(b.score-a.score))[0];
  if(hit)return hit;
 }catch(e){}
 return {code:'',grid:'',type:0};
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
 try{const d=await getDetector();if(!d)return '';const rots=[0,90,180,270];
  const arr=await Promise.all(rots.map(async a=>{if(Date.now()>deadline-900)return '';try{const c=rotate(img,a,1200);const r=await Promise.race([d.detect(c),new Promise((_,rej)=>setTimeout(()=>rej(Error('t')),850))]);for(const it of (r||[])){const v=validRS(it.rawValue);if(v)return v;}}catch(e){}return '';}));
  return arr.find(Boolean)||'';
 }catch(e){return '';}
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
  const preview=mode==='sorting'?$('#sortLabelPreview'):$('#putLabelPreview');
  preview.innerHTML=`<img class="scanPreview ultraPreview" src="${url}" alt="Captured label">`;
  warmGridMaster().catch(()=>{});
  const workerP=getOcrWorker().catch(()=>null);
  const barcodeP=nativeRotatedBarcodes(img,deadline);
  const worker=await Promise.race([workerP,new Promise((_,rej)=>setTimeout(()=>rej(Error('OCR engine not ready. Open the camera once before scanning.')),1200))]);
  if(!worker)throw Error('OCR engine not ready. Open the camera once before scanning.');
  const sortP=readSortTemplate(img,worker,deadline);
  const [sortInfo,barcode]=await Promise.all([sortP,barcodeP]);
  const resolved=await resolveSort(sortInfo,deadline);
  const s=state[mode];
  s.rsId=validRS(barcode)||'';
  s.sortCode=resolved.code||'';
  s.gridNo=resolved.grid||'';
  // Printed RunSheet fallback from the same OCR pass. Prefer long mixed alphanumeric IDs;
  // never treat the 4-char Sort Code as a RunSheet ID.
  if(!s.rsId){
   const raw=String(sortInfo.text||'').toUpperCase();
   const rs=[];
   const dhr=raw.match(/\bDHR[A-Z0-9]{8,25}\b/); if(dhr)rs.push(dhr[0]);
   for(const t of (raw.match(/[A-Z0-9]{8,24}/g)||[])){
    const n=norm(t); if(/\d/.test(n)&&/[A-Z]/.test(n)&&n.length>=8&&!knownCodes().includes(n)&&!rs.includes(n))rs.push(n);
   }
   s.rsId=rs[0]||'';
  }
  // If OCR returned a code but the direct lookup was delayed, use the already-warmed cache once more.
  if(!s.gridNo&&s.sortCode)s.gridNo=gridMasterCache[norm(s.sortCode)]||'';
  showResult(mode);if(typeof styleResult==='function')styleResult(mode);
  if(!s.sortCode){toast('Sort Code not detected within 5 seconds.');return;}
  if(!s.rsId){toast('RunSheet barcode/QR not detected within 5 seconds.');return;}
  if(!s.gridNo){toast('Grid No not found for this Sort Code.');return;}
  if(mode==='sorting'){await saveRecord(mode,'','SORTED');toast('Sorting completed.');}
  else{$('#putGridCard').classList.remove('hidden');$('#putGridStatus').textContent='Grid loaded. Open Grid Camera to continue.';toast('Label processed. Scan the Grid barcode.');}
 }catch(e){console.error(e);toast(e.message||'Could not read the label.');}
 finally{if(url)URL.revokeObjectURL(url);busy(false);}
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
