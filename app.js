
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const KEY="genevieve_food_v17_auto_scan";
const PRODUCT_API="https://world.openfoodfacts.org/api/v2/product/";
const SEARCH_API="https://world.openfoodfacts.org/cgi/search.pl";

const defaults={
  stock:[
    {id:"s1",name:"Chicken breast",location:"Fridge",qty:2,unit:"each",yellow:1,red:.5,safety:"Green — Tracey safe",notes:""},
    {id:"s2",name:"Carrot",location:"Fridge",qty:4,unit:"each",yellow:2,red:1,safety:"Green — Tracey safe",notes:""}
  ],
  recipes:[],usage:[],shopping:[],learned:[],
  scans:[],currentScan:null,currentRecipe:null,filter:"all",
  rules:{gluten:true,dairy:true,trace:true,housemate:true,clean:true}
};

const glutenTerms=["wheat","barley","rye","oats","malt","brewer's yeast","spelt","triticale","gluten"];
const dairyTerms=["milk","cream","butter","whey","casein","caseinate","cheese","yoghurt","yogurt","lactose","milk solids"];
const additiveTerms=["preservative","colour","color","flavour","flavor","emulsifier","stabiliser","stabilizer","thickener","artificial","e1","e2","e3","e4","e5","e6","e9"];
const digestionTerms=["onion","garlic","inulin","chicory","sorbitol","mannitol","xylitol","maltitol","high fructose","spice","chilli","chili"];

let state={};
let currentImageData="";
let currentImageRotation=0;
let barcodeReader=null;

function clone(x){return JSON.parse(JSON.stringify(x))}
function load(){
  try{state=JSON.parse(localStorage.getItem(KEY)||"null")||clone(defaults)}
  catch(e){state=clone(defaults)}
  for(const k in defaults) if(state[k]===undefined) state[k]=clone(defaults[k]);
  save();
}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
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
  $("#scanFindings").innerHTML=r.findings.length?r.findings.map(f=>`<article class="item ${f.level}"><h4>${esc(f.term)}</h4>${tag(f.level)}<p>${esc(f.reason)}</p></article>`).join(""):"<article class='item green'><h4>No blocked terms detected</h4><p>Always check the current physical label.</p></article>";
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
async function handleImageFile(file){
  if(!file)return;
  try{
    setStatus("loading","Loading photo","Preparing the barcode image.");
    currentImageData=await imageFileToDataURL(file);
    currentImageRotation=0;
    $("#barcodePreview").src=currentImageData;
    $("#barcodePreview").style.transform="rotate(0deg)";
    $("#photoWorkspace").classList.remove("hidden");
    $("#togglePhotoLoaded").checked=true;
    setStatus("loading","Photo loaded","Reading the barcode automatically.");
    await scanCurrentPhoto();
  }catch(e){
    console.error(e);
    setStatus("error","Photo could not be loaded","Try another clear barcode photo.");
  }
}
async function scanWithNativeBarcodeDetector(img){
  if(!("BarcodeDetector" in window)) return null;
  try{
    const formats=await BarcodeDetector.getSupportedFormats();
    const detector=new BarcodeDetector({formats:formats.length?formats:undefined});
    const found=await detector.detect(img);
    return found?.[0]?.rawValue||null;
  }catch(e){return null}
}
async function scanWithZXing(img){
  if(!window.ZXing) return null;
  try{
    barcodeReader=barcodeReader||new ZXing.BrowserMultiFormatReader();
    const result=await barcodeReader.decodeFromImageElement(img);
    return result?.getText?.()||result?.text||null;
  }catch(e){return null}
}
async function scanCurrentPhoto(){
  if(!currentImageData)return alert("Take or upload a barcode photo first.");
  const img=$("#barcodePreview");
  await new Promise(res=>{
    if(img.complete&&img.naturalWidth)res();
    else {img.onload=()=>res();img.onerror=()=>res()}
  });
  setStatus("loading","Reading barcode","Genevieve is scanning the uploaded image.");
  let code=await scanWithNativeBarcodeDetector(img);
  if(!code) code=await scanWithZXing(img);
  if(!code){
    setStatus("error","Barcode not found","Use a closer, sharper photo with the whole barcode visible. You can rotate the photo and try again.");
    return;
  }
  code=String(code).replace(/\D/g,"");
  if(!code){
    setStatus("error","Barcode was unclear","Try another photo.");
    return;
  }
  $("#barcode").value=code;
  setStatus("success","Barcode detected",code);
  await lookupBarcode(code,true);
}
async function lookupBarcode(code,saveScan=true){
  code=String(code||"").replace(/\D/g,"");
  if(!code)return alert("No barcode was available.");
  setStatus("loading","Loading product","Looking up the product name, ingredients and allergens.");
  try{
    const response=await fetch(PRODUCT_API+encodeURIComponent(code)+".json");
    if(!response.ok)throw new Error("Lookup failed");
    const data=await response.json();
    if(data.status!==1||!data.product){
      state.currentScan={
        id:uid("scan"),barcode:code,name:"Product not found",
        ingredients:"",allergens:"",labelText:"",
        photo:currentImageData,source:"barcode",loadedAt:new Date().toISOString()
      };
      save();render();
      setStatus("error","Product not found","The barcode was read, but the food database has no product information. Upload an ingredients photo and use automatic label reading.");
      return;
    }
    const p=data.product;
    const name=p.product_name_en||p.product_name||p.generic_name_en||p.generic_name||"Unnamed product";
    const ingredients=p.ingredients_text_en||p.ingredients_text||"";
    const allergens=normaliseAllergens(p);
    const traces=normaliseTraces(p);
    const labels=p.labels_text_en||p.labels_text||"";
    const labelText=[
      ingredients?`Ingredients: ${ingredients}`:"",
      allergens?`Allergens: ${allergens}`:"",
      traces?`May contain / traces: ${traces}`:"",
      labels?`Labels: ${labels}`:""
    ].filter(Boolean).join("\n");
    const scan={
      id:uid("scan"),barcode:code,name,ingredients,allergens,traces,labels,labelText,
      brand:p.brands||"",quantity:p.quantity||"",categories:p.categories||"",
      photo:currentImageData,source:"Open Food Facts barcode lookup",
      loadedAt:new Date().toISOString()
    };
    state.currentScan=scan;
    $("#proofAllergen").checked=!!allergens;
    $("#proofLabel").checked=!!ingredients;
    if(saveScan) upsertScan(scan);
    save(); render();
    setStatus("success","Product loaded",`${name} — information loaded automatically.`);
    runSafetyScan();
  }catch(e){
    console.error(e);
    setStatus("error","Product lookup failed","The barcode was read, but the product service could not be reached. Check internet access and tap Reload product information.");
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
  try{
    const url=SEARCH_API+"?search_terms="+encodeURIComponent(q)+"&search_simple=1&action=process&json=1&page_size=12";
    const r=await fetch(url); if(!r.ok)throw new Error();
    const data=await r.json();
    const products=(data.products||[]).filter(p=>p.code);
    const el=$("#nameSearchResults");
    if(!products.length){el.innerHTML="<p>No products found.</p>";setStatus("error","No products found","Try a more exact product name.");return}
    el.innerHTML=products.map(p=>`
      <article class="item search-result" onclick="selectSearchResult('${esc(p.code)}')">
        <h4>${esc(p.product_name||p.generic_name||"Unnamed product")}</h4>
        <p>${esc(p.brands||"")} • ${esc(p.code)}</p>
        <button>Load this product</button>
      </article>`).join("");
    setStatus("success","Products found","Choose the matching product.");
  }catch(e){
    setStatus("error","Search failed","The product search service could not be reached.");
  }
}
async function readIngredientsPhoto(file){
  if(!file)return alert("Upload an ingredients photo first.");
  if(!window.Tesseract)return alert("Automatic label reading did not load. Check internet access and try again.");
  setStatus("loading","Reading ingredients","This may take a little while.");
  try{
    const result=await Tesseract.recognize(file,"eng",{
      logger:m=>{if(m.status)setStatus("loading","Reading ingredients",`${m.status} ${Math.round((m.progress||0)*100)}%`)}
    });
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
    setStatus("error","Label reading failed","Use a straight, bright, close photo of the ingredients panel.");
  }
}
function runSafetyScan(){
  const name=(state.currentScan?.name||$("#scanName").value||"Product").trim();
  const label=$("#labelText").value.trim();
  const text=(name+" "+label).toLowerCase();
  const findings=[];
  const add=(term,level,reason)=>{if(!findings.some(f=>f.term===term&&f.level===level))findings.push({term,level,reason})};
  if(state.rules.gluten)glutenTerms.forEach(t=>{if(text.includes(t))add(t,"red","Contains or mentions a gluten-related term. Check current packaging and coeliac requirements.")});
  if(state.rules.dairy)dairyTerms.forEach(t=>{if(text.includes(t))add(t,"red","Contains or mentions a dairy-related term.")});
  if(state.rules.trace&&/(may contain|traces? of).*(milk|dairy)/i.test(label))add("trace dairy","amber","Trace dairy wording detected. Review against your personal rule.");
  if(state.rules.clean)additiveTerms.forEach(t=>{if(text.includes(t))add(t,"amber","Additive, preservative or processing term detected.")});
  digestionTerms.forEach(t=>{if(text.includes(t))add(t,"amber","This term may be harder to digest for some people. Track your personal response.")});
  if(!label)add("missing label information","amber","Ingredients and allergen information were not available.");
  if(!$("#proofLabel").checked)add("physical label not confirmed","amber","Check the current physical packaging because formulations change.");
  if(!$("#proofMine").checked)add("not confirmed as your food","red","Do not use food that is not yours or not approved for you.");

  const hasRed=findings.some(f=>f.level==="red");
  const hasAmber=findings.some(f=>f.level==="amber");
  const colour=hasRed?"red":hasAmber?"amber":"green";
  const confidence=Math.max(15,Math.min(100,
    (state.currentScan?.barcode?25:0)+(name?15:0)+(label?35:0)+($("#proofLabel").checked?15:0)+($("#proofAllergen").checked?10:0)
  ));
  const additiveCount=findings.filter(f=>f.reason.includes("Additive")).length;
  const digestCount=findings.filter(f=>f.reason.includes("digest")).length;
  const clean=Math.max(5,100-additiveCount*15-(hasRed?35:0));
  const digest=Math.max(5,100-digestCount*15-(hasRed?25:0));
  const result={
    colour,confidence,clean,digest,findings,
    heading:colour==="green"?"No blocked terms detected":colour==="red"?"Blocked term detected":"Review required",
    message:colour==="green"?"Available information fits your current rules. Still check the current physical label.":colour==="red"?"Do not use until the red issue has been resolved.":"Check the amber findings before using."
  };
  state.currentScan=Object.assign(state.currentScan||{id:uid("scan")},{
    barcode:$("#barcode").value.trim(),name,labelText:label,
    photo:currentImageData||state.currentScan?.photo||"",result,loadedAt:new Date().toISOString()
  });
  upsertScan(state.currentScan);
  findings.forEach(f=>{
    if(!state.learned.some(x=>x.term===f.term))state.learned.unshift({term:f.term,level:f.level,reason:f.reason});
  });
  save();render();
}
function deleteLoaded(){
  state.currentScan=null; currentImageData=""; currentImageRotation=0;
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
  state.currentScan=clone(scan);currentImageData=scan.photo||"";
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
  $("#learnedTerms").innerHTML=state.learned.length?state.learned.map(x=>`<article class="item ${x.level}"><h4>${esc(x.term)}</h4>${tag(x.level)}<p>${esc(x.reason)}</p></article>`).join(""):"<p>No learned terms yet.</p>";
}
function renderAlerts(){
  const a=state.stock.filter(i=>colourForStock(i)!=="green");
  $("#alertList").innerHTML=a.length?a.map(i=>`<article class="item ${colourForStock(i)}"><h4>${esc(i.name)}</h4><p>${i.qty} ${esc(i.unit)} • ${esc(i.safety)}</p></article>`).join(""):"<p>No current alerts.</p>";
}
function renderRules(){
  $("#ruleGluten").checked=state.rules.gluten;$("#ruleDairy").checked=state.rules.dairy;
  $("#ruleTrace").checked=state.rules.trace;$("#ruleHousemate").checked=state.rules.housemate;$("#ruleClean").checked=state.rules.clean;
  $("#blockedTerms").innerHTML=[...glutenTerms,...dairyTerms].map(x=>`<span>${esc(x)}</span>`).join("");
}
function csv(rows,fields){const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;return [fields.join(","),...rows.map(r=>fields.map(f=>q(r[f])).join(","))].join("\n")}
function dl(name,text,type="text/csv"){const b=new Blob([text],{type}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;a.click();URL.revokeObjectURL(a.href)}

document.addEventListener("click",e=>{
  const s=e.target.closest("[data-screen]");if(s)go(s.dataset.screen);
  const f=e.target.closest("[data-filter]");if(f){state.filter=f.dataset.filter;$$("[data-filter]").forEach(b=>b.classList.remove("active"));f.classList.add("active");renderStock()}
});
document.addEventListener("DOMContentLoaded",()=>{
  load();render();
  $("#cameraBarcodePhoto").onchange=e=>handleImageFile(e.target.files[0]);
  $("#uploadBarcodePhoto").onchange=e=>handleImageFile(e.target.files[0]);
  $("#scanUploadedPhoto").onclick=scanCurrentPhoto;
  $("#rotatePhoto").onclick=()=>{currentImageRotation=(currentImageRotation+90)%360;$("#barcodePreview").style.transform=`rotate(${currentImageRotation}deg)`;setStatus("idle","Photo rotated","Tap Read barcode + load product again.")};
  $("#deletePhoto").onclick=()=>{currentImageData="";$("#barcodePreview").src="";$("#photoWorkspace").classList.add("hidden");$("#cameraBarcodePhoto").value="";$("#uploadBarcodePhoto").value="";$("#togglePhotoLoaded").checked=false;setStatus("idle","Photo deleted","Take or upload another barcode photo.")};
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
  ["ruleGluten","ruleDairy","ruleTrace","ruleHousemate","ruleClean"].forEach(id=>{
    $("#"+id).onchange=()=>{state.rules[id.replace("rule","").toLowerCase()]=$("#"+id).checked;save();render()}
  });
  $("#exportShopping").onclick=()=>dl("genevieve_v17_shopping.csv",csv(state.shopping,["item","reason"]));
  $("#exportStock").onclick=()=>dl("genevieve_v17_stock.csv",csv(state.stock,["barcode","name","location","qty","unit","yellow","red","safety","notes"]));
  $("#exportRecipes").onclick=()=>dl("genevieve_v17_recipes.csv",csv(state.recipes.map(r=>({created:r.created,title:r.title,servings:r.servings,ingredients:r.ingredients.map(i=>`${i.qty} ${i.unit} ${i.name}`).join(" | "),notes:r.notes})),["created","title","servings","ingredients","notes"]));
  $("#exportUsage").onclick=()=>dl("genevieve_v17_usage.csv",csv(state.usage,["time","recipe","ingredients"]));
  $("#exportLearning").onclick=()=>dl("genevieve_v17_learning.csv",csv(state.learned,["term","level","reason"]));
});
