(() => {
  "use strict";

  const V4_THEMES = [
    ["system","Системная"],
    ["light","Светлая"],
    ["amoled","AMOLED"],
    ["ocean","Океан"],
    ["forest","Лес"]
  ];

  const css = document.createElement("style");
  css.textContent = `
    :root{--v4-accent:#3390ec;--v4-bg:#fff;--v4-panel:#f5f7fa;--v4-text:#17212b;--v4-muted:#708090}
    body.v4-light{--v4-accent:#1687e8;--v4-bg:#fff;--v4-panel:#f2f5f8;--v4-text:#17212b;--v4-muted:#667781}
    body.v4-amoled{--v4-accent:#4da3ff;--v4-bg:#000;--v4-panel:#050505;--v4-text:#f2f2f2;--v4-muted:#999}
    body.v4-ocean{--v4-accent:#08a4c4;--v4-bg:#071923;--v4-panel:#0c2531;--v4-text:#e8fbff;--v4-muted:#8db7c2}
    body.v4-forest{--v4-accent:#2e9b62;--v4-bg:#0d1b15;--v4-panel:#14271e;--v4-text:#ecfff4;--v4-muted:#9bc1ad}
    body.v4-light #app,body.v4-amoled #app,body.v4-ocean #app,body.v4-forest #app{background:var(--v4-bg);color:var(--v4-text)}
    body.v4-light .sidebar,body.v4-amoled .sidebar,body.v4-ocean .sidebar,body.v4-forest .sidebar,
    body.v4-light .chat-head,body.v4-amoled .chat-head,body.v4-ocean .chat-head,body.v4-forest .chat-head{background:var(--v4-panel)}
    body.v4-amoled .chat,body.v4-ocean .chat,body.v4-forest .chat{background:var(--v4-bg)}
    .v4-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:18px}
    .v4-card{width:min(520px,100%);max-height:82vh;overflow:auto;background:var(--v4-panel,#fff);color:var(--v4-text,#17212b);border-radius:18px;padding:18px;box-shadow:0 20px 70px rgba(0,0,0,.35)}
    .v4-card h2{margin:0 0 14px}.v4-row{display:flex;gap:8px;align-items:center;margin:9px 0}
    .v4-input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1px solid #0002;background:#fff;color:#111;font-size:16px}
    .v4-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}.v4-btn{border:0;border-radius:11px;padding:10px 14px;cursor:pointer}
    .v4-primary{background:var(--v4-accent);color:#fff}.v4-result{padding:11px 8px;border-bottom:1px solid #0002;cursor:pointer}.v4-result:last-child{border-bottom:0}
    .v4-muted{color:var(--v4-muted);font-size:12px}.v4-toolbar{display:flex;gap:4px}
    .v4-theme-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.v4-theme{padding:13px;border:2px solid #0001;border-radius:14px;cursor:pointer;background:#fff;color:#111;text-align:left}
    .v4-theme.active{border-color:var(--v4-accent)}.v4-theme b{display:block;margin-bottom:4px}
    .v4-badge{font-size:10px;padding:2px 6px;border-radius:9px;background:var(--v4-accent);color:#fff;margin-left:5px}
    @media(max-width:700px){.v4-card{border-radius:14px}.v4-theme-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(css);

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

  function applyTheme(theme){
    document.body.classList.remove("v4-light","v4-amoled","v4-ocean","v4-forest");
    if(theme !== "system") document.body.classList.add("v4-"+theme);
    localStorage.setItem("messenger-v4-theme",theme);
  }

  function themeModal(){
    let old=$("v4ThemeModal"); if(old) old.remove();
    const modal=document.createElement("div"); modal.id="v4ThemeModal"; modal.className="v4-modal";
    modal.innerHTML='<div class="v4-card"><h2>🎨 Оформление</h2><div class="v4-theme-grid">'+
      V4_THEMES.map(([id,name])=>'<button class="v4-theme" data-theme="'+id+'"><b>'+esc(name)+'</b><span class="v4-muted">'+(id==="system"?"Настройки устройства":id==="amoled"?"Чёрный фон":id==="ocean"?"Сине-бирюзовая тема":id==="forest"?"Зелёная тема":"Классическая")+'</span></button>').join("")+
      '</div><div class="v4-actions"><button class="v4-btn" data-v4-close>Закрыть</button></div></div>';
    document.body.appendChild(modal);
    const active=localStorage.getItem("messenger-v4-theme")||"system";
    modal.querySelectorAll("[data-theme]").forEach(b=>{b.classList.toggle("active",b.dataset.theme===active);b.onclick=()=>{applyTheme(b.dataset.theme);modal.querySelectorAll("[data-theme]").forEach(x=>x.classList.remove("active"));b.classList.add("active")};});
    modal.onclick=e=>{if(e.target===modal||e.target.hasAttribute("data-v4-close"))modal.remove()};
  }

  async function searchMessages(){
    let old=$("v4SearchModal"); if(old) old.remove();
    const modal=document.createElement("div"); modal.id="v4SearchModal"; modal.className="v4-modal";
    modal.innerHTML='<div class="v4-card"><h2>🔎 Поиск по переписке</h2><input id="v4SearchInput" class="v4-input" placeholder="Введите текст..." autocomplete="off"><div id="v4SearchResults" style="margin-top:12px"></div><div class="v4-actions"><button class="v4-btn" data-v4-close>Закрыть</button></div></div>';
    document.body.appendChild(modal);
    const input=$("v4SearchInput"), out=$("v4SearchResults");
    const run=async()=>{
      const q=input.value.trim().toLowerCase();
      if(!q){out.innerHTML='<div class="v4-muted">Начни вводить запрос.</div>';return}
      let arr=[];
      try{
        if(typeof current!=="undefined" && current && typeof currentType!=="undefined"){
          const url=currentType==="group"?"/api/groups/"+encodeURIComponent(current.id)+"/messages":"/api/messages/"+encodeURIComponent(current.id);
          const d=await api(url); arr=d.messages||[];
        }
      }catch{}
      arr=arr.filter(m=>((m.text||"")+" "+(m.attachment?.name||"")).toLowerCase().includes(q)).slice(-100).reverse();
      out.innerHTML=arr.length?arr.map(m=>'<div class="v4-result" data-id="'+esc(m.id)+'"><b>'+esc((m.text||"📎 файл").slice(0,180))+'</b><div class="v4-muted">'+new Date(m.createdAt).toLocaleString()+(m.editedAt?" · изменено":"")+'</div></div>').join(""):'<div class="v4-muted">Ничего не найдено.</div>';
      out.querySelectorAll("[data-id]").forEach(row=>row.onclick=()=>{const el=document.querySelector('[data-message-id="'+CSS.escape(row.dataset.id)+'"]');if(el){modal.remove();el.scrollIntoView({behavior:"smooth",block:"center"});el.animate([{transform:"scale(1)"},{transform:"scale(1.03)"},{transform:"scale(1)"}],350)}})
    };
    input.oninput=run; input.focus(); modal.onclick=e=>{if(e.target===modal||e.target.hasAttribute("data-v4-close"))modal.remove()};
  }

  function addButton(parent,id,title,text,fn){
    if($(id))return;
    const b=document.createElement("button");b.id=id;b.className="icon";b.title=title;b.textContent=text;b.onclick=fn;parent.appendChild(b);
  }

  function init(){
    applyTheme(localStorage.getItem("messenger-v4-theme")||"system");
    const sideHead=document.querySelector(".side-head");
    if(sideHead){
      addButton(sideHead.querySelector(".me-row")||sideHead,"v4ThemeBtn","Оформление","🎨",themeModal);
    }
    const chatHead=document.querySelector(".chat-head");
    if(chatHead){
      const pin=$("pinBtn"); addButton(chatHead,"v4SearchBtn","Поиск по переписке","🔎",searchMessages);
      if(pin && pin.parentNode) pin.parentNode.insertBefore($("v4SearchBtn"),pin);
    }
    document.addEventListener("keydown",e=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();searchMessages()}
      if(e.key==="Escape"){document.querySelectorAll(".v4-modal").forEach(x=>x.remove())}
    });
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
}

  // Messenger 4.0 calls — WebRTC over the existing authenticated WebSocket.
  let callPc=null, callStream=null, callRemote=null, callId=null, callKind="audio", callPeer=null, pendingCall=null, callUi=null;

  function callModal(){
    if(callUi)return callUi;
    callUi=document.createElement("div"); callUi.id="v4CallModal"; callUi.className="v4-modal";
    callUi.innerHTML='<div class="v4-card" style="max-width:720px;text-align:center"><h2 id="v4CallTitle">📞 Звонок</h2>'+
      '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">'+
      '<video id="v4LocalVideo" autoplay muted playsinline style="width:min(44vw,300px);max-height:260px;border-radius:14px;background:#000"></video>'+
      '<video id="v4RemoteVideo" autoplay playsinline style="width:min(70vw,520px);max-height:360px;border-radius:14px;background:#000"></video></div>'+
      '<audio id="v4RemoteAudio" autoplay></audio>'+
      '<div id="v4CallStatus" class="v4-muted" style="margin-top:10px">Подключение…</div>'+
      '<div class="v4-actions" style="justify-content:center">'+
      '<button id="v4Mute" class="v4-btn">🎙️ Микрофон</button><button id="v4Cam" class="v4-btn">📷 Камера</button>'+
      '<button id="v4Accept" class="v4-btn v4-primary" style="display:none">✅ Принять</button>'+
      '<button id="v4Decline" class="v4-btn">❌ Отклонить</button></div></div>';
    document.body.appendChild(callUi);
    $("v4Mute").onclick=()=>{const t=callStream?.getAudioTracks?.()[0];if(t){t.enabled=!t.enabled;$("v4Mute").textContent=t.enabled?"🎙️ Микрофон":"🔇 Микрофон выключен"}};
    $("v4Cam").onclick=()=>{const t=callStream?.getVideoTracks?.()[0];if(t){t.enabled=!t.enabled;$("v4Cam").textContent=t.enabled?"📷 Камера":"🚫 Камера выключена"}};
    $("v4Decline").onclick=()=>endCall(true);
    return callUi;
  }
  function setCallStatus(s){if($("v4CallStatus"))$("v4CallStatus").textContent=s}
  function showCall(kind,title,incoming=false){
    callModal(); $("v4CallTitle").textContent=(kind==="video"?"📹":"📞")+" "+title;
    $("v4LocalVideo").style.display=kind==="video"?"block":"none";
    $("v4RemoteVideo").style.display=kind==="video"?"block":"none";
    $("v4RemoteAudio").style.display=kind==="video"?"none":"block";
    $("v4Accept").style.display=incoming?"inline-block":"none";
    $("v4Decline").textContent=incoming?"❌ Отклонить":"☎️ Завершить";
    setCallStatus(incoming?"Входящий звонок…":"Подключение…");
  }
  function closeCallUi(){if(callUi){callUi.remove();callUi=null}}
  function cleanupCall(){
    try{callPc?.close()}catch{}
    callPc=null;
    callStream?.getTracks?.().forEach(t=>t.stop());
    callStream=null; callRemote=null; callPeer=null; callId=null; pendingCall=null;
    closeCallUi();
  }
  function endCall(notify=true){
    if(notify&&callPeer&&callId)try{sendWS({type:"callEnd",to:callPeer,callId})}catch{}
    cleanupCall();
  }
  async function setupPeer(kind,peer){
    callKind=kind; callPeer=peer;
    callPc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
    callPc.onicecandidate=e=>{if(e.candidate&&callPeer)sendWS({type:"callIce",to:callPeer,callId,candidate:e.candidate})};
    callPc.ontrack=e=>{
      callRemote=e.streams[0];
      const v=kind==="video"?$("v4RemoteVideo"):$("v4RemoteAudio");
      if(v){v.srcObject=callRemote;v.play?.().catch(()=>{})}
    };
    callPc.onconnectionstatechange=()=>{
      const s=callPc?.connectionState;
      if(s==="connected")setCallStatus("Соединение установлено");
      if(s==="failed"||s==="disconnected")setCallStatus("Соединение потеряно");
      if(s==="closed")cleanupCall();
    };
    callStream=await navigator.mediaDevices.getUserMedia({audio:true,video:kind==="video"});
    callStream.getTracks().forEach(t=>callPc.addTrack(t,callStream));
    $("v4LocalVideo").srcObject=callStream;
  }
  async function startCall(kind){
    if(typeof current==="undefined"||!current||typeof currentType==="undefined"||currentType!=="user")return toast("Звонить можно только пользователю");
    if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==="undefined")return toast("Звонки не поддерживаются этим браузером");
    if(callPc)return toast("Звонок уже идёт");
    try{
      callId=crypto.randomUUID(); callPeer=current.id; showCall(kind,(current.displayName||current.username||"пользователь"));
      await setupPeer(kind,current.id);
      const offer=await callPc.createOffer(); await callPc.setLocalDescription(offer);
      sendWS({type:"callOffer",to:current.id,callId,kind,sdp:callPc.localDescription});
      setCallStatus("Ожидание ответа…");
    }catch(e){toast("Не удалось начать звонок: "+(e.message||"ошибка"));cleanupCall()}
  }
  async function acceptCall(){
    if(!pendingCall)return;
    const p=pendingCall; pendingCall=null;
    $("v4Accept").style.display="none"; $("v4Decline").textContent="☎️ Завершить";
    try{
      callId=p.callId; callPeer=p.from; showCall(p.kind,"Входящий звонок");
      await setupPeer(p.kind,p.from);
      await callPc.setRemoteDescription(p.sdp);
      const answer=await callPc.createAnswer(); await callPc.setLocalDescription(answer);
      sendWS({type:"callAnswer",to:p.from,callId,kind:p.kind,sdp:callPc.localDescription});
      setCallStatus("Подключение…");
    }catch(e){toast("Не удалось принять звонок");endCall(true)}
  }
  async function handleCallSignal(d){
    if(d.type==="callOffer"){
      if(callPc){try{sendWS({type:"callDecline",to:d.from,callId:d.callId})}catch{};return}
      pendingCall=d; callId=d.callId; callPeer=d.from;
      const u=(typeof users!=="undefined"?users.find(x=>x.id===d.from):null);
      showCall(d.kind,u?.displayName||u?.username||"пользователь",true);
      $("v4Accept").onclick=acceptCall;
      return;
    }
    if(d.type==="callAnswer"&&callPc&&d.callId===callId){
      await callPc.setRemoteDescription(d.sdp); setCallStatus("Подключение…"); return;
    }
    if(d.type==="callIce"&&callPc&&d.callId===callId&&d.candidate){
      try{await callPc.addIceCandidate(d.candidate)}catch{}
      return;
    }
    if((d.type==="callEnd"||d.type==="callDecline")&&(!callId||d.callId===callId)){
      setCallStatus(d.type==="callDecline"?"Звонок отклонён":"Звонок завершён");
      setTimeout(cleanupCall,500); return;
    }
  }
  function bindCallSocket(){
    if(typeof ws==="undefined"||!ws)return;
    ws.onmessage=async e=>{
      let d;try{d=JSON.parse(e.data)}catch{return}
      if(["callOffer","callAnswer","callIce","callEnd","callDecline"].includes(d.type)){try{await handleCallSignal(d)}catch{};return}
      try{await onWS(e)}catch{}
    };
  }

  function addCallButtons(){
    const head=document.querySelector(".chat-head"); if(!head||$("v4AudioCallBtn"))return;
    const pin=$("pinBtn");
    addButton(head,"v4AudioCallBtn","Аудиозвонок","📞",()=>startCall("audio"));
    addButton(head,"v4VideoCallBtn","Видеозвонок","📹",()=>startCall("video"));
    if(pin){head.insertBefore($("v4AudioCallBtn"),pin);head.insertBefore($("v4VideoCallBtn"),pin)}
  }

  const v4OriginalConnect=connect;
  connect=()=>{v4OriginalConnect();setTimeout(bindCallSocket,50)};
  bindCallSocket();
  addCallButtons();
  setInterval(()=>{bindCallSocket();addCallButtons()},1200);

})();