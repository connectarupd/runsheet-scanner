// Grid Scanner By ArupD — URL is built into the app; users do not enter configuration.
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const state = {
  sorting: { label:null, employeeId:"", rsId:"", sortCode:"", gridNo:"" },
  putting: { label:null, employeeId:"", rsId:"", sortCode:"", gridNo:"", scanner:null, controls:null, stream:null, _qrRaf:null, _qrLastScan:0 }
};
const GRID_CACHE_KEY="runsheet_gridmaster_v5";
let gridMasterCache={};
let gridMasterWarmPromise=null;
let ocrWorkerPromise=null;

function loadGridCache(){
  try{
    gridMasterCache=JSON.parse(localStorage.getItem(GRID_CACHE_KEY)||"{}")||{};
  }catch(e){ gridMasterCache={}; }
}

function saveGridCache(){
  try{ localStorage.setItem(GRID_CACHE_KEY, JSON.stringify(gridMasterCache)); }catch(e){}
}

function normalizeSortCode(v){
  return String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
}

function warmGridMaster(){
  if(gridMasterWarmPromise) return gridMasterWarmPromise;
  if(!masterUrl) return Promise.resolve();
  gridMasterWarmPromise=(async()=>{
    try{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),10000);
      const r=await fetch(masterUrl+"?action=gridmaster&_="+Date.now(),{
        cache:"no-store", signal:controller.signal
      });
      clearTimeout(timer);
      const data=await r.json();
      if(data?.ok && data?.rows){
        for(const row of data.rows){
          const code=normalizeSortCode(row.sortCode);
          const grid=String(row.gridNo||"").trim();
          if(code && grid) gridMasterCache[code]=grid;
        }
        saveGridCache();
      }
    }catch(e){
      // Background warm-up is optional. Existing local cache remains usable.
    }
  })();
  return gridMasterWarmPromise;
}


const HISTORY_KEY = "rs_app_history_v2";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwpuHkLf9VT6qcqDNr7AvyWdJzPJFITMWdFNiRrpZU1svxCNrUWffdA_mMSsZCmBPN6kQ/exec";
const masterUrl = APPS_SCRIPT_URL;

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

async function loadJsQR(){
  if(window.jsQR) return window.jsQR;
  if(window.__jsQRPromise) return window.__jsQRPromise;
  window.__jsQRPromise=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
    script.onload=()=>window.jsQR?resolve(window.jsQR):reject(new Error("QR decoder did not load."));
    script.onerror=()=>reject(new Error("QR decoder could not load."));
    document.head.appendChild(script);
  });
  return window.__jsQRPromise;
}

function resetForNewScan(mode){
  if(mode === "putting"){
    try{ stopGridScanner(true); }catch(e){}
  }
  const s=state[mode];
  const employeeId=s.employeeId || (mode==="sorting" ? $("#sortEmployeeId").value.trim() : $("#putEmployeeId").value.trim());
  s.label=null; s.employeeId=employeeId; s.rsId=""; s.sortCode=""; s.gridNo="";
  const preview=mode==="sorting"?$("#sortLabelPreview"):$("#putLabelPreview");
  const result=mode==="sorting"?$("#sortResult"):$("#putResult");
  if(preview) preview.innerHTML="";
  if(result){ result.innerHTML=""; result.classList.add("hidden"); }
  if(mode==="putting"){
    $("#putGridCard").classList.add("hidden");
    $("#putGridStatus").textContent="";
    $("#putGridBtn").classList.remove("hidden");
    $("#putStopBtn").classList.add("hidden");
  }
  openLabelCamera(mode);
}

function startPuttingNewScan(){
  // After a successful Grid MATCH, the next scan must ALWAYS begin at the
  // Putting label step, never at the Grid scanner.
  try{ stopGridScanner(true); }catch(e){}
  const s=state.putting;
  const employeeId=$("#putEmployeeId").value.trim();
  s.label=null; s.employeeId=employeeId; s.rsId=""; s.sortCode=""; s.gridNo="";
  const preview=$("#putLabelPreview");
  const result=$("#putResult");
  if(preview) preview.innerHTML="";
  if(result){ result.innerHTML=""; result.classList.add("hidden"); }
  $("#putGridCard").classList.add("hidden");
  $("#putGridStatus").textContent="";
  $("#putGridBtn").classList.remove("hidden");
  $("#putStopBtn").classList.add("hidden");
  // Let the previous camera release finish before opening the label camera.
  setTimeout(()=>openLabelCamera("putting"),180);
}

function addNewScanButton(mode){
  const box=mode==="sorting"?$("#sortResult"):$("#putResult");
  if(!box || box.querySelector(".newScanBtn")) return;
  const btn=document.createElement("button");
  btn.type="button";
  btn.className="primary big newScanBtn";
  btn.textContent=mode==="putting"?"↻ New Label Scan":"↻ New Scan";
  btn.addEventListener("click",()=>{
    if(mode==="putting") startPuttingNewScan();
    else resetForNewScan(mode);
  });
  const wrap=document.createElement("div");
  wrap.className="resultActions";
  wrap.appendChild(btn);
  box.appendChild(wrap);
}

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


async function getOcrWorker(){
  if(ocrWorkerPromise) return ocrWorkerPromise;
  ocrWorkerPromise=(async()=>{
    const worker=await Tesseract.createWorker("eng", 1, {
      logger:m=>{
        if(m.status==="loading language model" || m.status==="initializing api") {
          const p=Math.round((m.progress||0)*100);
          const el=$("busyText");
          if(el) el.textContent=`Preparing scanner ${p}%`;
        }
      }
    });
    await worker.setParameters({
      tessedit_pageseg_mode:"11",
      preserve_interword_spaces:"0",
      user_defined_dpi:"150"
    });
    return worker;
  })().catch(e=>{ ocrWorkerPromise=null; throw e; });
  return ocrWorkerPromise;
}

function makeFastOcrCanvas(url, maxWidth=820, topRatio=0.72){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const scale=Math.min(1, maxWidth/img.naturalWidth);
      const w=Math.max(1,Math.round(img.naturalWidth*scale));
      const h=Math.max(1,Math.round(img.naturalHeight*scale*topRatio));
      const c=document.createElement("canvas");
      c.width=w; c.height=h;
      const ctx=c.getContext("2d",{willReadFrequently:true});
      ctx.drawImage(img,0,0,w,h);
      resolve(c);
    };
    img.onerror=()=>reject(new Error("Could not prepare image."));
    img.src=url;
  });
}

function makeFallbackOcrCanvas(url, maxWidth=1000){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const scale=Math.min(1, maxWidth/img.naturalWidth);
      const w=Math.max(1,Math.round(img.naturalWidth*scale));
      const h=Math.max(1,Math.round(img.naturalHeight*scale));
      const c=document.createElement("canvas");
      c.width=w; c.height=h;
      const ctx=c.getContext("2d",{willReadFrequently:true});
      ctx.drawImage(img,0,0,w,h);
      resolve(c);
    };
    img.onerror=()=>reject(new Error("Could not prepare image."));
    img.src=url;
  });
}

async function decodeLabelBarcode(file, objectUrl){
  // Barcode is best-effort and MUST NOT block Sort Code OCR.
  // First try the native detector (fast when supported).
  try{
    if("BarcodeDetector" in window){
      const img=new Image();
      img.src=objectUrl;
      await img.decode();
      const detector=new BarcodeDetector();
      const found=await detector.detect(img);
      const value=found?.find(x=>x.rawValue)?.rawValue||"";
      if(value) return value.trim();
    }
  }catch(e){}

  // One lightweight ZXing attempt only. If it fails, OCR can still finish.
  try{
    const reader=new ZXingBrowser.BrowserMultiFormatReader();
    const img=new Image();
    img.src=objectUrl;
    await img.decode();
    const result=await Promise.race([
      reader.decodeFromImageElement(img),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error("barcode-timeout")),1400))
    ]);
    const value=result?.getText?.()||"";
    if(value.trim()) return value.trim();
  }catch(e){}

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
  const code=normalizeSortCode(sortCode);
  if(gridMasterCache[code]) return gridMasterCache[code];
  if(!masterUrl) throw new Error("Grid Master is not configured.");

  // Do NOT wait for the background full-table preload on a first-time code.
  // A direct lookup is usually much faster on mobile networks.
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),3500);
  try{
    const r=await fetch(masterUrl+"?action=lookup&sortCode="+encodeURIComponent(code)+"&_="+Date.now(),{
      cache:"no-store", signal:controller.signal
    });
    const data=await r.json();
    if(data?.ok && data?.gridNo){
      gridMasterCache[code]=String(data.gridNo).trim();
      saveGridCache();
      return gridMasterCache[code];
    }
  }catch(e){
    // Fall through to the already-running full GridMaster preload.
  }finally{
    clearTimeout(timer);
  }

  await warmGridMaster();
  if(gridMasterCache[code]) return gridMasterCache[code];
  throw new Error("Grid not found for Sort Code: "+sortCode);
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
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});
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

function hideLabelCameraKeepStream(){
  // Hide the label camera UI but deliberately keep the stream alive so the
  // Putting workflow can hand the same stream to the Grid barcode scanner.
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
    // IMPORTANT: never stop the Putting camera after label capture. The same
    // live video element/stream will be reused for Grid scanning. This avoids
    // Android camera handoff/permission races.
    if(mode === "putting") hideLabelCameraKeepStream();
    else closeLabelCamera();
    await readLabel(mode,blob);
  },"image/jpeg",0.86);
}

async function readLabel(mode,file){
  const s=state[mode];
  const employeeInput = mode==="sorting" ? $("#sortEmployeeId") : $("#putEmployeeId");
  s.employeeId=employeeInput.value.trim();
  if(!s.employeeId){toast("Employee ID is required.");return;}

  busy(true,"Reading label...");
  let url="";
  try{
    url=URL.createObjectURL(file);

    const preview=mode==="sorting"?$("#sortLabelPreview"):$("#putLabelPreview");
    preview.innerHTML=`<img class="scanPreview" src="${url}" alt="Captured label" loading="eager">`;

    // OCR starts immediately. Barcode runs in parallel and is optional.
    // OCR is the primary/required path. Barcode is optional and runs in the background.
    const barcodePromise=decodeLabelBarcode(file,url).catch(()=> "");

    const worker=await getOcrWorker();

    // FAST PATH: OCR a smaller upper portion first. This avoids processing the
    // whole 1280x720 photo and is much faster on Android. Sort Code is normally
    // printed in the upper label area.
    $("#busyText").textContent="Reading label...";
    const fastCanvas=await makeFastOcrCanvas(url,820,0.72);
    let ocr=await worker.recognize(fastCanvas, {
      rotateAuto:false
    });
    let f=extractFields(ocr.data.text,"");

    // FALLBACK: only if the fast crop did not contain a readable Sort Code.
    // This keeps difficult labels working without making every scan slow.
    if(!f.sortCode){
      $("#busyText").textContent="Reading label again...";
      await worker.setParameters({tessedit_pageseg_mode:"6"});
      const fullCanvas=await makeFallbackOcrCanvas(url,1000);
      ocr=await worker.recognize(fullCanvas,{rotateAuto:false});
      f=extractFields(ocr.data.text,"");
      await worker.setParameters({tessedit_pageseg_mode:"11"});
    }

    Object.assign(s,f);
    if(!s.sortCode){
      throw new Error("Sort Code was not detected. Please capture the label closer and keep the Sort Code visible.");
    }

    $("#busyText").textContent="Loading Grid...";
    s.gridNo=await fetchGridForSort(s.sortCode);

    showResult(mode);

    if(mode==="sorting"){
      await saveRecord(mode,"","SORTED");
      addNewScanButton(mode);
      toast("Sorting completed.");
    }else{
      $("#putGridCard").classList.remove("hidden");
      $("#putGridStatus").textContent="Grid loaded. Open Grid Camera to continue.";
      toast("Label processed. Scan the Grid barcode.");
    }

    // Optional barcode result arrives later without blocking the workflow.
    barcodePromise.then(value=>{
      if(value){
        s.rsId=value;
        const rsEl=mode==="sorting"?$("#sortRsId"):$("#putRsId");
        if(rsEl) rsEl.textContent=value;
      }
    }).catch(()=>{});
  }catch(e){
    console.error(e);
    toast(e.message||"Could not read the label.");
  }finally{
    if(url) URL.revokeObjectURL(url);
    busy(false);
  }
}

async function startGridScanner(){
  const s=state.putting;
  if(!s.gridNo){toast("Grid No is not available yet.");return;}
  const status=$("#putGridStatus"), stop=$("#putStopBtn"), btn=$("#putGridBtn");
  const video=$("#labelCamera");
  status.textContent="Starting grid scanner...";
  btn.classList.add("hidden"); stop.classList.remove("hidden");
  try{
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      throw new Error("Camera access is not supported by this browser.");
    }
    $("#cameraTitle").textContent="Putting - Grid Camera";
    $("#cameraModal").classList.remove("hidden");
    $("#capturePhoto").classList.add("hidden");
    $("#cameraHelp").textContent="Point the camera at the Grid QR code.";

    if(cameraStream && cameraStream.getVideoTracks().some(t=>t.readyState==="live")){
      video.srcObject=cameraStream;
    }else{
      try{cameraStream?.getTracks()?.forEach(t=>t.stop());}catch(e){}
      cameraStream=null;
      await new Promise(r=>setTimeout(r,250));
      cameraStream=await navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},
        audio:false
      });
      video.srcObject=cameraStream;
    }
    video.setAttribute("playsinline","");
    video.setAttribute("autoplay","");
    video.muted=true;
    await video.play();
    await new Promise(r=>setTimeout(r,250));

    // Primary QR path: jsQR reads the existing camera frames directly.
    // This is more reliable on Android Chrome than relying only on BarcodeDetector.
    try{
      const decoder=await loadJsQR();
      const canvas=document.createElement("canvas");
      const ctx=canvas.getContext("2d",{willReadFrequently:true});
      s._qrLastScan=0;
      const tick=(now)=>{
        if(!cameraStream || !video.videoWidth || !s.gridNo) return;
        if(now-s._qrLastScan>=140){
          s._qrLastScan=now;
          try{
            const maxW=960;
            const scale=Math.min(1,maxW/video.videoWidth);
            canvas.width=Math.max(320,Math.round(video.videoWidth*scale));
            canvas.height=Math.max(240,Math.round(video.videoHeight*scale));
            ctx.drawImage(video,0,0,canvas.width,canvas.height);
            const image=ctx.getImageData(0,0,canvas.width,canvas.height);
            const code=decoder(image.data,image.width,image.height,{inversionAttempts:"attemptBoth"});
            if(code?.data){
              const value=normalize(code.data);
              const expected=normalize(s.gridNo);
              if(value){
                if(value===expected){
                  stopGridScanner();
                  status.innerHTML=`<span class="success">✓ MATCH — ${escapeHtml(value)}</span>`;
                  saveRecord("putting",value,"MATCH");
                  addNewScanButton("putting");
                  return;
                }
                status.innerHTML=`<span class="error">✗ WRONG BARCODE — ${escapeHtml(value)} | Expected: ${escapeHtml(expected)}</span>`;
                if(navigator.vibrate) navigator.vibrate(100);
              }
            }
          }catch(e){ /* keep scanning */ }
        }
        s._qrRaf=requestAnimationFrame(tick);
      };
      status.textContent="QR scanner ready. Point the camera at the Grid code.";
      s._qrRaf=requestAnimationFrame(tick);
      return;
    }catch(e){
      console.warn("jsQR unavailable; using native/ZXing fallback",e);
    }

    let nativeStarted=false;
    if("BarcodeDetector" in window){
      try{
        const wantedFormats=["qr_code","code_128","code_39","ean_13","ean_8","upc_a","upc_e","itf","codabar"];
        let formats=wantedFormats.slice();
        if(BarcodeDetector.getSupportedFormats){
          const supported=await BarcodeDetector.getSupportedFormats();
          formats=formats.filter(f=>supported.includes(f));
        }
        if(formats.includes("qr_code")){
          const detector=new BarcodeDetector({formats});
          s._nativeDetector=detector;
          s._nativeTimer=setInterval(async()=>{
            if(!cameraStream || !video.videoWidth || !s.gridNo) return;
            try{
              const codes=await detector.detect(video);
              if(!codes?.length) return;
              const value=normalize(codes[0].rawValue||"");
              const expected=normalize(s.gridNo);
              if(!value) return;
              if(value===expected){
                stopGridScanner();
                status.innerHTML=`<span class="success">✓ MATCH — ${escapeHtml(value)}</span>`;
                saveRecord("putting",value,"MATCH");
                addNewScanButton("putting");
              }else{
                status.innerHTML=`<span class="error">✗ WRONG BARCODE — ${escapeHtml(value)} | Expected: ${escapeHtml(expected)}</span>`;
              }
            }catch(e){}
          },160);
          nativeStarted=true;
        }
      }catch(e){ console.warn("Native BarcodeDetector unavailable",e); }
    }
    if(nativeStarted){
      status.textContent="Grid scanner ready. Point the camera at the QR code.";
      return;
    }
    s.scanner=new ZXingBrowser.BrowserMultiFormatReader();
    status.textContent="QR scanner ready. Point the camera at the Grid code.";
    s.controls=await s.scanner.decodeFromVideoElement(video,(result,err)=>{
      if(!result) return;
      const value=normalize(result.getText());
      const expected=normalize(s.gridNo);
      if(value===expected){
        stopGridScanner();
        status.innerHTML=`<span class="success">✓ MATCH — ${escapeHtml(value)}</span>`;
        saveRecord("putting",value,"MATCH");
        addNewScanButton("putting");
      }else if(value){
        status.innerHTML=`<span class="error">✗ WRONG BARCODE — ${escapeHtml(value)} | Expected: ${escapeHtml(expected)}</span>`;
      }
    });
  }catch(e){
    console.error("Grid scanner error:",e);
    $("#cameraModal").classList.add("hidden");
    $("#capturePhoto").classList.remove("hidden");
    status.innerHTML=`<span class="error">Grid camera could not start. ${escapeHtml(e.message||"Please check camera access.")}</span>`;
    stopGridScanner(true);
  }
}

function stopGridScanner(keepResult=false){
  const s=state.putting, video=$("#labelCamera"), stop=$("#putStopBtn"), btn=$("#putGridBtn");
  try{s.controls?.stop?.()}catch(e){}
  try{s.scanner?.reset()}catch(e){}
  s.controls=null;
  if(s._nativeTimer){clearInterval(s._nativeTimer);s._nativeTimer=null;}
  if(s._qrRaf){cancelAnimationFrame(s._qrRaf);s._qrRaf=null;}
  s._nativeDetector=null;
  s._qrLastScan=0;
  s.scanner=null;
  // Close/release the shared camera only after Grid scanning is finished.
  if(cameraStream){try{cameraStream.getTracks().forEach(t=>t.stop());}catch(e){} cameraStream=null;}
  s.stream=null;
  video.srcObject=null;
  $("#capturePhoto").classList.remove("hidden");
  $("#cameraModal").classList.add("hidden");
  stop.classList.add("hidden"); btn.classList.remove("hidden");
}

async function saveRecord(mode,scannedGrid,status){
  const s=state[mode];
  const rec={timestamp:new Date().toISOString(),type:mode,employeeId:s.employeeId,runSheetId:s.rsId,sortCode:s.sortCode,gridNo:s.gridNo,scannedGrid,status};
  const h=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]"); h.unshift(rec); localStorage.setItem(HISTORY_KEY,JSON.stringify(h.slice(0,100)));
  renderHistory();
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
forcePortraitCameraLayout();
$('#capturePhoto').onclick=captureLabelPhoto;
$('#closeCamera').onclick=closeLabelCamera;
$('#cancelCamera').onclick=closeLabelCamera;
$('#putGridBtn').onclick=startGridScanner;
$('#putStopBtn').onclick=stopGridScanner;
$('#clearLocal').onclick=()=>{localStorage.removeItem(HISTORY_KEY);renderHistory();toast('Local history cleared.');};

renderHistory();
loadGridCache();
setTimeout(warmGridMaster,50);
setTimeout(()=>getOcrWorker().catch(()=>{}),150);
