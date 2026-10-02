// Grid Scanner By ArupD — v5.26 TEMPLATE FAST label + clean Putting cycle
(function(){
  "use strict";

  const clean=v=>String(v||"").trim();
  const normCode=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"")
    .replace(/O(?=\d)/g,"0").replace(/(?<=\d)O/g,"0")
    .replace(/I(?=\d)/g,"1").replace(/L(?=\d)/g,"1");

  function loadImg(url){return new Promise((res,rej)=>{
    const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(Error("image"));i.src=url;
  });}

  function rotCanvas(i,a,max=850){
    const s=Math.min(1,max/i.naturalWidth),w=Math.max(1,Math.round(i.naturalWidth*s)),h=Math.max(1,Math.round(i.naturalHeight*s));
    const r=((a%360)+360)%360,c=document.createElement("canvas");
    c.width=(r===90||r===270)?h:w;c.height=(r===90||r===270)?w:h;
    const x=c.getContext("2d",{willReadFrequently:true});
    x.imageSmoothingEnabled=true;x.imageSmoothingQuality="medium";x.save();
    if(r===90){x.translate(c.width,0);x.rotate(Math.PI/2)}
    else if(r===180){x.translate(c.width,c.height);x.rotate(Math.PI)}
    else if(r===270){x.translate(0,c.height);x.rotate(-Math.PI/2)}
    x.drawImage(i,0,0,w,h);x.restore();return c;
  }

  function crop(c,q,scale=1.15){
    const [x,y,w,h]=q,z=document.createElement("canvas");
    z.width=Math.max(1,Math.round(w*scale));z.height=Math.max(1,Math.round(h*scale));
    const g=z.getContext("2d",{willReadFrequently:true});
    g.imageSmoothingEnabled=true;g.imageSmoothingQuality="medium";
    g.drawImage(c,x,y,w,h,0,0,z.width,z.height);return z;
  }

  function enhance(c){
    const z=document.createElement("canvas");z.width=c.width;z.height=c.height;
    const g=z.getContext("2d",{willReadFrequently:true});g.drawImage(c,0,0);
    const im=g.getImageData(0,0,z.width,z.height),d=im.data;
    for(let p=0;p<d.length;p+=4){
      let y=.299*d[p]+.587*d[p+1]+.114*d[p+2];
      y=(y-128)*1.35+128;y=Math.max(0,Math.min(255,y));
      d[p]=d[p+1]=d[p+2]=y;
    }
    g.putImageData(im,0,0);return z;
  }

  function sortCandidates(text){
    const t=String(text||"").toUpperCase().replace(/[|]/g,"I"),out=[],seen=new Set();
    const add=v=>{
      const x=normCode(v);
      if(/^[A-Z]{1,4}\d[A-Z0-9]{0,3}$/.test(x)&&!seen.has(x)){seen.add(x);out.push(x);}
    };
    const m=t.match(/(?:CLUSTER\s*CODE|SORT(?:ING)?\s*CODE|SORT\s*CODE|CLUSTER)\s*[:#-]?\s*([A-Z0-9IL ]{1,10})/i);
    if(m)add(m[1]);
    (t.match(/\b[A-Z]{1,4}\s*\d\s*[A-Z0-9]{0,3}\b/g)||[]).forEach(add);
    const p=t.split(/[^A-Z0-9]+/).filter(Boolean);
    for(let i=0;i<p.length;i++){add(p[i]);if(p[i+1])add(p[i]+p[i+1]);}
    return out;
  }

  function rsCandidates(text){
    const t=String(text||""),out=[],seen=new Set();
    const add=(v,score)=>{
      const d=String(v||"").replace(/\D/g,"");
      if(d.length<7||d.length>18||/^(19|20)\d{6,}$/.test(d)||seen.has(d))return;
      let s=score||10;
      if(d.length===8)s+=120;else if(d.length===9)s+=70;else if(d.length===7)s-=10;
      seen.add(d);out.push({v:d,score:s});
    };
    for(const re of [/RUN\s*SHEET[^0-9]{0,25}(\d[\d\s-]{6,20})/i,/RUNSHEET[^0-9]{0,25}(\d[\d\s-]{6,20})/i,/RS\s*ID[^0-9]{0,20}(\d[\d\s-]{6,20})/i]){
      const m=t.match(re);if(m)add(m[1],300);
    }
    (t.match(/\d[\d\s-]{6,20}/g)||[]).forEach(m=>add(m,20));
    return out.sort((a,b)=>b.score-a.score);
  }

  function extractRunSheet(v){
    const s=clean(v);if(!s)return "";
    const labeled=s.match(/(?:RUN\s*SHEET|RUNSHEET|RS\s*ID|RSID)[^0-9]{0,20}(\d{7,18})/i);
    if(labeled)return labeled[1];
    if(/^\d{7,18}$/.test(s)&&!/^(19|20)\d{6,}$/.test(s))return s;
    const ds=s.match(/\d{7,18}/g)||[];
    return ds.sort((a,b)=>(b.length===8)-(a.length===8)||b.length-a.length)[0]||"";
  }

  // v5.26: template-guided label reading.
  // The user's two label layouts put the RunSheet barcode/QR immediately beside
  // the Sort Code. We use the detected code as an anchor, so OCR only looks at
  // the small marked Sort Code area instead of OCR-ing the whole label.
  async function fastBarcode(url){
    const result={values:[],angle:null,hits:[]};
    const add=(v,hit)=>{
      const x=extractRunSheet(v);
      if(x&&!result.values.includes(x))result.values.push(x);
      if(hit)result.hits.push({...hit,raw:String(v||"")});
    };
    try{
      if(!('BarcodeDetector' in window))return result;
      let fs=['qr_code','data_matrix','aztec','pdf417','code_128','code_39','code_93','codabar','ean_13','ean_8','upc_a','upc_e','itf'];
      if(BarcodeDetector.getSupportedFormats){
        const supported=await BarcodeDetector.getSupportedFormats();fs=fs.filter(x=>supported.includes(x));
      }
      if(!fs.length)return result;
      const d=new BarcodeDetector({formats:fs}),i=await loadImg(url);
      for(const a of [0,90,270,180]){
        const c=rotCanvas(i,a,850);
        try{
          const found=await d.detect(c);
          if(found?.length){
            for(const z of found){
              const raw=String(z.rawValue||'');
              const box=z.boundingBox||null;
              const type=String(z.format||'').toLowerCase();
              if(raw) add(raw,{angle:a,box,format:type,canvasW:c.width,canvasH:c.height});
            }
            if(result.values.length||result.hits.length){
              // Prefer the QR/1-D hit that is most useful as the RunSheet anchor.
              const qr=result.hits.find(h=>h.format==='qr_code');
              const one=result.hits.find(h=>h.format!=='qr_code');
              const best=qr||one||result.hits[0];
              result.angle=best?.angle??a;
              result.anchor=best||null;
              break;
            }
          }
        }catch(e){}
      }
    }catch(e){}
    return result;
  }

  function makeSortAnchorMontage(c,box){
    // The marked Sort Code sits next to the RunSheet barcode/QR. We sample
    // four sides and four text orientations in ONE OCR image. This avoids the
    // old four sequential full-label OCR passes while still handling a phone
    // held sideways/upside-down.
    const bw=Math.max(30,box?.width||Math.min(c.width,c.height)*.18);
    const bh=Math.max(30,box?.height||bw*.8);
    const bx=Math.max(0,box?.x||c.width*.5),by=Math.max(0,box?.y||c.height*.5);
    const padX=Math.max(18,bw*.16),padY=Math.max(16,bh*.22);
    const sideW=Math.max(85,bw*1.30),sideH=Math.max(65,bh*1.30);
    const clamp=(v,max)=>Math.max(0,Math.min(max,v));
    const regions=[
      [clamp(bx+bw+padX,0,c.width-sideW),clamp(by-sideH*.15,0,c.height-sideH),sideW,sideH],
      [clamp(bx-sideW-padX,0,c.width-sideW),clamp(by-sideH*.15,0,c.height-sideH),sideW,sideH],
      [clamp(bx-sideW*.15,0,c.width-sideW),clamp(by-bh-sideH*.65,0,c.height-sideH),sideW,sideH],
      [clamp(bx-sideW*.15,0,c.width-sideW),clamp(by+bh+padY,0,c.height-sideH),sideW,sideH]
    ];
    const cell=Math.max(95,Math.round(Math.max(sideW,sideH)*1.05));
    const out=document.createElement('canvas');out.width=cell*4;out.height=cell*4;
    const g=out.getContext('2d',{willReadFrequently:true});g.fillStyle='#fff';g.fillRect(0,0,out.width,out.height);
    const drawRot=(src,deg,dx,dy)=>{
      const z=document.createElement('canvas');
      const r=((deg%360)+360)%360;z.width=(r===90||r===270)?src.height:src.width;z.height=(r===90||r===270)?src.width:src.height;
      const q=z.getContext('2d');q.imageSmoothingEnabled=true;q.imageSmoothingQuality='medium';q.save();
      if(r===90){q.translate(z.width,0);q.rotate(Math.PI/2)}
      else if(r===180){q.translate(z.width,z.height);q.rotate(Math.PI)}
      else if(r===270){q.translate(0,z.height);q.rotate(-Math.PI/2)}
      q.drawImage(src,0,0);q.restore();
      const sc=Math.min((cell-8)/z.width,(cell-8)/z.height),w=Math.max(1,z.width*sc),h=Math.max(1,z.height*sc);
      g.drawImage(z,(dx*cell)+(cell-w)/2,(dy*cell)+(cell-h)/2,w,h);
    };
    regions.forEach((q,ri)=>{
      const src=enhance(crop(c,q,1.35));
      [0,90,270,180].forEach((deg,oi)=>drawRot(src,deg,oi,ri));
    });
    return out;
  }

  async function templateSortOCR(url,worker,anchor){
    if(!anchor?.box)return [];
    const i=await loadImg(url),c=rotCanvas(i,anchor.angle||0,850);
    const montage=makeSortAnchorMontage(c,anchor.box);
    await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-'});
    const r=await worker.recognize(montage,{rotateAuto:false});
    return sortCandidates(r.data.text||'');
  }

  async function fastOCR(url,worker,preferredAngle,anchor){
    const i=await loadImg(url);
    const sort=[],rs=[],seenS=new Set(),seenR=new Set();
    const addS=x=>{if(!seenS.has(x)){seenS.add(x);sort.push(x)}};
    const addR=x=>{if(!seenR.has(x)){seenR.add(x);rs.push(x)}};

    // First and preferred path: OCR only the four small areas around the
    // detected RunSheet barcode/QR. This is the marked Sort Code zone.
    if(anchor?.box){
      try{
        const a=await templateSortOCR(url,worker,anchor);
        a.forEach(addS);
        if(sort.length)return {sort,rs};
      }catch(e){}
    }

    // Tiny fallback: only one full label-band pass, not four orientations.
    const a=preferredAngle===null||preferredAngle===undefined?0:preferredAngle;
    const c=rotCanvas(i,a,700),w=c.width,h=c.height;
    try{
      await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-'});
      const z=enhance(crop(c,[Math.round(w*.03),Math.round(h*.12),Math.round(w*.94),Math.round(h*.72)],1.0));
      const r=await worker.recognize(z,{rotateAuto:false}),t=r.data.text||'';
      sortCandidates(t).forEach(addS);rsCandidates(t).forEach(x=>addR(x.v));
    }catch(e){}
    return {sort,rs};
  }

  function pickRS(bar,ocr){
    const all=[...(bar||[]),...(ocr||[])],u=[...new Set(all.filter(Boolean))];
    return u.sort((a,b)=>{
      const sa=a.length===8?1000:a.length>8?700:a.length===7?100:10;
      const sb=b.length===8?1000:b.length>8?700:b.length===7?100:10;
      return sb-sa||b.length-a.length;
    })[0]||"";
  }

  async function getBestSort(codes){
    for(const code of codes){
      try{const g=await fetchGridForSort(code);if(g)return {code,grid:g};}catch(e){}
    }
    return null;
  }

  function ensurePutNewScan(){
    const result=$("#putResult");if(!result)return;
    let b=$("#putNewScanBtn");
    if(!b){
      b=document.createElement("button");
      b.id="putNewScanBtn";b.className="primary big";
      b.textContent="↻ New Scan";
      b.style.marginTop="10px";b.style.width="100%";
      result.appendChild(b);
      b.onclick=()=>{
        try{if(typeof stopGridScanner==="function")stopGridScanner(true)}catch(e){}
        const s=state.putting;
        s.rsId="";s.sortCode="";s.gridNo="";s._nativeDetector=null;s._nativeTimer=null;s.scanner=null;
        $("#putResult").innerHTML="";$("#putResult").classList.add("hidden");
        $("#putLabelPreview").innerHTML="";
        $("#putGridStatus").textContent="";
        $("#putGridCard").classList.add("hidden");
        // New scan explicitly starts from the LABEL camera.
        // Do not reveal Grid Camera until the new label produces Grid No.
        const b0=$("#putLabelBtn");if(b0)b0.click();
      };
    }
  }

  async function readLabelFast(mode,file){
    const s=state[mode],input=mode==="sorting"?$("#sortEmployeeId"):$("#putEmployeeId");
    s.employeeId=input.value.trim();
    if(!s.employeeId){toast("Employee ID is required.");return;}

    // A new label scan always starts with the Grid step hidden.
    // Grid Camera is revealed only after this label has been successfully
    // read and Grid No has been loaded.
    if(mode==="putting"){
      $("#putGridCard")?.classList.add("hidden");
      $("#putGridStatus").textContent="";
    }
    busy(true,"Reading label...");
    let url="";
    try{
      url=URL.createObjectURL(file);
      const preview=mode==="sorting"?$("#sortLabelPreview"):$("#putLabelPreview");
      preview.innerHTML=`<img class="scanPreview ultraPreview" src="${url}" alt="Captured label" loading="eager">`;

      const worker=await getOcrWorker();
      // Barcode detection runs while OCR worker is being prepared.
      const bp=fastBarcode(url);
      const bar=await bp;
      $("#busyText").textContent="Reading label...";
      const o=await fastOCR(url,worker,bar.angle,bar.anchor);

      s.rsId=pickRS(bar.values,o.rs);
      s.sortCode="";s.gridNo="";
      if(o.sort.length){
        $("#busyText").textContent="Checking Sort Code...";
        const g=await getBestSort(o.sort);
        if(g){s.sortCode=g.code;s.gridNo=g.grid;}
      }

      showResult(mode);
      if(typeof styleResult==="function")styleResult(mode);

      if(!s.sortCode){
        toast(s.rsId?"RunSheet ID captured, but Sort Code was not detected.":"RunSheet ID and Sort Code were not detected.");
        return;
      }

      if(mode==="sorting"){
        await saveRecord(mode,"","SORTED");
        toast("Sorting completed.");
        return;
      }

      $("#putGridCard").classList.remove("hidden");
      $("#putGridStatus").textContent=s.rsId?
        "Grid loaded. Open Grid Camera to continue.":
        "Grid loaded. RunSheet ID not detected. Open Grid Camera to continue.";
      toast("Label processed.");
    }catch(e){
      console.error(e);toast(e.message||"Could not read the label.");
    }finally{
      if(url)URL.revokeObjectURL(url);
      busy(false);
    }
  }

  // v5.26 Putting: after MATCH, remove the lower Grid step.
  function startGridScannerFast(){
    const s=state.putting;
    if(!s.gridNo){toast("Grid No is not available yet.");return;}
    const status=$("#putGridStatus"),stop=$("#putStopBtn"),btn=$("#putGridBtn"),video=$("#labelCamera");
    const expected=String(s.gridNo||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    status.textContent="Starting QR scanner...";
    btn.classList.add("hidden");stop.classList.remove("hidden");

    let finished=false;
    const finish=raw=>{
      if(finished)return;
      const value=String(raw||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
      if(!value)return;
      if(value===expected){
        finished=true;
        try{stopGridScanner()}catch(e){}
        status.innerHTML=`<span class="success">✓ MATCH — ${value}</span>`;
        saveRecord("putting",value,"MATCH");

        // IMPORTANT: once Grid MATCH is confirmed, the Grid Camera step
        // must disappear immediately. The next action is ONLY New Scan,
        // which starts a fresh Label scan.
        $("#putGridCard")?.classList.add("hidden");
        $("#putGridStatus").textContent="";
        ensurePutNewScan();
      }else{
        status.innerHTML=`<span class="error">✗ WRONG BARCODE — ${value} | Expected: ${expected}</span>`;
        if(navigator.vibrate)navigator.vibrate(80);
      }
    };

    // Reuse current stream if available.
    (async()=>{
      try{
        $("#cameraTitle").textContent="Putting - Grid Camera";
        $("#cameraModal").classList.remove("hidden");
        $("#capturePhoto").classList.add("hidden");
        $("#cameraHelp").textContent="Point the camera at the Grid QR code.";

        if(cameraStream&&cameraStream.getVideoTracks().some(t=>t.readyState==="live")){
          video.srcObject=cameraStream;
        }else{
          try{cameraStream?.getTracks()?.forEach(t=>t.stop())}catch(e){}
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
        await new Promise(r=>setTimeout(r,120));

        try{
          const track=cameraStream?.getVideoTracks?.()[0],caps=track?.getCapabilities?.();
          if(caps?.focusMode?.includes("continuous"))
            await track.applyConstraints({advanced:[{focusMode:"continuous"}]});
        }catch(e){}

        let nativeStarted=false;
        if("BarcodeDetector" in window){
          try{
            let fs=["qr_code","data_matrix","aztec","pdf417","code_128","code_39","code_93","codabar","ean_13","ean_8","upc_a","upc_e","itf"];
            if(BarcodeDetector.getSupportedFormats){
              const supported=await BarcodeDetector.getSupportedFormats();fs=fs.filter(f=>supported.includes(f));
            }
            if(fs.length){
              const detector=new BarcodeDetector({formats:fs});
              s._nativeDetector=detector;
              s._nativeTimer=setInterval(async()=>{
                if(finished||!cameraStream||!video.videoWidth||!video.videoHeight)return;
                try{
                  const codes=await detector.detect(video);
                  for(const c of codes||[]){
                    finish(c.rawValue);
                    if(finished)break;
                  }
                }catch(e){}
              },120);
              nativeStarted=true;
            }
          }catch(e){}
        }
        if(!nativeStarted && window.ZXingBrowser?.BrowserMultiFormatReader){
          const reader=new ZXingBrowser.BrowserMultiFormatReader();
          s.scanner=reader;
          s.controls=await reader.decodeFromVideoElement(video,(r)=>{
            if(r&&!finished)finish(r.getText?r.getText():r.text);
          });
        }
        if(!nativeStarted && !s.scanner)throw Error("QR scanner is not available in this browser.");
      }catch(e){
        console.error(e);
        try{if(typeof stopGridScanner==="function")stopGridScanner(true)}catch(x){}
        status.innerHTML='<span class="error">Grid QR scanner could not start. Allow camera access and try again.</span>';
      }
    })();
  }

  window.readLabel=readLabelFast;
  window.startGridScanner=startGridScannerFast;

  const gb=$("#putGridBtn");if(gb)gb.onclick=startGridScannerFast;

})();
