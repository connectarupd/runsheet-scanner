// Grid Scanner By ArupD — v5.55
// Deterministic label templates based on the user's marked regions.
// Type 1: RunSheet = linear barcode at top; Sort Code = bold code at right (e.g. TG1K).
// Type 2: RunSheet = QR at center; Sort Code = bold center code (e.g. MSA1).
// Never use date/time or unrelated small text as RunSheet/Sort Code.
(function(){
'use strict';
const DEAD_MS=4500;
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
function editDistance(a,b){
 a=String(a||'');b=String(b||'');
 const m=a.length,n=b.length;if(!m)return n;if(!n)return m;
 let prev=Array.from({length:n+1},(_,i)=>i),cur=new Array(n+1);
 for(let i=1;i<=m;i++){cur[0]=i;for(let j=1;j<=n;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));[prev,cur]=[cur,prev];}
 return prev[n];
}
function edit1(a,b){return editDistance(a,b);}
function fix4(s){return norm(s).replace(/[ILO]/g,ch=>({I:'1',L:'1',O:'0'}[ch]||ch));}
function sortTokens(text){
 const raw=String(text||'').toUpperCase();
 const out=new Set((raw.match(/[A-Z0-9]{3,6}/g)||[]).map(norm));
 // OCR often separates the bold 4-character Sort Code into two words (e.g. TG1 K).
 // Build short candidates from each OCR line after removing spaces/punctuation.
 const lines=raw.split(/\r?\n/);
 for(const line of lines){
  const compact=line.replace(/[^A-Z0-9]/g,'');
  for(let len=4;len<=6;len++)for(let i=0;i+len<=compact.length;i++)out.add(compact.slice(i,i+len));
 }
 // OCR may split a 4-character code into adjacent pieces such as "YMG" + "1".
 const small=(raw.match(/[A-Z0-9]{1,3}/g)||[]);
 for(let i=0;i<small.length-1;i++){
  const a=norm(small[i]),b=norm(small[i+1]);
  if(a.length+b.length>=4&&a.length+b.length<=6)out.add(a+b);
 }
 return [...out];
}
function findSortCandidates(text){
 const toks=sortTokens(text),known=knownCodes(),out=[];
 // Exact GridMaster matches first.
 for(const t0 of toks){const n=fix4(t0);if(n.length===4&&known.includes(n))out.push({code:n,score:100});}
 // Fuzzy correction, allowing one insertion/deletion as well as one substitution.
 // This catches common OCR results such as TG1IK -> TG1K.
 for(const t0 of toks){
  const t=fix4(t0);if(t.length<3||t.length>6)continue;
  for(const k of known){
   if(k.length!==4)continue;
   const d=editDistance(t,k);
   if(d<=2&&!out.some(x=>x.code===k))out.push({code:k,score:84-d});
  }
 }
 // If GridMaster is still warming, retain plausible 4-char mixed tokens.
 for(const t0 of toks){const n=fix4(t0);if(n.length===4&&/[A-Z]/.test(n)&&/\d/.test(n)&&/^[A-Z0-9]{4}$/.test(n)&&!out.some(x=>x.code===n))out.push({code:n,score:10});}
 return out;
}

// The user's two label layouts. Coordinates are fractions of the captured label frame.
// Tight boxes focus OCR on the bold Sort Code itself; broad boxes are the fallback.
const T1_SORT=[.18,.10,.64,.38];
const T1_SORT_TIGHT=[.28,.30,.50,.32];
const T1_BAR =[.08,.22,.78,.46];
const T2_SORT=[.28,.20,.50,.56];
const T2_SORT_TIGHT=[.38,.28,.48,.40];
const T2_QR  =[.30,.42,.44,.40];

// The labels can be photographed portrait, landscape, sideways or upside-down.
// Do NOT assume the Sort Code is in one fixed screen quadrant.  For each
// orientation we OCR the whole label plus a few overlapping central/right
// regions.  GridMaster verification then decides which 4-char token is real.
function drawContain(ctx,canvas,x,y,w,h){
 const s=Math.min(w/canvas.width,h/canvas.height);
 const dw=canvas.width*s,dh=canvas.height*s;
 ctx.drawImage(canvas,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
}
function buildSortMontage(img,tight=true){
 const rots=[0,90,180,270],pieces=[];
 const W=460,H=300,m=document.createElement('canvas');
 const cols=2, rows=rots.length*2;
 m.width=W*cols;m.height=H*rows;
 const g=m.getContext('2d',{willReadFrequently:true});
 g.fillStyle='#fff';g.fillRect(0,0,m.width,m.height);
 let i=0;
 for(const a of rots){
  const c=rotate(img,a,1100);

  // Whole-label tile: this is the important fallback for the real layouts.
  const full=prep(c,Math.min(1.25,900/Math.max(c.width,c.height)));
  let x=(i%cols)*W,y=Math.floor(i/cols)*H;
  drawContain(g,full,x,y,W,H); pieces.push({type:0,angle:a,x,y}); i++;

  // Broad crop tile: catches the bold code when the label occupies only part
  // of the camera frame.
  const broad=prep(crop(c,.08,.12,.84,.72),1.65);
  x=(i%cols)*W;y=Math.floor(i/cols)*H;
  drawContain(g,broad,x,y,W,H); pieces.push({type:1,angle:a,x,y}); i++;
 }
 return {canvas:m,pieces};
}
async function ocrOneOrientation(img,worker,angle,deadline){
  if(Date.now()>deadline-450) return {text:'',candidates:[],sort:''};
  try{
    const c=rotate(img,angle,1100);
    // Keep the whole label large. The previous montage reduced the bold 4-char
    // Sort Code too much, which is why TG1K/MSA1 was repeatedly missed.
    const scale=Math.min(1.35,1100/Math.max(c.width,c.height));
    const z=prep(c,scale);
    const remain=Math.max(650,Math.min(1200,deadline-Date.now()-80));
    const r=await Promise.race([
      worker.recognize(z,{rotateAuto:false}),
      new Promise((_,rej)=>setTimeout(()=>rej(Error('ocr-timeout')),remain))
    ]);
    const text=r?.data?.text||'';
    return {text,candidates:findSortCandidates(text),sort:findSortCandidates(text)[0]?.code||''};
  }catch(e){return {text:'',candidates:[],sort:''};}
}

async function readSortTemplate(img,worker,deadline){
  try{
    await worker.setParameters({
      tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      tessedit_pageseg_mode:'11',
      preserve_interword_spaces:'0'
    });

    // Simple deterministic rule:
    //  • Type-2: the bold 4-char code directly below KRV DC FMRTS (e.g. MSA1).
    //  • Type-1: the large bold 4-char code on the tag (e.g. TG1K/YMG1).
    // We therefore OCR the COMPLETE label at useful size instead of shrinking it
    // into a montage. Try the normal orientation first, then the two common
    // sideways orientations; only use 180/270 if still necessary.
    const angles=[0,90,270,180];
    const all=[];
    for(const a of angles){
      const r=await ocrOneOrientation(img,worker,a,deadline);
      if(r.text) all.push({angle:a,...r});
      if(r.sort) return {sort:r.sort,template:0,text:all.map(x=>x.text).join('\n'),candidates:r.candidates};
    }
    const merged=[];
    const seen=new Set();
    for(const r of all) for(const c of (r.candidates||[])) if(!seen.has(c.code)){seen.add(c.code);merged.push(c);}
    return {sort:merged[0]?.code||'',template:0,text:all.map(x=>x.text).join('\n'),candidates:merged};
  }catch(e){
    return {sort:'',template:0,text:'',candidates:[]};
  }finally{
    try{await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'0'});}catch(_){ }
  }
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
function candidateVariants(code){
 const s=fix4(code); if(s.length!==4)return [s];
 const map={N:['M'],M:['N'],4:['1','A'],1:['I','L'],I:['1'],L:['1'],O:['0'],Q:['0'],D:['0'],0:['O'],Z:['2'],2:['Z'],S:['5'],5:['S'],G:['6','9'],6:['G'],9:['G'],B:['8'],8:['B'],U:['V'],V:['U'],C:['G'],E:['F'],F:['E']};
 const out=[s];
 for(let i=0;i<4;i++)for(const r of (map[s[i]]||[])){const a=s.split('');a[i]=r;out.push(a.join(''));}
 for(const a of out.slice(1)){for(let i=0;i<4;i++)for(const r of (map[a[i]]||[])){const b=a.split('');b[i]=r;out.push(b.join(''));}}
 return [...new Set(out)].slice(0,12);
}

async function resolveSort(info,deadline){
 let candidates=Array.isArray(info?.candidates)?info.candidates:[];
 // If the background GridMaster request is still in flight, give it a short
 // head-start. This makes OCR variants such as 1G1K resolve to the real TG1K.
 if(!knownCodes().length && gridMasterWarmPromise){
   try{await Promise.race([gridMasterWarmPromise,new Promise(r=>setTimeout(r,Math.max(0,Math.min(700,deadline-Date.now()-900))))]);}catch(_){ }
   candidates=findSortCandidates(info?.text||'');
 }
 const ordered=[...new Map(candidates.map(c=>[norm(c.code),c])).values()].slice(0,8);
 // Use the local GridMaster cache first. This is the fastest and most reliable path.
 for(const c of ordered){
  const key=norm(c.code),grid=gridMasterCache[key];
  if(grid)return {code:key,grid:String(grid),type:c.type||0};
 }
 if(!ordered.length)return {code:'',grid:'',type:0};
 // If the cache is still warming, verify OCR candidates directly against Apps Script.
 // Also try common OCR-confusion variants, e.g. YNG4 -> YMG1.
 const expanded=[];
 for(const c of ordered){
  for(const v of candidateVariants(c.code)){
   if(!expanded.some(x=>x.code===v))expanded.push({code:v,type:c.type||0,score:(c.score||0)-(v===fix4(c.code)?0:1)});
   if(expanded.length>=12)break;
  }
  if(expanded.length>=12)break;
 }
 const jobs=expanded.map(c=>lookupSortDirect(c.code,deadline).then(grid=>({
  code:norm(c.code),grid,type:c.type||0,score:c.score||0
 })));
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
 const cropSpec=template===1?T1_BAR:T2_QR;
 const rots=[0,90,180,270];
 try{
  const vals=await Promise.all(rots.map(async a=>{
   if(Date.now()>deadline-450)return '';
   try{
    const c=rotate(img,a,1300),z=prep(crop(c,...cropSpec),1.5);
    return await zxingCanvas(z,deadline);
   }catch(e){return '';}
  }));
  return vals.find(Boolean)||'';
 }catch(e){return '';}
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
  const barcodeP=Promise.all([nativeRotatedBarcodes(img,deadline),targetedBarcode(img,1,deadline),targetedBarcode(img,2,deadline)]).then(v=>v.find(Boolean)||'');
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
   for(const t of (raw.match(/[A-Z0-9]{10,24}/g)||[])){
    const n=norm(t); if(/\d/.test(n)&&/[A-Z]/.test(n)&&n.length>=10&&!knownCodes().includes(n)&&!rs.includes(n))rs.push(n);
   }
   s.rsId=rs[0]||'';
  }
  // If OCR returned a code but the direct lookup was delayed, use the already-warmed cache once more.
  if(!s.gridNo&&s.sortCode)s.gridNo=gridMasterCache[norm(s.sortCode)]||'';
  showResult(mode);if(typeof styleResult==='function')styleResult(mode);
  // Always create an audit row after a captured label, even if one field is missing.
  // This prevents a failed Sort Code OCR from making the entire scan disappear from Google Sheets.
  if(!s.sortCode || !s.rsId || !s.gridNo){
    const missing=!s.sortCode?'SORT_CODE_MISSING':(!s.rsId?'RUNSHEET_MISSING':'GRID_MISSING');
    await saveRecord(mode,'',missing);
    if(!s.sortCode){toast('Sort Code not detected. Scan was saved to Sheet as incomplete.');return;}
    if(!s.rsId){toast('RunSheet barcode/QR not detected. Scan was saved to Sheet as incomplete.');return;}
    toast('Grid No not found. Scan was saved to Sheet as incomplete.');return;
  }
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
window.addEventListener('load',()=>{
  // Keep page/input responsive. OCR and GridMaster warm-up start only when camera/scan is used.
  setTimeout(()=>{try{getDetector().catch(()=>{})}catch(e){}},120);
});
})();
