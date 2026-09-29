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
})();