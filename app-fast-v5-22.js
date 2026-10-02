// Grid Scanner By ArupD — v5.22 ULTRA FAST label reader
(function(){
  "use strict";
  const clean=v=>String(v||"").trim();
  function loadImg(url){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(Error("image"));i.src=url;});}
  function rotCanvas(i,a,max=1100){
    const s=Math.min(1,max/i.naturalWidth),w=Math.max(1,Math.round(i.naturalWidth*s)),h=Math.max(1,Math.round(i.naturalHeight*s));
    const r=((a%360)+360)%360,c=document.createElement("canvas");
    c.width=(r===90||r===270)?h:w;c.height=(r===90||r===270)?w:h;
    const x=c.getContext("2d",{willReadFrequently:true});x.imageSmoothingEnabled=true;x.imageSmoothingQuality="medium";x.save();
    if(r===90){x.translate(c.width,0);x.rotate(Math.PI/2)} else if(r===180){x.translate(c.width,c.height);x.rotate(Math.PI)} else if(r===270){x.translate(0,c.height);x.rotate(-Math.PI/2)}
    x.drawImage(i,0,0,w,h);x.restore();return c;
  }
  function crop(c,q,scale=1.35){
    const [x,y,w,h]=q,z=document.createElement("canvas");z.width=Math.max(1,Math.round(w*scale));z.height=Math.max(1,Math.round(h*scale));
    const g=z.getContext("2d",{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality="medium";g.drawImage(c,x,y,w,h,0,0,z.width,z.height);return z;
  }
  function normCode(s){
    let x=String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    x=x.replace(/O(?=\d)/g,"0").replace(/(?<=\d)O/g,"0").replace(/I(?=\d)/g,"1").replace(/L(?=\d)/g,"1");
    return x;
  }
  function sortCandidates(text){
    const t=String(text||"").toUpperCase().replace(/[|]/g,"I"),out=[],seen=new Set();
    const add=v=>{const x=normCode(v);if(/^[A-Z]{1,4}\d[A-Z0-9]{0,3}$/.test(x)&&!seen.has(x)){seen.add(x);out.push(x)}};
    let m=t.match(/(?:CLUSTER\s*CODE|SORT(?:ING)?\s*CODE|SORT\s*CODE|CLUSTER)\s*[:#-]?\s*([A-Z0-9IL ]{1,10})/i);if(m)add(m[1]);
    (t.match(/\b[A-Z]{1,4}\s*\d\s*[A-Z0-9]{0,3}\b/g)||[]).forEach(add);
    const p=t.split(/[^A-Z0-9]+/).filter(Boolean);for(let i=0;i<p.length;i++){add(p[i]);if(p[i+1])add(p[i]+p[i+1])}
    return out;
  }
  function rsCandidates(text){
    const t=String(text||""),out=[],seen=new Set();
    const add=(v,score)=>{const d=String(v||"").replace(/\D/g,"");if(d.length<7||d.length>18)return;if(/^(19|20)\d{6,}$/.test(d))return;if(!seen.has(d)){seen.add(d);out.push({v:d,score:score||10})}};
    // Explicit RunSheet label/value.
    for(const re of [/RUN\s*SHEET[^0-9]{0,25}(\d[\d\s-]{6,20})/i,/RUNSHEET[^0-9]{0,25}(\d[\d\s-]{6,20})/i]){const m=t.match(re);if(m)add(m[1],100)}
    // Barcode-number OCR: long digit runs. Reject date/time-like strings.
    for(const m of (t.match(/\d[\d\s-]{6,20}/g)||[])){
      const d=m.replace(/\D/g,"");
      if(/^(19|20)\d{6,}$/.test(d))continue;
      if(/^\d{1,2}\d{2}\d{2}$/.test(d))continue;
      add(d,20+d.length);
    }
    return out.sort((a,b)=>b.score-a.score);
  }
  function extractRunSheet(v){
    const s=clean(v);if(!s)return "";
    const labeled=s.match(/(?:RUN\s*SHEET|RUNSHEET|RS\s*ID|RSID)[^0-9]{0,20}(\d{7,18})/i);if(labeled)return labeled[1];
    if(/^\d{7,18}$/.test(s)&&!/^(19|20)\d{6,}$/.test(s))return s;
    const ds=s.match(/\d{7,18}/g)||[];return ds.find(d=>!/^(19|20)\d{6,}$/.test(d))||"";
  }
  async function barcodeUltra(url){
    // Native BarcodeDetector first: 0° then only 90°/270° if necessary. Avoid expensive ZXing unless native fails.
    try{
      if("BarcodeDetector" in window){
        let fs=["code_128","code_39","code_93","codabar","ean_13","ean_8","upc_a","upc_e","itf","qr_code","data_matrix","pdf417"];
        if(BarcodeDetector.getSupportedFormats){const supported=await BarcodeDetector.getSupportedFormats();fs=fs.filter(x=>supported.includes(x));}
        if(fs.length){const d=new BarcodeDetector({formats:fs}),i=await loadImg(url);
          for(const a of [0,90,270,180]){const c=rotCanvas(i,a,1200);try{const f=await d.detect(c);for(const z of f||[]){const raw=clean(z.rawValue),v=extractRunSheet(raw);if(v)return v;}}catch(e){}}
        }
      }
    }catch(e){}
    // One ZXing attempt on original only. OCR fallback below handles printed RunSheet ID.
    try{
      const Z=window.ZXingBrowser||window.ZXing;if(Z?.BrowserMultiFormatReader){const i=await loadImg(url),c=rotCanvas(i,0,1100),r=new Z.BrowserMultiFormatReader();const q=await r.decodeFromCanvas(c);const raw=clean(q?.getText?q.getText():q?.text);return extractRunSheet(raw);}
    }catch(e){}
    return "";
  }
  async function ocrUltra(url,worker){
    const i=await loadImg(url),angles=[0,90,270,180],sort=[],rs=[],seenS=new Set(),seenR=new Set();
    const addS=x=>{if(!seenS.has(x)){seenS.add(x);sort.push(x)}};
    const addR=x=>{if(!seenR.has(x)){seenR.add(x);rs.push(x)}};
    // One small, high-value label band per orientation. This is much faster than full-image OCR.
    for(const a of angles){
      const c=rotCanvas(i,a,1050),w=c.width,h=c.height;
      const z=crop(c,[Math.round(w*.04),Math.round(h*.16),Math.round(w*.92),Math.round(h*.66)],1.35);
      await worker.setParameters({tessedit_pageseg_mode:"11",tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-"});
      const r=await worker.recognize(z,{rotateAuto:false});const t=r.data.text||"";
      sortCandidates(t).forEach(addS);rsCandidates(t).forEach(x=>addR(x.v));
      if(sort.length&&rs.length)break;
    }
    // Only one fallback pass, using the best view, if one field is still missing.
    if(!sort.length||!rs.length){
      const a=sort.length?0:90;const c=rotCanvas(i,a,1150),w=c.width,h=c.height;
      const z=crop(c,[0,Math.round(h*.20),w,Math.round(h*.60)],1.5);
      await worker.setParameters({tessedit_pageseg_mode:"11",tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-"});
      const r=await worker.recognize(z,{rotateAuto:false});const t=r.data.text||"";
      sortCandidates(t).forEach(addS);rsCandidates(t).forEach(x=>addR(x.v));
    }
    return {sort,rs,text:""};
  }
  async function getBestSort(codes){for(const code of codes){try{const g=await fetchGridForSort(code);if(g)return {code,grid:g};}catch(e){}}return null}
  function styleResult(mode){
    const box=$(mode==="sorting"?"#sortResult":"#putResult");if(!box)return;
    box.style.background="#e8f8ec";box.style.border="2px solid #b8e7c5";box.style.color="#111";box.style.fontWeight="800";
    box.querySelectorAll("div,span,strong,p,h2,label").forEach(e=>{e.style.color="#111";e.style.fontWeight="800"});
  }
  const oldRead=window.readLabel;
  window.readLabel=async function(mode,file){
    const s=state[mode],input=mode==="sorting"?$("#sortEmployeeId"):$("#putEmployeeId");s.employeeId=input.value.trim();if(!s.employeeId){toast("Employee ID is required.");return}
    busy(true,"Reading...");let url="";
    try{
      url=URL.createObjectURL(file);const preview=mode==="sorting"?$("#sortLabelPreview"):$(`#putLabelPreview`);preview.innerHTML=`<img class="scanPreview ultraPreview" src="${url}" alt="Captured label" loading="eager">`;
      const worker=await getOcrWorker();
      // Barcode and OCR run concurrently.
      const bp=barcodeUltra(url);
      const o=await ocrUltra(url,worker);
      let rs=await bp;if(!rs&&o.rs.length)rs=o.rs[0];
      s.rsId=rs||"";s.sortCode="";s.gridNo="";
      if(o.sort.length){const g=await getBestSort(o.sort);if(g){s.sortCode=g.code;s.gridNo=g.grid;}}
      showResult(mode);styleResult(mode);
      if(!s.sortCode){toast(s.rsId?"RunSheet ID captured, but Sort Code was not detected.":"RunSheet ID and Sort Code were not detected.");return}
      if(mode==="sorting"){await saveRecord(mode,"","SORTED");if(typeof addNewScanButton==="function")addNewScanButton(mode);toast("Sorting completed.");}
      else{$("#putGridCard").classList.remove("hidden");$("#putGridStatus").textContent="Grid loaded. Open Grid Camera to continue.";toast("Label processed.")}
    }catch(e){console.error(e);toast(e.message||"Could not read the label.")}finally{if(url)URL.revokeObjectURL(url);busy(false)}
  };
})();
