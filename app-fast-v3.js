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

  busy(true,"Reading label...");
  let url="";
  try{
    url=URL.createObjectURL(file);

    const preview=mode==="sorting"?$("#sortLabelPreview"):$("#putLabelPreview");
    preview.innerHTML=`<img class="scanPreview" src="${url}" alt="Captured label" loading="eager">`;

    // OCR starts immediately. Barcode runs in parallel and is optional.
    // OCR is the primary/required path. Barcode is optional and runs in the background.
    const barcodePromise=decodeLabelBarcode(file,url).catch(()=> "");

    const ocr=await Tesseract.recognize(url,"eng",{
      logger:m=>{
        if(m.status==="recognizing text"){
          $("#busyText").textContent=`Reading text ${Math.round((m.progress||0)*100)}%`;
        }
      },
      config:{
        tessedit_pageseg_mode:"6",
        preserve_interword_spaces:"1"
      }
    });

    // Do not wait for barcode. Process Sort Code immediately.
    const f=extractFields(ocr.data.text,"");
    Object.assign(s,f);

    if(!s.sortCode){
      throw new Error("Sort Code was not detected. Please capture the label closer and keep the Sort Code visible.");
    }

    $("#busyText").textContent="Loading Grid...";
    s.gridNo=await fetchGridForSort(s.sortCode);

    showResult(mode);

    if(mode==="sorting"){
      await saveRecord(mode,"","SORTED");
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
