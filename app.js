const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const state = {
  sorting: { label:null, employeeId:"", rsId:"", sortCode:"", gridNo:"", scanner:null, stream:null },
  putting:{ label:null, employeeId:"", rsId:"", sortCode:"", gridNo:"", scanner:null, stream:null }
};

const SETTINGS_KEY = "rs_app_settings_v1";
const HISTORY_KEY = "rs_app_history_v1";

function toast(msg){
  const el=$("#toast"); el.textContent=msg; el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),2600);
}
function busy(on,msg="Processing..."){
  $("#busy").classList.toggle("hidden",!on); $("#busyText").textContent=msg;
}
function normalize(v){ return (v||"").toUpperCase().replace(/[^A-Z0-9]/g,""); }

function showResult(mode){
  const s=state[mode], box=mode==="sorting"?$("#sortResult"):$("#putResult");
  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="row"><span>Employee ID</span><b>${escapeHtml(s.employeeId||"-")}</b></div>
    <div class="row"><span>RunSheet ID</span><b>${escapeHtml(s.rsId||"-")}</b></div>
    <div class="row"><span>Sort Code</span><b>${escapeHtml(s.sortCode||"-")}</b></div>
    <div class="row"><span>Grid No</span><b>${escapeHtml(s.gridNo||"-")}</b></div>`;
}
function escapeHtml(x){return String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}

function extractFields(text, barcodeValue){
  const raw=(text||"").toUpperCase();
  const compact=raw.replace(/\s+/g," ");
  // Common labels: "RS ID: 12345", "RUNSHEET ID 12345"
  let rs = barcodeValue || "";
  const rsMatch=compact.match(/(?:RUN\s*SHEET|RUNSHEET|RS\s*ID|RSID)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,})/i);
  if(rsMatch && !barcodeValue) rs=rsMatch[1];

  // Sort codes are usually 2-5 alphanumeric chars like FK02, AJP1, TG1K.
  // If a label contains "SORT CODE: FK02", prefer that exact value.
  let sort="";
  const sm=compact.match(/(?:SORT(?:ING)?\s*CODE|SORT\s*CODE|SORT)\s*[:#-]?\s*([A-Z]{1,4}\d[A-Z0-9]{0,3})/i);
  if(sm) sort=sm[1];
  if(!sort){
    const candidates=compact.match(/\b[A-Z]{1,4}\d[A-Z0-9]{0,3}\b/g)||[];
    sort=candidates.find(x=>!/^RS\d*$/i.test(x) && x.length>=3 && x.length<=6) || "";
  }

  // Grid values such as A1, B1, H1, AA12.
  // Grid is NOT read from the label. It comes from the Grid Master by Sort Code.
  return {rsId:rs,sortCode:sort,gridNo:"",ocrText:raw};
}

async function fetchGridForSort(sortCode){
  const url=$("#masterUrl").value.trim();
  if(!url) throw new Error("Grid Master API URL set করা হয়নি");
  const res=await fetch(url+"?action=lookup&sortCode="+encodeURIComponent(sortCode));
  const data=await res.json();
  if(!data.ok || !data.gridNo) throw new Error("Grid Master-এ এই Sort Code পাওয়া যায়নি: "+sortCode);
  return data.gridNo;
}

async function readLabel(mode,file){
  const s=state[mode];
  const employeeInput = mode==="sorting" ? $("#sortEmployeeId") : $("#putEmployeeId");
  const employeeId = employeeInput.value.trim();
  if(!employeeId){
    toast("Employee ID অবশ্যই দিতে হবে।");
    employeeInput.focus();
    return;
  }
  s.employeeId = employeeId;
  busy(true,"Barcode + OCR চলছে...");
  try{
    const url=URL.createObjectURL(file);
    const preview=mode==="sorting"?$("#sortLabelPreview"):$("#putLabelPreview");
    preview.innerHTML=`<img src="${url}" alt="label">`;

    let barcode="";
    try{
      const reader=new ZXingBrowser.BrowserMultiFormatReader();
      const img=new Image(); img.src=url; await img.decode();
      const result=await reader.decodeFromImageElement(img);
      barcode=result?.getText?.()||"";
    }catch(e){ /* OCR may still find RS ID */ }

    const ocr=await Tesseract.recognize(url,"eng",{logger:m=>{
      if(m.status==="recognizing text") $("#busyText").textContent=`OCR ${Math.round((m.progress||0)*100)}%`;
    }});
    const f=extractFields(ocr.data.text,barcode);
    Object.assign(s,f);
    if(!s.rsId){
      toast("Label barcode থেকে RunSheet ID পাওয়া যায়নি—আবার photo নিন।");
      return;
    }
    if(!s.sortCode){
      toast("OCR থেকে Sort Code পাওয়া যায়নি—label photo পরিষ্কার করে আবার নিন।");
      return;
    }
    busy(true,"Sort Code থেকে Grid Master lookup হচ্ছে...");
    try{
      s.gridNo=await fetchGridForSort(s.sortCode);
    }finally{
      busy(false);
    }
    showResult(mode);

    if(!s.gridNo){
      toast("এই Sort Code-এর Grid Master mapping নেই।");
      return;
    }
    if(mode==="sorting"){
      toast("Sorting label read হয়েছে। Data ready.");
      return;
    }
    const card=$("#putGridCard");
    card.classList.remove("hidden");
    toast("Putting label read হয়েছে। এখন Grid barcode scan করুন.");
  }catch(e){
    console.error(e); toast("Label পড়তে সমস্যা হয়েছে: "+e.message);
  }finally{busy(false)}
}

async function startGridScanner(mode){
  const s=state[mode];
  const video=mode==="sorting"?$("#sortVideo"):$("#putVideo");
  const status=mode==="sorting"?$("#sortGridStatus"):$("#putGridStatus");
  const stop=mode==="sorting"?$("#sortStopBtn"):$("#putStopBtn");
  const btn=mode==="sorting"?$("#sortGridBtn"):$("#putGridBtn");
  status.textContent="Camera চালু হচ্ছে...";
  btn.classList.add("hidden"); stop.classList.remove("hidden"); video.classList.remove("hidden");
  try{
    s.scanner = new ZXingBrowser.BrowserMultiFormatReader();
    await s.scanner.decodeFromConstraints(
      {video:{facingMode:{ideal:"environment"}}},
      video,
      (result,err)=>{
        if(result){
          const value=normalize(result.getText());
          const expected=normalize(s.gridNo);
          if(value===expected){
            stopGridScanner(mode);
            status.innerHTML=`<span class="success">✓ Match: ${escapeHtml(value)}</span>`;
            saveRecord(mode,value);
          }else{
            status.innerHTML=`<span class="error">✗ Wrong barcode: ${escapeHtml(value)} — expected ${escapeHtml(expected)}</span>`;
            if(navigator.vibrate) navigator.vibrate([150,80,150]);
          }
        }
      }
    );
  }catch(e){
    status.innerHTML=`<span class="error">Camera error: ${escapeHtml(e.message)}. HTTPS/GitHub Pages এবং camera permission check করুন।</span>`;
    stopGridScanner(mode);
  }
}
function stopGridScanner(mode){
  const s=state[mode];
  const video=mode==="sorting"?$("#sortVideo"):$("#putVideo");
  const stop=mode==="sorting"?$("#sortStopBtn"):$("#putStopBtn");
  const btn=mode==="sorting"?$("#sortGridBtn"):$("#putGridBtn");
  try{s.scanner?.reset()}catch(e){}
  if(s.stream){s.stream.getTracks().forEach(t=>t.stop());s.stream=null}
  video.srcObject=null; video.classList.add("hidden"); stop.classList.add("hidden"); btn.classList.remove("hidden");
}

async function saveRecord(mode,scannedGrid){
  const s=state[mode];
  const rec={
    timestamp:new Date().toISOString(),
    type:mode,
    employeeId:s.employeeId,
    runSheetId:s.rsId,
    sortCode:s.sortCode,
    gridNo:s.gridNo,
    scannedGrid:scannedGrid,
    status:"MATCH"
  };
  const h=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");
  h.unshift(rec); localStorage.setItem(HISTORY_KEY,JSON.stringify(h.slice(0,100)));
  renderHistory();

  const url=$("#scriptUrl").value.trim();
  if(!url){toast("Match হয়েছে। Google Sheet URL সেট করা নেই, তাই শুধু local history-তে save হয়েছে.");return}
  try{
    // Apps Script Web App endpoint. no-cors is intentional: Apps Script often does not expose CORS headers.
    await fetch(url,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(rec)});
    toast("✓ Match + Google Sheet save request sent");
  }catch(e){
    toast("Match হয়েছে, কিন্তু Sheet-এ পাঠাতে সমস্যা হয়েছে।");
  }
}

function renderHistory(){
  const h=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");
  $("#historyList").innerHTML=h.length?h.map(r=>`
    <div class="historyItem">
      <div class="type">${escapeHtml(r.type)} · ${new Date(r.timestamp).toLocaleString()}</div>
      <b>${escapeHtml(r.runSheetId)}</b> · ${escapeHtml(r.sortCode)} · Grid ${escapeHtml(r.gridNo)}
    </div>`).join(""):"<p class='hint'>No local records yet.</p>";
}

$$(".tab").forEach(btn=>btn.addEventListener("click",()=>{
  $$(".tab").forEach(x=>x.classList.remove("active")); btn.classList.add("active");
  $$(".panel").forEach(x=>x.classList.remove("active")); $("#"+btn.dataset.tab).classList.add("active");
}));

$("#sortLabelBtn").onclick=()=>$("#sortLabelInput").click();
$("#putLabelBtn").onclick=()=>$("#putLabelInput").click();
$("#sortLabelInput").onchange=e=>e.target.files[0]&&readLabel("sorting",e.target.files[0]);
$("#putLabelInput").onchange=e=>e.target.files[0]&&readLabel("putting",e.target.files[0]);
$("#sortGridBtn").onclick=()=>startGridScanner("sorting");
$("#putGridBtn").onclick=()=>startGridScanner("putting");
$("#sortStopBtn").onclick=()=>stopGridScanner("sorting");
$("#putStopBtn").onclick=()=>stopGridScanner("putting");
$("#clearLocal").onclick=()=>{localStorage.removeItem(HISTORY_KEY);renderHistory();toast("Local history cleared");};

const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}");
if(saved.scriptUrl) $("#scriptUrl").value=saved.scriptUrl;
if(saved.masterUrl) $("#masterUrl").value=saved.masterUrl;
if(saved.sortEmployeeId) $("#sortEmployeeId").value=saved.sortEmployeeId;
if(saved.putEmployeeId) $("#putEmployeeId").value=saved.putEmployeeId;
if(saved.masterUrl) $("#masterUrl").value=saved.masterUrl;
$("#saveSettings").onclick=()=>{
  localStorage.setItem(SETTINGS_KEY,JSON.stringify({
    scriptUrl:$("#scriptUrl").value.trim(),
    masterUrl:$("#masterUrl").value.trim(),
    sortEmployeeId:$("#sortEmployeeId").value.trim(),
    putEmployeeId:$("#putEmployeeId").value.trim()
}));
  toast("Google Sheet URL saved");
};
renderHistory();

$("#sortEmployeeId").addEventListener("input", e=>{
  const x=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}"); x.sortEmployeeId=e.target.value.trim();
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(x));
});
$("#putEmployeeId").addEventListener("input", e=>{
  const x=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}"); x.putEmployeeId=e.target.value.trim();
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(x));
});
