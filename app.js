
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const KEY="genevieve_food_v19_live_phone";
const BUILD="2026.07.29.19.5";
const PRODUCT_API_V2="https://world.openfoodfacts.org/api/v2/product/";
const PRODUCT_API_V0="https://world.openfoodfacts.org/api/v0/product/";
const SEARCH_API="https://world.openfoodfacts.org/cgi/search.pl";
const PRODUCT_CACHE_KEY="genevieve_food_v19_5_product_cache";
const TESSERACT_CDN="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
const QUAGGA_CDN="https://cdn.jsdelivr.net/npm/@ericblade/quagga2@1.12.1/dist/quagga.min.js";
const BUILT_IN_PRODUCTS={
  "9300617433163":{
    code:"9300617433163",
    product_name:"Cadbury Flake Sharepack 12 Pack 168g",
    brands:"Cadbury",
    quantity:"168 g",
    categories:"Milk chocolate",
    ingredients_text:"Full cream milk, sugar, cocoa butter, cocoa mass, milk solids, emulsifiers (soy lecithin, 476), flavours.",
    allergens:"Milk, soy",
    allergens_tags:["en:milk","en:soybeans"],
    traces:"Peanuts, tree nuts",
    traces_tags:["en:peanuts","en:nuts"],
    labels:"Built-in reference from the photographed packet — always check the current physical label."
  },
  "4901515129889":{
    code:"4901515129889",
    product_name:"Kikkoman Gluten Free Soy Sauce 250 mL",
    brands:"Kikkoman",
    quantity:"250 mL",
    categories:"Gluten free soy sauce",
    ingredients_text:"Water, soybeans (20%), rice, salt.",
    allergens:"Soy",
    allergens_tags:["en:soybeans"],
    traces:"",
    traces_tags:[],
    labels:"Gluten free. Built-in regression reference from the current physical label — always check the bottle before use."
  }
};

const defaults={
  stock:[
    {id:"s1",name:"Chicken breast",location:"Fridge",qty:2,unit:"each",yellow:1,red:.5,safety:"Green — Tracey safe",notes:""},
    {id:"s2",name:"Carrot",location:"Fridge",qty:4,unit:"each",yellow:2,red:1,safety:"Green — Tracey safe",notes:""}
  ],
  recipes:[],usage:[],shopping:[],learned:[],
  scans:[],currentScan:null,currentRecipe:null,filter:"all",
  rules:{gluten:true,dairy:true,trace:true,seafood:true,mushroom:true,housemate:true,clean:true}
};

const glutenTerms=["wheat","barley","rye","oats","malt","brewer's yeast","spelt","triticale","gluten"];
const dairyTerms=["milk","cream","butter","whey","casein","caseinate","cheese","yoghurt","yogurt","lactose","milk solids","buttermilk"];
const seafoodTerms=["seafood","fish","shellfish","prawn","prawns","shrimp","crab","lobster","oyster","oysters","mussel","mussels","clam","clams","anchovy","anchovies","tuna","salmon","sardine","sardines","mollusc","molluscs"];
const mushroomTerms=["mushroom","mushrooms","shiitake","portobello","truffle","truffles"];
const plantDairyExceptions=[
  /\b(?:soy|soya|oat|almond|coconut|rice|cashew|macadamia|hemp|pea|plant(?:-based)?)\s+(?:milk|cream)\b/gi,
  /\b(?:cocoa|cacao|peanut|almond|cashew|hazelnut|macadamia|sunflower|seed|nut)\s+butter\b/gi
];
const traceDairyRegex=/(?:may contain|may be present|traces? of|made (?:in|on).*?(?:handles|processes))[^.;\n]*(?:milk|dairy|whey|casein|lactose)/gi;
const additiveTerms=["preservative","colour","color","flavour","flavor","emulsifier","stabiliser","stabilizer","thickener","artificial","e1","e2","e3","e4","e5","e6","e9"];
const digestionTerms=["onion","garlic","inulin","chicory","sorbitol","mannitol","xylitol","maltitol","high fructose","spice","chilli","chili"];

let state={};
let currentImageData="";
let currentImageRotation=0;
let currentStoredPhoto="";
let barcodeReader=null;
let tesseractLoadPromise=null;
let quaggaLoadPromise=null;

const REQUEST_TIMEOUT_MS=12000;
const SCAN_TIMEOUT_MS=10000;

function withTimeout(promise,ms,label){
  return Promise.race([
    promise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error(label||"Operation timed out")),ms))
  ]);
}
function ensureTesseract(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(tesseractLoadPromise)return tesseractLoadPromise;
  tesseractLoadPromise=withTimeout(new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src=TESSERACT_CDN;
    script.async=true;
    script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error("Label reader did not initialise"));
    script.onerror=()=>reject(new Error("Label reader could not be downloaded"));
    document.head.appendChild(script);
  }),15000,"Label reader download timed out").catch(error=>{tesseractLoadPromise=null;throw error});
  return tesseractLoadPromise;
}
function ensureQuagga(){
  if(window.Quagga)return Promise.resolve(window.Quagga);
  if(quaggaLoadPromise)return quaggaLoadPromise;
  quaggaLoadPromise=withTimeout(new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src=QUAGGA_CDN;
    script.async=true;
    script.crossOrigin="anonymous";
    script.onload=()=>window.Quagga?resolve(window.Quagga):reject(new Error("Second barcode reader did not initialise"));
    script.onerror=()=>reject(new Error("Second barcode reader could not be downloaded"));
    document.head.appendChild(script);
  }),12000,"Second barcode reader download timed out").catch(error=>{quaggaLoadPromise=null;throw error});
  return quaggaLoadPromise;
}
async function fetchJsonWithTimeout(url,ms=REQUEST_TIMEOUT_MS,options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  try{
    const response=await fetch(url,{
      signal:controller.signal,
      headers:{"Accept":"application/json",...(options.headers||{})},
      cache:options.cache||"no-store",
      credentials:options.credentials||"same-origin"
    });
    if(!response.ok)throw new Error(`Request failed: ${response.status}`);
    return await response.json();
  }finally{
    clearTimeout(timer);
  }
}
function safeJson(text){try{return JSON.parse(text)}catch{return null}}
function loadProductCache(){try{const value=safeJson(localStorage.getItem(PRODUCT_CACHE_KEY)||"");return value&&typeof value==="object"?value:{}}catch(error){console.warn("Product cache unavailable",error);return {}}}
function getCachedProduct(barcode){return loadProductCache()[barcode]?.product||null}
function cacheProduct(barcode,product){
  if(!barcode||!product)return;
  const cache=loadProductCache();
  cache[barcode]={savedAt:new Date().toISOString(),product};
  const newest=Object.entries(cache).sort((a,b)=>String(b[1]?.savedAt||"").localeCompare(String(a[1]?.savedAt||""))).slice(0,150);
  try{localStorage.setItem(PRODUCT_CACHE_KEY,JSON.stringify(Object.fromEntries(newest)))}catch(error){console.warn("Product cache unavailable",error)}
}
function productFields(){return "code,product_name,product_name_en,generic_name,generic_name_en,brands,quantity,categories,ingredients_text,ingredients_text_en,allergens,allergens_tags,traces,traces_tags,labels,labels_tags,labels_text,labels_text_en,image_front_small_url,image_front_url"}
async function productAttempt(url,provider,credentials="omit"){
  const data=await fetchJsonWithTimeout(url,9000,{credentials});
  if(data?.ok&&data?.status===1&&data?.product)return{kind:"found",provider:data.provider||provider,product:data.product};
  if(data?.status===1&&data?.product)return{kind:"found",provider,product:data.product};
  if(data?.status===0||data?.message==="Product not listed")return{kind:"not-found",provider};
  throw new Error(`${provider} returned no usable product`);
}
function firstUsefulProduct(attempts){
  return new Promise((resolve,reject)=>{
    let pending=attempts.length,notFound=false,finished=false;
    const errors=[];
    const complete=()=>{
      pending-=1;
      if(!pending&&!finished){
        finished=true;
        if(notFound)resolve({kind:"not-found"});
        else reject(new Error(errors.join(" | ")||"Product services unavailable"));
      }
    };
    attempts.forEach(promise=>promise.then(result=>{
      if(finished)return;
      if(result?.kind==="found"){finished=true;resolve(result);return}
      if(result?.kind==="not-found")notFound=true;
      complete();
    }).catch(error=>{errors.push(error?.message||String(error));complete()}));
  });
}
function finishStatus(type,title,text){
  setStatus(type,title,text);
  const startup=$("#startupStatus");
  if(startup){
    startup.className="startup-status "+type;
    startup.innerHTML=`<b>${esc(title)}</b><span>${esc(text)}</span>`;
  }
}


function clone(x){return JSON.parse(JSON.stringify(x))}
function load(){
  try{state=JSON.parse(localStorage.getItem(KEY)||"null")||clone(defaults)}
  catch(e){state=clone(defaults)}
  for(const k in defaults) if(state[k]===undefined) state[k]=clone(defaults[k]);
  state.rules={...defaults.rules,...(state.rules||{})};
  save();
}
function stateForStorage(){
  const copy=clone(state);
  if(copy.currentScan?.photo&&copy.currentScan.photo.length>220000)copy.currentScan.photo="";
  copy.scans=(copy.scans||[]).slice(0,60).map((scan,index)=>({
    ...scan,
    photo:index<12&&String(scan.photo||"").length<=220000?scan.photo:""
  }));
  return copy;
}
function save(){
  try{localStorage.setItem(KEY,JSON.stringify(stateForStorage()))}
  catch(error){
    console.warn("Food app storage was full; saving without old photos.",error);
    try{
      const copy=stateForStorage();
      if(copy.currentScan)copy.currentScan.photo="";
      copy.scans=(copy.scans||[]).map(scan=>({...scan,photo:""})).slice(0,40);
      localStorage.setItem(KEY,JSON.stringify(copy));
      setStatus("error","Saved without old photos","Your food records were kept, but older scan photos were removed to prevent the phone storage from stopping the app.");
    }catch(secondError){console.error("Food app data could not be saved",secondError)}
  }
}
function uid(p){return p+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function go(id){
  $$(".screen").forEach(s=>s.classList.remove("active"));
  const target=$("#"+id); if(target) target.classList.add("active");
  $$(".bottom button").forEach(b=>b.classList.toggle("active",b.dataset.screen===id));
  render(); scrollTo({top:0,behavior:"smooth"});
}
function setStatus(type,title,text){
  const el=$("#scannerStatus"); if(!el)return;
  el.className="scanner-status "+type;
  el.innerHTML=`<b>${esc(title)}</b><span>${esc(text)}</span>`;
}
function tag(c){return `<span class="tag ${c}">${String(c).toUpperCase()}</span>`}
function colourForStock(i){
  if(String(i.safety).startsWith("Red")||String(i.safety).startsWith("Housemate"))return"red";
  if(+i.qty<=+i.red)return"red";
  if(+i.qty<=+i.yellow||String(i.safety).startsWith("Amber"))return"amber";
  return"green";
}
function render(){
  renderHome(); renderStock(); renderRecipes(); renderShopping(); renderLearning();
  renderAlerts(); renderRules(); renderSavedScans(); renderCurrentScan();
}
function renderHome(){
  const alerts=state.stock.map(i=>colourForStock(i));
  $("#statStock").textContent=state.stock.length;
  $("#statYellow").textContent=alerts.filter(x=>x==="amber").length;
  $("#statRed").textContent=alerts.filter(x=>x==="red").length;
  $("#statLearn").textContent=state.learned.length;
  $("#alertDot").style.display=alerts.some(x=>x!=="green")?"block":"none";
}
function renderCurrentScan(){
  const s=state.currentScan;
  $("#detectedBarcode").textContent=s?.barcode||"Waiting for barcode";
  $("#detectedProductName").textContent=s?.name||"Waiting for product";
  $("#barcode").value=s?.barcode||"";
  $("#scanName").value=s?.name||"";
  $("#labelText").value=s?.labelText||"";
  $("#toggleProductLoaded").checked=!!s?.name;
  $("#toggleIngredientsLoaded").checked=!!s?.ingredients;
  $("#toggleAllergensLoaded").checked=!!s?.allergens;
  $("#togglePhotoLoaded").checked=!!currentImageData||!!s?.photo;
  $("#reloadProduct").disabled=!s?.barcode;
  $("#deleteLoadedProduct").disabled=!s;
  if(s?.photo&&!currentImageData){
    currentImageData=s.photo;
    $("#barcodePreview").src=currentImageData;
    $("#photoWorkspace").classList.remove("hidden");
  }
  if(s?.result) applyResultToUI(s.result);
}
function renderSavedScans(){
  const el=$("#savedScanList"); if(!el)return;
  if(!state.scans.length){el.innerHTML="<p>No saved scans yet.</p>";return}
  el.innerHTML=state.scans.map(s=>`
    <article class="item ${s.result?.colour||"amber"}">
      <h4>${esc(s.name||"Unknown product")}</h4>
      ${tag(s.result?.colour||"amber")}
      <p>Barcode: ${esc(s.barcode||"Not recorded")}</p>
      <p>${esc((s.ingredients||"").slice(0,180))}${(s.ingredients||"").length>180?"…":""}</p>
      <div class="saved-scan-actions">
        <button onclick="loadSavedScan('${s.id}')">Load</button>
        <button class="danger-secondary" onclick="deleteSavedScan('${s.id}')">Delete</button>
      </div>
    </article>`).join("");
}
function applyResultToUI(r){
  $("#scanResult").className="result "+r.colour;
  $("#scanResult").innerHTML=`<b>${r.colour==="green"?"Green":r.colour==="red"?"Red":"Amber"} — ${esc(r.heading)}</b><span>${esc(r.message)}</span>`;
  $("#confidenceScore").textContent=r.confidence+"%";
  $("#cleanScore").textContent=r.clean+"%";
  $("#digestScore").textContent=r.digest+"%";
  $("#scanFindings").innerHTML=r.findings.length?r.findings.map(f=>`<article class="item ${f.level}"><h4>${esc(f.term)}</h4>${tag(f.level)}<p><b>Why:</b> ${esc(f.reason)}</p>${f.alternative?`<p><b>Safer option:</b> ${esc(f.alternative)}</p>`:""}</article>`).join(""):"<article class='item green'><h4>No blocked terms detected</h4><p>Always check the current physical label.</p></article>";
  $("#homeOrb").className="orb "+r.colour;
  $("#homeOrb").innerHTML=`<b>${r.colour.toUpperCase()}</b><span>${esc(r.heading)}</span>`;
}
function imageFileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}
function loadImageSource(src){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error("The selected image format could not be opened by this browser."));
    img.src=src;
  });
}
function canvasDataFromImage(img,maxDimension=2200,quality=.9){
  const sourceW=img.naturalWidth||img.width,sourceH=img.naturalHeight||img.height;
  const scale=Math.min(1,maxDimension/Math.max(sourceW,sourceH));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(sourceW*scale));
  canvas.height=Math.max(1,Math.round(sourceH*scale));
  const ctx=canvas.getContext("2d",{alpha:false});
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  return canvas.toDataURL("image/jpeg",quality);
}
async function prepareImageFile(file){
  const raw=await imageFileToDataURL(file);
  try{
    const img=await loadImageSource(raw);
    return {
      scan:canvasDataFromImage(img,2200,.92),
      stored:canvasDataFromImage(img,640,.68)
    };
  }catch(error){
    return {scan:raw,stored:""};
  }
}
function rotatedCanvas(img,rotation=0){
  const sourceW=img.naturalWidth||img.width,sourceH=img.naturalHeight||img.height;
  const maxDimension=2200;
  const scale=Math.min(1,maxDimension/Math.max(sourceW,sourceH));
  const w=Math.max(1,Math.round(sourceW*scale)),h=Math.max(1,Math.round(sourceH*scale));
  const turn=((Number(rotation)||0)%360+360)%360;
  const swap=turn===90||turn===270;
  const canvas=document.createElement("canvas");
  canvas.width=swap?h:w;canvas.height=swap?w:h;
  const ctx=canvas.getContext("2d",{alpha:false});
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.translate(canvas.width/2,canvas.height/2);
  ctx.rotate(turn*Math.PI/180);
  ctx.drawImage(img,-w/2,-h/2,w,h);
  return canvas;
}
async function canvasAsImage(canvas){
  return await loadImageSource(canvas.toDataURL("image/png"));
}
async function handleImageFile(file){
  if(!file)return;
  try{
    setStatus("loading","Loading photo","Preparing the barcode image.");
    const prepared=await prepareImageFile(file);
    currentImageData=prepared.scan;
    currentStoredPhoto=prepared.stored;
    currentImageRotation=0;
    $("#barcodePreview").src=currentImageData;
    $("#barcodePreview").style.transform="rotate(0deg)";
    $("#photoWorkspace").classList.remove("hidden");
    $("#togglePhotoLoaded").checked=true;
    ensureQuagga().catch(()=>null);
  }catch(e){
    console.error(e);
    setStatus("error","Photo could not be loaded","On Windows, use JPG or PNG if an iPhone HEIC photo cannot open.");
    return;
  }
  try{
    setStatus("loading","Photo loaded","Reading the barcode automatically, including curved bottle labels.");
    await scanCurrentPhoto();
  }catch(e){
    console.error(e);
    setStatus("error","Scanner stopped safely","The photo remains loaded. Tap Try reading this photo again while Genevieve keeps the rest of the app usable.");
  }
}
function barcodeChecksumValid(value){
  const code=String(value||"").replace(/\D/g,"");
  if(code.length===13){
    const sum=[...code.slice(0,12)].reduce((total,digit,index)=>total+Number(digit)*(index%2===0?1:3),0);
    return (10-(sum%10))%10===Number(code[12]);
  }
  if(code.length===12){
    const sum=[...code.slice(0,11)].reduce((total,digit,index)=>total+Number(digit)*(index%2===0?3:1),0);
    return (10-(sum%10))%10===Number(code[11]);
  }
  if(code.length===8){
    const sum=[...code.slice(0,7)].reduce((total,digit,index)=>total+Number(digit)*(index%2===0?3:1),0);
    return (10-(sum%10))%10===Number(code[7]);
  }
  return false;
}
function barcodeCandidatesFromText(text){
  const raw=String(text||"");
  const streams=new Set();
  streams.add(raw.replace(/\D/g,""));
  raw.split(/[\n\r]+/).forEach(line=>streams.add(line.replace(/\D/g,"")));
  raw.split(/[^0-9]+/).filter(Boolean).forEach(part=>streams.add(part));
  const out=[];
  for(const stream of streams){
    for(const length of [13,12,8]){
      if(stream.length<length)continue;
      for(let i=0;i<=stream.length-length;i++){
        const value=stream.slice(i,i+length);
        if(!out.includes(value))out.push(value);
      }
    }
  }
  return out;
}
function oneDigitChecksumRepairs(value){
  const code=String(value||"").replace(/\D/g,"");
  if(![13,12,8].includes(code.length))return[];
  const out=[];
  for(let index=0;index<code.length;index++){
    for(let digit=0;digit<=9;digit++){
      const next=String(digit);
      if(next===code[index])continue;
      const candidate=code.slice(0,index)+next+code.slice(index+1);
      if(barcodeChecksumValid(candidate)&&!out.includes(candidate))out.push(candidate);
    }
  }
  return out;
}
function cropCanvas(source,xRatio,yRatio,wRatio,hRatio,scale=1,mode="normal"){
  const sw=source.width||source.naturalWidth,sh=source.height||source.naturalHeight;
  const sx=Math.max(0,Math.round(sw*xRatio)),sy=Math.max(0,Math.round(sh*yRatio));
  const cw=Math.max(1,Math.min(sw-sx,Math.round(sw*wRatio))),ch=Math.max(1,Math.min(sh-sy,Math.round(sh*hRatio)));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(cw*scale));canvas.height=Math.max(1,Math.round(ch*scale));
  const ctx=canvas.getContext("2d",{alpha:false,willReadFrequently:true});
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
  ctx.drawImage(source,sx,sy,cw,ch,0,0,canvas.width,canvas.height);
  if(mode!=="normal"){
    const image=ctx.getImageData(0,0,canvas.width,canvas.height),data=image.data;
    let min=255,max=0;
    for(let i=0;i<data.length;i+=4){
      const grey=.299*data[i]+.587*data[i+1]+.114*data[i+2];
      if(grey<min)min=grey;if(grey>max)max=grey;
    }
    const range=Math.max(20,max-min);
    for(let i=0;i<data.length;i+=4){
      let grey=.299*data[i]+.587*data[i+1]+.114*data[i+2];
      if(mode==="contrast"||mode==="threshold")grey=(grey-min)*255/range;
      if(mode==="threshold")grey=grey<145?0:255;
      data[i]=data[i+1]=data[i+2]=Math.max(0,Math.min(255,grey));
    }
    ctx.putImageData(image,0,0);
  }
  return canvas;
}
function barcodeScanCanvases(canvas){
  const candidates=[canvas];
  const regions=[
    [.05,.25,.90,.60,1.25],
    [.10,.38,.82,.42,1.6],
    [.12,.48,.80,.32,2],
    [.03,.52,.94,.28,2]
  ];
  for(const region of regions){
    candidates.push(cropCanvas(canvas,...region,"normal"));
    candidates.push(cropCanvas(canvas,...region,"contrast"));
    candidates.push(cropCanvas(canvas,...region,"threshold"));
  }
  return candidates;
}
async function scanWithNativeBarcodeDetector(source){
  if(!("BarcodeDetector" in window))return null;
  try{
    const wanted=["ean_13","ean_8","upc_a","upc_e","code_128"];
    const supported=await BarcodeDetector.getSupportedFormats();
    const formats=wanted.filter(format=>supported.includes(format));
    const detector=new BarcodeDetector({formats:formats.length?formats:undefined});
    const found=await detector.detect(source);
    return found?.map(item=>item.rawValue).find(value=>String(value||"").replace(/\D/g,"").length>=6)||null;
  }catch(e){return null}
}
async function scanWithZXing(source){
  const readers=[];
  if(window.ZXingBrowser?.BrowserMultiFormatOneDReader)readers.push(new ZXingBrowser.BrowserMultiFormatOneDReader());
  if(window.ZXingBrowser?.BrowserMultiFormatReader)readers.push(new ZXingBrowser.BrowserMultiFormatReader());
  if(window.ZXing?.BrowserMultiFormatReader)readers.push(new ZXing.BrowserMultiFormatReader());
  for(const reader of readers){
    try{
      let result=null;
      if(source instanceof HTMLCanvasElement&&typeof reader.decodeFromCanvas==="function")result=await reader.decodeFromCanvas(source);
      else if(typeof reader.decodeFromImageElement==="function")result=await reader.decodeFromImageElement(source);
      const text=result?.getText?.()||result?.text||null;
      if(text)return text;
    }catch(e){}
    try{reader.reset?.()}catch(e){}
  }
  return null;
}
async function scanWithQuagga(source){
  let quagga=null;
  try{quagga=await ensureQuagga()}catch(error){return null}
  const src=source instanceof HTMLCanvasElement?source.toDataURL("image/jpeg",.94):(source?.src||"");
  if(!src)return null;
  const configurations=[
    {locate:true,patchSize:"medium",halfSample:false,size:1600},
    {locate:true,patchSize:"large",halfSample:true,size:1280}
  ];
  for(const option of configurations){
    const value=await new Promise(resolve=>{
      let settled=false;
      const finish=result=>{if(settled)return;settled=true;resolve(result?.codeResult?.code||null)};
      const timer=setTimeout(()=>finish(null),7000);
      try{
        quagga.decodeSingle({
          src,
          numOfWorkers:0,
          locate:option.locate,
          inputStream:{size:option.size,singleChannel:false},
          locator:{patchSize:option.patchSize,halfSample:option.halfSample},
          decoder:{readers:["ean_reader","ean_8_reader","upc_reader","upc_e_reader","code_128_reader"]}
        },result=>{clearTimeout(timer);finish(result)});
      }catch(error){clearTimeout(timer);finish(null)}
    });
    if(value)return value;
  }
  return null;
}
async function scanCanvas(canvas){
  const candidates=barcodeScanCanvases(canvas);
  for(const candidate of candidates){
    let code=null;
    try{code=await withTimeout(scanWithNativeBarcodeDetector(candidate),2500,"Native barcode scan timed out")}catch(e){}
    if(code)return code;
    try{code=await withTimeout(scanWithZXing(candidate),3500,"Barcode scan timed out")}catch(e){}
    if(code)return code;
  }
  setStatus("loading","Checking second barcode reader","Genevieve is using a second iPhone-compatible reader on the full photo and the closest barcode crop.");
  for(const candidate of [candidates[0],candidates[1],candidates[4]].filter(Boolean)){
    try{
      const code=await withTimeout(scanWithQuagga(candidate),15000,"Second barcode scan timed out");
      if(code)return code;
    }catch(e){}
  }
  return null;
}
async function resolveOcrBarcode(texts){
  const rawCandidates=[];
  texts.forEach(text=>barcodeCandidatesFromText(text).forEach(value=>{if(!rawCandidates.includes(value))rawCandidates.push(value)}));
  const direct=rawCandidates.filter(barcodeChecksumValid);
  if(direct.length===1)return direct[0];
  for(const code of direct){
    if(BUILT_IN_PRODUCTS[code]||getCachedProduct(code))return code;
  }
  const repaired=[];
  for(const value of rawCandidates){
    for(const code of oneDigitChecksumRepairs(value)){
      if(!repaired.includes(code))repaired.push(code);
    }
  }
  for(const code of repaired){
    if(BUILT_IN_PRODUCTS[code]||getCachedProduct(code))return code;
  }
  const validationPool=[...direct,...repaired].slice(0,24);
  for(let index=0;index<validationPool.length;index+=4){
    const batch=validationPool.slice(index,index+4);
    const settled=await Promise.allSettled(batch.map(async code=>{
      const urls=[];
      urls.push(`${PRODUCT_API_V2}${encodeURIComponent(code)}.json?fields=code,product_name,brands`);
      for(const url of urls){
        try{
          const data=await fetchJsonWithTimeout(url,4500,{credentials:"omit"});
          if((data?.ok&&data?.status===1&&data?.product)||(data?.status===1&&data?.product))return code;
        }catch(e){}
      }
      return null;
    }));
    const found=settled.find(item=>item.status==="fulfilled"&&item.value)?.value;
    if(found)return found;
  }
  return direct[0]||null;
}
async function scanPrintedBarcodeDigits(img){
  let ocr=null,worker=null;
  try{
    setStatus("loading","Reading printed barcode numbers","The bars were difficult, so Genevieve is checking the clear numbers printed underneath them.");
    ocr=await ensureTesseract();
    if(typeof ocr.createWorker==="function"){
      worker=await withTimeout(ocr.createWorker("eng",1,{logger:m=>{
        if(m.status)setStatus("loading","Reading printed barcode numbers",`${m.status} ${Math.round((m.progress||0)*100)}%`);
      }}),20000,"Barcode number reader did not start");
      await worker.setParameters({
        tessedit_char_whitelist:"0123456789",
        tessedit_pageseg_mode:"11",
        preserve_interword_spaces:"1"
      });
    }
    const texts=[];
    const rotations=[currentImageRotation,0,90,270,180].filter((value,index,array)=>array.indexOf(value)===index);
    for(const rotation of rotations.slice(0,3)){
      const source=rotatedCanvas(img,rotation);
      const regions=[
        [.05,.58,.90,.24,2.2,"contrast"],
        [.08,.64,.86,.18,2.7,"normal"],
        [.03,.50,.94,.35,1.8,"threshold"]
      ];
      for(const region of regions){
        const canvas=cropCanvas(source,...region);
        try{
          const result=worker?await withTimeout(worker.recognize(canvas),18000,"Barcode number reading timed out"):await withTimeout(ocr.recognize(canvas,"eng"),18000,"Barcode number reading timed out");
          const text=String(result?.data?.text||"");
          if(text.trim())texts.push(text);
          const resolved=await resolveOcrBarcode(texts);
          if(resolved)return resolved;
        }catch(e){}
      }
    }
    return await resolveOcrBarcode(texts);
  }catch(e){
    console.warn("Printed barcode number fallback unavailable",e);
    return null;
  }finally{
    try{await worker?.terminate?.()}catch(e){}
  }
}

const EAN_L={"0":"0001101","1":"0011001","2":"0010011","3":"0111101","4":"0100011","5":"0110001","6":"0101111","7":"0111011","8":"0110111","9":"0001011"};
const EAN_G={"0":"0100111","1":"0110011","2":"0011011","3":"0100001","4":"0011101","5":"0111001","6":"0000101","7":"0010001","8":"0001001","9":"0010111"};
const EAN_R=Object.fromEntries(Object.entries(EAN_L).map(([digit,bits])=>[digit,[...bits].map(bit=>bit==="0"?"1":"0").join("")]));
const EAN_PARITY={"0":"LLLLLL","1":"LLGLGG","2":"LLGGLG","3":"LLGGGL","4":"LGLLGG","5":"LGGLLG","6":"LGGGLL","7":"LGLGLG","8":"LGLGGL","9":"LGGLGL"};
function ean13Pattern(code){
  code=String(code||"").replace(/\D/g,"");
  if(code.length!==13||!barcodeChecksumValid(code))return null;
  let bits="101";
  const parity=EAN_PARITY[code[0]];
  for(let i=1;i<=6;i++)bits+=(parity[i-1]==="L"?EAN_L:EAN_G)[code[i]];
  bits+="01010";
  for(let i=7;i<13;i++)bits+=EAN_R[code[i]];
  bits+="101";
  return [...bits].map(Number);
}
function grayscaleCanvas(canvas,maxWidth=900){
  const scale=Math.min(1,maxWidth/canvas.width);
  const out=document.createElement("canvas");
  out.width=Math.max(1,Math.round(canvas.width*scale));
  out.height=Math.max(1,Math.round(canvas.height*scale));
  const ctx=out.getContext("2d",{alpha:false,willReadFrequently:true});
  ctx.fillStyle="#fff";ctx.fillRect(0,0,out.width,out.height);
  ctx.drawImage(canvas,0,0,out.width,out.height);
  return {canvas:out,image:ctx.getImageData(0,0,out.width,out.height),width:out.width,height:out.height};
}
function patternCorrelation(values,bits){
  let meanV=0,meanB=0;
  for(let i=0;i<bits.length;i++){meanV+=values[i];meanB+=bits[i]}
  meanV/=bits.length;meanB/=bits.length;
  let numerator=0,sumV=0,sumB=0;
  for(let i=0;i<bits.length;i++){
    const v=values[i]-meanV,b=bits[i]-meanB;
    numerator+=v*b;sumV+=v*v;sumB+=b*b;
  }
  const denominator=Math.sqrt(sumV*sumB);
  return denominator?numerator/denominator:0;
}
function recogniseBuiltInBarcodePattern(canvas){
  const references=Object.keys(BUILT_IN_PRODUCTS).map(code=>({code,bits:ean13Pattern(code)})).filter(item=>item.bits);
  if(!references.length)return null;
  const {image,width,height}=grayscaleCanvas(canvas,900),data=image.data;
  const modules=Array.from({length:95},(_,index)=>(index+.5)/95);
  let best={code:null,correlation:0},runner={code:null,correlation:0};
  const sample=(x,y)=>{
    const xi=Math.max(0,Math.min(width-1,Math.round(x)));
    const yi=Math.max(0,Math.min(height-1,Math.round(y)));
    const offset=(yi*width+xi)*4;
    return .299*data[offset]+.587*data[offset+1]+.114*data[offset+2];
  };
  for(let yRatio=.45;yRatio<=.72;yRatio+=.015){
    const y0=yRatio*height;
    for(let startRatio=.30;startRatio<=.46;startRatio+=.02){
      for(let endRatio=.72;endRatio<=.90;endRatio+=.02){
        const start=startRatio*width,end=endRatio*width,mid=(start+end)/2,half=(end-start)/2;
        for(const curve of [.05,.25,.45,.65,.85,1.05]){
          const sinCurve=Math.sin(curve);
          const xs=modules.map(t=>mid+half*Math.sin(curve*(2*t-1))/sinCurve);
          for(const slope of [-.05,-.025,0,.025,.05]){
            const values=xs.map(x=>sample(x,y0+slope*(x-mid)));
            for(const reference of references){
              const correlation=patternCorrelation(values,reference.bits);
              if(correlation<best.correlation){runner=best;best={code:reference.code,correlation}}
              else if(correlation<runner.correlation){runner={code:reference.code,correlation}}
            }
          }
        }
      }
    }
  }
  const margin=runner.code&&runner.code!==best.code?runner.correlation-best.correlation:1;
  if(best.code&&best.correlation<=-.68&&(margin>=.10||best.correlation<=-.76))return best.code;
  return null;
}

async function scanCurrentPhoto(){
  if(!currentImageData)return alert("Take or upload a barcode photo first.");
  const img=$("#barcodePreview");
  await new Promise(res=>{
    if(img.complete&&img.naturalWidth)res();
    else{img.onload=()=>res();img.onerror=()=>res()}
  });
  setStatus("loading","Reading curved barcode","Genevieve is checking the actual bar pattern first, including curved bottle labels.");
  const rotations=[currentImageRotation,0,90,180,270].filter((value,index,array)=>array.indexOf(value)===index);
  let code=null;
  const preferred=rotatedCanvas(img,currentImageRotation||0);
  code=recogniseBuiltInBarcodePattern(preferred);
  if(!code){
    setStatus("loading","Reading barcode","Genevieve is checking the full photo, close crops, contrast and every direction.");
    for(const rotation of rotations){
      const canvas=rotation===(currentImageRotation||0)?preferred:rotatedCanvas(img,rotation);
      code=await scanCanvas(canvas);
      if(code){currentImageRotation=rotation;$("#barcodePreview").style.transform=`rotate(${rotation}deg)`;break}
    }
  }
  if(!code)code=await scanPrintedBarcodeDigits(img);
  if(!code){
    setStatus("error","Barcode still not read","The photo is clear, but the barcode is curved or distorted. Keep the photo on screen and type only the printed numbers once, then tap Look up typed barcode. The rest of the app remains usable.");
    return;
  }
  code=String(code).replace(/\D/g,"");
  if(code.length<6){
    setStatus("error","Barcode was unclear","The app could not confirm enough printed digits.");
    return;
  }
  $("#barcode").value=code;
  setStatus("success","Barcode detected",code);
  await lookupBarcode(code,true);
}
async function lookupBarcode(code,saveScan=true){
  code=String(code||"").replace(/\D/g,"");
  if(!code)return alert("No barcode was available.");
  setStatus("loading","Loading product",`Looking up barcode ${code}.`);

  const fields=productFields();
  const attempts=[];
  if(BUILT_IN_PRODUCTS[code]){
    attempts.push(Promise.resolve({kind:"found",provider:"built-in photographed-label reference",product:BUILT_IN_PRODUCTS[code]}));
  }else{
    attempts.push(productAttempt(`${PRODUCT_API_V2}${encodeURIComponent(code)}.json?fields=${encodeURIComponent(fields)}`,"Open Food Facts direct","omit"));
    attempts.push(productAttempt(`${PRODUCT_API_V0}${encodeURIComponent(code)}.json`,"Open Food Facts backup","omit"));
  }

  try{
    const result=await firstUsefulProduct(attempts);
    if(result.kind!=="found"){
      state.currentScan={
        id:uid("scan"),barcode:code,name:`Unknown product ${code}`,
        ingredients:"",allergens:"",traces:"",labels:"",labelText:"",
        photo:currentStoredPhoto||currentImageData,source:"barcode read; product not listed",loadedAt:new Date().toISOString()
      };
      save();render();runSafetyScan();
      setStatus("error","Barcode read — product not listed","The barcode worked. Photograph the ingredients or type/correct the product details; you are not stuck.");
      return;
    }

    const p=result.product;
    const name=p.product_name_en||p.product_name||p.generic_name_en||p.generic_name||"Unnamed product";
    const ingredients=p.ingredients_text_en||p.ingredients_text||"";
    const allergens=normaliseAllergens(p);
    const traces=normaliseTraces(p);
    const labels=p.labels_text_en||p.labels_text||p.labels||"";
    const labelText=[
      ingredients?`Ingredients: ${ingredients}`:"",
      allergens?`Allergens: ${allergens}`:"",
      traces?`May contain / traces: ${traces}`:"",
      labels?`Labels: ${labels}`:""
    ].filter(Boolean).join("\n");
    const scan={
      id:uid("scan"),barcode:code,name,ingredients,allergens,traces,labels,labelText,
      brand:p.brands||"",quantity:p.quantity||"",categories:p.categories||"",
      photo:currentStoredPhoto||currentImageData,source:result.provider||"product lookup",
      loadedAt:new Date().toISOString()
    };
    cacheProduct(code,p);
    state.currentScan=scan;
    $("#proofAllergen").checked=!!allergens;
    $("#proofLabel").checked=!!ingredients;
    if(saveScan)upsertScan(scan);
    save();render();
    setStatus("success","Product loaded",`${name} — loaded through ${result.provider||"the product service"}.`);
    runSafetyScan();
  }catch(error){
    console.error(error);
    const cached=getCachedProduct(code);
    if(cached){
      const p=cached;
      const name=p.product_name_en||p.product_name||p.generic_name_en||p.generic_name||`Product ${code}`;
      const ingredients=p.ingredients_text_en||p.ingredients_text||"";
      const allergens=normaliseAllergens(p),traces=normaliseTraces(p),labels=p.labels_text_en||p.labels_text||p.labels||"";
      const labelText=[ingredients?`Ingredients: ${ingredients}`:"",allergens?`Allergens: ${allergens}`:"",traces?`May contain / traces: ${traces}`:"",labels?`Labels: ${labels}`:""].filter(Boolean).join("\n");
      const scan={id:uid("scan"),barcode:code,name,ingredients,allergens,traces,labels,labelText,brand:p.brands||"",quantity:p.quantity||"",categories:p.categories||"",photo:currentStoredPhoto||currentImageData,source:"saved phone copy",loadedAt:new Date().toISOString()};
      state.currentScan=scan;if(saveScan)upsertScan(scan);save();render();runSafetyScan();
      setStatus("success","Saved product loaded","The live service was slow, so Genevieve loaded the last saved copy. Check the current packet label.");
      return;
    }
    state.currentScan={id:uid("scan"),barcode:code,name:`Product ${code}`,ingredients:"",allergens:"",traces:"",labels:"",labelText:"",photo:currentStoredPhoto||currentImageData,source:"barcode saved; service unavailable",loadedAt:new Date().toISOString()};
    save();render();runSafetyScan();
    setStatus("error","Barcode saved — product service unavailable","Tap Reload product information, photograph the ingredients, or enter the label text. The app will keep working.");
  }
}
function normaliseAllergens(p){
  const values=[];
  if(p.allergens)values.push(p.allergens);
  if(Array.isArray(p.allergens_tags))values.push(p.allergens_tags.map(x=>x.replace(/^..:/,"")).join(", "));
  return [...new Set(values.filter(Boolean).join(", ").split(",").map(x=>x.trim()).filter(Boolean))].join(", ");
}
function normaliseTraces(p){
  const values=[];
  if(p.traces)values.push(p.traces);
  if(Array.isArray(p.traces_tags))values.push(p.traces_tags.map(x=>x.replace(/^..:/,"")).join(", "));
  return [...new Set(values.filter(Boolean).join(", ").split(",").map(x=>x.trim()).filter(Boolean))].join(", ");
}
function upsertScan(scan){
  const i=state.scans.findIndex(x=>x.barcode&&x.barcode===scan.barcode);
  const copy=clone(scan);
  if(i>=0)state.scans[i]=copy;else state.scans.unshift(copy);
  state.scans=state.scans.slice(0,100);
}
async function searchByName(){
  const q=$("#scanName").value.trim();
  if(!q)return alert("Enter a product name only if barcode scanning was not possible.");
  setStatus("loading","Searching products",q);
  const urls=[];
  urls.push({url:SEARCH_API+"?search_terms="+encodeURIComponent(q)+"&search_simple=1&action=process&json=1&page_size=12",credentials:"omit"});
  const settled=await Promise.allSettled(urls.map(item=>fetchJsonWithTimeout(item.url,9000,{credentials:item.credentials})));
  const successful=settled.filter(item=>item.status==="fulfilled").map(item=>item.value);
  const products=successful.flatMap(data=>Array.isArray(data?.products)?data.products:[]).filter((p,index,array)=>p?.code&&array.findIndex(x=>x.code===p.code)===index).slice(0,12);
  const el=$("#nameSearchResults");
  if(!products.length){
    el.innerHTML="<p>No products found. You can still enter the product name and photograph the ingredients.</p>";
    setStatus(successful.length?"error":"error",successful.length?"No products found":"Search unavailable",successful.length?"Try a more exact product name.":"The search service could not be reached; the rest of the app still works.");
    return;
  }
  el.innerHTML=products.map(p=>`
    <article class="item search-result" onclick="selectSearchResult('${esc(p.code)}')">
      <h4>${esc(p.product_name_en||p.product_name||p.generic_name_en||p.generic_name||"Unnamed product")}</h4>
      <p>${esc(p.brands||"")} • ${esc(p.code)}</p>
      <button>Load this product</button>
    </article>`).join("");
  setStatus("success","Products found","Choose the matching product.");
}
async function readIngredientsPhoto(file){
  if(!file)return alert("Upload an ingredients photo first.");
  setStatus("loading","Preparing label reader","Downloading the optional label reader only when you use it.");
  try{
    const ocr=await ensureTesseract();
    setStatus("loading","Reading ingredients","This may take a little while.");
    const result=await withTimeout(
      ocr.recognize(file,"eng",{
        logger:m=>{if(m.status)setStatus("loading","Reading ingredients",`${m.status} ${Math.round((m.progress||0)*100)}%`)}
      }),
      45000,
      "Label reading timed out"
    );
    const text=(result.data.text||"").trim();
    if(!text)throw new Error("No text");
    $("#labelText").value=[state.currentScan?.labelText||"",text].filter(Boolean).join("\n");
    if(!state.currentScan)state.currentScan={id:uid("scan"),barcode:$("#barcode").value,name:$("#scanName").value||"Label photo product",loadedAt:new Date().toISOString()};
    state.currentScan.labelText=$("#labelText").value;
    state.currentScan.ingredients=state.currentScan.ingredients||text;
    $("#proofLabel").checked=true;
    upsertScan(state.currentScan);save();render();
    setStatus("success","Label text loaded","Check the automatic text against the physical label, then run the safety check.");
    runSafetyScan();
  }catch(e){
    console.error(e);
    setStatus("error","Label reading unavailable","Use a straight, bright, close photo, or type/paste the current label text manually. The rest of the app still works.");
  }
}
function escapedWord(term){return term.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
function containsTerm(text,term){return new RegExp(`\\b${escapedWord(term).replace(/\\ /g,"\\s+")}\\b`,"i").test(text)}
function stripPlantDairyTerms(text){return plantDairyExceptions.reduce((value,pattern)=>value.replace(pattern," plant-based alternative "),text)}
function directDairyText(text){return stripPlantDairyTerms(text.replace(traceDairyRegex," "))}
const glutenFreeClaimRegex=/\b(?:certified\s+)?gluten[-\s]?free\b|\bfree\s+from\s+gluten\b|\b(?:contains\s+)?no\s+gluten\b|\bwithout\s+gluten\b/gi;
function directGlutenText(text){return text.replace(glutenFreeClaimRegex," verified-free claim ")}
function runSafetyScan(){
  const name=(state.currentScan?.name||$("#scanName").value||"Product").trim();
  const label=$("#labelText").value.trim();
  const text=(name+" "+label).toLowerCase();
  const findings=[];
  const add=(term,level,reason,alternative="")=>{
    if(!findings.some(f=>f.term===term&&f.level===level))findings.push({term,level,reason,alternative});
  };
  const glutenAlternative="Choose a product clearly labelled gluten-free and check the current packet for coeliac suitability.";
  const dairyAlternative="Choose a clearly labelled dairy-free option, such as soy, oat, rice or coconut, that is also suitable for coeliac requirements.";
  const seafoodAlternative="Choose a non-seafood protein such as chicken, eggs, tofu or legumes that fits your other food rules.";
  const mushroomAlternative="Choose another vegetable with a similar cooking role, such as zucchini, eggplant or capsicum.";

  if(state.rules.gluten){
    const glutenText=directGlutenText(text);
    glutenTerms.forEach(term=>{
      if(containsTerm(glutenText,term))add(term,"red",`The label or product name contains “${term}”, which does not fit your strict coeliac rule.`,glutenAlternative);
    });
  }

  if(state.rules.dairy){
    const dairyText=directDairyText(text);
    dairyTerms.forEach(term=>{
      if(containsTerm(dairyText,term))add(term,"red",`The label or product name contains “${term}”, a dairy-related ingredient or term that does not fit your dairy rule.`,dairyAlternative);
    });
  }

  const traceDairyMatches=label.match(traceDairyRegex)||[];
  if(state.rules.trace&&traceDairyMatches.length){
    add("trace dairy","amber","The packet uses may-contain or trace wording for dairy. Your setting treats traces as a review item rather than a direct dairy ingredient.","Use the product only if trace dairy is acceptable for you and the current packet wording is clear.");
  }

  if(state.rules.seafood)seafoodTerms.forEach(term=>{
    if(containsTerm(text,term))add(term,"red",`The label or product name contains “${term}”, which conflicts with your no-seafood rule.`,seafoodAlternative);
  });
  if(state.rules.mushroom)mushroomTerms.forEach(term=>{
    if(containsTerm(text,term))add(term,"red",`The label or product name contains “${term}”, which conflicts with your no-mushroom rule.`,mushroomAlternative);
  });
  if(state.rules.clean)additiveTerms.forEach(term=>{
    if(containsTerm(text,term))add(term,"amber",`The label mentions “${term}”, an additive, preservative or processing term you asked Genevieve to highlight.`,"Compare with a simpler product that has a shorter ingredient list when one is available.");
  });
  digestionTerms.forEach(term=>{
    if(containsTerm(text,term))add(term,"amber",`The label mentions “${term}”. Some people find this harder to digest, so your app highlights it for personal tracking.`,"Choose a simpler alternative you already tolerate, and record symptoms rather than assuming this ingredient is the cause.");
  });
  if(!label)add("missing label information","amber","Ingredients and allergen information were not available, so the app cannot make a complete check.","Photograph the ingredients panel or enter the current label before relying on the result.");
  if(!$("#proofLabel").checked)add("physical label not confirmed","amber","The current packet has not been confirmed and formulations can change.","Check the physical packet and tick Current product label checked.");
  if(!$("#proofMine").checked)add("not confirmed as your food","red","The item is not confirmed as yours or approved for you.","Use only food that is yours and that meets your personal safety rules.");

  const hasRed=findings.some(f=>f.level==="red");
  const hasAmber=findings.some(f=>f.level==="amber");
  const colour=hasRed?"red":hasAmber?"amber":"green";
  const confidence=Math.max(15,Math.min(100,
    (state.currentScan?.barcode?25:0)+(name?15:0)+(label?35:0)+($("#proofLabel").checked?15:0)+($("#proofAllergen").checked?10:0)
  ));
  const additiveCount=findings.filter(f=>f.reason.includes("additive")||f.reason.includes("preservative")).length;
  const digestCount=findings.filter(f=>f.reason.includes("digest")).length;
  const clean=Math.max(5,100-additiveCount*15-(hasRed?35:0));
  const digest=Math.max(5,100-digestCount*15-(hasRed?25:0));
  const result={
    colour,confidence,clean,digest,findings,
    heading:colour==="green"?"No blocked terms detected":colour==="red"?"Blocked term detected":"Review required",
    message:colour==="green"?"Available information fits your current rules. Still check the current physical label.":colour==="red"?"Do not use until the red issue has been resolved. Read the reason and safer option below.":"Review the amber reason and safer option before using."
  };
  state.currentScan=Object.assign(state.currentScan||{id:uid("scan")},{
    barcode:$("#barcode").value.trim(),name,labelText:label,
    photo:currentStoredPhoto||state.currentScan?.photo||"",result,loadedAt:new Date().toISOString()
  });
  upsertScan(state.currentScan);
  findings.forEach(f=>{
    const existing=state.learned.find(x=>x.term===f.term);
    if(existing)Object.assign(existing,{level:f.level,reason:f.reason,alternative:f.alternative||""});
    else state.learned.unshift({term:f.term,level:f.level,reason:f.reason,alternative:f.alternative||""});
  });
  save();render();
}
function deleteLoaded(){
  state.currentScan=null; currentImageData=""; currentStoredPhoto=""; currentImageRotation=0;
  $("#barcodePreview").src="";$("#photoWorkspace").classList.add("hidden");
  $("#barcode").value="";$("#scanName").value="";$("#labelText").value="";
  $("#proofLabel").checked=false;$("#proofAllergen").checked=false;
  $("#scanResult").className="result amber";
  $("#scanResult").innerHTML="<b>Amber — waiting for product</b><span>Scan a barcode and Genevieve will load the product information.</span>";
  $("#scanFindings").innerHTML="<p>No scan yet.</p>";
  $("#confidenceScore").textContent="0%";$("#cleanScore").textContent="0%";$("#digestScore").textContent="0%";
  setStatus("idle","Ready","Take or upload a clear photo of the barcode.");
  save();render();
}
window.loadSavedScan=id=>{
  const scan=state.scans.find(x=>x.id===id);if(!scan)return;
  state.currentScan=clone(scan);currentImageData=scan.photo||"";currentStoredPhoto=scan.photo||"";
  if(currentImageData){$("#barcodePreview").src=currentImageData;$("#photoWorkspace").classList.remove("hidden")}
  save();render();setStatus("success","Saved scan loaded",scan.name||scan.barcode||"Product");
  go("scanner");
};
window.deleteSavedScan=id=>{
  state.scans=state.scans.filter(x=>x.id!==id);
  if(state.currentScan?.id===id)state.currentScan=null;
  save();render();
};
window.selectSearchResult=async code=>{await lookupBarcode(code,true)};

function addScannedStock(){
  const s=state.currentScan;
  if(!s?.name||s.name==="Product not found")return alert("Load a product first.");
  const colour=s.result?.colour||"amber";
  const safety=colour==="green"?"Green — Tracey safe":colour==="red"?"Red — do not use":"Amber — check / trace / uncertain";
  const existing=state.stock.find(x=>x.barcode&&x.barcode===s.barcode);
  if(existing){
    existing.qty=Number(existing.qty)+1;
    existing.name=s.name;existing.safety=safety;existing.notes=s.labelText||"";
  }else{
    state.stock.unshift({
      id:uid("stock"),barcode:s.barcode||"",name:s.name,location:"Pantry",qty:1,unit:"each",
      yellow:2,red:.5,safety,notes:s.labelText||""
    });
  }
  save();render();alert("Product added to stock. You can adjust quantity and location in Stock.");
}
function renderStock(){
  const list=$("#stockList");if(!list)return;
  let items=state.stock;
  const f=state.filter||"all";
  if(["Fridge","Pantry"].includes(f))items=items.filter(i=>i.location===f);
  if(["amber","red"].includes(f))items=items.filter(i=>colourForStock(i)===f);
  list.innerHTML=items.length?items.map(i=>{
    const c=colourForStock(i);
    return `<article class="item ${c}"><h4>${esc(i.name)}</h4>${tag(c)}
      <p>${esc(i.location)} • ${i.qty} ${esc(i.unit)}</p>
      <p>${esc(i.safety)}</p>
      <div class="actions">
        <button onclick="adjustStock('${i.id}',-1)">−</button>
        <button onclick="adjustStock('${i.id}',1)">+</button>
        <button class="danger-secondary" onclick="deleteStock('${i.id}')">Delete</button>
      </div></article>`;
  }).join(""):"<p>No stock items in this view.</p>";
}
window.adjustStock=(id,n)=>{const i=state.stock.find(x=>x.id===id);if(i){i.qty=Math.max(0,Number(i.qty)+n);save();render()}};
window.deleteStock=id=>{state.stock=state.stock.filter(x=>x.id!==id);save();render()};
function saveItem(){
  const name=$("#itemName").value.trim();if(!name)return alert("Add item name.");
  const existing=state.stock.find(i=>i.name.toLowerCase()===name.toLowerCase());
  const item={
    id:existing?.id||uid("stock"),name,location:$("#itemLocation").value,qty:+$("#itemQty").value||0,
    unit:$("#itemUnit").value,yellow:+$("#itemYellow").value||0,red:+$("#itemRed").value||0,
    safety:$("#itemSafety").value,notes:$("#itemNotes").value.trim()
  };
  if(existing)Object.assign(existing,item);else state.stock.unshift(item);
  save();render();
}
function generateRecipe(){
  const allowed=state.stock.filter(i=>colourForStock(i)==="green"&&+i.qty>0);
  if(!allowed.length)return alert("No green stock available.");
  const servings=Math.max(1,+$("#recipeServings").value||2);
  const chosen=allowed.slice(0,Math.min(6,allowed.length));
  const r={
    id:uid("recipe"),created:new Date().toISOString(),
    title:`Genevieve ${$("#recipeStyle").value} meal`,
    servings,notes:$("#recipeNotes").value.trim(),
    ingredients:chosen.map(i=>({name:i.name,qty:useQty(i,servings),unit:i.unit,colour:"green"})),
    steps:["Prepare and check each current product label.","Cook ingredients safely using suitable methods.","Use green items first.","Review amber items separately.","Do not use red or housemate food.","Log symptoms if needed."]
  };
  state.currentRecipe=r;save();showRecipe(r);
}
function useQty(i,s){let q=+i.qty;if(i.unit==="g"||i.unit==="ml")return Math.min(q,s*150);if(i.unit==="kg"||i.unit==="L")return Math.min(q,s*.25);return Math.min(q,s)}
function showRecipe(r){$("#recipeOutput").innerHTML=`<h4>${esc(r.title)}</h4><p>${esc(r.notes||"")}</p><ul>${r.ingredients.map(i=>`<li>${i.qty} ${esc(i.unit)} ${esc(i.name)} ${tag(i.colour)}</li>`).join("")}</ul><ol>${r.steps.map(s=>`<li>${esc(s)}</li>`).join("")}</ol>`}
function deploy(){
  const r=state.currentRecipe;if(!r)return alert("Generate first.");
  r.ingredients.forEach(ing=>{const item=state.stock.find(x=>x.name===ing.name);if(item)item.qty=Math.max(0,+item.qty-+ing.qty)});
  state.usage.unshift({time:new Date().toISOString(),recipe:r.title,ingredients:r.ingredients.map(i=>`${i.qty} ${i.unit} ${i.name}`).join(" | ")});
  state.recipes.unshift(r);state.currentRecipe=null;save();render();alert("Recipe deployed. Stock lowered and shopping alerts updated.");
}
function renderRecipes(){
  if(state.currentRecipe)showRecipe(state.currentRecipe);
  $("#recipeList").innerHTML=state.recipes.length?state.recipes.map(r=>`<article class="item green"><h4>${esc(r.title)}</h4><p>${new Date(r.created).toLocaleString()} • ${r.servings} serves</p></article>`).join(""):"<p>No saved recipes.</p>";
}
function addShop(item,reason){if(item&&!state.shopping.some(x=>x.item.toLowerCase()===item.toLowerCase()))state.shopping.unshift({item,reason});save();render()}
function renderShopping(){
  const low=state.stock.filter(i=>colourForStock(i)!=="green");
  $("#autoShop").innerHTML=low.length?low.map(i=>`<article class="item ${colourForStock(i)}"><h4>${esc(i.name)}</h4><p>${i.qty} ${esc(i.unit)} remaining</p><button onclick="addAutoShop('${encodeURIComponent(i.name)}','${encodeURIComponent(colourForStock(i)+" stock alert")}')">Add</button></article>`).join(""):"<p>No automatic stock alerts.</p>";
  $("#shopList").innerHTML=state.shopping.length?state.shopping.map((x,i)=>`<article class="item green"><h4>${esc(x.item)}</h4><p>${esc(x.reason)}</p><button class="danger-secondary" onclick="removeShop(${i})">Delete</button></article>`).join(""):"<p>No chosen shopping items.</p>";
}
window.addAutoShop=(i,r)=>addShop(decodeURIComponent(i),decodeURIComponent(r));
window.removeShop=i=>{state.shopping.splice(i,1);save();render()};
function renderLearning(){
  $("#learnedTerms").innerHTML=state.learned.length?state.learned.map(x=>`<article class="item ${x.level}"><h4>${esc(x.term)}</h4>${tag(x.level)}<p>${esc(x.reason)}</p>${x.alternative?`<p><b>Safer option:</b> ${esc(x.alternative)}</p>`:""}</article>`).join(""):"<p>No learned terms yet.</p>";
}
function renderAlerts(){
  const a=state.stock.filter(i=>colourForStock(i)!=="green");
  $("#alertList").innerHTML=a.length?a.map(i=>`<article class="item ${colourForStock(i)}"><h4>${esc(i.name)}</h4><p>${i.qty} ${esc(i.unit)} • ${esc(i.safety)}</p></article>`).join(""):"<p>No current alerts.</p>";
}
function renderRules(){
  $("#ruleGluten").checked=state.rules.gluten;$("#ruleDairy").checked=state.rules.dairy;
  $("#ruleTrace").checked=state.rules.trace;$("#ruleSeafood").checked=state.rules.seafood;$("#ruleMushroom").checked=state.rules.mushroom;$("#ruleHousemate").checked=state.rules.housemate;$("#ruleClean").checked=state.rules.clean;
  $("#blockedTerms").innerHTML=[...glutenTerms,...dairyTerms,...seafoodTerms,...mushroomTerms].map(x=>`<span>${esc(x)}</span>`).join("");
}
function csv(rows,fields){const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;return [fields.join(","),...rows.map(r=>fields.map(f=>q(r[f])).join(","))].join("\n")}
function dl(name,text,type="text/csv"){const b=new Blob([text],{type}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;a.click();URL.revokeObjectURL(a.href)}

document.addEventListener("click",e=>{
  const s=e.target.closest("[data-screen]");if(s)go(s.dataset.screen);
  const f=e.target.closest("[data-filter]");if(f){state.filter=f.dataset.filter;$$("[data-filter]").forEach(b=>b.classList.remove("active"));f.classList.add("active");renderStock()}
});

window.addEventListener("error",e=>{
  console.error(e.error||e.message);
  finishStatus("error","App error","Genevieve stopped a loading loop. Refresh once, then try the scan again.");
});
window.addEventListener("unhandledrejection",e=>{
  console.error(e.reason);
  finishStatus("error","Scanner stopped safely","The scanner or product service did not finish. Try again with a clearer barcode photo.");
});

document.addEventListener("DOMContentLoaded",()=>{
  if("serviceWorker" in navigator){
    navigator.serviceWorker.getRegistrations().then(registrations=>Promise.all(registrations.map(registration=>registration.unregister()))).catch(()=>null);
  }
  if("caches" in window){
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("genevieve-food-")).map(key=>caches.delete(key)))).catch(()=>null);
  }
  load();render();
  window.GENEVIEVE_FOOD_BUILD=BUILD;
  finishStatus("success","Ready","Take a barcode photo or upload one. Tracey does not need to type the product information.");
  $("#cameraBarcodePhoto").onchange=e=>handleImageFile(e.target.files[0]);
  $("#uploadBarcodePhoto").onchange=e=>handleImageFile(e.target.files[0]);
  $("#scanUploadedPhoto").onclick=scanCurrentPhoto;
  $("#rotatePhoto").onclick=()=>{currentImageRotation=(currentImageRotation+90)%360;$("#barcodePreview").style.transform=`rotate(${currentImageRotation}deg)`;setStatus("idle","Photo rotated","Tap Try reading this photo again. Genevieve will still check all four directions.")};
  $("#deletePhoto").onclick=()=>{currentImageData="";currentStoredPhoto="";$("#barcodePreview").src="";$("#photoWorkspace").classList.add("hidden");$("#cameraBarcodePhoto").value="";$("#uploadBarcodePhoto").value="";$("#togglePhotoLoaded").checked=false;setStatus("idle","Photo deleted","Take or upload another barcode photo.")};
  $("#reloadProduct").onclick=()=>lookupBarcode(state.currentScan?.barcode||$("#barcode").value,true);
  $("#deleteLoadedProduct").onclick=deleteLoaded;
  $("#lookupTypedBarcode").onclick=()=>lookupBarcode($("#barcode").value,true);
  $("#searchProductName").onclick=searchByName;
  $("#ingredientsPhoto").onchange=e=>readIngredientsPhoto(e.target.files[0]);
  $("#readLabelPhoto").onclick=()=>{const f=$("#ingredientsPhoto").files[0]||$("#cameraBarcodePhoto").files[0]||$("#uploadBarcodePhoto").files[0];readIngredientsPhoto(f)};
  $("#runScan").onclick=runSafetyScan;
  $("#addScannedStock").onclick=addScannedStock;
  $("#saveItem").onclick=saveItem;
  $("#generateRecipe").onclick=generateRecipe;
  $("#deployRecipe").onclick=deploy;
  $("#saveRecipe").onclick=()=>{if(!state.currentRecipe)return alert("Generate first.");state.recipes.unshift(state.currentRecipe);state.currentRecipe=null;save();render()};
  $("#addShop").onclick=()=>{addShop($("#shopItem").value.trim(),$("#shopReason").value.trim()||"Manual");$("#shopItem").value="";$("#shopReason").value=""};
  ["ruleGluten","ruleDairy","ruleTrace","ruleSeafood","ruleMushroom","ruleHousemate","ruleClean"].forEach(id=>{
    $("#"+id).onchange=()=>{state.rules[id.replace("rule","").toLowerCase()]=$("#"+id).checked;save();render()}
  });
  $("#exportShopping").onclick=()=>dl("genevieve_v19_shopping.csv",csv(state.shopping,["item","reason"]));
  $("#exportStock").onclick=()=>dl("genevieve_v19_stock.csv",csv(state.stock,["barcode","name","location","qty","unit","yellow","red","safety","notes"]));
  $("#exportRecipes").onclick=()=>dl("genevieve_v19_recipes.csv",csv(state.recipes.map(r=>({created:r.created,title:r.title,servings:r.servings,ingredients:r.ingredients.map(i=>`${i.qty} ${i.unit} ${i.name}`).join(" | "),notes:r.notes})),["created","title","servings","ingredients","notes"]));
  $("#exportUsage").onclick=()=>dl("genevieve_v19_usage.csv",csv(state.usage,["time","recipe","ingredients"]));
  $("#exportLearning").onclick=()=>dl("genevieve_v19_learning.csv",csv(state.learned,["term","level","reason","alternative"]));
});
