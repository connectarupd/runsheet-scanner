// Grid Scanner By ArupD — v5.24 QR Grid Scanner fix
// Fix: Putting Grid Camera now explicitly supports QR codes (the grid labels
// shown by the user are QR codes, not only 1-D barcodes).
(function(){
  "use strict";

  function clean(v){ return String(v||"").trim(); }
  function norm(v){ return String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,""); }

  async function startGridScannerV524(){
    const s=state.putting;
    if(!s.gridNo){toast("Grid No is not available yet.");return;}

    const status=$("#putGridStatus"), stop=$("#putStopBtn"), btn=$("#putGridBtn"), video=$("#labelCamera");
    status.textContent="Starting QR scanner...";
    btn.classList.add("hidden");
    stop.classList.remove("hidden");

    const expected=norm(s.gridNo);
    let finished=false;
    const finish=(raw)=>{
      if(finished) return;
      const value=norm(raw);
      if(!value) return;
      if(value===expected){
        finished=true;
        try{stopGridScanner();}catch(e){}
        status.innerHTML=`<span class="success">✓ MATCH — ${escapeHtml(value)}</span>`;
        saveRecord("putting",value,"MATCH");
      }else{
        status.innerHTML=`<span class="error">✗ WRONG BARCODE — ${escapeHtml(value)} | Expected: ${escapeHtml(expected)}</span>`;
        if(navigator.vibrate) navigator.vibrate(80);
      }
    };

    try{
      if(!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not supported by this browser.");

      $("#cameraTitle").textContent="Putting - Grid Camera";
      $("#cameraModal").classList.remove("hidden");
      $("#capturePhoto").classList.add("hidden");
      $("#cameraHelp").textContent="Point the camera at the Grid QR code.";

      // Reuse the already-open camera stream when possible.
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

      // Ask the Android camera for continuous autofocus when the device exposes it.
      try{
        const track=cameraStream?.getVideoTracks?.()[0];
        const caps=track?.getCapabilities?.();
        if(caps?.focusMode?.includes("continuous")) await track.applyConstraints({advanced:[{focusMode:"continuous"}]});
      }catch(e){}

      // PRIMARY: native BarcodeDetector, including QR.
      let nativeStarted=false;
      if("BarcodeDetector" in window){
        try{
          let formats=[
            "qr_code","data_matrix","aztec","pdf417",
            "code_128","code_39","code_93","codabar",
            "ean_13","ean_8","upc_a","upc_e","itf"
          ];
          if(BarcodeDetector.getSupportedFormats){
            const supported=await BarcodeDetector.getSupportedFormats();
            formats=formats.filter(f=>supported.includes(f));
          }
          if(formats.length){
            const detector=new BarcodeDetector({formats});
            s._nativeDetector=detector;
            s._nativeTimer=setInterval(async()=>{
              if(finished || !cameraStream || !video.videoWidth || !video.videoHeight || !s.gridNo) return;
              try{
                const codes=await detector.detect(video);
                for(const c of codes||[]){
                  const raw=clean(c.rawValue);
                  if(raw) finish(raw);
                  if(finished) break;
                }
              }catch(e){}
            },90);
            nativeStarted=true;
          }
        }catch(e){ console.warn("Native QR detector unavailable",e); }
      }

      // FALLBACK: ZXing supports QR and many other 1-D/2-D formats.
      if(!nativeStarted && window.ZXingBrowser?.BrowserMultiFormatReader){
        try{
          const reader=new ZXingBrowser.BrowserMultiFormatReader();
          s.scanner=reader;
          status.textContent="Scanning QR / barcode...";
          s.controls=await reader.decodeFromVideoElement(video,(result,err)=>{
            if(finished || !result) return;
            try{ finish(result.getText ? result.getText() : result.text); }catch(e){}
          });
          return;
        }catch(e){ console.warn("ZXing video scanner failed",e); }
      }

      if(nativeStarted) status.textContent="Point the camera at the Grid QR code.";
      else throw new Error("QR scanner is not available in this browser.");

    }catch(e){
      console.error("Grid scanner v5.24 error:",e);
      try{stopGridScanner(true);}catch(x){}
      status.innerHTML=`<span class="error">Grid QR scanner could not start. Keep this HTTPS page open and allow camera access.</span>`;
    }
  }

  // The original button was bound by the base version before this patch loaded.
  // Rebind it explicitly so v5.24 is actually used.
  window.startGridScanner=startGridScannerV524;
  const btn=$("#putGridBtn");
  if(btn) btn.onclick=startGridScannerV524;
})();
