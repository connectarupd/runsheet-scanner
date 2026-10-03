// Grid Scanner By ArupD — v5.65
// Deterministic label templates based on the user's marked regions.
// Type 1: RunSheet = linear barcode at top; Sort Code = bold code at right (e.g. TG1K).
// Type 2: RunSheet = QR at center; Sort Code = bold center code (e.g. MSA1).
// Never use date/time or unrelated small text as RunSheet/Sort Code.
(function(){
'use strict';
const DEAD_MS=4550;
// Targeted barcode crops used by the RunSheet fallback pass.
// Keep these broad because the label can be captured at any angle; rotate()
// normalizes the orientation before these crops are tested.
const T1_BAR=[0.02,0.02,0.96,0.96];
const T2_QR=[0.02,0.02,0.96,0.96];
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
function fix4(s){return norm(s);}
function ocrFix4(s){return norm(s).replace(/[ILO]/g,ch=>({I:'1',L:'1',O:'0'}[ch]||ch));}
function isSortShape(s){const t=norm(s);return /^[A-Z0-9]{4}$/.test(t) && /[A-Z]/.test(t);}
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
 for(const t0 of toks){const n=norm(t0);if(isSortShape(n)&&known.includes(n))out.push({code:n,score:100});}
 for(const t0 of toks){
  const t=norm(t0);if(t.length<3||t.length>6||!/^[A-Z0-9]+$/.test(t))continue;
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
   text:fix4(w?.text||''), raw:String(w?.text||''),
   x:+w?.bbox?.x0||0,y:+w?.bbox?.y0||0,x1:+w?.bbox?.x1||0,y1:+w?.bbox?.y1||0,
   conf:+w?.confidence||0
 })).filter(w=>/^[A-Z0-9]{4}$/.test(w.text));
}
function cleanFour(raw){
 let t=norm(raw).replace(/[^A-Z0-9]/g,'');
 // A Sort Code is always four alphanumeric characters and must contain
 // at least one letter. This prevents dates/numeric label values such as
 // 1300 from ever becoming a Sort Code.
 if(t.length===4 && isSortShape(t)) return t;
 // OCR may insert punctuation/space inside the 4-char code.
 if(t.length>=4 && t.length<=5){
   const compact=t.slice(0,4);
   if(isSortShape(compact)) return compact;
 }
 return '';
}
function chooseFour(texts){
 const out=[];
 for(const raw of texts||[]){
   const t=cleanFour(raw);
   if(/^[A-Z0-9]{4}$/.test(t) && !out.includes(t))out.push(t);
 }
 return out;
}

// v5.65: exact-location Sort Code OCR, with a deliberately simple fallback.
// TYPE 1: the bold 4-character code printed on the label (examples: TG1K, YMG1, OMNI).
// TYPE 2: the 4-character code directly below "KRV DC FMRTS" and above "REV".
// The camera may be 0/90/180/270 degrees; we normalize all four orientations.
function drawContain(g,src,dx,dy,dw,dh){
  const sw=src.width||1, sh=src.height||1;
  const scale=Math.min(dw/sw,dh/sh);
  const w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale));
  g.drawImage(src,Math.round(dx+(dw-w)/2),Math.round(dy+(dh-h)/2),w,h);
}

function makeSortProbe(img){
  const rots=[0,90,180,270];
  const tileW=900,tileH=260,gap=10;
  // One focused Type-1 crop + one focused Type-2 crop per orientation.
  // The Type-1 crop is deliberately centred on the large/bold code area;
  // the barcode/date area is excluded so numeric OCR cannot compete with OMNI/TG1K/YMG1.
  // The Type-2 crop covers the KRV DC FMRTS -> code -> REV band.
  const m=document.createElement('canvas');
  m.width=tileW; m.height=(tileH+gap)*rots.length*2;
  const g=m.getContext('2d',{willReadFrequently:true});
  g.fillStyle='#fff';g.fillRect(0,0,m.width,m.height);
  let row=0;
  const specs=[
    {x:.42,y:.24,w:.50,h:.54,type:1}, // Type 1 large/bold Sort Code
    {x:.18,y:.16,w:.64,h:.62,type:2}  // Type 2 KRV...REV region
  ];
  for(const a of rots){
    const c=rotate(img,a,1500);
    for(const sp of specs){
      const z=prep(crop(c,sp.x,sp.y,sp.w,sp.h),2.6);
      drawContain(g,z,0,row*(tileH+gap),tileW,tileH);
      row++;
    }
  }
  return {canvas:m,tileH,gap,rots};
}

function positionScoreForSort(w,allWords,tileIndex){
  const raw=norm(w?.text||'');
  const h=Math.max(1,(+w?.bbox?.y1||0)-(+w?.bbox?.y0||0));
  const conf=+w?.confidence||0;
  let score=conf*.55 + Math.min(140,h)*1.4;
  // Type-1 rows are odd; Type-2 rows are even.
  if(tileIndex%2===1) score+=28;
  // Numeric-only 4-char strings are NEVER Sort Codes.
  if(!/[A-Z]/.test(raw)) score-=250;
  // Prefer the visually larger word in the focused crop.
  const words=allWords.filter(x=>x.tile===tileIndex);
  const maxH=Math.max(1,...words.map(x=>Math.max(1,(+x.bbox?.y1||0)-(+x.bbox?.y0||0))));
  score += (h/maxH)*90;
  // Type-2: code must be between KRV/DC/FMRTS and REV.
  const upper=words.filter(x=>/^(KRV|DC|FMRTS|KRVDCFMRTS)$/i.test(norm(x.text)));
  const rev=words.filter(x=>norm(x.text)==='REV');
  const wy=+w?.bbox?.y0||0;
  if(upper.some(x=>(+x.bbox.y0||0)<wy) && rev.some(x=>(+x.bbox.y0||0)>wy)) score+=180;
  return score;
}

function fuzzyKnownSortCandidates(rawCandidates){
  const known=knownCodes().filter(k=>k.length===4 && /[A-Z]/.test(k));
  const out=[];
  for(const raw0 of rawCandidates){
    const raw=norm(raw0);
    if(!isSortShape(raw))continue;
    if(known.includes(raw)){
      if(!out.some(x=>x.code===raw))out.push({code:raw,score:220});
      continue;
    }
    // Only apply OCR confusion mapping when comparing against a real GridMaster code.
    const variants=[raw,ocrFix4(raw)];
    for(const v of variants){
      if(!v || !/^[A-Z0-9]{4}$/.test(v) || !/[A-Z]/.test(v))continue;
      for(const k of known){
        const d=editDistance(v,k);
        if(d<=1){
          const score=190-d*20;
          if(!out.some(x=>x.code===k) || score>out.find(x=>x.code===k).score){
            const old=out.findIndex(x=>x.code===k); if(old>=0)out.splice(old,1);
            out.push({code:k,score});
          }
        }
      }
    }
  }
  out.sort((a,b)=>b.score-a.score);
  return out;
}

async function readSortTemplate(img,worker,deadline){
  let probeInfo=null;
  try{
    await worker.setParameters({
      tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      tessedit_pageseg_mode:'6',
      preserve_interword_spaces:'0',
      user_defined_dpi:'300'
    });
    probeInfo=makeSortProbe(img);
    const remaining=Math.max(1000,deadline-Date.now()-100);
    const r=await Promise.race([
      worker.recognize(probeInfo.canvas,{rotateAuto:false}),
      new Promise((_,rej)=>setTimeout(()=>rej(Error('sort-ocr-timeout')),remaining))
    ]);
    const data=r?.data||{};
    const text=String(data.text||'');
    const allRaw=Array.isArray(data.words)?data.words:[];
    const words=[];
    const tileH=probeInfo.tileH+probeInfo.gap;
    for(const w of allRaw){
      const y=+w?.bbox?.y0||0;
      const tile=Math.max(0,Math.min(7,Math.floor(y/tileH)));
      words.push({text:String(w?.text||''),bbox:w?.bbox||{},confidence:+w?.confidence||0,tile});
    }

    const spatial=[];
    for(const w of words){
      const code=cleanFour(w.text);
      if(!isSortShape(code))continue;
      const score=positionScoreForSort(w,words,w.tile);
      spatial.push({code,score,type:(w.tile%2===1)?2:1,angle:probeInfo.rots[Math.floor(w.tile/2)],tile:w.tile});
    }
    spatial.sort((a,b)=>b.score-a.score);

    // Exact spatial result wins over generic OCR text.
    const exactKnown=spatial.filter(h=>knownCodes().includes(h.code));
    if(exactKnown.length){
      const h=exactKnown[0];
      return {sort:h.code,template:h.type,angle:h.angle,text,candidates:[{code:h.code,score:h.score+100,type:h.type,angle:h.angle},...spatial],data};
    }

    const rawTokens=words.map(w=>w.text).concat(sortTokens(text));
    const knownHits=fuzzyKnownSortCandidates(rawTokens);
    if(knownHits.length){
      const h=knownHits[0];
      const near=spatial.find(x=>x.code===h.code) || spatial.find(x=>editDistance(x.code,h.code)<=1);
      return {sort:h.code,template:near?.type||1,angle:near?.angle??90,text,candidates:[{code:h.code,score:h.score,type:near?.type||1,angle:near?.angle??90},...spatial],data};
    }

    // If GridMaster is not yet warm, return the best focused alphanumeric code.
    if(spatial.length){
      const h=spatial[0];
      return {sort:h.code,template:h.type,angle:h.angle,text,candidates:spatial,data};
    }

    const chunks=chooseFour(sortTokens(text)).filter(isSortShape);
    if(chunks.length)return {sort:chunks[0],template:0,angle:0,text,candidates:chunks.map(code=>({code,score:12,type:0,angle:0})),data};
    return {sort:'',template:0,angle:0,text,candidates:[],data};
  }catch(e){
    return {sort:'',template:0,angle:0,text:'',candidates:[],data:null};
  }finally{
    try{await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'0'});}catch(_){ }
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
 const s=norm(code); if(s.length!==4)return [s];
 const map={N:['M'],M:['N'],4:['1','A'],1:['I','L'],I:['1'],L:['1'],O:['0'],Q:['0'],D:['0'],0:['O'],Z:['2'],2:['Z'],S:['5'],5:['S'],G:['6','9'],6:['G'],9:['G'],B:['8'],8:['B'],U:['V'],V:['U'],C:['G'],E:['F'],F:['E']};
 const out=[s,ocrFix4(s)];
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
 // Never erase a code that the dedicated spatial OCR actually detected.
 // GridMaster may be unavailable/slow; the UI should still show the detected Sort Code.
 const fallback=ordered[0];
 if(fallback?.code) return {code:norm(fallback.code),grid:'',type:fallback.type||0};
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

async function targetedBarcodeAtAngle(img,template,angle,deadline){
 try{
  const c=rotate(img,angle,1600);
  // Type 1 barcode is the long linear barcode at the top of the normalized label.
  // Type 2 keeps a broad centre crop because its QR/barcode position differs.
  const spec=template===1 ? [0.05,0.04,0.78,0.38] : [0.08,0.08,0.84,0.72];
  const z=prep(crop(c,...spec),2.2);
  const d=await getDetector();
  if(d){
    try{
      const r=await Promise.race([d.detect(z),new Promise((_,rej)=>setTimeout(()=>rej(Error('t')),650))]);
      for(const it of (r||[])){const v=validRS(it.rawValue);if(v)return v;}
    }catch(e){}
  }
  return await zxingCanvas(z,deadline);
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

function fallbackRunSheetFromSortInfo(info){
  const template=+info?.template||0;
  const text=String(info?.text||'').toUpperCase();
  // Type 2: explicit DHRXSF... printed RunSheet.
  const dhr=text.match(/D\s*H\s*R\s*X\s*S\s*F\s*[A-Z0-9]{6,24}/);
  if(dhr){const v=dhr[0].replace(/[^A-Z0-9]/g,'');if(/^DHRXSF[A-Z0-9]{6,24}$/.test(v))return v;}
  // Type 1: only long numeric tokens, never 4-digit/clock/date fragments.
  if(template===1){
    const vals=(text.match(/\b\d{8,12}\b/g)||[]).filter(v=>!/^20\d{6}$/.test(v));
    if(vals.length)return vals.sort((a,b)=>b.length-a.length)[0];
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
  const [sortInfo,barcode0]=await Promise.all([sortP,barcodeP]);
  let barcode=barcode0;
  if(!barcode && sortInfo?.template && Date.now()<deadline-250){
    barcode=await targetedBarcodeAtAngle(img,sortInfo.template,sortInfo.angle||0,deadline);
  }
  const resolved=await resolveSort(sortInfo,deadline);
  const s=state[mode];
  // Barcode/QR remains the primary RunSheet source. Only when decoding fails
  // do we apply the explicit label-type fallback rules above.
  s.rsId=validRS(barcode)||validRS(fallbackRunSheetFromSortInfo(sortInfo))||'';
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
  setTimeout(()=>{try{getDetector().catch(()=>{})}catch(e){}; try{warmGridMaster().catch(()=>{})}catch(e){}},120);
});
})();
