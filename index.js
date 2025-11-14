
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

let players = {};
let bullets = [];
let map = { width: 3000, height: 3000 };
let safeZone = { x: 1500, y: 1500, r: 1200 };

function broadcast(data) {
  const msg = JSON.stringify(data);
  [...wss.clients].forEach(c => { if (c.readyState === 1) c.send(msg); });
}

wss.on('connection', ws => {
  const id = Date.now().toString();
  players[id] = { x:1500, y:1500, hp:100, angle:0, vx:0, vy:0 };

  ws.send(JSON.stringify({ type:'init', id, map, safeZone }));

  ws.on('message', msg => {
    const data = JSON.parse(msg);
    if(data.type === 'move'){
      players[id].vx = data.vx;
      players[id].vy = data.vy;
      players[id].angle = data.angle;
    }
    if(data.type === 'shoot'){
      bullets.push({ x: players[id].x, y: players[id].y, vx: Math.cos(players[id].angle)*20, vy: Math.sin(players[id].angle)*20, owner:id });
    }
  });

  ws.on('close', ()=> delete players[id]);
});

setInterval(()=>{
  for(const id in players){
    const p = players[id];
    p.x += p.vx;
    p.y += p.vy;
    p.x = Math.max(0, Math.min(map.width, p.x));
    p.y = Math.max(0, Math.min(map.height, p.y));
  }

  bullets.forEach(b=>{
    b.x += b.vx;
    b.y += b.vy;
    for(const id in players){
      const p = players[id];
      if((p.x-b.x)**2 + (p.y-b.y)**2 < 30*30){
        p.hp -= 20;
        b.dead = true;
      }
    }
  });
  bullets = bullets.filter(b=>!b.dead);

  safeZone.r -= 0.5;
  for(const id in players){
    const p = players[id];
    const dx = p.x - safeZone.x;
    const dy = p.y - safeZone.y;
    if(dx*dx + dy*dy > safeZone.r*safeZone.r) p.hp -= 0.2;
  }

  broadcast({ type:'state', players, bullets, safeZone });
}, 50);

server.listen(3000, ()=> console.log('Server ON'));
