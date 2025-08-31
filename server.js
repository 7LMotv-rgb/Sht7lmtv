
// server.js
const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: "7lm-secret",
  resave: false,
  saveUninitialized: true
}));

// تحميل بيانات المستخدمين من ملف JSON
const USERS_FILE = path.join(__dirname, "users.json");
let users = {};
if (fs.existsSync(USERS_FILE)) {
  users = JSON.parse(fs.readFileSync(USERS_FILE));
}

// صفحات ثابتة
app.use(express.static(path.join(__dirname, "public")));

// تسجيل حساب جديد
app.post("/signup", (req, res) => {
  const { username, password } = req.body;
  if (users[username]) {
    return res.send("اسم المستخدم مستخدم بالفعل.");
  }
  users[username] = { password };
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  req.session.username = username;
  res.redirect("/");
});

// تسجيل الدخول
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (users[username] && users[username].password === password) {
    req.session.username = username;
    res.redirect("/");
  } else {
    res.send("خطأ في تسجيل الدخول.");
  }
});

// تسجيل الخروج
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// حماية الصفحة الرئيسية
app.get("/", (req, res, next) => {
  if (!req.session.username) {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  }
  next();
});

// خادم HTTP
const server = app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});

// WebSocket (للدردشة)
const wss = new WebSocket.Server({ server });

let waiting = null;
wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    let data = {};
    try { data = JSON.parse(message); } catch {}
    if (data.type === "find") {
      if (waiting && waiting !== ws) {
        const partner = waiting;
        waiting = null;
        ws.partner = partner;
        partner.partner = ws;
        ws.send(JSON.stringify({ type: "match", role: "caller" }));
        partner.send(JSON.stringify({ type: "match", role: "callee" }));
      } else {
        waiting = ws;
      }
    } else if (data.type === "signal" && ws.partner) {
      ws.partner.send(JSON.stringify({ type: "signal", payload: data.payload }));
    } else if (data.type === "leave" && ws.partner) {
      ws.partner.send(JSON.stringify({ type: "peer-left" }));
      ws.partner.partner = null;
      ws.partner = null;
    }
  });

  ws.on("close", () => {
    if (ws.partner) {
      ws.partner.send(JSON.stringify({ type: "peer-left" }));
      ws.partner.partner = null;
    }
    if (waiting === ws) waiting = null;
  });
});
