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
const JWT_SECRET =
  process.env.JWT_SECRET || "CHANGE_THIS_SECRET_IN_PRODUCTION";

const db = await JSONFilePreset(
  path.join(__dirname, "data", "db.json"),
  {
    users: [],
    messages: []
  }
);

db.data.users ||= [];
db.data.messages ||= [];

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function tokenFor(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username
    },
    JWT_SECRET,
    {
      expiresIn: "30d"
    }
  );
}

function auth(req, res, next) {
  try {
    const raw = req.headers.authorization || "";
    const token = raw.startsWith("Bearer ")
      ? raw.slice(7)
      : "";

    req.user = jwt.verify(token, JWT_SECRET);

    next();
  } catch {
    res.status(401).json({
      error: "Нужна авторизация"
    });
  }
}

function safeUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    bio: user.bio || "",
    avatar: user.avatar || "",
    createdAt: user.createdAt,
    lastSeen: user.lastSeen || null
  };
}

function send(ws, payload) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
  }
}

const sockets = new Map();

function isOnline(userId) {
  return (
    sockets.has(userId) &&
    sockets.get(userId).size > 0
  );
}

function broadcastToUser(userId, payload) {
  const set = sockets.get(userId);

  if (!set) return;

  for (const ws of set) {
    send(ws, payload);
  }
}

function touchUser(userId) {
  const user = db.data.users.find(
    u => u.id === userId
  );

  if (user) {
    user.lastSeen = new Date().toISOString();
  }

  return user;
}

function broadcastPresence(userId) {
  const user = db.data.users.find(
    u => u.id === userId
  );

  if (!user) return;

  for (const [id] of sockets) {
    broadcastToUser(id, {
      type: "presence",
      userId,
      online: isOnline(userId),
      lastSeen: user.lastSeen || null
    });
  }
}

app.post("/api/register", async (req, res) => {
  const username = String(
    req.body.username || ""
  )
    .trim()
    .toLowerCase();

  const password = String(
    req.body.password || ""
  );

  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
    return res.status(400).json({
      error:
        "Логин: 3–24 символа, только латиница, цифры и _"
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      error:
        "Пароль должен быть минимум 6 символов"
    });
  }

  if (
    db.data.users.some(
      u => u.username === username
    )
  ) {
    return res.status(409).json({
      error:
        "Такой пользователь уже существует"
    });
  }

  const user = {
    id: crypto.randomUUID(),
    username,
    displayName: username,
    bio: "",
    avatar: "",
    passwordHash:
      await bcrypt.hash(password, 12),
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString()
  };

  db.data.users.push(user);

  await db.write();

  res.json({
    token: tokenFor(user),
    user: safeUser(user)
  });
});

app.post("/api/login", async (req, res) => {
  const username = String(
    req.body.username || ""
  )
    .trim()
    .toLowerCase();

  const password = String(
    req.body.password || ""
  );

  const user = db.data.users.find(
    u => u.username === username
  );

  if (
    !user ||
    !(await bcrypt.compare(
      password,
      user.passwordHash
    ))
  ) {
    return res.status(401).json({
      error: "Неверный логин или пароль"
    });
  }

  touchUser(user.id);

  await db.write();

  res.json({
    token: tokenFor(user),
    user: safeUser(user)
  });
});

app.get("/api/me", auth, (req, res) => {
  const user = db.data.users.find(
    u => u.id === req.user.id
  );

  if (!user) {
    return res.status(404).json({
      error: "Пользователь не найден"
    });
  }

  res.json({
    user: safeUser(user),
    online: isOnline(user.id)
  });
});

app.put("/api/me", auth, async (req, res) => {
  const user = db.data.users.find(
    u => u.id === req.user.id
  );

  if (!user) {
    return res.status(404).json({
      error: "Пользователь не найден"
    });
  }

  const displayName = String(
    req.body.displayName ?? ""
  ).trim();

  const bio = String(
    req.body.bio ?? ""
  ).trim();

  const avatar = String(
    req.body.avatar ?? ""
  );

  if (
    displayName.length < 1 ||
    displayName.length > 40
  ) {
    return res.status(400).json({
      error: "Имя: от 1 до 40 символов"
    });
  }

  if (bio.length > 160) {
    return res.status(400).json({
      error:
        "Описание: максимум 160 символов"
    });
  }

  if (avatar.length > 700000) {
    return res.status(400).json({
      error: "Аватар слишком большой"
    });
  }

  if (
    avatar &&
    !/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(
      avatar
    )
  ) {
    return res.status(400).json({
      error:
        "Неподдерживаемый формат аватара"
    });
  }

  user.displayName = displayName;
  user.bio = bio;
  user.avatar = avatar;

  await db.write();

  const safe = safeUser(user);

  broadcastToUser(user.id, {
    type: "profile",
    user: safe
  });

  for (const [id] of sockets) {
    if (id !== user.id) {
      broadcastToUser(id, {
        type: "userUpdated",
        user: safe
      });
    }
  }

  res.json({
    user: safe
  });
});

app.get("/api/users", auth, (req, res) => {
  const q = String(
    req.query.q || ""
  )
    .trim()
    .toLowerCase();

  const users = db.data.users
    .filter(
      u =>
        u.id !== req.user.id &&
        (
          !q ||
          u.username.includes(q) ||
          (u.displayName || "")
            .toLowerCase()
            .includes(q)
        )
    )
    .slice(0, 50)
    .map(u => ({
      ...safeUser(u),
      online: isOnline(u.id)
    }));

  res.json({
    users
  });
});

app.get(
  "/api/messages/:otherId",
  auth,
  (req, res) => {
    const me = req.user.id;
    const other = req.params.otherId;

    const messages = db.data.messages
      .filter(
        m =>
          (m.from === me && m.to === other) ||
          (m.from === other && m.to === me)
      )
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(
            b.createdAt
          )
      )
      .slice(-200);

    res.json({
      messages
    });
  }
);

async function createMessage(
  from,
  to,
  text
) {
  const clean = String(text || "").trim();

  if (!clean || clean.length > 4000) {
    throw new Error(
      "Пустое или слишком длинное сообщение"
    );
  }

  if (
    !db.data.users.some(
      u => u.id === to
    )
  ) {
    throw new Error(
      "Получатель не найден"
    );
  }

  const message = {
    id: crypto.randomUUID(),
    from,
    to,
    text: clean,
    createdAt:
      new Date().toISOString(),
    editedAt: null,
    deleted: false
  };

  db.data.messages.push(message);

  await db.write();

  return message;
}

async function editMessage(
  userId,
  messageId,
  text
) {
  const message =
    db.data.messages.find(
      m => m.id === messageId
    );

  if (!message) {
    throw new Error(
      "Сообщение не найдено"
    );
  }

  if (message.from !== userId) {
    throw new Error(
      "Можно изменять только свои сообщения"
    );
  }

  if (message.deleted) {
    throw new Error(
      "Сообщение уже удалено"
    );
  }

  const clean = String(
    text || ""
  ).trim();

  if (!clean || clean.length > 4000) {
    throw new Error(
      "Пустое или слишком длинное сообщение"
    );
  }

  message.text = clean;

  message.editedAt =
    new Date().toISOString();

  await db.write();

  return message;
}

async function deleteMessage(
  userId,
  messageId
) {
  const message =
    db.data.messages.find(
      m => m.id === messageId
    );

  if (!message) {
    throw new Error(
      "Сообщение не найдено"
    );
  }

  if (message.from !== userId) {
    throw new Error(
      "Можно удалять только свои сообщения"
    );
  }

  message.text = "";
  message.deleted = true;
  message.editedAt =
    new Date().toISOString();

  await db.write();

  return message;
}

wss.on(
  "connection",
  (ws, req) => {
    try {
      const url = new URL(
        req.url,
        "http://localhost"
      );

      const token =
        url.searchParams.get("token");

      const user = jwt.verify(
        token,
        JWT_SECRET
      );

      if (!touchUser(user.id)) {
        return ws.close(
          1008,
          "Unauthorized"
        );
      }

      if (!sockets.has(user.id)) {
        sockets.set(
          user.id,
          new Set()
        );
      }

      sockets
        .get(user.id)
        .add(ws);

      db.write().catch(() => {});

      send(ws, {
        type: "ready"
      });

      broadcastPresence(user.id);

      ws.on(
        "message",
        async raw => {
          try {
            const data =
              JSON.parse(
                raw.toString()
              );

            if (
              data.type === "message"
            ) {
              const message =
                await createMessage(
                  user.id,
                  data.to,
                  data.text
                );

              broadcastToUser(
                message.from,
                {
                  type: "message",
                  message
                }
              );

              broadcastToUser(
                message.to,
                {
                  type: "message",
                  message
                }
              );
            }

            if (
              data.type === "edit"
            ) {
              const message =
                await editMessage(
                  user.id,
                  data.id,
                  data.text
                );

              broadcastToUser(
                message.from,
                {
                  type:
                    "messageUpdated",
                  message
                }
              );

              broadcastToUser(
                message.to,
                {
                  type:
                    "messageUpdated",
                  message
                }
              );
            }

            if (
              data.type === "delete"
            ) {
              const message =
                await deleteMessage(
                  user.id,
                  data.id
                );

              broadcastToUser(
                message.from,
                {
                  type:
                    "messageUpdated",
                  message
                }
              );

              broadcastToUser(
                message.to,
                {
                  type:
                    "messageUpdated",
                  message
                }
              );
            }
          } catch (e) {
            send(ws, {
              type: "error",
              error:
                e.message ||
                "Ошибка"
            });
          }
        }
      );

      ws.on(
        "close",
        async () => {
          const set =
            sockets.get(
              user.id
            );

          if (!set) return;

          set.delete(ws);

          if (!set.size) {
            sockets.delete(
              user.id
            );

            touchUser(
              user.id
            );

            await db
              .write()
              .catch(() => {});

            broadcastPresence(
              user.id
            );
          }
        }
      );
    } catch {
      ws.close(
        1008,
        "Unauthorized"
      );
    }
  }
);

app.get(
  "/health",
  (req, res) => {
    res.json({
      ok: true
    });
  }
);

app.use(
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Messenger 2.0 running on port ${PORT}`
    );
  }
);
