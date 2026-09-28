const CACHE="messenger-shell-v1";
const SHELL=["/","/index.html","/manifest.json","/icon.svg"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",event=>{if(event.request.method!=="GET")return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(r=>r||caches.match("/"))))});
self.addEventListener("push",event=>{
  let data={title:"Messenger",body:"Новое сообщение",data:{}};
  try{data=event.data?event.data.json():data}catch{}
  event.waitUntil(self.registration.showNotification(data.title||"Messenger",{body:data.body||"Новое сообщение",icon:"/icon.svg",badge:"/icon.svg",data:data.data||{}}));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
    for(const c of list){if("focus"in c)return c.focus()}
    if(clients.openWindow)return clients.openWindow("/");
  }));
});