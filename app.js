const $=s=>document.querySelector(s);
const apiInput=$("#api-url"),tokenInput=$("#api-token"),serverStatus=$("#server-status");
let apiBase=localStorage.getItem("stemApiBase")||"";
let apiToken=sessionStorage.getItem("stemApiToken")||"";
apiInput.value=apiBase;tokenInput.value=apiToken;
function base(){return apiBase.replace(/\/$/,"");}
function headers(extra={}){return {...extra,"X-STEM-Token":apiToken,"cf-skip-browser-warning":"true"};}
function setServerStatus(t){serverStatus.textContent=t;}
async function apiFetch(path,options={}){return fetch(base()+path,{...options,headers:headers(options.headers||{})});}
$("#save-server").addEventListener("click",async()=>{
 apiBase=apiInput.value.trim().replace(/\/$/,"");apiToken=tokenInput.value.trim();
 if(!apiBase||!apiToken){setServerStatus("Paste both the Colab HTTPS address and the session token.");return;}
 try{
  const r=await fetch(base()+"/health",{headers:{"cf-skip-browser-warning":"true"}});if(!r.ok)throw new Error("Health check failed.");
  const d=await r.json();if(d.ok===false||!d.authenticated)throw new Error("This does not look like an active STEM Colab bridge.");
  localStorage.setItem("stemApiBase",apiBase);sessionStorage.setItem("stemApiToken",apiToken);
  setServerStatus("Connected to your live Colab session ("+(d.device||"device") +"). Upload your song below.");
 }catch(e){setServerStatus("Could not connect to Colab. Check the temporary URL, token and that the notebook is still running.");}
});
const form=$("#upload-form"),fileInput=$("#audio-file"),selected=$("#selected-file"),button=$("#submit-btn"),jobPanel=$("#job"),drop=$("#dropzone");
let pollHandle=null,activeJob=null;
fileInput.addEventListener("change",()=>showFile(fileInput.files[0]));
function showFile(f){if(f){selected.hidden=false;selected.textContent=f.name+" · "+(f.size/1048576).toFixed(1)+" MB";}}
["dragenter","dragover"].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.add("drag");}));
["dragleave","drop"].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.remove("drag");}));
drop.addEventListener("drop",ev=>{const f=ev.dataTransfer.files[0];if(f){fileInput.files=ev.dataTransfer.files;showFile(f);}});
form.addEventListener("submit",async ev=>{
 ev.preventDefault();const file=fileInput.files[0];
 if(!file){alert("Choose an audio file first.");return;}
 if(!apiBase||!apiToken){setServerStatus("Connect your active Colab session before uploading.");apiInput.focus();return;}
 if(file.size>250*1024*1024){alert("This Colab bridge accepts files up to 250 MB.");return;}
 button.disabled=true;button.textContent="Uploading audio…";jobPanel.hidden=false;$("#results-panel").hidden=true;$("#download-link").hidden=true;$("#job-state").textContent="UPLOADING";$("#job-title").textContent="Preparing your stems";progress(3);message("Uploading "+file.name+" to Colab…");
 try{
  const body=new FormData();body.append("audio",file);
  const r=await apiFetch("/api/jobs",{method:"POST",body});const d=await r.json();if(!r.ok)throw new Error(d.error||"Upload failed.");
  activeJob=d.id;message("Upload complete. Colab is processing your song…");poll(d.id);
 }catch(e){message(e.message);$("#job-state").textContent="ERROR";button.disabled=false;button.innerHTML='Try again <span>→</span>';}
});
function poll(id){
 if(pollHandle)clearInterval(pollHandle);
 const check=async()=>{
  try{
   const r=await apiFetch("/api/jobs/"+id);const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not read job status.");
   progress(d.progress||5);message(d.message||d.status);$("#job-state").textContent=d.status.toUpperCase();
   $("#job-title").textContent=d.status==="completed"?"Your results are ready":d.status==="failed"?"Processing needs attention":"Separating your audio";
   if(d.status==="completed"){
    clearInterval(pollHandle);button.disabled=false;button.innerHTML='Separate another song <span>→</span>';
    const a=$("#download-link");a.hidden=false;a.onclick=downloadZip;await loadResults(id);
   }else if(d.status==="failed"){clearInterval(pollHandle);button.disabled=false;button.innerHTML='Try another upload <span>→</span>';}
  }catch(e){clearInterval(pollHandle);message(e.message);$("#job-state").textContent="DISCONNECTED";button.disabled=false;button.innerHTML='Try again <span>→</span>';}
 };
 check();pollHandle=setInterval(check,3000);
}
async function blobDownload(path,name){
 const r=await apiFetch(path);if(!r.ok)throw new Error("Could not download "+name);
 const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function downloadZip(ev){ev.preventDefault();try{await blobDownload("/api/jobs/"+activeJob+"/download","STEM-results.zip");}catch(e){message(e.message);}}
async function loadResults(id){
 const r=await apiFetch("/api/jobs/"+id+"/results");const data=await r.json();if(!r.ok)throw new Error(data.error||"Could not load result previews.");
 const grid=$("#results-grid");grid.replaceChildren();
 for(const item of data.results||[]){
  const card=document.createElement("article");card.className="result-card";
  const title=document.createElement("h3");title.textContent=item.name.toUpperCase();card.appendChild(title);
  const meta=document.createElement("p");meta.textContent=(item.duration_seconds?Number(item.duration_seconds).toFixed(2)+" seconds":"Audio preview")+(item.diagnostics&&item.diagnostics.rms_dbfs!==undefined?" · RMS "+item.diagnostics.rms_dbfs+" dBFS":"");card.appendChild(meta);
  const audio=document.createElement("audio");audio.controls=true;audio.preload="none";audio.dataset.path=item.mp3;audio.setAttribute("aria-label",item.name+" audio preview");card.appendChild(audio);try{const response=await apiFetch(item.mp3);if(!response.ok)throw new Error("Preview unavailable");audio.src=URL.createObjectURL(await response.blob());}catch(e){message("Could not load "+item.name+" preview: "+e.message);}
  const actions=document.createElement("div");actions.className="result-actions";
  for(const [label,path] of [["Download WAV",item.wav],["Download MP3",item.mp3]]){
   const b=document.createElement("button");b.type="button";b.className="secondary";b.textContent=label;b.addEventListener("click",async()=>{try{await blobDownload(path,item.name.replace(/[^a-z0-9_-]/gi,"-")+"."+label.slice(-3).toLowerCase());}catch(e){message(e.message);}});actions.appendChild(b);
  }
  card.appendChild(actions);grid.appendChild(card);
 }
 $("#results-panel").hidden=false;
}
function progress(n){$("#progress-bar").style.width=Math.max(2,Math.min(100,n))+"%";}
function message(t){$("#job-message").textContent=t;}
