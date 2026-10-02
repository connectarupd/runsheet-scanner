// Grid Scanner By ArupD — v5.21 Fast 2-label orientation-safe reader
(function(){
  "use strict";
  const clean=v=>String(v||"").trim();
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function loadImg(url){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(Error("image"));i.src=url;});}
  function rotCanvas(i,a,max=1500){
    const s=Math.min(1,max/i.naturalWidth),w=Math.max(1,Math.round(i.naturalWidth*s)),h=Math.max(1,Math.round(i.naturalHeight*s));
    const r=((a%360)+360)%360,c=document.createElement("canvas");
    c.width=(r===90||r===270)?h:w;c.height=(r===90||r===270)?w:h;
    const x=c.getContext("2d",{willReadFrequently:true});x.imageSmoothingEnabled=true;x.imageSmoothingQuality="high";x.save();
    if(r===90){x.translate(c.width,0);x.rotate(Math.PI/2)} else if(r===180){x.translate(c.width,c.height);x.rotate(Math.PI)} else if(r===270){x.translate(0,c.height);x.rotate(-Math.PI/2)}
    x.drawImage(i,0,0,w,h);x.restore();return c;
  }
  function crop(c,q,scale=1.5){
    const [x,y,w,h]=q,z=document.createElement("canvas");z.width=Math.max(1,Math.round(w*scale));z.height=Math.max(1,Math.round(h*scale));
    const g=z.getContext("2d",{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality="high";g.drawImage(c,x,y,w,h,0,0,z.width,z.height);return z;
  }
  function normCode(s){
    let x=String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    x=x.replace(/O(?=\d)/g,"0").replace(/(?<=\d)O/g,"0").replace(/I(?=\d)/g,"1").replace(/L(?=\d)/g,"1");
    return x;
  }
  function sortCandidates(text){
    const t=String(text||"").toUpperCase().replace(/[|]/g,"I"),out=[],seen=new Set();
    const add=v=>{const x=normCode(v);if(/^[A-Z]{1,4}\d[A-Z0-9]{0,3}$/.test(x)&&!seen.has(x)){seen.add(x);out.push(x)}};
    let m=t.match(/(?:CLUSTER\s*CODE|SORT(?:ING)?\s*CODE|SORT\s*CODE)\s*[:#-]?\s*([A-Z0-9IL ]{1,10})/i);if(m)add(m[1]);
    (t.match(/[A-Z]{1,4}\s*\d\s*[A-Z0-9]{0,3}/g)||[]).forEach(add);
    const p=t.split(/[^A-Z0-9]+/).filter(Boolean);for(let i=0;i<p.length;i++){add(p[i]);if(p[i+1])add(p[i]+p[i+1])}
    return out;
  }
  function digitCandidates(text){
    const t=String(text||""),out=[];
    const near=t.match(/RUN\s*SHEET[^\d]{0,20}(\d[\d\s-]{6,20})/i);if(near){const d=near[1].replace(/\D/g,"");if(d.length>=7&&d.length<=18&&!/19\d{2}|20\d{2}/.test(d))out.push({v:d,score:100});}
    for(const m of (t.match(/\d[\d\s-]{6,20}/g)||[])){
      const d=m.replace(/\D/g,"");
      if(d.length<7||d.length>18)continue;
      if(/19\d{2}|20\d{2}/.test(d))continue;
      // reject obvious time/date fragments
      if(/^\d{1,2}\d{2}\d{2}$/.test(d))continue;
      out.push({v:d,score:20+d.length});
    }
    const seen=new Set();return out.filter(x=>!seen.has(x.v)&&seen.add(x.v)).sort((a,b)=>b.score-a.score);
  }
  function extractRunSheetFromRaw(v){
    const s=clean(v);if(!s)return "";
    const labeled=s.match(/(?:RUN\s*SHEET|RUNSHEET|RS\s*ID|RSID)[^0-9]{0,20}(\d{7,18})/i);if(labeled)return labeled[1];
    if(/^\d{7,18}$/.test(s)&&!/19\d{2}|20\d{2}/.test(s))return s;
    const ds=s.match(/\d{7,18}/g)||[];return ds.find(d=>!/19\d{2}|20\d{2}/.test(d))||"";
  }
  async function barcodeFast(url){
    const i=await loadImg(url);
    const angles=[0,90,270,180];
    try{
      if("BarcodeDetector" in window){
        let fs=["code_128","code_39","code_93","codabar","ean_13","ean_8","upc_a","upc_e","itf","qr_code","data_matrix","pdf417"];
        if(BarcodeDetector.getSupportedFormats){const supported=await BarcodeDetector.getSupportedFormats();fs=fs.filter(x=>supported.includes(x));}
        if(fs.length){const d=new BarcodeDetector({formats:fs});
          for(const a of angles){const c=rotCanvas(i,a,2200);try{const f=await d.detect(c);for(const z of f||[]){const raw=clean(z.rawValue);const v=extractRunSheetFromRaw(raw);if(v)return v;}}catch(e){}}
        }
      }
    }catch(e){}
    try{
      const Z=window.ZXingBrowser||window.ZXing;if(Z?.BrowserMultiFormatReader){const r=new Z.BrowserMultiFormatReader();
        for(const a of angles){const c=rotCanvas(i,a,2000);try{const q=await r.decodeFromCanvas(c);const raw=clean(q?.getText?q.getText():q?.text);const v=extractRunSheetFromRaw(raw);if(v)return v;}catch(e){}}
      }
    }catch(e){}
    return "";
  }
  async function ocrRead(url,worker){
    const i=await loadImg(url),angles=[0,90,270,180],texts=[],foundSort=[],foundRS=[];
    // Fast pass: only four orientation views. Stop as soon as both values are available.
    for(const a of angles){
      const c=rotCanvas(i,a,1450);
      await worker.setParameters({tessedit_pageseg_mode:"11",tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-"});
      const r=await worker.recognize(c,{rotateAuto:false});const t=r.data.text||"";texts.push(t);
      foundSort.push(...sortCandidates(t));foundRS.push(...digitCandidates(t));
      if(foundSort.length&&foundRS.length)break;
    }
    // Fast targeted pass only when something is missing. Pick the orientation with the richest OCR text.
    if(!foundSort.length||!foundRS.length){
      const bestIdx=texts.reduce((bi,t,i)=>t.length>texts[bi].length?i:bi,0),a=angles[bestIdx]||0,c=rotCanvas(i,a,1700),w=c.width,h=c.height;
      const regions=[
        [0,Math.round(h*.22),w,Math.round(h*.48)], // barcode + number + nearby code
        [Math.round(w*.15),Math.round(h*.38),Math.round(w*.75),Math.round(h*.50)], // code/run sheet band
        [0,Math.round(h*.50),w,Math.round(h*.38)] // lower label fields
      ];
      for(const q of regions){
        const z=crop(c,q,1.6);await worker.setParameters({tessedit_pageseg_mode:"11",tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-"});
        const r=await worker.recognize(z,{rotateAuto:false});const t=r.data.text||"";texts.push(t);foundSort.push(...sortCandidates(t));foundRS.push(...digitCandidates(t));
        if(foundSort.length&&foundRS.length)break;
      }
    }
    return {sort:[...new Set(foundSort)],rs:[...new Set(foundRS.map(x=>x.v))],text:texts.join("\n")};
  }
  async function getBestSort(codes){
    for(const code of codes){try{const g=await fetchGridForSort(code);if(g)return {code,grid:g};}catch(e){}}
    return null;
  }
  function styleResult(mode){
    const box=$(mode==="sorting"?"#sortResult":"#putResult");if(!box)return;
    box.style.background="#e8f8ec";box.style.border="2px solid #b8e7c5";box.style.color="#111";box.style.fontWeight="800";
    box.querySelectorAll("div,span,strong,p,h2,label").forEach(e=>{e.style.color="#111";e.style.fontWeight="800"});
  }
  const oldRead=window.readLabel;
  window.readLabel=async function(mode,file){
    const s=state[mode],input=mode==="sorting"?$("#sortEmployeeId"):$("#putEmployeeId");s.employeeId=input.value.trim();if(!s.employeeId){toast("Employee ID is required.");return}
    busy(true,"Reading label...");let url="";
    try{
      url=URL.createObjectURL(file);const preview=mode==="sorting"?$("#sortLabelPreview"):$(`#putLabelPreview`);preview.innerHTML=`<img class="scanPreview" src="${url}" alt="Captured label" loading="eager">`;
      const worker=await getOcrWorker();
      // Barcode and OCR start together.
      const bp=barcodeFast(url);
      $("#busyText").textContent="Reading label...";
      const o=await ocrRead(url,worker);let rs=await bp;
      if(!rs && o.rs.length)rs=o.rs[0];
      s.rsId=rs||"";s.sortCode="";s.gridNo="";
      if(o.sort.length){$("#busyText").textContent="Checking Sort Code...";const g=await getBestSort(o.sort);if(g){s.sortCode=g.code;s.gridNo=g.grid;}}
      showResult(mode);styleResult(mode);
      if(!s.sortCode){toast(s.rsId?"RunSheet ID captured, but Sort Code was not detected.":"RunSheet ID and Sort Code were not detected.");return}
      if(mode==="sorting"){await saveRecord(mode,"","SORTED");if(typeof addNewScanButton==="function")addNewScanButton(mode);toast(s.rsId?"Sorting completed.":"Sorting completed. RunSheet ID not detected.");}
      else{$("#putGridCard").classList.remove("hidden");$("#putGridStatus").textContent=s.rsId?"Grid loaded. Open Grid Camera to continue.":"Grid loaded. RunSheet ID not detected. Open Grid Camera to continue.";toast("Label processed.");}
    }catch(e){console.error(e);toast(e.message||"Could not read the label.")}finally{if(url)URL.revokeObjectURL(url);busy(false)}
  };
})();
