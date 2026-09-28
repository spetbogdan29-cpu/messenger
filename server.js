import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import webpush from "web-push";
import crypto from "crypto";
import path from "path";
import { readFile } from "fs/promises";
import pg from "pg";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SECRET_IN_PRODUCTION";

if (JWT_SECRET === "CHANGE_THIS_SECRET_IN_PRODUCTION") {
  console.warn("WARNING: set JWT_SECRET in Render environment variables.");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Add the Neon PostgreSQL connection string to Render Environment.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

const defaultData = {
  users: [], messages: [], groups: [], groupMessages: [], pushSubscriptions: []
};

function normalizeData(data) {
  data ||= {};
  data.users ||= [];
  data.messages ||= [];
  data.groups ||= [];
  data.groupMessages ||= [];
  data.pushSubscriptions ||= [];
  return data;
}

await pool.query(`
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);

const stateResult = await pool.query("SELECT data FROM app_state WHERE id = 1");
let initialData;

if (stateResult.rows.length) {
  initialData = normalizeData(stateResult.rows[0].data);
} else {
  try {
    const localFile = await readFile(path.join(__dirname, "data", "db.json"), "utf8");
    initialData = normalizeData(JSON.parse(localFile));
  } catch {
    initialData = defaultData;
  }

  await pool.query(
    "INSERT INTO app_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING",
    [initialData]
  );
}

const db = {
  data: initialData,
  async write() {
    await pool.query(
      "UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1",
      [this.data]
    );
  }
};

console.log("PostgreSQL persistence: connected");

app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));
app.use(express.json({ limit: "6mb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(__dirname, "public")));

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const sockets = new Map();

function tokenFor(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "30d" });
}
function auth(req, res, next) {
  try {
    const raw = req.headers.authorization || "";
    const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Нужна авторизация" });
  }
}
function safeUser(u) {
  return {
    id: u.id, username: u.username, displayName: u.displayName || u.username,
    bio: u.bio || "", avatar: u.avatar || "", createdAt: u.createdAt,
    lastSeen: u.lastSeen || null
  };
}
function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}
function online(id) {
  return !!sockets.get(id)?.size;
}
function sendUser(id, payload) {
  for (const ws of sockets.get(id) || []) send(ws, payload);
}
function broadcastPresence(userId) {
  const u = db.data.users.find(x => x.id === userId);
  if (!u) return;
  for (const id of sockets.keys()) sendUser(id, { type: "presence", userId, online: online(userId), lastSeen: u.lastSeen || null });
}
function touch(id) {
  const u = db.data.users.find(x => x.id === id);
  if (u) u.lastSeen = new Date().toISOString();
  return u;
}
function findUser(id) { return db.data.users.find(u => u.id === id); }
function isMember(group, userId) { return group?.members?.includes(userId); }
function groupFor(id) { return db.data.groups.find(g => g.id === id); }
function cleanText(value, max=4000) {
  const s = String(value ?? "").trim();
  if (!s || s.length > max) throw new Error("Пустое или слишком длинное сообщение");
  return s;
}
function validateAttachment(a) {
  if (!a) return null;
  if (typeof a !== "object") throw new Error("Некорректный файл");
  const name = String(a.name || "file").slice(0, 120);
  const type = String(a.type || "application/octet-stream");
  const data = String(a.data || "");
  if (data.length > 2_500_000) throw new Error("Файл слишком большой (максимум около 2 МБ)");
  if (!data.startsWith("data:")) throw new Error("Некорректный файл");
  if (!/^(image|application|text)\//i.test(type)) throw new Error("Этот тип файла не поддерживается");
  return { name, type, data, size: Number(a.size) || 0 };
}
async function notifyPush(userId, payload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  const list = db.data.pushSubscriptions.filter(x => x.userId === userId);
  for (const item of list) {
    try { await webpush.sendNotification(item.subscription, JSON.stringify(payload)); }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        db.data.pushSubscriptions = db.data.pushSubscriptions.filter(x => x.id !== item.id);
      }
    }
  }
  await db.write();
}

app.post("/api/register", async (req,res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return res.status(400).json({error:"Логин: 3–24 символа, латиница, цифры и _"});
  if (password.length < 6 || password.length > 128) return res.status(400).json({error:"Пароль: от 6 до 128 символов"});
  if (db.data.users.some(u => u.username === username)) return res.status(409).json({error:"Такой пользователь уже существует"});
  const user = {
    id: crypto.randomUUID(), username, displayName: username, bio:"", avatar:"",
    passwordHash: await bcrypt.hash(password, 12), createdAt:new Date().toISOString(), lastSeen:new Date().toISOString()
  };
  db.data.users.push(user); await db.write();
  res.json({token:tokenFor(user), user:safeUser(user)});
});

app.post("/api/login", async (req,res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.data.users.find(u => u.username === username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({error:"Неверный логин или пароль"});
  touch(user.id); await db.write();
  res.json({token:tokenFor(user), user:safeUser(user)});
});

app.get("/api/me", auth, (req,res) => {
  const u = findUser(req.user.id);
  if (!u) return res.status(404).json({error:"Пользователь не найден"});
  res.json({user:safeUser(u), online:online(u.id)});
});

app.put("/api/me", auth, async (req,res) => {
  const u = findUser(req.user.id);
  if (!u) return res.status(404).json({error:"Пользователь не найден"});
  const displayName = String(req.body.displayName ?? "").trim();
  const bio = String(req.body.bio ?? "").trim();
  const avatar = String(req.body.avatar ?? "");
  if (!displayName || displayName.length > 40) return res.status(400).json({error:"Имя: от 1 до 40 символов"});
  if (bio.length > 160) return res.status(400).json({error:"Описание: максимум 160 символов"});
  if (avatar.length > 700000) return res.status(400).json({error:"Аватар слишком большой"});
  if (avatar && !/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(avatar)) return res.status(400).json({error:"Неподдерживаемый формат аватара"});
  u.displayName=displayName; u.bio=bio; if (avatar) u.avatar=avatar;
  await db.write();
  const safe=safeUser(u);
  sendUser(u.id,{type:"profile",user:safe});
  for (const id of sockets.keys()) if (id !== u.id) sendUser(id,{type:"userUpdated",user:safe});
  res.json({user:safe});
});

app.get("/api/users", auth, (req,res) => {
  const q=String(req.query.q||"").trim().toLowerCase();
  const users=db.data.users.filter(u=>u.id!==req.user.id && (!q || u.username.includes(q) || (u.displayName||"").toLowerCase().includes(q))).slice(0,100).map(u=>({...safeUser(u),online:online(u.id)}));
  res.json({users});
});

app.get("/api/messages/:otherId", auth, (req,res) => {
  const me=req.user.id, other=req.params.otherId;
  const messages=db.data.messages.filter(m=>(m.from===me&&m.to===other)||(m.from===other&&m.to===me)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).slice(-300);
  res.json({messages});
});

app.get("/api/groups", auth, (req,res) => {
  const groups=db.data.groups.filter(g=>isMember(g,req.user.id)).map(g=>({...g,memberCount:g.members.length}));
  res.json({groups});
});

app.post("/api/groups", auth, async (req,res) => {
  const name=String(req.body.name||"").trim();
  const memberIds=Array.isArray(req.body.memberIds)?req.body.memberIds:[];
  if (!name || name.length>60) return res.status(400).json({error:"Название группы: 1–60 символов"});
  const unique=[req.user.id,...memberIds].filter((v,i,a)=>a.indexOf(v)===i);
  if (unique.length<2) return res.status(400).json({error:"Добавь хотя бы одного участника"});
  if (unique.length>100) return res.status(400).json({error:"В группе максимум 100 участников"});
  if (unique.some(id=>!findUser(id))) return res.status(400).json({error:"Один из пользователей не найден"});
  const group={id:crypto.randomUUID(),name,avatar:"",ownerId:req.user.id,members:unique,createdAt:new Date().toISOString()};
  db.data.groups.push(group); await db.write();
  for (const id of unique) sendUser(id,{type:"groupCreated",group});
  res.json({group});
});

app.put("/api/groups/:id", auth, async (req,res) => {
  const g=groupFor(req.params.id);
  if (!g || !isMember(g,req.user.id)) return res.status(404).json({error:"Группа не найдена"});
  if (g.ownerId!==req.user.id) return res.status(403).json({error:"Только владелец может менять группу"});
  const name=String(req.body.name??g.name).trim();
  if (!name || name.length>60) return res.status(400).json({error:"Название группы: 1–60 символов"});
  g.name=name;
  if (typeof req.body.avatar==="string" && req.body.avatar.length<700000) g.avatar=req.body.avatar;
  await db.write();
  for (const id of g.members) sendUser(id,{type:"groupUpdated",group:g});
  res.json({group:g});
});

app.post("/api/groups/:id/members", auth, async (req,res) => {
  const g=groupFor(req.params.id);
  if (!g || !isMember(g,req.user.id)) return res.status(404).json({error:"Группа не найдена"});
  if (g.ownerId!==req.user.id) return res.status(403).json({error:"Только владелец может добавлять участников"});
  const id=String(req.body.userId||"");
  if (!findUser(id)) return res.status(404).json({error:"Пользователь не найден"});
  if (!g.members.includes(id)) g.members.push(id);
  await db.write();
  for (const uid of g.members) sendUser(uid,{type:"groupUpdated",group:g});
  res.json({group:g});
});

app.get("/api/groups/:id/messages", auth, (req,res) => {
  const g=groupFor(req.params.id);
  if (!g || !isMember(g,req.user.id)) return res.status(404).json({error:"Группа не найдена"});
  res.json({messages:db.data.groupMessages.filter(m=>m.groupId===g.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).slice(-300)});
});

async function createPrivate(from,to,text,attachment,clientId) {
  if (!findUser(to)) throw new Error("Получатель не найден");
  const file=validateAttachment(attachment);
  const clean=String(text ?? "").trim();
  if (!clean && !file) throw new Error("Добавь текст или файл");
  if (clean.length>4000) throw new Error("Слишком длинное сообщение");
  if (clientId) { const existing=db.data.messages.find(m=>m.from===from && m.clientId===clientId); if (existing) return null; }
  const message={id:crypto.randomUUID(),from,to,text:clean,attachment:file,clientId:clientId||null,createdAt:new Date().toISOString(),editedAt:null,deleted:false,readAt:null};
  db.data.messages.push(message); await db.write(); return message;
}
async function createGroup(from,groupId,text,attachment,clientId) {
  const g=groupFor(groupId);
  if (!g || !isMember(g,from)) throw new Error("Нет доступа к группе");
  const file=validateAttachment(attachment);
  const clean=String(text ?? "").trim();
  if (!clean && !file) throw new Error("Добавь текст или файл");
  if (clean.length>4000) throw new Error("Слишком длинное сообщение");
  if (clientId) { const existing=db.data.groupMessages.find(m=>m.from===from && m.clientId===clientId); if (existing) return null; }
  const message={id:crypto.randomUUID(),groupId,from,text:clean,attachment:file,clientId:clientId||null,createdAt:new Date().toISOString(),editedAt:null,deleted:false};
  db.data.groupMessages.push(message); await db.write(); return message;
}
async function editIn(list,messageId,userId,text) {
  const m=list.find(x=>x.id===messageId);
  if (!m) throw new Error("Сообщение не найдено");
  if (m.from!==userId) throw new Error("Можно изменять только свои сообщения");
  if (m.deleted) throw new Error("Сообщение уже удалено");
  m.text=cleanText(text); m.editedAt=new Date().toISOString(); await db.write(); return m;
}
async function deleteIn(list,messageId,userId) {
  const m=list.find(x=>x.id===messageId);
  if (!m) throw new Error("Сообщение не найдено");
  if (m.from!==userId) throw new Error("Можно удалять только свои сообщения");
  m.text=""; m.deleted=true; m.editedAt=new Date().toISOString(); await db.write(); return m;
}

async function markPrivateRead(readerId, otherId) {
  const now = new Date().toISOString();
  const changed = [];
  for (const m of db.data.messages) {
    if (m.from === otherId && m.to === readerId && !m.deleted && !m.readAt) {
      m.readAt = now;
      changed.push(m);
    }
  }
  if (!changed.length) return;
  await db.write();
  for (const m of changed) {
    sendUser(m.from, {type:"messageRead", messageId:m.id, readAt:m.readAt, readerId});
    sendUser(m.to, {type:"messageRead", messageId:m.id, readAt:m.readAt, readerId});
  }
}

async function markGroupRead(readerId, groupId) {
  const g = groupFor(groupId);
  if (!g || !isMember(g, readerId)) throw new Error("Нет доступа к группе");
  const now = new Date().toISOString();
  const changed = [];
  for (const m of db.data.groupMessages) {
    if (m.groupId === groupId && m.from !== readerId && !m.deleted) {
      m.readBy = m.readBy || {};
      if (!m.readBy[readerId]) {
        m.readBy[readerId] = now;
        changed.push(m);
      }
    }
  }
  if (!changed.length) return;
  await db.write();
  for (const m of changed) {
    for (const id of g.members) {
      sendUser(id, {type:"groupMessageRead", messageId:m.id, readerId, readAt:m.readBy[readerId]});
    }
  }
}

app.post("/api/push/subscribe", auth, async (req,res) => {
  const subscription=req.body.subscription;
  if (!subscription?.endpoint) return res.status(400).json({error:"Некорректная подписка"});
  db.data.pushSubscriptions=db.data.pushSubscriptions.filter(x=>x.subscription?.endpoint!==subscription.endpoint);
  db.data.pushSubscriptions.push({id:crypto.randomUUID(),userId:req.user.id,subscription});
  await db.write(); res.json({ok:true,enabled:!!(VAPID_PUBLIC_KEY&&VAPID_PRIVATE_KEY)});
});
app.delete("/api/push/subscribe", auth, async (req,res) => {
  db.data.pushSubscriptions=db.data.pushSubscriptions.filter(x=>x.userId!==req.user.id); await db.write(); res.json({ok:true});
});
app.get("/api/push/config", auth, (req,res)=>res.json({publicKey:VAPID_PUBLIC_KEY}));

wss.on("connection",(ws,req)=>{
  try {
    const url=new URL(req.url,"http://localhost");
    const user=jwt.verify(url.searchParams.get("token")||"",JWT_SECRET);
    if (!touch(user.id)) return ws.close(1008,"Unauthorized");
    if (!sockets.has(user.id)) sockets.set(user.id,new Set());
    sockets.get(user.id).add(ws);
    db.write().catch(()=>{});
    send(ws,{type:"ready"});
    broadcastPresence(user.id);
    ws.on("message",async raw=>{
      try {
        const d=JSON.parse(raw.toString());
        if(d.type==="message"){
          const m=await createPrivate(user.id,d.to,d.text,d.attachment,d.clientId);
          if (!m) return;
          sendUser(m.from,{type:"message",message:m}); sendUser(m.to,{type:"message",message:m});
          await notifyPush(m.to,{title:findUser(m.from)?.displayName||findUser(m.from)?.username||"Новое сообщение",body:m.attachment?"📎 Файл":m.text,data:{kind:"private",from:m.from}});
        } else if(d.type==="groupMessage"){
          const m=await createGroup(user.id,d.groupId,d.text,d.attachment,d.clientId); if (!m) return; const g=groupFor(d.groupId);
          for(const id of g.members) sendUser(id,{type:"groupMessage",message:m});
          for(const id of g.members) if(id!==user.id) await notifyPush(id,{title:g.name,body:m.attachment?"📎 Файл":m.text,data:{kind:"group",groupId:g.id}});
        } else if(d.type==="edit"){
          const privateM=db.data.messages.find(m=>m.id===d.id);
          if(privateM){const m=await editIn(db.data.messages,d.id,user.id,d.text); sendUser(m.from,{type:"messageUpdated",message:m}); sendUser(m.to,{type:"messageUpdated",message:m});}
          else {const gm=db.data.groupMessages.find(m=>m.id===d.id); if(!gm) throw new Error("Сообщение не найдено"); const m=await editIn(db.data.groupMessages,d.id,user.id,d.text), g=groupFor(m.groupId); for(const id of g.members) sendUser(id,{type:"messageUpdated",message:m});}
        } else if(d.type==="delete"){
          const privateM=db.data.messages.find(m=>m.id===d.id);
          if(privateM){const m=await deleteIn(db.data.messages,d.id,user.id); sendUser(m.from,{type:"messageUpdated",message:m}); sendUser(m.to,{type:"messageUpdated",message:m});}
          else {const gm=db.data.groupMessages.find(m=>m.id===d.id); if(!gm) throw new Error("Сообщение не найдено"); const m=await deleteIn(db.data.groupMessages,d.id,user.id), g=groupFor(m.groupId); for(const id of g.members) sendUser(id,{type:"messageUpdated",message:m});}
        } else if(d.type==="read"){
          if(d.groupId) await markGroupRead(user.id,d.groupId);
          else if(d.to) await markPrivateRead(user.id,d.to);
        } else if(d.type==="typing"){
          if(d.to) sendUser(d.to,{type:"typing",from:user.id,typing:!!d.typing});
          if(d.groupId){const g=groupFor(d.groupId); if(g) for(const id of g.members) if(id!==user.id) sendUser(id,{type:"typing",from:user.id,groupId:g.id,typing:!!d.typing});}
        }
      } catch(e){ send(ws,{type:"error",error:e.message||"Ошибка",clientId:(typeof d!=="undefined"?d.clientId:null)}); }
    });
    ws.on("close",async()=>{
      const set=sockets.get(user.id); if(!set) return;
      set.delete(ws);
      if(!set.size){sockets.delete(user.id); touch(user.id); await db.write().catch(()=>{}); broadcastPresence(user.id);}
    });
  } catch { ws.close(1008,"Unauthorized"); }
});

app.get("/health",(req,res)=>res.json({ok:true,version:"3.2.0",storage:"postgresql",users:db.data.users.length,groups:db.data.groups.length}));
app.use((req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

server.listen(PORT,"0.0.0.0",()=>console.log("Messenger 3.1 running on port "+PORT));

process.on("SIGTERM", async () => {
  try { await pool.end(); } finally { process.exit(0); }
});
