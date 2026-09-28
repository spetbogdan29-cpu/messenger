import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { JSONFilePreset } from "lowdb/node";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SECRET_IN_PRODUCTION";

const db = await JSONFilePreset(path.join(__dirname, "data", "db.json"), {
  users: [],
  messages: []
});

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

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
  return { id: u.id, username: u.username, createdAt: u.createdAt };
}

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

const sockets = new Map(); // userId -> Set<WebSocket>

function broadcastToUser(userId, payload) {
  const set = sockets.get(userId);
  if (!set) return;
  for (const ws of set) send(ws, payload);
}

app.post("/api/register", async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
    return res.status(400).json({ error: "Логин: 3–24 символа, только латиница, цифры и _" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Пароль должен быть минимум 6 символов" });
  }
  if (db.data.users.some(u => u.username === username)) {
    return res.status(409).json({ error: "Такой пользователь уже существует" });
  }

  const user = {
    id: crypto.randomUUID(),
    username,
    passwordHash: await bcrypt.hash(password, 12),
    createdAt: new Date().toISOString()
  };
  db.data.users.push(user);
  await db.write();

  res.json({ token: tokenFor(user), user: safeUser(user) });
});

app.post("/api/login", async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.data.users.find(u => u.username === username);

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Неверный логин или пароль" });
  }

  res.json({ token: tokenFor(user), user: safeUser(user) });
});

app.get("/api/me", auth, (req, res) => {
  const user = db.data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });
  res.json({ user: safeUser(user) });
});

app.get("/api/users", auth, (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const users = db.data.users
    .filter(u => u.id !== req.user.id && (!q || u.username.includes(q)))
    .slice(0, 50)
    .map(safeUser);
  res.json({ users });
});

app.get("/api/messages/:otherId", auth, (req, res) => {
  const me = req.user.id;
  const other = req.params.otherId;
  const messages = db.data.messages
    .filter(m => (m.from === me && m.to === other) || (m.from === other && m.to === me))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-200);
  res.json({ messages });
});

async function createMessage(from, to, text) {
  const clean = String(text || "").trim();
  if (!clean || clean.length > 4000) throw new Error("Пустое или слишком длинное сообщение");
  if (!db.data.users.some(u => u.id === to)) throw new Error("Получатель не найден");

  const message = {
    id: crypto.randomUUID(),
    from,
    to,
    text: clean,
    createdAt: new Date().toISOString()
  };
  db.data.messages.push(message);
  await db.write();
  return message;
}

wss.on("connection", (ws, req) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");
    const user = jwt.verify(token, JWT_SECRET);

    if (!sockets.has(user.id)) sockets.set(user.id, new Set());
    sockets.get(user.id).add(ws);

    send(ws, { type: "ready" });

    ws.on("message", async raw => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type !== "message") return;

        const message = await createMessage(user.id, data.to, data.text);
        broadcastToUser(user.id, { type: "message", message });
        broadcastToUser(data.to, { type: "message", message });
      } catch (e) {
        send(ws, { type: "error", error: e.message || "Ошибка" });
      }
    });

    ws.on("close", () => {
      const set = sockets.get(user.id);
      if (set) {
        set.delete(ws);
        if (!set.size) sockets.delete(user.id);
      }
    });
  } catch {
    ws.close(1008, "Unauthorized");
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Messenger running on port ${PORT}`);
});