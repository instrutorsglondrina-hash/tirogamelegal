// =======================
// BACKEND (NODE + WS)
// =======================
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function randomColor() {
  const colors = ["red","blue","green","yellow","purple","orange","pink"];
  return colors[Math.floor(Math.random() * colors.length)];
}

const rooms = {}; // { roomId: { players, bullets } }

function createRoom(id) {
  rooms[id] = {
    players: {},
    bullets: []
  };
}

// Serve a página com o jogo
app.get("/", (req, res) => {
  res.send(frontendHTML);
});

// =======================
// WEBSOCKET LOGIC
// =======================

wss.on("connection", (ws) => {
  let roomId = "sala1";
  if (!rooms[roomId]) createRoom(roomId);

  const playerId = Math.random().toString(36).substring(2, 9);

  rooms[roomId].players[playerId] = {
    x: Math.random() * 800,
    y: Math.random() * 500,
    color: randomColor(),
    angle: 0,
    alive: true,
    ws: ws
  };

  ws.send(JSON.stringify({ type: "id", id: playerId }));

  ws.on("message", (msg) => {
    let data = {};
    try { data = JSON.parse(msg); } catch {}

    const room = rooms[roomId];
    if (!room) return;

    if (data.type === "move") {
      const p = room.players[playerId];
      if (!p) return;
      p.x = data.x;
      p.y = data.y;
      p.angle = data.angle;
    }

    if (data.type === "shoot") {
      const p = room.players[playerId];
      room.bullets.push({
        x: p.x,
        y: p.y,
        angle: p.angle,
        owner: playerId
      });
    }
  });

  ws.on("close", () => {
    delete rooms[roomId].players[playerId];
  });
});

// =======================
// GAME LOOP (30 FPS)
// =======================

setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];

    // mover balas
    room.bullets.forEach((b) => {
      b.x += Math.cos(b.angle) * 10;
      b.y += Math.sin(b.angle) * 10;
    });

    // colisões
    room.bullets.forEach((b) => {
      for (const pid in room.players) {
        const p = room.players[pid];
        if (pid === b.owner) continue;

        const dist = Math.hypot(p.x - b.x, p.y - b.y);
        if (dist < 20) {
          // respawn
          p.x = Math.random() * 800;
          p.y = Math.random() * 500;
          p.color = randomColor();
        }
      }
    });

    // remover balas longe
    room.bullets = room.bullets.filter(
      (b) => b.x >= 0 && b.x <= 800 && b.y >= 0 && b.y <= 500
    );

    // broadcast
    const state = {
      type: "state",
      players: Object.fromEntries(
        Object.entries(room.players).map(([id, p]) => [
          id,
          { x: p.x, y: p.y, color: p.color, angle: p.angle }
        ])
      ),
      bullets: room.bullets
    };

    const json = JSON.stringify(state);

    for (const pid in room.players) {
      const p = room.players[pid];
      if (p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(json);
      }
    }
  }
}, 1000 / 30);

// =======================
// FRONTEND HTML
// =======================

const frontendHTML = `
<!DOCTYPE html>
<html>
<head>
<title>Tiro Online</title>
<style>
  body { margin:0; overflow:hidden; background:#111; }
  canvas { background:#222; display:block; margin:0 auto; }
</style>
</head>
<body>
<canvas id="game" width="800" height="500"></canvas>

<script>
let ws = new WebSocket("wss://" + location.host);
let id = null;
let players = {};
let bullets = [];

ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data);

  if (data.type === "id") {
    id = data.id;
  }
  if (data.type === "state") {
    players = data.players;
    bullets = data.bullets;
  }
};

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let x = 400, y = 250, angle = 0;
let speed = 3;

window.onkeydown = (e) => {
  if (e.key === " ") {
    ws.send(JSON.stringify({ type:"shoot" }));
  }
};

function loop() {
  const keys = {};
  window.onkeydown = (e) => keys[e.key] = true;
  window.onkeyup = (e) => keys[e.key] = false;

  if (keys["w"]) y -= speed;
  if (keys["s"]) y += speed;
  if (keys["a"]) x -= speed;
  if (keys["d"]) x += speed;

  canvas.onmousemove = (e) => {
    angle = Math.atan2(
      e.clientY - canvas.height/2,
      e.clientX - canvas.width/2
    );
  };

  ws.send(JSON.stringify({ type:"move", x, y, angle }));

  ctx.clearRect(0,0,800,500);

  // desenhar jogadores
  for (const pid in players) {
    const p = players[pid];
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI*2);
    ctx.fill();
  }

  // desenhar balas
  ctx.fillStyle = "white";
  bullets.forEach((b)=>{
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI*2);
    ctx.fill();
  });

  requestAnimationFrame(loop);
}

loop();
</script>
</body>
</html>
`;

// =======================
// START SERVER
// =======================
server.listen(process.env.PORT || 3000, () => {
  console.log("Servidor rodando!");
});
