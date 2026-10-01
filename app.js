// Admin Fixed v2 — URL is built into the app; users do not enter configuration.
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const state = {
  sorting: { label:null, employeeId:"", rsId:"", sortCode:"", gridNo:"" },
  putting: { label:null, employeeId:"", rsId:"", sortCode:"", gridNo:"", scanner:null, stream:null }
};

const HISTORY_KEY = "rs_app_history_v2";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwpuHkLf9VT6qcqDNr7AvyWdJzPJFITMWdFNiRrpZU1svxCNrUWffdA_mMSsZCmBPN6kQ/exec";
let cameraStream = null;
let cameraMode = null;

function toast(msg){
  const el=$("#toast"); el.textContent=msg; el.classList.add("show");
  clearTimeout(window.__toastTimer); window.__toastTimer=setTimeout(()=>el.classList.remove("show"),3000);
}
function busy(on,msg="Processing..."){
  $("#busy").classList.toggle("hidden",!on); $("#busyText").textContent=msg;
}
function normalize(v){ return (v||"").toUpperCase().replace(/[^A-Z0-9]/g,""); }
function escapeHtml(x){return String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}

function showResult(mode){
  const s=state[mode], box=mode==="sorting"?$("#sortResult") : $("#putResult");
  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="resultTitle">SCAN RESULT</div>
    <div class="row"><span>Employee ID</span><b>${escapeHtml(s.employeeId||"-")}</b></div>
    <div class="row"><span>RunSheet ID</span><b>${escapeHtml(s.rsId||"-")}</b></div>
    <div class="row"><span>Sort Code</span><b>${escapeHtml(s.sortCode||"-")}</b></div>
    <div class="row"><span>Grid No</span><b>${escapeHtml(s.gridNo||"-")}</b></div>`;
}


async function decodeLabelBarcode(file, objectUrl){
  // 1) Use the browser's native barcode detector when available.
  try{
    if("BarcodeDetector" in window){
      const formats = ["code_128","code_39","ean_13","ean_8","upc_a","upc_e","itf","codabar","qr_code"];
      let detector;
      try{ detector = new BarcodeDetector({formats}); }
      catch(e){ detector = new BarcodeDetector(); }

      const img = new Image();
      img.src = objectUrl;
      await img.decode();
      const found = await detector.detect(img);
      if(found && found.length){
        const value = found.find(x => x.rawValue)?.rawValue || "";
        if(value) return value.trim();
      }
    }
  }catch(e){
    console.warn("Native barcode detector failed", e);
  }

  // 2) ZXing fallback with multiple image enhancements/crops.
  try{
    const reader = new ZXingBrowser.BrowserMultiFormatReader();
    const img = new Image();
    img.src = objectUrl;
    await img.decode();

    const attempts = [img];
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const maxSide = Math.max(iw, ih);
    const scale = maxSide < 1600 ? 2 : 1;

    const makeCanvas = (mode, crop) => {
      let sx=0, sy=0, sw=iw, sh=ih;
      if(crop){
        sx=Math.floor(iw*crop.x); sy=Math.floor(ih*crop.y);
        sw=Math.floor(iw*crop.w); sh=Math.floor(ih*crop.h);
      }
      const c=document.createElement("canvas");
      c.width=Math.max(1,Math.round(sw*scale));
      c.height=Math.max(1,Math.round(sh*scale));
      const ctx=c.getContext("2d",{willReadFrequently:true});
      ctx.drawImage(img,sx,sy,sw,sh,0,0,c.width,c.height);

      if(mode){
        const d=ctx.getImageData(0,0,c.width,c.height);
        const p=d.data;
        for(let i=0;i<p.length;i+=4){
          const g=0.299*p[i]+0.587*p[i+1]+0.114*p[i+2];
          const v=mode==="bw" ? (g>150?255:0) : g;
          p[i]=p[i+1]=p[i+2]=v;
        }
        ctx.putImageData(d,0,0);
      }
      return c;
    };

    attempts.push(makeCanvas(null,null));
    attempts.push(makeCanvas("gray",null));
    attempts.push(makeCanvas("bw",null));
    attempts.push(makeCanvas(null,{x:0,y:0,w:1,h:0.65}));
    attempts.push(makeCanvas(null,{x:0,y:0.15,w:1,h:0.7}));
    attempts.push(makeCanvas(null,{x:0,y:0.35,w:1,h:0.65}));

    for(const source of attempts){
      try{
        let result;
        if(source instanceof HTMLCanvasElement){
          const im=new Image();
          im.src=source.toDataURL("image/png");
          await im.decode();
          result=await reader.decodeFromImageElement(im);
        }else{
          result=await reader.decodeFromImageElement(source);
        }
        const value=result?.getText?.()||"";
        if(value.trim()) return value.trim();
      }catch(e){
        // Try the next representation.
      }
    }
  }catch(e){
    console.warn("ZXing barcode decode failed",e);
  }
  return "";
}


function extractFields(text, barcodeValue){
  const raw=(text||"").toUpperCase();
  const compact=raw.replace(/\s+/g," ");
  let rs = barcodeValue || "";
  const rsMatch=compact.match(/(?:RUN\s*SHEET|RUNSHEET|RS\s*ID|RSID)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,})/i);
  if(rsMatch && !barcodeValue) rs=rsMatch[1];

  let sort="";
  const sm=compact.match(/(?:SORT(?:ING)?\s*CODE|SORT\s*CODE|SORT)\s*[:#-]?\s*([A-Z]{1,4}\d[A-Z0-9]{0,3})/i);
  if(sm) sort=sm[1];
  if(!sort){
    const candidates=compact.match(/\b[A-Z]{1,4}\d[A-Z0-9]{0,3}\b/g)||[];
    sort=candidates.find(x=>!/^RS\d*$/i.test(x) && x.length>=3 && x.length<=6) || "";
  }
  return {rsId:rs,sortCode:sort,gridNo:"",ocrText:raw};
}

async function fetchGridForSort(sortCode){
  const res=await fetch(APPS_SCRIPT_URL+"?action=lookup&sortCode="+encodeURIComponent(sortCode),{cache:"no-store"});
  const data=await res.json();
  if(!data.ok || !data.gridNo) throw new Error("Sort Code was not found in GridMaster: "+sortCode);
  return String(data.gridNo).trim().toUpperCase();
}

async function openLabelCamera(mode){
  const employeeInput = mode==="sorting" ? $("#sortEmployeeId") : $("#putEmployeeId");
  const employeeId=employeeInput.value.trim();
  if(!employeeId){ toast("Employee ID is required."); employeeInput.focus(); return; }
  cameraMode=mode;
  $("#cameraTitle").textContent=mode==="sorting"?"Sorting - Label Camera":"Putting - Label Camera";
  $("#cameraModal").classList.remove("hidden");
  try{
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Camera access is not supported by this browser.");
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}},audio:false});
    const video=$("#labelCamera"); video.srcObject=cameraStream; await video.play();
  }catch(e){
    closeLabelCamera();
    toast("Camera could not be opened. Please allow camera permission and use the HTTPS GitHub Pages URL.");
  }
}

function closeLabelCamera(){
  if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}
  $("#labelCamera").srcObject=null;
  $("#cameraModal").classList.add("hidden");
  cameraMode=null;
}

async function captureLabelPhoto(){
  if(!cameraMode) return;
  const video=$("#labelCamera");
  if(!video.videoWidth){toast("Camera is not ready yet.");return;}
  const canvas=$("#captureCanvas");
  canvas.width=video.videoWidth; canvas.height=video.videoHeight;
  const ctx=canvas.getContext("2d"); ctx.drawImage(video,0,0,canvas.width,canvas.height);
  canvas.toBlob(async blob=>{
    if(!blob){toast("Could not capture the photo.");return;}
    const mode=cameraMode;
    closeLabelCamera();
    await readLabel(mode,blob);
  },"image/jpeg",0.92);
}

async function readLabel(mode,file){
  const s=state[mode];
  const employeeInput = mode==="sorting" ? $("#sortEmployeeId") : $("#putEmployeeId");
  s.employeeId=employeeInput.value.trim();
  if(!s.employeeId){toast("Employee ID is required.");return;}
  busy(true,"Reading barcode and OCR...");
  let url="";
  try{
    url=URL.createObjectURL(file);
    const preview=mode==="sorting"?$("#sortLabelPreview") : $("#putLabelPreview");
    preview.innerHTML=`<img src="${url}" alt="Captured label">`;

    let barcode = await decodeLabelBarcode(file, url);

    if(!barcode){
      throw new Error("RunSheet ID barcode was not detected. Hold the label flat, keep the full barcode inside the frame, and capture again.");
    }

    const ocr=await Tesseract.recognize(url,"eng",{logger:m=>{
      if(m.status==="recognizing text") $("#busyText").textContent=`OCR ${Math.round((m.progress||0)*100)}%`;
    }});
    const f=extractFields(ocr.data.text,barcode);
    Object.assign(s,f);
    if(!s.rsId) throw new Error("RunSheet ID was not found. Capture the label again with the barcode clearly visible.");
    if(!s.sortCode) throw new Error("Sort Code was not found. Capture a clearer label image.");

    $("#busyText").textContent="Looking up GridMaster...";
    s.gridNo=await fetchGridForSort(s.sortCode);
    showResult(mode);

    if(mode==="sorting"){
      await saveRecord(mode,"","SORTED");
      toast("Sorting completed successfully.");
    }else{
      $("#putGridCard").classList.remove("hidden");
      $("#putGridStatus").textContent="GridMaster loaded. Open the Grid Camera to continue.";
      toast("Label processed. Now scan the Grid barcode.");
    }
  }catch(e){
    console.error(e); toast(e.message||"Could not read the label.");
  }finally{
    if(url) URL.revokeObjectURL(url);
    busy(false);
  }
}

async function startGridScanner(){
  const s=state.putting;
  if(!s.gridNo){toast("Grid No is not available yet.");return;}
  const video=$("#putVideo"), status=$("#putGridStatus"), stop=$("#putStopBtn"), btn=$("#putGridBtn");
  status.textContent="Starting camera...";
  btn.classList.add("hidden"); stop.classList.remove("hidden"); video.classList.remove("hidden");
  try{
    s.scanner=new ZXingBrowser.BrowserMultiFormatReader();
    await s.scanner.decodeFromConstraints({video:{facingMode:{ideal:"environment"}}},video,(result)=>{
      if(result){
        const value=normalize(result.getText());
        const expected=normalize(s.gridNo);
        if(value===expected){
          stopGridScanner();
          status.innerHTML=`<span class="success">✓ MATCH — ${escapeHtml(value)}</span>`;
          saveRecord("putting",value,"MATCH");
        }else{
          status.innerHTML=`<span class="error">✗ WRONG BARCODE — ${escapeHtml(value)} | Expected: ${escapeHtml(expected)}</span>`;
          if(navigator.vibrate) navigator.vibrate([150,80,150]);
        }
      }
    });
  }catch(e){
    status.innerHTML=`<span class="error">Camera error. Check HTTPS and camera permission.</span>`;
    stopGridScanner();
  }
}

function stopGridScanner(){
  const s=state.putting, video=$("#putVideo"), stop=$("#putStopBtn"), btn=$("#putGridBtn");
  try{s.scanner?.reset()}catch(e){}
  if(s.stream){s.stream.getTracks().forEach(t=>t.stop());s.stream=null;}
  video.srcObject=null; video.classList.add("hidden"); stop.classList.add("hidden"); btn.classList.remove("hidden");
}

async function saveRecord(mode,scannedGrid,status){
  const s=state[mode];
  const rec={timestamp:new Date().toISOString(),type:mode,employeeId:s.employeeId,runSheetId:s.rsId,sortCode:s.sortCode,gridNo:s.gridNo,scannedGrid,status};
  const h=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]"); h.unshift(rec); localStorage.setItem(HISTORY_KEY,JSON.stringify(h.slice(0,100))); renderHistory();
  try{
    await fetch(APPS_SCRIPT_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(rec)});
  }catch(e){toast("Saved locally, but the Google Sheet request failed.");}
}

function renderHistory(){
  const h=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");
  $("#historyList").innerHTML=h.length?h.map(r=>`<div class="historyItem"><div class="type">${escapeHtml(r.type)} · ${new Date(r.timestamp).toLocaleString()}</div><b>${escapeHtml(r.runSheetId)}</b> · ${escapeHtml(r.sortCode)} · Grid ${escapeHtml(r.gridNo)} · ${escapeHtml(r.status)}</div>`).join(""):"<p class='hint'>No local records yet.</p>";
}

$$('.tab').forEach(btn=>btn.addEventListener('click',()=>{
  $$('.tab').forEach(x=>x.classList.remove('active')); btn.classList.add('active');
  $$('.panel').forEach(x=>x.classList.remove('active')); $('#'+btn.dataset.tab).classList.add('active');
}));

$('#sortLabelBtn').onclick=()=>openLabelCamera('sorting');
$('#putLabelBtn').onclick=()=>openLabelCamera('putting');
$('#capturePhoto').onclick=captureLabelPhoto;
$('#closeCamera').onclick=closeLabelCamera;
$('#cancelCamera').onclick=closeLabelCamera;
$('#putGridBtn').onclick=startGridScanner;
$('#putStopBtn').onclick=stopGridScanner;
$('#clearLocal').onclick=()=>{localStorage.removeItem(HISTORY_KEY);renderHistory();toast('Local history cleared.');};

renderHistory();
