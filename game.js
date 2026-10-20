/* Kaleitris: Tetris seen through a rotating kaleidoscope. */
(() => {
'use strict';

// ============================================================
// Tetris core
// ============================================================
const COLS = 10, ROWS = 20, CELL = 24;
const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
};
const HUES = { I: 185, O: 52, T: 285, S: 125, Z: 350, J: 225, L: 28 };
const KICKS = [[0,0],[-1,0],[1,0],[0,-1],[-2,0],[2,0],[0,-2],[-1,-1],[1,-1]];
const DAS = 150, ARR = 45, LOCK_DELAY = 500, CLEAR_TIME = 380;

const G = {
  grid: null, piece: null, queue: [], bag: [], hold: null, canHold: true,
  score: 0, lines: 0, level: 1,
  started: false, over: false, paused: false,
  dropAcc: 0, lockAcc: 0, lockResets: 0, grounded: false,
  clearing: null,
  softDrop: false, dasDir: 0, dasAcc: 0, arrAcc: 0,
};

const emptyGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

function refill() {
  if (!G.bag.length) {
    G.bag = TYPES.slice();
    for (let i = G.bag.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [G.bag[i], G.bag[j]] = [G.bag[j], G.bag[i]];
    }
  }
  return G.bag.pop();
}
function nextType() {
  while (G.queue.length < 4) G.queue.push(refill());
  return G.queue.shift();
}
function makePiece(type) {
  const m = SHAPES[type].map(r => r.slice());
  return { type, m, x: Math.floor((COLS - m.length) / 2), y: type === 'I' ? -1 : 0 };
}
function collides(m, px, py) {
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) {
    if (!m[y][x]) continue;
    const gx = px + x, gy = py + y;
    if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
    if (gy >= 0 && G.grid[gy][gx]) return true;
  }
  return false;
}
function rotated(m, dir) {
  const n = m.length, r = m.map(row => row.map(() => 0));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (dir > 0) r[x][n - 1 - y] = m[y][x]; else r[n - 1 - x][y] = m[y][x];
  }
  return r;
}
function spawn(type) {
  const p = makePiece(type || nextType());
  G.piece = p; G.dropAcc = 0; G.lockAcc = 0; G.lockResets = 0; G.grounded = false;
  if (collides(p.m, p.x, p.y)) {
    p.y--;
    if (collides(p.m, p.x, p.y)) { gameOver(); }
  }
}
function onMoved() {
  if (G.grounded && G.lockResets < 15) { G.lockAcc = 0; G.lockResets++; }
}
function tryRotate(dir) {
  const p = G.piece;
  if (!p || G.clearing || p.type === 'O') return;
  const m = rotated(p.m, dir);
  for (const [kx, ky] of KICKS) {
    if (!collides(m, p.x + kx, p.y + ky)) {
      p.m = m; p.x += kx; p.y += ky; onMoved(); sfx.rotate(); return;
    }
  }
}
function tryMove(dx) {
  const p = G.piece;
  if (!p || G.clearing) return false;
  if (!collides(p.m, p.x + dx, p.y)) { p.x += dx; onMoved(); sfx.move(); return true; }
  return false;
}
function ghostY() {
  const p = G.piece; let y = p.y;
  while (!collides(p.m, p.x, y + 1)) y++;
  return y;
}
function softStep() {
  const p = G.piece;
  if (!p || G.clearing) return false;
  if (!collides(p.m, p.x, p.y + 1)) { p.y++; G.score++; G.lockAcc = 0; return true; }
  return false;
}
function hardDrop() {
  const p = G.piece;
  if (!p || G.clearing) return;
  const gy = ghostY();
  G.score += (gy - p.y) * 2; p.y = gy;
  sfx.drop(); fx.thud();
  lock();
}
function lock() {
  const p = G.piece; let lockout = false;
  for (let y = 0; y < p.m.length; y++) for (let x = 0; x < p.m.length; x++) {
    if (!p.m[y][x]) continue;
    const gy = p.y + y;
    if (gy < 0) { lockout = true; continue; }
    G.grid[gy][p.x + x] = p.type;
  }
  G.piece = null; G.canHold = true;
  if (lockout) { gameOver(); return; }
  const rows = [];
  for (let y = 0; y < ROWS; y++) if (G.grid[y].every(c => c)) rows.push(y);
  if (rows.length) { G.clearing = { rows, t: 0 }; sfx.clear(rows.length); fx.lineClear(rows.length); }
  else spawn();
}
function finishClear() {
  const rows = G.clearing.rows; G.clearing = null;
  G.grid = G.grid.filter((_, y) => !rows.includes(y));
  while (G.grid.length < ROWS) G.grid.unshift(Array(COLS).fill(null));
  const n = rows.length;
  G.score += [0, 100, 300, 500, 800][n] * G.level;
  G.lines += n;
  const nl = Math.floor(G.lines / 10) + 1;
  if (nl > G.level) { G.level = nl; sfx.levelUp(); fx.levelUp(); music.setLevel(nl); }
  spawn();
}
function holdPiece() {
  if (!G.piece || !G.canHold || G.clearing) return;
  const t = G.piece.type;
  if (G.hold) { const h = G.hold; G.hold = t; spawn(h); } else { G.hold = t; spawn(); }
  G.canHold = false; sfx.rotate();
}
function dropInterval() {
  const l = G.level - 1;
  return Math.max(40, 1000 * Math.pow(0.8 - l * 0.007, l));
}
function tick(dt) {
  if (!G.started || G.over || G.paused) return;
  if (G.clearing) { G.clearing.t += dt; if (G.clearing.t >= CLEAR_TIME) finishClear(); return; }
  const p = G.piece; if (!p) return;
  if (G.dasDir) {
    G.dasAcc += dt;
    if (G.dasAcc >= DAS) {
      G.arrAcc += dt;
      while (G.arrAcc >= ARR) { G.arrAcc -= ARR; if (!tryMove(G.dasDir)) { G.arrAcc = 0; break; } }
    }
  }
  const interval = G.softDrop ? Math.min(dropInterval(), 50) : dropInterval();
  G.dropAcc += dt;
  while (G.dropAcc >= interval) {
    G.dropAcc -= interval;
    if (!collides(p.m, p.x, p.y + 1)) { p.y++; if (G.softDrop) G.score++; G.lockAcc = 0; }
    else { G.dropAcc = 0; break; }
  }
  if (collides(p.m, p.x, p.y + 1)) {
    G.grounded = true; G.lockAcc += dt;
    if (G.lockAcc >= LOCK_DELAY) lock();
  } else { G.grounded = false; G.lockAcc = 0; }
}
function startGame() {
  G.grid = emptyGrid(); G.queue = []; G.bag = []; G.hold = null; G.canHold = true;
  G.score = 0; G.lines = 0; G.level = 1; G.over = false; G.paused = false; G.started = true;
  G.clearing = null; G.piece = null; G.dasDir = 0; G.softDrop = false;
  fx.hue = Math.random() * 360;
  music.setLevel(1); music.start();
  spawn();
  document.body.classList.add('playing');
  overlay.classList.add('hidden');
}
function gameOver() {
  G.over = true; G.piece = null; G.dasDir = 0; G.softDrop = false;
  sfx.gameOver(); music.stop(); fx.gameOver();
  document.body.classList.remove('playing');
  showOverlay('GAME OVER', `SCORE ${G.score}  ·  LINES ${G.lines}  ·  LEVEL ${G.level}`, 'PRESS ENTER OR TAP TO PLAY AGAIN');
}
function togglePause() {
  if (!G.started || G.over) return;
  G.paused = !G.paused;
  music.pause(G.paused);
  if (G.paused) showOverlay('PAUSED', '', 'PRESS P OR TAP TO RESUME'); else overlay.classList.add('hidden');
}

// ============================================================
// Visual effects state
// ============================================================
const fx = {
  angle: 0, kick: 0, pulse: 1, chroma: 0, hue: 0, flash: 0, shake: 0,
  spin: true, prism: true, highlight: true, wedges: 6, focus: false,
  lineClear(n) { this.pulse = 1 + 0.035 * n; this.chroma += 0.01 * n; this.hue += 25 * n; this.kick += 0.5 * n; this.flash = 0.25 * n; },
  thud() { this.pulse = Math.max(this.pulse, 1.015); this.shake = 4; },
  levelUp() { this.pulse = 1.08; this.chroma += 0.03; this.kick -= 2.5; this.flash = 0.6; },
  gameOver() { this.chroma += 0.05; this.kick += 3; },
  update(dt) {
    const s = dt / 1000;
    const base = this.spin ? 0.06 + 0.012 * (G.level - 1) : 0;
    this.angle += (base + this.kick) * s;
    this.kick *= Math.exp(-s * 2.5);
    this.pulse += (1 - this.pulse) * Math.min(1, s * 5);
    this.chroma *= Math.exp(-s * 3);
    this.flash *= Math.exp(-s * 6);
    this.shake *= Math.exp(-s * 10);
    this.hue = (this.hue + 7 * s) % 360;
  },
};

// ============================================================
// Canvases
// ============================================================
const view = document.getElementById('view');
const mctx = view.getContext('2d');
const overlay = document.getElementById('overlay');
const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

const board = document.createElement('canvas');
board.width = COLS * CELL; board.height = ROWS * CELL;
const bctx = board.getContext('2d');

const scene = document.createElement('canvas'), sctx = scene.getContext('2d');
const chan = document.createElement('canvas'), cctx = chan.getContext('2d');
const small1 = document.createElement('canvas'), s1ctx = small1.getContext('2d');
const small2 = document.createElement('canvas'), s2ctx = small2.getContext('2d');

// ------------------------------------------------------------
// Oil-projector background: domain-warped noise in a fragment shader,
// rendered small and stretched over the scene. Falls back to a conic gradient.
// ------------------------------------------------------------
const oil = (() => {
  const cv = document.createElement('canvas');
  let gl = null, prog = null, loc = null, ok = false;
  const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const FS = `
precision mediump float;
uniform vec2 u_res; uniform float u_time, u_hue, u_angle, u_pulse, u_seed;
vec2 hash(vec2 p){ p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))); return -1.0+2.0*fract(sin(p)*43758.5453123); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(dot(hash(i),f),dot(hash(i+vec2(1.,0.)),f-vec2(1.,0.)),u.x),
             mix(dot(hash(i+vec2(0.,1.)),f-vec2(0.,1.)),dot(hash(i+vec2(1.,1.)),f-vec2(1.,1.)),u.x),u.y);
}
float fbm(vec2 p){
  float v=0.0, a=0.5; mat2 m=mat2(0.8,0.6,-0.6,0.8);
  for(int i=0;i<4;i++){ v+=a*noise(p); p=m*p*2.0+vec2(1.7,9.2); a*=0.5; }
  return v;
}
vec3 pal(float t){ return 0.5+0.5*cos(6.28318*(t+vec3(0.0,0.33,0.67))); }
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*u_res)/min(u_res.x,u_res.y);
  float r=length(uv);
  float ang=atan(uv.y,uv.x)+u_angle*0.5+0.45*sin(r*2.0-u_time*0.05);
  vec2 p=vec2(cos(ang),sin(ang))*r*1.35+u_seed;
  float t=u_time*0.04;
  p.y-=t*0.5;                                                   // slow lava-lamp rise
  vec2 q=vec2(fbm(p+vec2(0.0,t)), fbm(p+vec2(5.2,1.3)-t*0.7));
  vec2 w=vec2(fbm(p+2.2*q+vec2(1.7,9.2)+0.15*t), fbm(p+2.2*q+vec2(8.3,2.8)-0.126*t));
  float f=fbm(p+(1.8+1.2*u_pulse)*w);
  float blobA=smoothstep(0.0,0.14,f);                           // soft blob layers
  float blobB=smoothstep(0.14,0.28,f);
  vec3 bg=pal(u_hue+0.06*q.x+r*0.15)*0.5;
  vec3 ca=pal(u_hue+0.33+0.45*w.y+0.3*q.x);
  vec3 cb=pal(u_hue+0.66+0.45*w.x+0.3*q.y)*1.15;
  vec3 col=mix(bg,ca,blobA); col=mix(col,cb,blobB);
  float rim=1.0-smoothstep(0.0,0.045,abs(f-0.14));             // glowing blob edges
  col+=0.35*rim*pal(u_hue+0.5+0.2*w.x);
  float film=sin((f*4.0+length(w)*3.0-t*1.5)*3.14159);         // faint oil sheen
  col=mix(col, pal(f*2.0+u_hue+0.5), 0.12*film);
  col+=0.25*u_pulse*pal(u_hue+r);
  col*=1.0-0.5*smoothstep(0.35,1.1,r);                          // vignette
  gl_FragColor=vec4(col,1.0);
}`;
  function compile(type, src) {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  function setup() {
    ok = false;
    gl = cv.getContext('webgl', { antialias: false, depth: false, alpha: false, preserveDrawingBuffer: false })
      || cv.getContext('experimental-webgl');
    if (gl) {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      loc = {};
      for (const u of ['u_res', 'u_time', 'u_hue', 'u_angle', 'u_pulse', 'u_seed']) loc[u] = gl.getUniformLocation(prog, u);
      gl.viewport(0, 0, cv.width, cv.height);
      ok = true;
    }
  }
  try { setup(); } catch (e) { ok = false; }
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); ok = false; });
  cv.addEventListener('webglcontextrestored', () => { try { setup(); } catch (e) { ok = false; } });
  const seed = Math.random() * 100;
  return {
    get ok() { return ok; },
    canvas: cv,
    resize(w, h) {
      const k = Math.min(1, 420 / w);
      cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
      if (ok) gl.viewport(0, 0, cv.width, cv.height);
    },
    draw(time, hue, angle, pulse) {
      if (!ok) return;
      gl.uniform2f(loc.u_res, cv.width, cv.height);
      gl.uniform1f(loc.u_time, time);
      gl.uniform1f(loc.u_hue, hue / 360);
      gl.uniform1f(loc.u_angle, angle);
      gl.uniform1f(loc.u_pulse, pulse);
      gl.uniform1f(loc.u_seed, seed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
})();

let W = 0, H = 0, hudMode = 'side', layout = null, focusAuto = true;

function resize() {
  const cw = window.innerWidth, ch = window.innerHeight;
  const budget = isTouch ? 0.9e6 : 2.1e6;
  let dpr = Math.min(window.devicePixelRatio || 1, Math.sqrt(budget / (cw * ch)));
  dpr = Math.max(isTouch ? 1 : 0.75, dpr);
  W = Math.round(cw * dpr); H = Math.round(ch * dpr);
  view.width = W; view.height = H;
  scene.width = chan.width = W; scene.height = chan.height = H;
  small1.width = Math.max(1, W >> 2); small1.height = Math.max(1, H >> 2);
  small2.width = Math.max(1, W >> 4); small2.height = Math.max(1, H >> 4);
  oil.resize(W, H);
  hudMode = (cw >= 820 && cw > ch) ? 'side' : 'top';
  const s = dpr * (hudMode === 'side' ? Math.max(0.7, Math.min(1, cw / 1400)) : Math.max(0.85, Math.min(1.4, cw / 420)));
  const padH = isTouch ? 84 * dpr : 0;
  if (focusAuto) fx.focus = isTouch || cw < 900 || ch > cw;
  const sideW = hudMode === 'side' ? Math.round(230 * s) : 0;
  const topH = hudMode === 'top' ? Math.round(74 * s) : 0;
  document.getElementById('pad').style.right = `${Math.round(sideW / dpr)}px`;
  layout = {
    dpr, s, sideW, topH, padH,
    cx: (W - sideW) / 2, cy: topH + (H - topH - padH) / 2,
    halfW: (W - sideW) / 2, halfH: (H - topH - padH) / 2,
  };
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
resize();

// ============================================================
// Board rendering (one offscreen copy, mirrored everywhere else)
// ============================================================
function tile(c, x, y, s, hue, alpha, flash) {
  const b = s * 0.18;
  c.globalAlpha = alpha;
  c.fillStyle = `hsl(${hue},95%,58%)`; c.fillRect(x, y, s, s);
  c.fillStyle = `hsl(${hue},95%,80%)`;
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + s, y); c.lineTo(x + s - b, y + b); c.lineTo(x + b, y + b); c.lineTo(x + b, y + s - b); c.lineTo(x, y + s); c.closePath(); c.fill();
  c.fillStyle = `hsl(${hue},90%,30%)`;
  c.beginPath(); c.moveTo(x + s, y + s); c.lineTo(x, y + s); c.lineTo(x + b, y + s - b); c.lineTo(x + s - b, y + s - b); c.lineTo(x + s - b, y + b); c.lineTo(x + s, y); c.closePath(); c.fill();
  c.fillStyle = `hsla(${hue},100%,92%,0.25)`; c.fillRect(x + b, y + b, (s - 2 * b) * 0.45, (s - 2 * b) * 0.45);
  if (flash > 0) { c.fillStyle = `rgba(255,255,255,${flash})`; c.fillRect(x, y, s, s); }
  c.globalAlpha = 1;
}

function renderBoard(now) {
  const c = bctx, bw = board.width, bh = board.height;
  c.clearRect(0, 0, bw, bh);
  c.fillStyle = 'rgba(4,0,18,0.32)'; c.fillRect(0, 0, bw, bh);
  c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 1;
  c.beginPath();
  for (let x = 1; x < COLS; x++) { c.moveTo(x * CELL + 0.5, 0); c.lineTo(x * CELL + 0.5, bh); }
  for (let y = 1; y < ROWS; y++) { c.moveTo(0, y * CELL + 0.5); c.lineTo(bw, y * CELL + 0.5); }
  c.stroke();
  if (!G.grid) return;
  const clearingRows = G.clearing ? G.clearing.rows : null;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const t = G.grid[y][x]; if (!t) continue;
    let flash = 0;
    if (clearingRows && clearingRows.includes(y)) flash = 0.45 + 0.45 * Math.sin(now / 28);
    tile(c, x * CELL, y * CELL, CELL, (HUES[t] + fx.hue) % 360, 1, flash);
  }
  const p = G.piece;
  if (p) {
    const hue = (HUES[p.type] + fx.hue) % 360;
    const gy = ghostY();
    c.strokeStyle = `hsla(${hue},95%,75%,0.75)`; c.lineWidth = 2;
    for (let y = 0; y < p.m.length; y++) for (let x = 0; x < p.m.length; x++) {
      if (!p.m[y][x] || gy + y < 0) continue;
      c.strokeRect((p.x + x) * CELL + 3, (gy + y) * CELL + 3, CELL - 6, CELL - 6);
    }
    for (let y = 0; y < p.m.length; y++) for (let x = 0; x < p.m.length; x++) {
      if (!p.m[y][x] || p.y + y < 0) continue;
      tile(c, (p.x + x) * CELL, (p.y + y) * CELL, CELL, hue, 1, 0);
    }
  }
}

// ============================================================
// Kaleidoscope scene
// ============================================================
function clipWedge(c, halfAngle) {
  const R = 6000;
  c.beginPath(); c.moveTo(0, 0);
  c.lineTo(-R * Math.sin(halfAngle), -R * Math.cos(halfAngle));
  c.lineTo(R * Math.sin(halfAngle), -R * Math.cos(halfAngle));
  c.closePath(); c.clip();
}

function renderScene(now) {
  const c = sctx, L = layout;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;

  // psychedelic background: swirling oil-projector shader, conic gradient as fallback
  const h0 = fx.hue;
  if (oil.ok) {
    oil.draw(now / 1000, h0, fx.angle, Math.max(0, fx.pulse - 1) * 8 + fx.chroma * 10);
    c.drawImage(oil.canvas, 0, 0, W, H);
  } else {
    if (c.createConicGradient) {
      const g = c.createConicGradient(-fx.angle * 0.7, L.cx, L.cy);
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(h0 + i * 60) % 360},90%,46%)`);
      c.fillStyle = g;
    } else c.fillStyle = `hsl(${h0},80%,25%)`;
    c.fillRect(0, 0, W, H);
    const v = c.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, Math.hypot(W, H) * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
    c.fillStyle = v; c.fillRect(0, 0, W, H);
  }

  const n = fx.wedges, a = Math.PI / n;
  const r0c = (COLS / 2) / Math.tan(a) + 0.6;
  const outerC = r0c + ROWS;
  const cellS = (fx.focus ? Math.max(L.halfW, L.halfH) : Math.min(L.halfW, L.halfH)) * 0.985 / outerC;
  const bw = COLS * cellS, bh = ROWS * cellS, r0 = r0c * cellS;
  const sx = L.cx + (Math.random() - 0.5) * fx.shake, sy = L.cy + (Math.random() - 0.5) * fx.shake;

  c.save();
  c.translate(sx, sy); c.rotate(fx.angle); c.scale(fx.pulse, fx.pulse);
  const rMax = Math.hypot(Math.max(L.cx, W - L.cx), Math.max(L.cy, H - L.cy)) / fx.pulse;
  const rows = Math.max(1, Math.ceil((rMax - r0) / bh));

  for (let i = 0; i < n; i++) {
    c.save(); c.rotate(i * 2 * a); clipWedge(c, a);
    for (let j = 0; j < rows; j++) {
      const rTop = r0 + (j + 1) * bh;
      const K = Math.ceil(Math.max(0, rTop * Math.tan(a) - bw / 2) / bw);
      for (let k = -K; k <= K; k++) {
        c.save();
        if (j % 2) { c.translate(k * bw, -(r0 + j * bh)); c.scale(k % 2 ? -1 : 1, -1); }
        else { c.translate(k * bw, -(r0 + (j + 1) * bh)); if (k % 2) c.scale(-1, 1); }
        c.drawImage(board, -bw / 2, 0, bw, bh);
        c.restore();
      }
    }
    c.restore();
  }

  // inner mandala: the board shrunk into 2n mirrored slices
  const si = r0 / bh;
  for (let m = 0; m < 2 * n; m++) {
    c.save(); c.rotate(m * a + a / 2); clipWedge(c, a / 2);
    if (m % 2) c.scale(-1, 1);
    c.drawImage(board, -bw * si / 2, -r0, bw * si, r0);
    c.restore();
  }
  c.fillStyle = `hsla(${(h0 + 180) % 360},100%,85%,0.9)`;
  c.beginPath(); c.arc(0, 0, cellS * 0.35, 0, Math.PI * 2); c.fill();

  // marker around the board to watch
  if (fx.highlight && !fx.focus && G.started && !G.over) {
    c.save();
    c.shadowColor = `hsla(${(h0 + 180) % 360},100%,80%,0.9)`; c.shadowBlur = cellS * 1.2;
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = Math.max(2, cellS * 0.18);
    c.strokeRect(-bw / 2, -(r0 + bh), bw, bh);
    c.restore();
  }
  c.restore();

  // focus board: an upright, non-rotating copy in the centre (phones, narrow windows, or B key)
  if (fx.focus) {
    const avail = Math.min(2 * L.halfH * 0.78, 2 * L.halfW * 0.7);
    const fc = Math.min(avail / ROWS, (2 * L.halfW * 0.7) / COLS);
    const fbw = COLS * fc, fbh = ROWS * fc, fx0 = L.cx - fbw / 2, fy0 = L.cy - fbh / 2;
    c.save();
    c.shadowColor = `hsla(${(h0 + 180) % 360},100%,80%,0.9)`; c.shadowBlur = fc * 1.2;
    c.fillStyle = 'rgba(2,0,12,0.78)'; c.fillRect(fx0, fy0, fbw, fbh);
    c.shadowBlur = 0;
    c.drawImage(board, fx0, fy0, fbw, fbh);
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = Math.max(2, fc * 0.12);
    c.strokeRect(fx0, fy0, fbw, fbh);
    c.restore();
  }

  if (fx.flash > 0.01) { c.fillStyle = `rgba(255,255,255,${Math.min(0.6, fx.flash)})`; c.fillRect(0, 0, W, H); }
}

// ============================================================
// Post: bloom + prism (chromatic) split
// ============================================================
let slowFrames = 0, prismAuto = true;
function post() {
  const c = mctx, L = layout;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  if (fx.prism) {
    const amt = 0.0035 + fx.chroma;
    const chans = [['#ff0000', 1 + amt, amt * 0.6], ['#00ff00', 1, 0], ['#0000ff', 1 - amt, -amt * 0.6]];
    for (const [col, sc, rot] of chans) {
      cctx.globalCompositeOperation = 'source-over'; cctx.drawImage(scene, 0, 0);
      cctx.globalCompositeOperation = 'multiply'; cctx.fillStyle = col; cctx.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'lighter';
      c.save(); c.translate(L.cx, L.cy); c.rotate(rot); c.scale(sc, sc); c.drawImage(chan, -L.cx, -L.cy); c.restore();
    }
  } else {
    c.drawImage(scene, 0, 0);
  }
  s1ctx.drawImage(scene, 0, 0, small1.width, small1.height);
  s2ctx.drawImage(small1, 0, 0, small2.width, small2.height);
  c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.38;
  c.drawImage(small2, 0, 0, W, H);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

// ============================================================
// HUD (drawn crisp, after post-processing)
// ============================================================
function miniPiece(c, type, x, y, cs, hue) {
  if (!type) return;
  const m = SHAPES[type];
  let minX = 9, maxX = -1, minY = 9, maxY = -1;
  for (let yy = 0; yy < m.length; yy++) for (let xx = 0; xx < m.length; xx++) if (m[yy][xx]) {
    minX = Math.min(minX, xx); maxX = Math.max(maxX, xx); minY = Math.min(minY, yy); maxY = Math.max(maxY, yy);
  }
  const w = (maxX - minX + 1) * cs, h = (maxY - minY + 1) * cs;
  for (let yy = minY; yy <= maxY; yy++) for (let xx = minX; xx <= maxX; xx++) if (m[yy][xx]) {
    tile(c, x - w / 2 + (xx - minX) * cs, y - h / 2 + (yy - minY) * cs, cs, hue, 1, 0);
  }
}
function drawHUD() {
  const c = mctx, L = layout, s = L.s;
  c.setTransform(1, 0, 0, 1, 0, 0);
  const glow = `hsl(${(fx.hue + 180) % 360},100%,75%)`;
  const label = (t, x, y, size) => {
    c.font = `bold ${Math.round(size)}px "Courier New", Courier, monospace`;
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.shadowBlur = 0; c.fillText(t, x, y);
  };
  const value = (t, x, y, size) => {
    c.font = `bold ${Math.round(size)}px "Courier New", Courier, monospace`;
    c.shadowColor = glow; c.shadowBlur = 12 * s; c.fillStyle = '#fff'; c.fillText(t, x, y); c.shadowBlur = 0;
  };
  try { c.letterSpacing = `${Math.round(3 * s)}px`; } catch (e) { /* older browsers */ }
  c.textBaseline = 'top';
  const score = String(G.score).padStart(7, '0'), lines = String(G.lines).padStart(3, '0'), level = String(G.level).padStart(2, '0');
  if (hudMode === 'side') {
    const px = W - L.sideW;
    c.fillStyle = 'rgba(8,4,24,0.6)'; c.fillRect(px, 0, L.sideW, H);
    c.textAlign = 'left';
    const vs = Math.min(1, (H - L.padH - 30 * s) / (720 * s));
    const x = px + 24 * s; let y = 50 * s * vs;
    label('SCORE', x, y, 17 * s); value(score, x, y + 26 * s, 34 * s); y += 120 * s * vs;
    label('LINES', x, y, 17 * s); value(lines, x, y + 26 * s, 34 * s); y += 120 * s * vs;
    label('LEVEL', x, y, 17 * s); value(level, x, y + 26 * s, 34 * s); y += 120 * s * vs;
    label('NEXT', x, y, 17 * s); miniPiece(c, G.queue[0], px + L.sideW / 2, y + 75 * s * vs, 22 * s * vs, (HUES[G.queue[0]] + fx.hue) % 360); y += 150 * s * vs;
    label('HOLD', x, y, 17 * s); miniPiece(c, G.hold, px + L.sideW / 2, y + 75 * s * vs, 22 * s * vs, G.hold ? (HUES[G.hold] + fx.hue) % 360 : 0);
  } else {
    c.fillStyle = 'rgba(8,4,24,0.6)'; c.fillRect(0, 0, W, L.topH);
    const xs = [0.17, 0.41, 0.58, 0.76, 0.91].map(f => f * W);
    const items = [['SCORE', score], ['LINES', lines], ['LEVEL', level]];
    c.textAlign = 'center';
    items.forEach(([l, vv], i) => { label(l, xs[i], 10 * s, 12 * s); value(vv, xs[i], 30 * s, 23 * s); });
    label('NEXT', xs[3], 10 * s, 12 * s);
    miniPiece(c, G.queue[0], xs[3], 48 * s, 10 * s, (HUES[G.queue[0]] + fx.hue) % 360);
    label('HOLD', xs[4], 10 * s, 12 * s);
    miniPiece(c, G.hold, xs[4], 48 * s, 10 * s, G.hold ? (HUES[G.hold] + fx.hue) % 360 : 0);
  }
  if (!fx.prism && prismAuto === false) {
    c.textAlign = hudMode === 'side' ? 'left' : 'center'; c.font = `${Math.round(11 * s)}px "Courier New", monospace`;
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillText('PRISM OFF (F)', hudMode === 'side' ? W - L.sideW + 24 * s : W / 2, H - L.padH - 22 * s);
  }
  try { c.letterSpacing = '0px'; } catch (e) { /* ignore */ }
}

// ============================================================
// Main loop
// ============================================================
let last = performance.now(), hidden = false;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = now - last; last = now;
  if (dt > 250) dt = 250;
  if (hidden) return;
  tick(dt);
  fx.update(dt);
  renderBoard(now);
  renderScene(now);
  post();
  drawHUD();
  // automatic fallback: switch the heavy prism pass off if the device cannot keep up
  if (fx.prism && prismAuto) {
    if (dt > 34) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 90) { fx.prism = false; prismAuto = false; }
  }
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => {
  hidden = document.hidden;
  if (hidden && G.started && !G.over && !G.paused) togglePause();
  last = performance.now();
});

// ============================================================
// Music: Korobeiniki through a warped tape machine
// ============================================================
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const music = (() => {
  let ctx = null, master, leadBus, padBus, bassFilt, delay, fb, wobble, vib;
  let timer = null, pos = 0, loop = 0, nextT = 0, level = 1, muted = false, running = false;
  let variant = false, transpose = 0;

  // melody: [midi, eighths]; 0 = rest
  const mel = [
    [76,2],[71,1],[72,1],[74,2],[72,1],[71,1],
    [69,2],[69,1],[72,1],[76,2],[74,1],[72,1],
    [71,3],[72,1],[74,2],[76,2],
    [72,2],[69,2],[69,2],[0,2],
    [0,1],[74,2],[77,1],[81,2],[79,1],[77,1],
    [76,3],[72,1],[76,2],[74,1],[72,1],
    [71,2],[71,1],[72,1],[74,2],[76,2],
    [72,2],[69,2],[69,2],[0,2],
  ];
  const melAt = Array.from({ length: 64 }, () => []);
  { let t = 0; for (const [m, d] of mel) { if (m) melAt[t].push({ m, d }); t += d; } }
  // chord per half bar: [bass root midi, quality]
  const prog = [[40,'m'],[40,'m'],[45,'m'],[45,'m'],[47,'M'],[40,'m'],[45,'m'],[45,'m'],
                [38,'m'],[38,'m'],[36,'M'],[36,'M'],[47,'M'],[40,'m'],[45,'m'],[45,'m']];

  const bpm = () => Math.min(215, 138 + (level - 1) * 6);
  const eighth = () => 60 / bpm() / 2;

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 6;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 2600; filt.Q.value = 1.8;
    const flfo = ctx.createOscillator(); flfo.frequency.value = 0.09;
    const flg = ctx.createGain(); flg.gain.value = 1500; flfo.connect(flg); flg.connect(filt.frequency); flfo.start();
    master.connect(filt); filt.connect(comp); comp.connect(ctx.destination);

    delay = ctx.createDelay(2); delay.delayTime.value = 0.33;
    fb = ctx.createGain(); fb.gain.value = 0.35;
    const dfilt = ctx.createBiquadFilter(); dfilt.type = 'lowpass'; dfilt.frequency.value = 1500;
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    delay.connect(dfilt); dfilt.connect(fb); fb.connect(delay); dfilt.connect(wet); wet.connect(master);

    leadBus = ctx.createGain(); leadBus.gain.value = 0.55; leadBus.connect(master);
    const send = ctx.createGain(); send.gain.value = 0.45; leadBus.connect(send); send.connect(delay);
    padBus = ctx.createGain(); padBus.gain.value = 0.4; padBus.connect(master);
    const psend = ctx.createGain(); psend.gain.value = 0.2; padBus.connect(psend); psend.connect(delay);
    bassFilt = ctx.createBiquadFilter(); bassFilt.type = 'lowpass'; bassFilt.frequency.value = 520; bassFilt.connect(master);

    // tape wobble + vibrato shared by every voice
    const wo = ctx.createOscillator(); wo.frequency.value = 0.21;
    wobble = ctx.createGain(); wobble.gain.value = 14; wo.connect(wobble); wo.start();
    const vo = ctx.createOscillator(); vo.frequency.value = 5.3;
    vib = ctx.createGain(); vib.gain.value = 7; vo.connect(vib); vo.start();
  }

  function lead(t, midi, dur) {
    const f = mtof(midi + transpose + (variant ? 12 : 0));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(variant ? 0.18 : 0.28, t + 0.015);
    g.gain.setTargetAtTime(variant ? 0.12 : 0.17, t + 0.05, 0.12);
    g.gain.setTargetAtTime(0, t + dur - 0.02, variant ? 0.14 : 0.04);
    g.connect(leadBus);
    const o1 = ctx.createOscillator(); o1.type = variant ? 'sine' : 'triangle'; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = variant ? 'triangle' : 'sawtooth'; o2.frequency.value = f;
    o2.detune.value = 9 + (Math.random() * 8 - 4);
    const g2 = ctx.createGain(); g2.gain.value = variant ? 0.3 : 0.33;
    o1.connect(g); o2.connect(g2); g2.connect(g);
    wobble.connect(o1.detune); wobble.connect(o2.detune); vib.connect(o1.detune); vib.connect(o2.detune);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.8); o2.stop(t + dur + 0.8);
  }
  function bass(t, midi, dur) {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = mtof(midi + transpose);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.9);
    o.connect(g); g.connect(bassFilt); wobble.connect(o.detune);
    o.start(t); o.stop(t + dur);
  }
  function pad(t, root, qual, dur) {
    const ints = qual === 'm' ? [0, 3, 7, 12] : [0, 4, 7, 12];
    for (const i of ints) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = mtof(root + 24 + i + transpose); o.detune.value = Math.random() * 10 - 5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g); g.connect(padBus); wobble.connect(o.detune);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }
  function sparkle(t, midi) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(midi + transpose);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(delay); g.connect(master); o.start(t); o.stop(t + 0.5);
  }
  function loopStart() {
    variant = loop % 2 === 1;
    transpose = loop % 4 === 3 ? 3 : 0;
    fb.gain.setTargetAtTime(variant ? 0.55 : 0.35, ctx.currentTime, 0.5);
  }
  function step(p, t) {
    const e = eighth();
    for (const n of melAt[p]) lead(t, n.m, n.d * e * 0.95);
    const [root, q] = prog[p >> 2];
    bass(t, root + [0, 12, 7, 12][p % 4], e * 0.9);
    if (p % 4 === 0) pad(t, root, q, e * 4);
    if (p % 8 === 4 && Math.random() < 0.2) sparkle(t, root + 48 + [0, 7, 12, 14][(Math.random() * 4) | 0]);
  }
  function sched() {
    if (!running) return;
    while (nextT < ctx.currentTime + 0.2) {
      if (pos === 0) loopStart();
      step(pos, nextT);
      nextT += eighth();
      pos = (pos + 1) % 64;
      if (pos === 0) loop++;
    }
  }
  return {
    get ctx() { return ctx; },
    get master() { return master; },
    get delay() { return delay; },
    ensure() { if (!ctx) init(); if (ctx.state === 'suspended') ctx.resume(); },
    start() {
      this.ensure();
      if (running) return;
      running = true; pos = 0; loop = 0; nextT = ctx.currentTime + 0.15;
      timer = setInterval(sched, 25);
    },
    stop() { running = false; if (timer) clearInterval(timer); timer = null; },
    pause(on) { if (!ctx) return; if (on) ctx.suspend(); else ctx.resume(); },
    setLevel(l) { level = l; },
    toggleMute() {
      if (!ctx) return;
      muted = !muted; master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05);
    },
  };
})();

// ============================================================
// Sound effects
// ============================================================
function tone(f0, f1, dur, type, vol, when, wet) {
  const ctx = music.ctx; if (!ctx) return;
  const t = ctx.currentTime + (when || 0);
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(music.master);
  if (wet) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(music.delay); }
  o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  move() { tone(320, 300, 0.03, 'square', 0.05); },
  rotate() { tone(520, 820, 0.07, 'sine', 0.13, 0, 0.3); },
  drop() { tone(170, 35, 0.16, 'sawtooth', 0.3); tone(90, 30, 0.12, 'square', 0.2); },
  clear(n) {
    for (let i = 0; i < n + 3; i++) tone(523 * Math.pow(2, (i * 2) / 12), 523 * Math.pow(2, (i * 2 + 1) / 12), 0.18, 'triangle', 0.18, i * 0.055, 0.5);
    if (n >= 4) tone(880, 1760, 0.6, 'sine', 0.2, 0.3, 0.8);
  },
  levelUp() { [0, 4, 7, 12, 16].forEach((s, i) => tone(mtof(64 + s), mtof(64 + s), 0.25, 'sine', 0.18, i * 0.08, 0.6)); },
  gameOver() { tone(440, 50, 1.6, 'sawtooth', 0.3, 0, 0.6); tone(445, 40, 1.8, 'square', 0.15, 0.05, 0.6); },
};

// ============================================================
// Overlay + input
// ============================================================
function showOverlay(title, sub, go) {
  overlay.querySelector('h1').textContent = title;
  overlay.querySelector('#subtitle').textContent = sub;
  overlay.querySelector('#go').textContent = go;
  overlay.classList.remove('hidden');
}
function primaryAction() {
  if (!G.started || G.over) { music.ensure(); startGame(); }
  else if (G.paused) togglePause();
}
overlay.addEventListener('click', primaryAction);
overlay.addEventListener('touchend', e => { e.preventDefault(); primaryAction(); }, { passive: false });

function pressLeft(d) { G.dasDir = d; G.dasAcc = 0; G.arrAcc = 0; tryMove(d); }
function releaseDir(d) { if (G.dasDir === d) G.dasDir = 0; }

window.addEventListener('keydown', e => {
  const k = e.key;
  if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(k)) e.preventDefault();
  if (e.repeat) return;
  if (k === 'Enter') { primaryAction(); return; }
  if (k === 'p' || k === 'P' || k === 'Escape') { togglePause(); return; }
  if (k === 'm' || k === 'M') { music.toggleMute(); return; }
  if (k === 'r' || k === 'R') { fx.spin = !fx.spin; return; }
  if (k === 'f' || k === 'F') { fx.prism = !fx.prism; prismAuto = false; return; }
  if (k === 'h' || k === 'H') { fx.highlight = !fx.highlight; return; }
  if (k === 'b' || k === 'B') { fx.focus = !fx.focus; focusAuto = false; return; }
  if (k === '[') { fx.wedges = Math.max(3, fx.wedges - 1); return; }
  if (k === ']') { fx.wedges = Math.min(12, fx.wedges + 1); return; }
  if (!G.started || G.over || G.paused) return;
  switch (k) {
    case 'ArrowLeft': pressLeft(-1); break;
    case 'ArrowRight': pressLeft(1); break;
    case 'ArrowDown': G.softDrop = true; break;
    case 'ArrowUp': case 'x': case 'X': tryRotate(1); break;
    case 'z': case 'Z': case 'Control': tryRotate(-1); break;
    case ' ': hardDrop(); break;
    case 'c': case 'C': case 'Shift': holdPiece(); break;
  }
});
window.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft') releaseDir(-1);
  if (e.key === 'ArrowRight') releaseDir(1);
  if (e.key === 'ArrowDown') G.softDrop = false;
});

// on-screen buttons
const pad = document.getElementById('pad');
pad.querySelectorAll('button').forEach(btn => {
  const act = btn.dataset.act;
  const down = e => {
    e.preventDefault();
    music.ensure();
    if (act === 'pause') { togglePause(); return; }
    if (!G.started || G.over || G.paused) return;
    if (act === 'left') pressLeft(-1);
    else if (act === 'right') pressLeft(1);
    else if (act === 'rotate') tryRotate(1);
    else if (act === 'soft') G.softDrop = true;
    else if (act === 'hard') hardDrop();
    else if (act === 'hold') holdPiece();
  };
  const up = e => {
    e.preventDefault();
    if (act === 'left') releaseDir(-1);
    else if (act === 'right') releaseDir(1);
    else if (act === 'soft') G.softDrop = false;
  };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('pointerleave', up);
  btn.addEventListener('contextmenu', e => e.preventDefault());
});

// touch gestures on the play field: drag to move, drag down to soft drop, flick down to hard drop, tap to rotate
let touch = null;
view.addEventListener('touchstart', e => {
  if (e.touches.length !== 1) return;
  const t = e.touches[0];
  touch = { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, t0: performance.now(), moved: false, dropped: false };
}, { passive: true });
view.addEventListener('touchmove', e => {
  if (!touch || !G.started || G.over || G.paused) return;
  e.preventDefault();
  const t = e.touches[0];
  const step = Math.max(22, Math.min(40, window.innerWidth / 14));
  const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  if (Math.abs(dx) >= step) {
    const n = Math.trunc(dx / step);
    for (let i = 0; i < Math.abs(n); i++) tryMove(Math.sign(n));
    touch.x += n * step; touch.moved = true;
  }
  if (dy >= step) {
    const n = Math.trunc(dy / step);
    for (let i = 0; i < n; i++) softStep();
    touch.y += n * step; touch.moved = true;
  }
  if (!touch.dropped && t.clientY - touch.y0 > 90 && performance.now() - touch.t0 < 220 && Math.abs(t.clientX - touch.x0) < 50) {
    touch.dropped = true; touch.moved = true; hardDrop();
  }
}, { passive: false });
const touchEnd = e => {
  if (!touch) return;
  const dt = performance.now() - touch.t0;
  if (!touch.moved && dt < 250 && G.started && !G.over && !G.paused) {
    tryRotate(e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientX < window.innerWidth * 0.25 ? -1 : 1);
  }
  touch = null;
};
view.addEventListener('touchend', touchEnd);
view.addEventListener('touchcancel', touchEnd);
view.addEventListener('contextmenu', e => e.preventDefault());

})();
