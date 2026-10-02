// Grid Scanner By ArupD — v5.48
// Fixed label logic:
// TYPE 1 (small white label): RunSheet = TOP LINEAR BARCODE (OCR printed value fallback); Sort = BOLD RIGHT CODE.
// TYPE 2 (green/white label): RunSheet = CENTER QR (OCR printed value fallback); Sort = BOLD CENTER CODE.
// Grid No is ONLY from GridMaster. New capture always clears previous values.
(function(){
'use strict';
const DEAD=4800;
const clean=v=>String(v||'').trim();
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

function rotateCanvas(img,deg,maxW=1200){
 const sc=Math.min(1,maxW/img.naturalWidth),w=Math.max(1,Math.round(img.naturalWidth*sc)),h=Math.max(1,Math.round(img.naturalHeight*sc));
 const r=((deg%360)+360)%360,c=document.createElement('canvas');c.width=(r===90||r===270)?h:w;c.height=(r===90||r===270)?w:h;
 const g=c.getContext('2d',{willReadFrequently:true});
 if(r===90){g.translate(c.width,0);g.rotate(Math.PI/2)} else if(r===180){g.translate(c.width,c.height);g.rotate(Math.PI)} else if(r===270){g.translate(0,c.height);g.rotate(-Math.PI/2)}
 g.drawImage(img,0,0,w,h);return c;
}
function cropFrac(c,r){const [x,y,w,h]=r;const sx=Math.max(0,Math.round(c.width*x)),sy=Math.max(0,Math.round(c.height*y));const sw=Math.min(c.width-sx,Math.round(c.width*w)),sh=Math.min(c.height-sy,Math.round(c.height*h));const z=document.createElement('canvas');z.width=Math.max(1,sw);z.height=Math.max(1,sh);z.getContext('2d',{willReadFrequently:true}).drawImage(c,sx,sy,sw,sh,0,0,sw,sh);return z;}
function prep(c,scale=1.7){const z=document.createElement('canvas');z.width=Math.max(1,Math.round(c.width*scale));z.height=Math.max(1,Math.round(c.height*scale));const g=z.getContext('2d',{willReadFrequently:true});g.imageSmoothingEnabled=true;g.drawImage(c,0,0,z.width,z.height);const im=g.getImageData(0,0,z.width,z.height),d=im.data;for(let i=0;i<d.length;i+=4){let y=.299*d[i]+.587*d[i+1]+.114*d[i+2];y=(y-128)*1.45+128;y=Math.max(0,Math.min(255,y));d[i]=d[i+1]=d[i+2]=y;}g.putImageData(im,0,0);return z;}
function knownCodes(){return Object.keys(gridMasterCache||{}).map(norm).filter(Boolean);}
function edit1(a,b){if(a.length!==b.length)return 99;let d=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])d++;return d;}
function fix4(s){return norm(s).replace(/[ILO]/g,ch=>({I:'1',L:'1',O:'0'}[ch]||ch));}
function findKnownSort(text){
 const raw=String(text||'').toUpperCase();
 const toks=[...new Set((raw.match(/[A-Z0-9]{3,6}/g)||[]).map(norm))]; const known=knownCodes();
 for(const t of toks){const n=fix4(t);if(n.length===4&&known.includes(n))return n;}
 for(const t of toks)if(known.includes(t))return t;
 let best='',bd=2;for(const t0 of toks){const t=fix4(t0);for(const k of known){if(k.length!==t.length)continue;const d=edit1(t,k);if(d<bd){bd=d;best=k;}}}return bd<=1?best:'';
}
function plausibleRS(v){const n=norm(v);if(!n||n.length<7||n.length>40)return '';if(knownCodes().includes(n))return '';if(/^HTTP/i.test(n))return '';return clean(v).replace(/[^A-Za-z0-9_-]/g,'');}
function extractPrintedRS(text,type){
 const raw=String(text||'').toUpperCase();
 // Type 2 printed ID is immediately above/beside QR and normally begins DHR. Keep this strict.
 if(type===2){const m=raw.match(/\b(DHR[A-Z0-9]{8,25})\b/);if(m)return plausibleRS(m[1]);}
 // Type 1 human-readable barcode value: alphanumeric string around 7-20 chars. Prefer the line containing digits under barcode.
 const lines=raw.split(/\n+/).map(x=>x.replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim()).filter(Boolean);
 for(const line of lines){const toks=line.match(/[A-Z0-9]{7,24}/g)||[];for(const t of toks){const n=norm(t);if(/\d/.test(n)&&n.length>=7&&n.length<=24&&!/^\d{4,6}$/.test(n)){const v=plausibleRS(n);if(v)return v;}}}
 const toks=raw.match(/[A-Z0-9]{7,24}/g)||[];for(const t of toks){const n=norm(t);if(/\d/.test(n)&&n.length>=7&&n.length<=24&&!/^\d{4,6}$/.test(n)){const v=plausibleRS(n);if(v)return v;}}
 return '';
}

// Find the label from its green carrier/border. This is the key fix: old versions used coordinates
// relative to the whole camera frame, so a centered/rotated label was cropped in the wrong place.
function findGreenBox(img){
 const W=520,H=Math.max(1,Math.round(img.naturalHeight*520/img.naturalWidth));const c=document.createElement('canvas');c.width=W;c.height=H;c.getContext('2d').drawImage(img,0,0,W,H);const d=c.getContext('2d').getImageData(0,0,W,H).data;
 let minX=W,maxX=0,minY=H,maxY=0,count=0;
 for(let y=0;y<H;y+=2)for(let x=0;x<W;x+=2){const i=(y*W+x)*4,r=d[i],g=d[i+1],b=d[i+2];if(g>70&&g>r*1.18&&g>b*1.04&&(g-r)>18){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;}}
 if(count<80)return null;
 const bw=maxX-minX,bh=maxY-minY;if(bw<70||bh<35)return null;
 // Expand around green carrier to include the complete white label.
 const ex=Math.round(bw*.20),ey=Math.round(bh*.38);minX=Math.max(0,minX-ex);maxX=Math.min(W-1,maxX+ex);minY=Math.max(0,minY-ey);maxY=Math.min(H-1,maxY+ey);
 return {x:minX/W,y:minY/H,w:(maxX-minX)/W,h:(maxY-minY)/H,score:count};
}
function findBrightBox(img){
 const W=520,H=Math.max(1,Math.round(img.naturalHeight*520/img.naturalWidth));const c=document.createElement('canvas');c.width=W;c.height=H;c.getContext('2d').drawImage(img,0,0,W,H);const d=c.getContext('2d').getImageData(0,0,W,H).data;
 let minX=W,maxX=0,minY=H,maxY=0,count=0;for(let y=0;y<H;y+=2)for(let x=0;x<W;x+=2){const i=(y*W+x)*4,r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);if(mx>190&&mx-mn<45){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;}}
 if(count<250)return null;const bw=maxX-minX,bh=maxY-minY;if(bw<160||bh<90)return null;const ex=Math.round(bw*.06),ey=Math.round(bh*.06);minX=Math.max(0,minX-ex);maxX=Math.min(W-1,maxX+ex);minY=Math.max(0,minY-ey);maxY=Math.min(H-1,maxY+ey);return{x:minX/W,y:minY/H,w:(maxX-minX)/W,h:(maxY-minY)/H,score:count};
}
function cropLabel(img,rot){
 const c=rotateCanvas(img,rot,1200);const box=findGreenBox(img);
 // box was found on original orientation; easiest reliable route is detect green after rotation.
 const tmp={naturalWidth:c.width,naturalHeight:c.height}; // canvas-like input for detector
 const box2=findGreenBoxCanvas(c);
 const b=box2||findBrightBoxCanvas(c)||{x:.05,y:.05,w:.90,h:.90};
 return {c,box:b};
}
function findGreenBoxCanvas(src){
 const W=520,H=Math.max(1,Math.round(src.height*520/src.width));const c=document.createElement('canvas');c.width=W;c.height=H;c.getContext('2d').drawImage(src,0,0,W,H);const d=c.getContext('2d').getImageData(0,0,W,H).data;let minX=W,maxX=0,minY=H,maxY=0,count=0;
 for(let y=0;y<H;y+=2)for(let x=0;x<W;x+=2){const i=(y*W+x)*4,r=d[i],g=d[i+1],b=d[i+2];if(g>70&&g>r*1.18&&g>b*1.04&&(g-r)>18){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;}}
 if(count<80)return null;const bw=maxX-minX,bh=maxY-minY;if(bw<70||bh<35)return null;const ex=Math.round(bw*.20),ey=Math.round(bh*.38);minX=Math.max(0,minX-ex);maxX=Math.min(W-1,maxX+ex);minY=Math.max(0,minY-ey);maxY=Math.min(H-1,maxY+ey);return{x:minX/W,y:minY/H,w:(maxX-minX)/W,h:(maxY-minY)/H,score:count};
}
function findBrightBoxCanvas(src){
 const W=520,H=Math.max(1,Math.round(src.height*520/src.width));const c=document.createElement('canvas');c.width=W;c.height=H;c.getContext('2d').drawImage(src,0,0,W,H);const d=c.getContext('2d').getImageData(0,0,W,H).data;let minX=W,maxX=0,minY=H,maxY=0,count=0;for(let y=0;y<H;y+=2)for(let x=0;x<W;x+=2){const i=(y*W+x)*4,r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);if(mx>190&&mx-mn<45){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;}}if(count<250)return null;const bw=maxX-minX,bh=maxY-minY;if(bw<160||bh<90)return null;const ex=Math.round(bw*.06),ey=Math.round(bh*.06);minX=Math.max(0,minX-ex);maxX=Math.min(W-1,maxX+ex);minY=Math.max(0,minY-ey);maxY=Math.min(H-1,maxY+ey);return{x:minX/W,y:minY/H,w:(maxX-minX)/W,h:(maxY-minY)/H,score:count};
}

let detectorPromise=null;
async function getDetector(){if(detectorPromise)return detectorPromise;detectorPromise=(async()=>{if(!('BarcodeDetector'in window))return null;let f=['qr_code','data_matrix','code_128','code_39','code_93','codabar','ean_13','ean_8','upc_a','upc_e','itf','pdf417','aztec'];try{const s=await BarcodeDetector.getSupportedFormats();f=f.filter(x=>s.includes(x));}catch(e){}return f.length?new BarcodeDetector({formats:f}):null;})().catch(()=>null);return detectorPromise;}
async function detectNative(img,deadline){const d=await getDetector();if(!d)return {value:'',format:'',rot:0};const rots=[0,90,180,270];const jobs=rots.map(async rot=>{if(Date.now()>deadline-1200)return null;try{const c=rotateCanvas(img,rot,1200);const r=await Promise.race([d.detect(c),new Promise((_,rej)=>setTimeout(()=>rej(Error('t')),650))]);for(const it of(r||[])){const v=plausibleRS(it.rawValue);if(v){const f=String(it.format||'').toLowerCase();return{value:v,format:f,rot};}}}catch(e){}return null;});const a=await Promise.all(jobs);return a.find(Boolean)||{value:'',format:'',rot:0};}

async function ocrCanvas(worker,c,deadline){try{const p=prep(c,1.55);const remain=Math.max(600,Math.min(1800,deadline-Date.now()-120));const r=await Promise.race([worker.recognize(p,{rotateAuto:false}),new Promise((_,rej)=>setTimeout(()=>rej(Error('ocr-timeout')),remain))]);return r?.data?.text||'';}catch(e){return '';}}
async function zxing(c,deadline){try{if(!window.ZXingBrowser||Date.now()>deadline-500)return '';const R=window.ZXingBrowser.BrowserMultiFormatReader;const reader=new R();const r=await Promise.race([reader.decodeFromCanvas(c),new Promise((_,rej)=>setTimeout(()=>rej(Error('t')),800))]);return plausibleRS(r?.getText?.()||'');}catch(e){return '';}}

async function readLabel(img,worker,deadline,native){
 // Barcode/QR result decides the label type immediately when available.
 let type=(native.format==='qr_code'||native.format==='data_matrix'||native.format==='aztec')?2:(native.value?1:0);
 const rots=type?([native.rot,(native.rot+180)%360]):[0,90,180,270];
 let best={sort:'',rs:'',type:type||0};
 for(const rot of rots){
  if(Date.now()>deadline-850)break;
  const c=rotateCanvas(img,rot,1200);let box=findGreenBoxCanvas(c)||findBrightBoxCanvas(c);if(!box)box={x:.03,y:.03,w:.94,h:.94};
  const label=cropFrac(c,[Math.max(0,box.x),Math.max(0,box.y),Math.min(.98,box.w),Math.min(.98,box.h)]);
  // Determine type from the label itself when barcode detection is absent: QR-heavy label is type 2.
  let localType=type||0;
  if(!localType){
   // Type 2 has the green bands and a QR near the lower middle. OCR is enough to find MSA1/DHR.
   localType=2;
  }
  // Target the marked fields, but keep enough surrounding area for OCR fallback.
  let target=localType===1 ? [0.48,0.10,0.50,0.58] : [0.30,0.25,0.48,0.58];
  let text=await ocrCanvas(worker,cropFrac(label,target),deadline);
  if(!text) text=await ocrCanvas(worker,label,deadline);
  let sort=findKnownSort(text);
  let rs=extractPrintedRS(text,localType);
  if(localType===1 && !rs && Date.now()<deadline-1300){
    const barCrop=cropFrac(label,[0.08,0.10,0.84,0.50]);
    rs=await zxing(prep(barCrop,1.25),deadline);
    // Last fallback for the human-readable digits printed below the barcode.
    if(!rs && Date.now()<deadline-700){
      const bt=await ocrCanvas(worker,barCrop,deadline);
      rs=extractPrintedRS(bt,1)||'';
    }
  }
  if(sort||rs){best={sort:sort||best.sort,rs:rs||best.rs,type:localType};if(sort&&rs)break;}
 }
 // If native barcode/QR gave a valid value, it is authoritative for RunSheet.
 if(native.value)best.rs=native.value;
 if(native.format==='qr_code'||native.format==='data_matrix'||native.format==='aztec')best.type=2;
 else if(native.value&&native.format)best.type=1;
 return best;
}

function clearScan(mode){const s=state[mode];s.label=null;s.rsId='';s.sortCode='';s.gridNo='';const box=mode==='sorting'?$('#sortResult'):$('#putResult');if(box){box.classList.add('hidden');box.innerHTML='';}const p=mode==='sorting'?$('#sortLabelPreview'):$('#putLabelPreview');if(p)p.innerHTML='';if(mode==='putting'){$('#putGridCard')?.classList.add('hidden');$('#putGridStatus').textContent='';}}
function loadImage(url){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(Error('image'));i.src=url;});}

async function getGridFast(code,deadline){
 const key=norm(code);if(gridMasterCache[key])return gridMasterCache[key];
 // First-use lookup gets a short direct request. Background full GridMaster is already warming on page load.
 try{const left=Math.max(250,Math.min(1500,deadline-Date.now()-100));const ctrl=new AbortController();const tm=setTimeout(()=>ctrl.abort(),left);const r=await fetch(masterUrl+'?action=lookup&sortCode='+encodeURIComponent(key)+'&_='+Date.now(),{cache:'no-store',signal:ctrl.signal});clearTimeout(tm);const data=await r.json();if(data?.ok&&data?.gridNo){gridMasterCache[key]=String(data.gridNo).trim();saveGridCache();return gridMasterCache[key];}}catch(e){}
 if(gridMasterCache[key])return gridMasterCache[key];return '';
}

async function runScan(mode,file){const input=mode==='sorting'?$('#sortEmployeeId'):$('#putEmployeeId'),emp=clean(input.value);if(!emp){toast('Employee ID is required.');return;}clearScan(mode);state[mode].employeeId=emp;busy(true,'Reading label…');const deadline=Date.now()+DEAD;let url='';try{url=URL.createObjectURL(file);const img=await loadImage(url);const preview=mode==='sorting'?$('#sortLabelPreview'):$('#putLabelPreview');preview.innerHTML=`<img class="scanPreview ultraPreview" src="${url}" alt="Captured label">`;warmGridMaster().catch(()=>{});const workerP=getOcrWorker().catch(()=>null);const nativeP=detectNative(img,deadline);const worker=await Promise.race([workerP,new Promise((_,rej)=>setTimeout(()=>rej(Error('OCR engine not ready. Open the camera once before scanning.')),1100))]);if(!worker)throw Error('OCR engine not ready. Open the camera once before scanning.');const native=await Promise.race([nativeP,new Promise(r=>setTimeout(()=>r({value:'',format:'',rot:0}),850))]);const info=await readLabel(img,worker,deadline,native);const s=state[mode];s.rsId=plausibleRS(info.rs)||'';s.sortCode=info.sort||'';s.gridNo='';if(s.sortCode){s.gridNo=await getGridFast(s.sortCode,deadline);}showResult(mode);if(typeof styleResult==='function')styleResult(mode);if(!s.sortCode){toast('Sort Code not detected within 5 seconds.');return;}if(!s.rsId){toast('RunSheet ID not detected within 5 seconds.');return;}if(!s.gridNo){toast('Grid No not found in GridMaster.');return;}if(mode==='sorting'){await saveRecord(mode,'','SORTED');toast('Sorting completed.');}else{$('#putGridCard').classList.remove('hidden');$('#putGridStatus').textContent='Grid loaded. Open Grid Camera to continue.';toast('Label processed. Scan the Grid barcode.');}}catch(e){console.error(e);toast(e.message||'Could not read the label.');}finally{if(url)URL.revokeObjectURL(url);busy(false);}}
window.readLabel=runScan;

// Pre-warm the two slow resources before the employee scans.
window.addEventListener('load',()=>{setTimeout(()=>{try{getOcrWorker().catch(()=>{})}catch(e){}},50);setTimeout(()=>{try{warmGridMaster().catch(()=>{})}catch(e){}},50);setTimeout(()=>{try{getDetector().catch(()=>{})}catch(e){}} ,50);});
})();
