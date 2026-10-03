// Grid Scanner By ArupD — v5.59
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
 const lines=raw.split(/\r?\n/);
 for(const line of lines){
  const compact=line.replace(/[^A-Z0-9]/g,'');
  if(compact.length>=4&&compact.length<=6) out.add(compact);
  for(let len=4;len<=6;len++)for(let i=0;i+len<=compact.length;i++)out.add(compact.slice(i,i+len));
 }
 const small=(raw.match(/[A-Z0-9]{1,3}/g)||[]);
 for(let i=0;i<small.length-1;i++){
  const a=norm(small[i]),b=norm(small[i+1]);
  if(a.length+b.length>=4&&a.length+b.length<=6)out.add(a+b);
 }
 return [...out];
}
function findSortCandidates(text){
 const toks=sortTokens(text),known=knownCodes(),out=[];
 for(const t0 of toks){const n=fix4(t0);if(n.length===4&&known.includes(n))out.push({code:n,score:100});}
 for(const t0 of toks){
  const t=fix4(t0);if(t.length<3||t.length>6)continue;
  for(const k of known){if(k.length!==4)continue;const d=editDistance(t,k);if(d<=2&&!out.some(x=>x.code===k))out.push({code:k,score:84-d});}
 }
 for(const t0 of toks){const n=fix4(t0);if(n.length===4&&/[A-Z]/.test(n)&&/\d/.test(n)&&/^[A-Z0-9]{4}$/.test(n)&&!out.some(x=>x.code===n))out.push({code:n,score:10});}
 return out;
}

// Deterministic Sort Code rule supplied by the user:
// TYPE 1 = the large/bold 4-character code on the tag (e.g. TG1K/YMG1).
// TYPE 2 = the 4-character code directly below "KRV DC FMRTS" and above "REV" (e.g. MSA1).
// We use OCR word boxes, not arbitrary OCR text/date tokens.
function fourCharWords(data){
 const words=Array.isArray(data?.words)?data.words:[];
 return words.map(w=>({
   text:fix4(w?.text||''),
   raw:String(w?.text||''),
   x:+w?.bbox?.x0||0,y:+w?.bbox?.y0||0,x1:+w?.bbox?.x1||0,y1:+w?.bbox?.y1||0,
   conf:+w?.confidence||0
 })).filter(w=>/^[A-Z0-9]{4}$/.test(w.text));
}
function scoreSpatialSort(data){
 const words=fourCharWords(data); if(!words.length)return {code:'',score:-1,type:0};
 const all=Array.isArray(data?.words)?data.words:[];
 const upper=all.map(w=>({t:norm(w?.text||''),x:+w?.bbox?.x0||0,y:+w?.bbox?.y0||0,x1:+w?.bbox?.x1||0,y1:+w?.bbox?.y1||0,conf:+w?.confidence||0}));
 const headerParts=upper.filter(w=>['KRV','DC','FMRTS','KRVDCFMRTS'].includes(w.t));
 const revs=upper.filter(w=>w.t==='REV'||w.t.includes('REV'));
 let best=null;
 // Detect the Type-2 header even when OCR separates it into KRV / DC / FMRTS.
 const header=headerParts.length>=2 ? {
   x:Math.min(...headerParts.map(w=>w.x)), y:Math.min(...headerParts.map(w=>w.y)),
   x1:Math.max(...headerParts.map(w=>w.x1)), y1:Math.max(...headerParts.map(w=>w.y1))
 } : null;
 for(const w of words){
   let score=w.conf*.15 + Math.max(0,(w.y1-w.y))*2;
   // Penalize obvious non-sort 4-char labels.
   if(['KRV','FMRT','FMTS','DHRX','XSRF','DATE','TIME','SEPT','JULY','AUGU'].includes(w.text)) score-=50;
   // Type-2: directly under the KRV DC FMRTS header and above REV.
   const a=header;
   if(a){
     const ax=(a.x+a.x1)/2, wx=(w.x+w.x1)/2;
     const below=w.y>a.y1-10 && w.y<a.y1+Math.max(140,(a.y1-a.y)*4.5) && Math.abs(wx-ax)<Math.max(180,(a.x1-a.x)*2.5);
     const rev=revs.find(r=>r.y>w.y && r.y-w.y<Math.max(220,(w.y1-w.y)*6));
     if(below) score+=90;
     if(rev) score+=35;
   }
   // Type-1: the sort code is visually large/bold. Prefer taller 4-char words.
   score += (w.y1-w.y)*1.5;
   if(!best||score>best.score)best={code:w.text,score,type:anchor?2:1};
 }
 return best||{code:'',score:-1,type:0};
}

const T1_SORT=[.18,.10,.64,.38],T1_SORT_TIGHT=[.28,.30,.50,.32],T1_BAR=[.08,.22,.78,.46];
const T2_SORT=[.28,.20,.50,.56],T2_SORT_TIGHT=[.38,.28,.48,.40],T2_QR=[.30,.42,.44,.40];
function drawContain(ctx,canvas,x,y,w,h){const s=Math.min(w/canvas.width,h/canvas.height);const dw=canvas.width*s,dh=canvas.height*s;ctx.drawImage(canvas,x+(w-dw)/2,y+(h-dh)/2,dw,dh);}
function makeOcrMontage(img){
 const rots=[0,90,270,180],W=700,H=520,m=document.createElement('canvas');m.width=W;m.height=H*rots.length;
 const g=m.getContext('2d',{willReadFrequently:true});g.fillStyle='#fff';g.fillRect(0,0,m.width,m.height);
 let y=0;
 for(const a of rots){
   const c=rotate(img,a,1200);
   // Each row contains two enlarged crops: left = centre/type-2 zone, right = large type-1 zone.
   const left=prep(crop(c,.18,.08,.64,.70),1.9);
   const right=prep(crop(c,.38,.08,.55,.78),2.0);
   drawContain(g,left,0,y,W/2,H); drawContain(g,right,W/2,y,W/2,H); y+=H;
 }
 return m;
}
async function readSortTemplate(img,worker,deadline){
 try{
  await worker.setParameters({tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',tessedit_pageseg_mode:'11',preserve_interword_spaces:'0'});
  const montage=makeOcrMontage(img);
  const r=await Promise.race([worker.recognize(montage,{rotateAuto:false}),new Promise((_,rej)=>setTimeout(()=>rej(Error('sort-ocr-timeout')),Math.max(900,deadline-Date.now()-120))) ]);
  const data=r?.data||{},text=data.text||'';
  const spatial=scoreSpatialSort(data);
  const candidates=findSortCandidates(text);
  // Exact GridMaster match wins, but only among the spatially plausible 4-char words.
  const spatialCode=fix4(spatial.code);
  const exact=knownCodes().find(k=>k===spatialCode);
  if(exact)return {sort:exact,template:spatial.type,text,candidates:[{code:exact,score:150,type:spatial.type},...candidates],data};
  // If GridMaster is not warm yet, preserve the spatially selected mixed 4-char code.
  if(spatialCode && spatialCode.length===4 && /[A-Z]/.test(spatialCode) && /\d/.test(spatialCode))return {sort:spatialCode,template:spatial.type,text,candidates:[{code:spatialCode,score:spatial.score,type:spatial.type},...candidates],data};
  return {sort:'',template:0,text,candidates,data};
 }catch(e){return {sort:'',template:0,text:'',candidates:[],data:null};}
 finally{try{await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'0'});}catch(_){}}
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

// RunSheet fallback rules requested by the user:
// 1) First choice is always the actual barcode/QR value.
// 2) If barcode/QR is not decoded:
//    - Type-2 label: use the printed DHRXSF... RunSheet ID.
//    - Type-1 label: use the numeric value printed directly under the barcode.
// Never use date/time values as RunSheet IDs.
function fallbackRunSheetFromText(text){
 const raw=String(text||'').toUpperCase();
 // Type-2 printed RunSheet: DHRXSF followed by the numeric/alphanumeric tail.
 const dhr=raw.match(/D\s*H\s*R\s*X\s*S\s*F\s*[A-Z0-9]{6,24}/);
 if(dhr){
   const v=dhr[0].replace(/[^A-Z0-9]/g,'');
   if(/^DHRXSF[A-Z0-9]{6,24}$/.test(v)) return v;
 }
 const compact=raw.replace(/[^A-Z0-9\n ]/g,' ');
 // Type-1 fallback: barcode number is a long numeric token. Dates/times are
 // deliberately excluded; short numbers such as 2026/2027 are also excluded.
 const nums=(compact.match(/\b\d{7,12}\b/g)||[]);
 const filtered=nums.filter(v=>{
   if(/^20\d{2}(0[1-9]|1[0-2])\d{2}$/.test(v)) return false;
   if(/^20\d{2}(0[1-9]|1[0-2])$/.test(v)) return false;
   if(/^\d{1,2}(0\d|1\d|2[0-3])\d{2}$/.test(v)) return false;
   return true;
 });
 // Prefer the longest numeric candidate because the RunSheet barcode text is
 // substantially longer than any ordinary label number/date.
 if(filtered.length) return filtered.sort((a,b)=>b.length-a.length)[0];
 return '';
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
async function zxingFullRotated(img,deadline){
  try{
    if(!window.ZXingBrowser || Date.now()>deadline-350) return '';
    const rots=[0,90,270,180];
    const vals=await Promise.all(rots.map(async a=>{
      if(Date.now()>deadline-350)return '';
      try{
        const c=rotate(img,a,1600);
        const z=prep(c,1.0);
        return await zxingCanvas(z,deadline);
      }catch(e){return '';}
    }));
    return vals.find(Boolean)||'';
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
  const barcodeP=Promise.all([nativeRotatedBarcodes(img,deadline),zxingFullRotated(img,deadline),targetedBarcode(img,1,deadline),targetedBarcode(img,2,deadline)]).then(v=>v.find(Boolean)||'');
  const worker=await Promise.race([workerP,new Promise((_,rej)=>setTimeout(()=>rej(Error('OCR engine not ready. Open the camera once before scanning.')),1200))]);
  if(!worker)throw Error('OCR engine not ready. Open the camera once before scanning.');
  const sortP=readSortTemplate(img,worker,deadline);
  const [sortInfo,barcode]=await Promise.all([sortP,barcodeP]);
  const resolved=await resolveSort(sortInfo,deadline);
  const s=state[mode];
  // Barcode/QR remains the primary RunSheet source. Only when decoding fails
  // do we apply the explicit label-type fallback rules above.
  s.rsId=validRS(barcode)||validRS(fallbackRunSheetFromText(sortInfo.text))||'';
  s.sortCode=resolved.code||'';
  s.gridNo=resolved.grid||'';
  // RunSheet ID is barcode/QR ONLY. Never use OCR text/date/time as RunSheet.
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
