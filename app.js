const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const DB_KEY="genevieve_food_v15_personal_trial";
const rules={
  gluten:["wheat","barley","rye","malt","gluten","semolina","spelt","triticale","farro","durum","couscous","brewer's yeast","brewers yeast","ordinary oats","oats"],
  dairy:["milk","cheese","cream","yoghurt","yogurt","butter","milk solids","skim milk powder","whey","casein","caseinate","lactose","buttermilk"],
  trace:["may contain milk","may contain dairy","may be present: milk","traces of milk","made on equipment with milk"],
  additives:["preservative","sorbate","benzoate","sulphite","sulfite","nitrate","nitrite","colour","flavour","emulsifier","stabiliser","thickener","gum","maltodextrin","natural flavour"]
};
let state={meals:[],symptoms:[],pantry:[],lastResult:null,settings:{blockDairy:true,traceDairyAmber:true}};
function load(){try{Object.assign(state,JSON.parse(localStorage.getItem(DB_KEY)||"{}"))}catch(e){}}
function save(){localStorage.setItem(DB_KEY,JSON.stringify(state))}
function screen(id){$$(".screen").forEach(s=>s.classList.remove("active"));$("#"+id)?.classList.add("active");$$(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.screen===id));scrollTo({top:0,behavior:"smooth"});if(id==="learning")renderLearning();if(id==="diary")renderDiary();if(id==="pantry")renderPantry();}
function norm(text){return (text||"").toLowerCase().replace(/[^\w\s'/-]/g," ")}
function findTerms(text, arr){const t=norm(text);return arr.filter(term=>t.includes(term.toLowerCase()))}
function analyse(){
  const text=$("#labelText").value.trim();
  const product=$("#productName").value.trim()||"Unnamed product";
  const proofIngredients=$("#proofIngredients").checked;
  const proofAllergen=$("#proofAllergen").checked;
  const proofCurrent=$("#proofCurrentLabel").checked;
  const proofMine=$("#proofMine").checked;
  const hasPhotos=$("#ingredientsPhoto").files.length>0 && $("#allergenPhoto").files.length>0;
  let risks=[], colour="green", title="Green — Tracey Safe", confidence=95, clean=92;

  if(!text){risks.push({level:"amber",msg:"No label text entered or OCR read. Genevieve cannot prove safety."}); colour="amber"; confidence=0; clean=0;}
  const gluten=findTerms(text,rules.gluten);
  const dairy=findTerms(text,rules.dairy);
  const trace=findTerms(text,rules.trace);
  const additives=findTerms(text,rules.additives);
  const glutenFree=/gluten[-\s]?free|free from gluten|coeliac suitable|celiac suitable/i.test(text);

  if(gluten.length){
    if(glutenFree && gluten.every(x=>["gluten","oats"].includes(x))){
      risks.push({level:"amber",msg:"Gluten/oats wording found but label may claim gluten free. Check physical label carefully."});
      colour=colour==="red"?"red":"amber"; confidence-=18;
    } else {
      risks.push({level:"red",msg:"Strict coeliac blocker found: "+gluten.join(", ")});
      colour="red"; confidence-=35; clean-=35;
    }
  }
  if(state.settings.blockDairy && dairy.length){
    risks.push({level:"red",msg:"Direct dairy blocker found: "+dairy.join(", ")});
    colour="red"; confidence-=30; clean-=25;
  }
  if(state.settings.traceDairyAmber && trace.length){
    risks.push({level:"amber",msg:"Trace dairy / may contain milk found: "+trace.join(", ")});
    if(colour!=="red") colour="amber"; confidence-=12; clean-=8;
  }
  if(additives.length){
    risks.push({level:"amber",msg:"Clean-food caution/additive terms found: "+additives.slice(0,12).join(", ")});
    if(colour!=="red") colour="amber"; clean-=Math.min(30, additives.length*4);
  }
  if(!proofIngredients||!proofAllergen||!proofCurrent||!proofMine||!hasPhotos){
    risks.push({level:"amber",msg:"Hard fail for green: photo proof and all proof boxes must be complete."});
    if(colour!=="red") colour="amber"; confidence-=25;
  }
  if(/housemate|not mine|shared only|do not use/i.test(text) || !proofMine){
    if(!proofMine){risks.push({level:"amber",msg:"Pantry ownership not confirmed as yours."});}
  }
  confidence=Math.max(0,Math.min(100,confidence));
  clean=Math.max(0,Math.min(100,clean));
  if(colour==="amber") title="Amber — Check / uncertain";
  if(colour==="red") title="Red — Do Not Use";
  if(colour==="green" && confidence<90){colour="amber";title="Amber — confidence too low for green";risks.push({level:"amber",msg:"Confidence below green threshold."});}
  if(!risks.length) risks.push({level:"green",msg:"No blocked terms found and proof is complete. Still use your eyes and current label."});

  const result={id:Date.now(),time:new Date().toISOString(),product,text,colour,title,confidence,clean,risks,notes:$("#barcodeNotes").value.trim()};
  state.lastResult=result; save(); renderResult(result); renderHomeStatus(result); return result;
}
function renderResult(r){
  const card=$("#scanResult"); card.className="result-card "+r.colour; card.innerHTML=`<strong>${r.title}</strong><span>${r.product}</span>`;
  $("#confidenceScore").textContent=r.confidence+"%"; $("#cleanScore").textContent=r.clean+"%";
  $("#detectedRisks").innerHTML=r.risks.map(x=>`<div class="risk ${x.level}">${x.msg}</div>`).join("");
}
function renderHomeStatus(r){
  const orb=$("#todayStatus"); orb.className="status-orb "+r.colour; orb.innerHTML=`<strong>${r.colour.toUpperCase()}</strong><span>${r.product}</span>`;
}
function saveMeal(){
  const r=state.lastResult||analyse();
  state.meals.unshift(r); save(); alert("Saved to meal diary.");
}
function renderDiary(){
  const list=$("#diaryList"); if(!list)return;
  list.innerHTML=state.symptoms.length?state.symptoms.map(x=>`<div class="saved-item"><b>${x.meal||"Meal"}</b><p>${x.time||""} • bowel count ${x.bowel||0} • delay ${x.delay||""}</p><p>${x.symptoms||""}</p><small>Suspect: ${x.suspect||"not set"}</small></div>`).join(""):"<p class='helper'>No symptoms logged yet.</p>";
}
function saveSymptom(){
  state.symptoms.unshift({id:Date.now(),time:$("#symptomTime").value,meal:$("#symptomMeal").value,bowel:$("#bowelCount").value,delay:$("#delayAfter").value,symptoms:$("#symptoms").value,suspect:$("#suspectIngredient").value});
  save(); renderDiary(); alert("Reaction saved.");
}
function renderLearning(){
  const counts={}; [...state.symptoms].forEach(s=>{const key=(s.suspect||"").trim().toLowerCase(); if(key)counts[key]=(counts[key]||0)+1;});
  const rows=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  $("#learningList").innerHTML=rows.length?rows.map(([k,v])=>`<div class="saved-item"><b>${k}</b><p>Logged ${v} time${v===1?"":"s"} as suspected. Discuss with doctor/dietitian before treating as confirmed.</p></div>`).join(""):"<p class='helper'>No repeated suspects yet. Log meals and symptoms to build patterns.</p>";
}
function renderPantry(){
  $("#pantryList").innerHTML=state.pantry.length?state.pantry.map(p=>`<div class="saved-item"><b>${p.item}</b><p>${p.status}</p></div>`).join(""):"<p class='helper'>No pantry items saved yet.</p>";
}
function savePantry(){
  const item=$("#pantryItem").value.trim(); if(!item)return alert("Add item name first.");
  state.pantry.unshift({id:Date.now(),item,status:$("#pantryStatus").value}); save(); renderPantry(); $("#pantryItem").value="";
}
function csv(rows,fields){
  const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  return [fields.join(","),...rows.map(r=>fields.map(f=>esc(r[f])).join(","))].join("\n");
}
function download(name,text){
  const blob=new Blob([text],{type:"text/csv;charset=utf-8"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href);
}
function exportMeals(){
  const rows=state.meals.map(m=>({time:m.time,product:m.product,colour:m.colour,confidence:m.confidence,clean:m.clean,risks:m.risks.map(r=>r.msg).join(" | "),notes:m.notes,text:m.text}));
  download("genevieve_food_meal_scans.csv",csv(rows,["time","product","colour","confidence","clean","risks","notes","text"]));
}
function exportSymptoms(){
  download("genevieve_food_symptoms.csv",csv(state.symptoms,["time","meal","bowel","delay","symptoms","suspect"]));
}
function exportPantry(){
  download("genevieve_food_pantry.csv",csv(state.pantry,["item","status"]));
}
function previewFile(input,imgId){
  const img=$("#"+imgId); const file=input.files[0]; if(!file)return; img.src=URL.createObjectURL(file); img.style.display="block";
}
async function runOCR(){
  const file=$("#ingredientsPhoto").files[0]; if(!file)return alert("Upload ingredients photo first.");
  if(!window.Tesseract)return alert("OCR script did not load. Paste the label text manually and Genevieve will still analyse safely.");
  $("#runOcrBtn").textContent="OCR reading...";
  try{
    const {data:{text}}=await Tesseract.recognize(file,"eng");
    $("#labelText").value=($("#labelText").value+"\n"+text).trim();
    alert("OCR added text. Please check it against the photo before trusting it.");
  }catch(e){alert("OCR failed. Paste the label text manually or retake a clearer photo.");}
  $("#runOcrBtn").textContent="Try OCR from ingredients photo";
}
function fillTerms(){
  $("#glutenTerms").innerHTML=rules.gluten.map(x=>`<span>${x}</span>`).join("");
  $("#dairyTerms").innerHTML=rules.dairy.map(x=>`<span>${x}</span>`).join("");
  $("#additiveTerms").innerHTML=rules.additives.map(x=>`<span>${x}</span>`).join("");
}
document.addEventListener("click",e=>{
  const go=e.target.closest("[data-screen]"); if(go)screen(go.dataset.screen);
});
document.addEventListener("DOMContentLoaded",()=>{
  load(); fillTerms(); renderDiary(); renderPantry();
  $("#blockDairy").checked=state.settings.blockDairy; $("#traceDairyAmber").checked=state.settings.traceDairyAmber;
  $("#blockDairy").onchange=e=>{state.settings.blockDairy=e.target.checked;save()};
  $("#traceDairyAmber").onchange=e=>{state.settings.traceDairyAmber=e.target.checked;save()};
  $("#analyseBtn").onclick=analyse; $("#saveMealBtn").onclick=saveMeal; $("#saveSymptomBtn").onclick=saveSymptom; $("#savePantryBtn").onclick=savePantry;
  $("#exportMealsBtn").onclick=exportMeals; $("#exportSymptomsBtn").onclick=exportSymptoms; $("#exportPantryBtn").onclick=exportPantry; $("#runOcrBtn").onclick=runOCR;
  $("#clearScanBtn").onclick=()=>{["productName","labelText","barcodeNotes"].forEach(id=>$("#"+id).value="");["proofIngredients","proofAllergen","proofCurrentLabel","proofMine"].forEach(id=>$("#"+id).checked=false);$("#detectedRisks").innerHTML="<p class='helper'>No label analysed yet.</p>";$("#scanResult").className="result-card amber";$("#scanResult").innerHTML="<strong>Amber — waiting for label proof</strong><span>Upload photos, tick proof boxes, then run check.</span>";$("#confidenceScore").textContent="0%";$("#cleanScore").textContent="0%";};
  $("#ingredientsPhoto").onchange=e=>previewFile(e.target,"ingredientsPreview");
  $("#allergenPhoto").onchange=e=>previewFile(e.target,"allergenPreview");
  $("#safetyShare").onchange=e=>{alert(e.target.checked?"Safety share turned on for chosen contacts placeholder.":"Safety share turned off.")};
});
