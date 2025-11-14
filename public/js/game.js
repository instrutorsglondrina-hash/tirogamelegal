
let canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');
canvas.width = innerWidth;
canvas.height = innerHeight;

let socket = new WebSocket('ws://' + location.host);
let id, players={}, bullets=[], map={}, safeZone={};

let input = { vx:0, vy:0, angle:0 };

socket.onmessage = e=>{
  let data = JSON.parse(e.data);
  if(data.type==='init'){
    id = data.id;
    map = data.map;
    safeZone = data.safeZone;
  }
  if(data.type==='state'){
    players = data.players;
    bullets = data.bullets;
    safeZone = data.safeZone;
  }
};

window.onmousemove = e=>{
  const p = players[id];
  if(!p) return;
  let dx = e.clientX - canvas.width/2;
  let dy = e.clientY - canvas.height/2;
  input.angle = Math.atan2(dy,dx);
  sendMove();
};

window.onkeydown = e=>{
  if(e.key==='w') input.vy = -5;
  if(e.key==='s') input.vy = 5;
  if(e.key==='a') input.vx = -5;
  if(e.key==='d') input.vx = 5;
  sendMove();
};
window.onkeyup = e=>{
  if(['w','s'].includes(e.key)) input.vy = 0;
  if(['a','d'].includes(e.key)) input.vx = 0;
  sendMove();
};

canvas.onclick = ()=> socket.send(JSON.stringify({type:'shoot'}));

function sendMove(){
  socket.send(JSON.stringify({type:'move', vx:input.vx, vy:input.vy, angle:input.angle}));
}

function loop(){
  requestAnimationFrame(loop);
  ctx.clearRect(0,0,canvas.width,canvas.height);

  let me = players[id];
  if(!me) return;

  let camX = me.x - canvas.width/2;
  let camY = me.y - canvas.height/2;

  ctx.strokeStyle = 'cyan';
  ctx.beginPath();
  ctx.arc(safeZone.x-camX, safeZone.y-camY, safeZone.r, 0, Math.PI*2);
  ctx.stroke();

  for(const pid in players){
    let p = players[pid];
    ctx.fillStyle = pid===id?'yellow':'white';
    ctx.beginPath();
    ctx.arc(p.x-camX, p.y-camY, 20, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle='red';
    ctx.fillRect(p.x-camX-20, p.y-camY-35,40,5);
    ctx.fillStyle='lime';
    ctx.fillRect(p.x-camX-20, p.y-camY-35,(p.hp/100)*40,5);
  }

  ctx.fillStyle='orange';
  bullets.forEach(b=>{
    ctx.beginPath();
    ctx.arc(b.x-camX, b.y-camY,5,0,Math.PI*2);
    ctx.fill();
  });
}
loop();
