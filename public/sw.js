self.addEventListener("push",event=>{
  let data={title:"Messenger",body:"Новое сообщение",data:{}};
  try{data=event.data?event.data.json():data}catch{}
  event.waitUntil(self.registration.showNotification(data.title||"Messenger",{
    body:data.body||"Новое сообщение",icon:"/icon.svg",badge:"/icon.svg",data:data.data||{}
  }));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
    for(const c of list){if("focus"in c)return c.focus()}
    if(clients.openWindow)return clients.openWindow("/");
  }));
});