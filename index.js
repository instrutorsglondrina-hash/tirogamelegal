// =======================================================
//  BATTLE ROYALE — BACKEND + FRONTEND EM 1 ARQUIVO
//  Parte 1/2
// =======================================================

const express = require("express");
const http = require("http");
const WebSocket = require("ws");

// --------------------------
// CONFIGURAÇÕES DO JOGO
// --------------------------
const MAP_WIDTH = 3000;
const MAP_HEIGHT = 3000;

const SAFEZONE_SHRINK_RATE = 0.25; // por segundo
const SAFEZONE_INITIAL_RADIUS = 1200;

const PLAYER_SPEED = 4;
const BULLET_SPEED = 14;
const FIRE_RATE = 250; // ms entre tiros
const MAX_HP = 100;

// --------------------------
// SERVIDOR EXPRESS
// --------------------------
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Página principal
app.get("/", (req, res) => {
  res.send(htmlFrontend);
});

// --------------------------
// ESTRUTURA DAS SALAS
// --------------------------
const rooms = {};  
/*
 rooms = {
   salaId: {
     players: { id: {x,y,hp,color,ws,...} },
     bullets: [ {x,y,angle,owner} ],
     loot: [...],
     safezone: {x,y,radius}
   }
 }
*/

function createRoom(roomId) {
  rooms[roomId] = {
    players: {},
    bullets: [],
    loot: [],
    safezone: {
      x: MAP_WIDTH / 2,
      y: MAP_HEIGHT / 2,
      radius: SAFEZONE_INITIAL_RADIUS
    }
  };

  // Gera loot inicial no mapa
  for (let i = 0; i < 60; i++) {
    rooms[roomId].loot.push({
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
      type: "medkit",
      id: Math.random().toString(36).substring(2, 9)
    });
  }
}

// --------------------------
// WEBSOCKET
// --------------------------
wss.on("connection", (ws) => {
  let playerId = Math.random().toString(36).substring(2, 9);
  let roomId = "BRsolo";

  if (!rooms[roomId]) createRoom(roomId);

  // Cria jogador
  rooms[roomId].players[playerId] = {
    id: playerId,
    ws,
    x: 1500 + Math.random() * 200 - 100,
    y: 1500 + Math.random() * 200 - 100,
    angle: 0,
    hp: MAX_HP,
    lastShot: 0,
    color: ["red","blue","green","yellow","purple"][Math.floor(Math.random()*5)],
    alive: true
  };

  ws.send(JSON.stringify({ type: "id", id: playerId }));

  // Receber mensagens do cliente
  ws.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    const room = rooms[roomId];
    const p = room.players[playerId];
    if (!p) return;

    // movimento
    if (data.type === "move") {
      p.x = data.x;
      p.y = data.y;
      p.angle = data.angle;
    }

    // tiro
    if (data.type === "shoot") {
      const now = Date.now();
      if (now - p.lastShot >= FIRE_RATE) {
        room.bullets.push({
          x: p.x,
          y: p.y,
          angle: p.angle,
          owner: playerId
        });
        p.lastShot = now;
      }
    }

    // pegar loot
    if (data.type === "pickup") {
      room.loot = room.loot.filter((l) => {
        if (l.id === data.id) {
          if (l.type === "medkit") {
            p.hp = Math.min(MAX_HP, p.hp + 40);
          }
          return false;
        }
        return true;
      });
    }
  });

  ws.on("close", () => {
    if (rooms[roomId]?.players[playerId])
      delete rooms[roomId].players[playerId];
  });
});

// --------------------------
// GAME LOOP (30FPS)
// --------------------------
setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];

    // atualizar balas
    room.bullets.forEach((b) => {
      b.x += Math.cos(b.angle) * BULLET_SPEED;
      b.y += Math.sin(b.angle) * BULLET_SPEED;
    });

    // remover balas fora do mapa
    room.bullets = room.bullets.filter(
      (b) => b.x > 0 && b.x < MAP_WIDTH && b.y > 0 && b.y < MAP_HEIGHT
    );

    // colisões
    room.bullets.forEach((b) => {
      for (const id in room.players) {
        const p = room.players[id];
        if (!p.alive || id === b.owner) continue;

        const dist = Math.hypot(p.x - b.x, p.y - b.y);
        if (dist < 20) {
          p.hp -= 25;
          b.x = -9999; // remove bala
          if (p.hp <= 0) {
            p.alive = false;
            setTimeout(() => respawn(room, p), 3000);
          }
        }
      }
    });

    // remove balas marcadas
    room.bullets = room.bullets.filter((b) => b.x > 0);

    // safe zone diminuindo
    room.safezone.radius -= SAFEZONE_SHRINK_RATE;

    // dano fora da safezone
    for (const id in room.players) {
      const p = room.players[id];
      const d = Math.hypot(p.x - room.safezone.x, p.y - room.safezone.y);

      if (d > room.safezone.radius) {
        p.hp -= 0.5;
        if (p.hp <= 0 && p.alive) {
          p.alive = false;
          setTimeout(() => respawn(room, p), 3000);
        }
      }
    }

    // enviar estado
    const state = {
      type: "state",
      players: Object.fromEntries(
        Object.entries(room.players).map(([id, p]) => [
          id,
          {
            x: p.x,
            y: p.y,
            angle: p.angle,
            hp: p.hp,
            color: p.color,
            alive: p.alive
          }
        ])
      ),
      bullets: room.bullets,
      loot: room.loot,
      safezone: room.safezone
    };

    const json = JSON.stringify(state);

    for (const id in room.players) {
      const p = room.players[id];
      if (p.ws.readyState === WebSocket.OPEN)
        p.ws.send(json);
    }
  }
}, 1000 / 30);

// --------------------------
// FUNÇÃO DE RESPAWN
// --------------------------
function respawn(room, p) {
  p.x = 1500 + Math.random() * 200 - 100;
  p.y = 1500 + Math.random() * 200 - 100;
  p.hp = MAX_HP;
  p.alive = true;
}

// =======================================================
// FRONTEND — HTML (COMEÇO)
// Continua na Parte 2
// =======================================================

const htmlFrontend = `
<!DOCTYPE html>
<html>
<head>
<title>Battle Royale</title>
<style>
  body { margin:0; overflow:hidden; background:#111; }
  canvas { display:block; margin:0 auto; background:#000; }
  #menu {
    position: absolute;
    inset: 0;
    background: #000a;
    display:flex;
    align-items:center;
    justify-content:center;
    flex-direction:column;
    color:white;
    font-family:Arial;
    z-index:10;
  }
  #play {
    font-size:32px;
    padding:20px 40px;
    background:#3a7;
    border:none;
    border-radius:12px;
    color:white;
  }
</style>
</head>
<body>
<div id="menu">
  <h1>🔥 Battle Royale 🔥</h1>
  <button id="play">Jogar</button>
</div>

<canvas id="game" width="1000" height="600"></canvas>

<script>
let ws;
let id = null;
let players = {};
let bullets = [];
let loot = [];
let safezone = {};
let x = 1500, y = 1500;
let angle = 0;
let speed = ${PLAYER_SPEED};
let alive = true;
let joystick = { x:0, y:0, active:false };
//--------------------------------------------------------
//   PARTE 2/2 — FRONTEND (JOGO COMPLETO)
//--------------------------------------------------------

document.getElementById("play").onclick = () => {
  document.getElementById("menu").style.display = "none";

  ws = new WebSocket("wss://" + location.host);

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);

    if (data.type === "id") {
      id = data.id;
    }

    if (data.type === "state") {
      players = data.players;
      bullets = data.bullets;
      loot = data.loot;
      safezone = data.safezone;

      if (players[id]) alive = players[id].alive;
    }
  };
};

// --------------------------------------------------
// CANVAS + SISTEMA DE INPUT
// --------------------------------------------------

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Mouse → mira
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  angle = Math.atan2(my - canvas.height / 2, mx - canvas.width / 2);
});

// Mouse → tiro
canvas.addEventListener("mousedown", () => {
  if (ws)
    ws.send(JSON.stringify({ type: "shoot" }));
});

// Teclas → movimento
let keys = {};
window.onkeydown = (e) => (keys[e.key] = true);
window.onkeyup = (e) => (keys[e.key] = false);

// --------------------------------------------------
// JOYSTICK MOBILE
// --------------------------------------------------

let touchId = null;

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  if (!touchId) {
    touchId = e.changedTouches[0].identifier;
    joystick.active = true;
  }
});

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === touchId) {
      let rect = canvas.getBoundingClientRect();
      let mx = t.clientX - rect.left - canvas.width / 2;
      let my = t.clientY - rect.top - canvas.height / 2;
      let len = Math.hypot(mx, my);

      if (len > 60) {
        mx = (mx / len) * 60;
        my = (my / len) * 60;
      }

      joystick.x = mx;
      joystick.y = my;
    }
  }
});

canvas.addEventListener("touchend", (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === touchId) {
      joystick.x = joystick.y = 0;
      joystick.active = false;
      touchId = null;
    }
  }
});

// --------------------------------------------------
// LOOP DO JOGO
// --------------------------------------------------

function gameLoop() {
  if (!id || !players[id]) {
    requestAnimationFrame(gameLoop);
    return;
  }

  const me = players[id];

  // Movimento PC
  let dx = 0,
    dy = 0;

  if (keys["w"]) dy -= speed;
  if (keys["s"]) dy += speed;
  if (keys["a"]) dx -= speed;
  if (keys["d"]) dx += speed;

  // Movimento Mobile
  if (joystick.active) {
    dx += (joystick.x / 60) * speed;
    dy += (joystick.y / 60) * speed;
  }

  x += dx;
  y += dy;

  // Colisão no mapa
  x = Math.max(0, Math.min(${MAP_WIDTH}, x));
  y = Math.max(0, Math.min(${MAP_HEIGHT}, y));

  // Envia estado
  if (ws)
    ws.send(JSON.stringify({ type: "move", x, y, angle }));

  // --------------------------------------------------
  // RENDERIZAÇÃO
  // --------------------------------------------------

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Câmera centraliza no jogador
  const camX = x - canvas.width / 2;
  const camY = y - canvas.height / 2;

  // Safezone
  ctx.beginPath();
  ctx.strokeStyle = "white";
  ctx.lineWidth = 3;
  ctx.arc(
    safezone.x - camX,
    safezone.y - camY,
    safezone.radius,
    0,
    Math.PI * 2
  );
  ctx.stroke();

  // LOOT
  loot.forEach((l) => {
    ctx.fillStyle = l.type === "medkit" ? "lime" : "orange";
    ctx.beginPath();
    ctx.arc(l.x - camX, l.y - camY, 10, 0, Math.PI * 2);
    ctx.fill();

    // pegar loot
    if (Math.hypot(x - l.x, y - l.y) < 25) {
      ws.send(JSON.stringify({ type: "pickup", id: l.id }));
    }
  });

  // Jogadores
  for (const pid in players) {
    const p = players[pid];
    if (!p.alive) continue;

    ctx.save();
    ctx.translate(p.x - camX, p.y - camY);
    ctx.rotate(p.angle);

    // Corpo
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();

    // Arma
    ctx.fillStyle = "black";
    ctx.fillRect(15, -4, 20, 8);

    ctx.restore();

    // HP
    ctx.fillStyle = "red";
    ctx.fillRect(p.x - camX - 20, p.y - camY - 28, 40, 5);
    ctx.fillStyle = "lime";
    ctx.fillRect(
      p.x - camX - 20,
      p.y - camY - 28,
      (p.hp / 100) * 40,
      5
    );
  }

  // Balas
  ctx.fillStyle = "yellow";
  bullets.forEach((b) => {
    ctx.beginPath();
    ctx.arc(b.x - camX, b.y - camY, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Mira
  ctx.strokeStyle = "white";
  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, 15, 0, Math.PI * 2);
  ctx.stroke();

  // HUD
  ctx.fillStyle = "white";
  ctx.font = "20px Arial";
  ctx.fillText("HP: " + me.hp, 20, 30);

  requestAnimationFrame(gameLoop);
}

gameLoop();

</script>
</body>
</html>
`;

// --------------------------------------------------
// INICIAR SERVIDOR
// --------------------------------------------------

server.listen(process.env.PORT || 3000, () => {
  console.log("Servidor Battle Royale rodando!");
});


