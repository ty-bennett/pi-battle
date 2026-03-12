/**
 * Pi Battle Arena — Client
 * Game rendering, networking, block coding customizer, trivia, UI
 */

// ═══════════════════════════════════════════════
// GLOBALS
// ═══════════════════════════════════════════════
const socket = io();
let CONFIG = {};
let WEAPONS = {};
let myId = null;
let isAdmin = false;
let currentScreen = 'loading';

// Player state
let playerName = '';
let selectedWeapon = 'crystal_wand';
let customization = {
  bodyColor: '#00d4ff',
  hatType: 'none',
  hatColor: '#a855f7',
  shirtColor: '#1e3a5f',
  shoesColor: '#ff6b35'
};

// Game state (from server)
let gs = null;

// Input
const keys = { w: false, a: false, s: false, d: false };
let mouseX = 0, mouseY = 0;
let mouseDown = false;

// Canvas & rendering
let canvas, ctx;
let gameW, gameH;
let scaleX = 1, scaleY = 1;
let cameraX = 0, cameraY = 0;

// Particles (client-side only for effects)
let localParticles = [];

// Leaderboard toggle
let showLeaderboard = false;

// ── Smoothness / interpolation ──────────────────────────────
let prevGs = null;
let lastStateTime = 0;
let prevProjMap = {};     // id → {x,y,color} for hit-spark detection

// Screen shake
let shakeMag = 0, shakeX = 0, shakeY = 0;
let myPrevHp = 100;

// Client-side movement prediction
let predictX = 0, predictY = 0, hasPrediction = false;

// Smooth display positions — objects reused every frame (no GC pressure)
let frameDt = 16.67;
const displayPos = { pawns: {}, boss: null, players: {} };

// Stars background
let stars = [];
for (let i = 0; i < 100; i++) {
  stars.push({
    x: Math.random() * 1600,
    y: Math.random() * 900,
    s: Math.random() * 2 + 0.5,
    a: Math.random()
  });
}

// ═══════════════════════════════════════════════
// SCREEN MANAGEMENT
// ═══════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id + '-screen');
  if (el) el.classList.add('active');
  currentScreen = id;

  if (id === 'game') {
    initGameCanvas();
    requestAnimationFrame(gameLoop);
  }
}

// ═══════════════════════════════════════════════
// SOCKET EVENTS
// ═══════════════════════════════════════════════
socket.on('welcome', (data) => {
  CONFIG = data.config;
  WEAPONS = data.weapons;
  gameW = CONFIG.ARENA_W;
  gameH = CONFIG.ARENA_H;

  // Small delay for loading screen effect
  setTimeout(() => {
    showScreen('join');
    initCustomizer();
  }, 2200);
});

socket.on('joined', (data) => {
  myId = data.id;
  showScreen('game');
  // Show waiting overlay if game hasn't started
  if (!gs || gs.phase === 'lobby') {
    document.getElementById('waiting-overlay').classList.remove('hidden');
  }
});

socket.on('playerList', (list) => {
  document.getElementById('lobby-count').textContent = list.length;
  if (isAdmin) {
    document.getElementById('admin-player-count').textContent = `Players: ${list.length}`;
  }
});

socket.on('gameState', (state) => {
  prevGs = gs;
  gs = state;
  lastStateTime = performance.now();

  // Pawn deaths → burst particles at last known position
  if (prevGs?.pawns) {
    const newPawnIds = new Set(state.pawns.map(p => p.id));
    for (const pawn of prevGs.pawns) {
      if (!newPawnIds.has(pawn.id)) spawnDeathParticles(pawn.x, pawn.y);
    }
  }

  // Projectile hits → hit-spark particles
  const newProjIds = new Set(state.projectiles.map(p => p.id));
  for (const [id, pos] of Object.entries(prevProjMap)) {
    if (!newProjIds.has(Number(id))) spawnHitParticles(pos.x, pos.y, pos.color);
  }
  prevProjMap = {};
  for (const p of state.projectiles) prevProjMap[p.id] = { x: p.x, y: p.y, color: p.color };

  // Player damage → screen shake + prediction reconcile
  const me = state.players[myId];
  if (me) {
    if (me.alive && me.hp < myPrevHp) addShake(7);
    myPrevHp = me.hp;
    if (me.alive) {
      if (!hasPrediction) {
        predictX = me.x; predictY = me.y; hasPrediction = true;
      } else if (Math.hypot(me.x - predictX, me.y - predictY) > 120) {
        // Large server drift — snap to authoritative position
        predictX = me.x; predictY = me.y;
      }
    } else {
      hasPrediction = false;
    }
  }

  if (state.phase === 'playing') {
    document.getElementById('waiting-overlay').classList.add('hidden');
  }
});

socket.on('gamePhase', (data) => {
  if (data.phase === 'playing') {
    document.getElementById('paused-overlay').classList.add('hidden');
    document.getElementById('waiting-overlay').classList.add('hidden');
  } else if (data.phase === 'paused') {
    document.getElementById('paused-overlay').classList.remove('hidden');
  } else if (data.phase === 'victory' || data.phase === 'gameover') {
    showEndScreen(data);
  } else if (data.phase === 'lobby') {
    showScreen('join');
    myId = null;
  }
});

socket.on('waveStart', (data) => {
  showWaveAnnouncement(data.message);
  if (isAdmin) {
    document.getElementById('admin-wave').textContent = `Wave: ${data.wave}`;
  }
});

socket.on('bossDefeated', () => {
  // Celebratory particles
  for (let i = 0; i < 50; i++) {
    localParticles.push({
      x: gameW / 2 + (Math.random() - 0.5) * 200,
      y: 200,
      vx: (Math.random() - 0.5) * 8,
      vy: -Math.random() * 6 - 2,
      life: 80 + Math.random() * 40,
      color: ['#ffd700', '#ff0080', '#00d4ff', '#00ff88'][Math.floor(Math.random() * 4)],
      size: 4 + Math.random() * 4
    });
  }
});

socket.on('playerDied', (data) => {
  showTrivia(data.triviaQuestion);
});

socket.on('respawned', (data) => {
  hideTrivia();
  if (data.goldenGun) {
    showGoldenGunEffect();
  }
});

socket.on('goldenGun', () => {
  showGoldenGunEffect();
});

socket.on('adminConfirmed', () => {
  isAdmin = true;
  document.getElementById('admin-panel').classList.remove('hidden');
  document.getElementById('admin-login').classList.add('hidden');
});

socket.on('fullReset', () => {
  myId = null;
  gs = null;
  prevGs = null;
  prevProjMap = {};
  hasPrediction = false;
  showScreen('join');
});

// ═══════════════════════════════════════════════
// JOIN SCREEN
// ═══════════════════════════════════════════════
document.getElementById('btn-to-customize').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  if (!name) {
    document.getElementById('player-name').style.borderColor = '#ff3b5c';
    document.getElementById('player-name').placeholder = 'Please enter a name!';
    return;
  }
  playerName = name;
  document.getElementById('hero-name-display').textContent = name;
  showScreen('customize');
  renderPreview();
});

document.getElementById('player-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-to-customize').click();
  document.getElementById('player-name').style.borderColor = '';
});

// Admin
document.getElementById('btn-admin-toggle').addEventListener('click', () => {
  document.getElementById('admin-login').classList.toggle('hidden');
});
document.getElementById('btn-admin-auth').addEventListener('click', () => {
  socket.emit('adminAuth', { password: document.getElementById('admin-password').value });
});

// Admin game controls
document.getElementById('btn-admin-start').addEventListener('click', () => socket.emit('adminStart'));
document.getElementById('btn-admin-pause').addEventListener('click', () => socket.emit('adminPause'));
document.getElementById('btn-admin-stop').addEventListener('click', () => socket.emit('adminStop'));
document.getElementById('btn-admin-reset').addEventListener('click', () => socket.emit('adminReset'));

// ═══════════════════════════════════════════════
// BLOCK CODING CUSTOMIZER
// ═══════════════════════════════════════════════
const BLOCK_DEFS = [
  // Body colors
  { id: 'body-blue', label: 'setBodyColor("blue")', category: 'body', action: () => { customization.bodyColor = '#00d4ff'; } },
  { id: 'body-red', label: 'setBodyColor("red")', category: 'body', action: () => { customization.bodyColor = '#ff3b5c'; } },
  { id: 'body-green', label: 'setBodyColor("green")', category: 'body', action: () => { customization.bodyColor = '#00ff88'; } },
  { id: 'body-purple', label: 'setBodyColor("purple")', category: 'body', action: () => { customization.bodyColor = '#a855f7'; } },
  { id: 'body-gold', label: 'setBodyColor("gold")', category: 'body', action: () => { customization.bodyColor = '#ffd700'; } },
  { id: 'body-pink', label: 'setBodyColor("pink")', category: 'body', action: () => { customization.bodyColor = '#ff69b4'; } },
  { id: 'body-orange', label: 'setBodyColor("orange")', category: 'body', action: () => { customization.bodyColor = '#ff6b35'; } },
  { id: 'body-white', label: 'setBodyColor("white")', category: 'body', action: () => { customization.bodyColor = '#e8e8f0'; } },
  // Hats
  { id: 'hat-wizard', label: 'setHat("wizard")', category: 'hat', action: () => { customization.hatType = 'wizard'; } },
  { id: 'hat-crown', label: 'setHat("crown")', category: 'hat', action: () => { customization.hatType = 'crown'; } },
  { id: 'hat-cap', label: 'setHat("cap")', category: 'hat', action: () => { customization.hatType = 'cap'; } },
  { id: 'hat-headband', label: 'setHat("headband")', category: 'hat', action: () => { customization.hatType = 'headband'; } },
  { id: 'hat-none', label: 'setHat("none")', category: 'hat', action: () => { customization.hatType = 'none'; } },
  { id: 'hat-color-purple', label: 'setHatColor("purple")', category: 'hat', action: () => { customization.hatColor = '#a855f7'; } },
  { id: 'hat-color-gold', label: 'setHatColor("gold")', category: 'hat', action: () => { customization.hatColor = '#ffd700'; } },
  { id: 'hat-color-red', label: 'setHatColor("red")', category: 'hat', action: () => { customization.hatColor = '#ff3b5c'; } },
  { id: 'hat-color-cyan', label: 'setHatColor("cyan")', category: 'hat', action: () => { customization.hatColor = '#00d4ff'; } },
  // Shirts
  { id: 'shirt-blue', label: 'setShirtColor("blue")', category: 'shirt', action: () => { customization.shirtColor = '#1e3a5f'; } },
  { id: 'shirt-red', label: 'setShirtColor("red")', category: 'shirt', action: () => { customization.shirtColor = '#5f1e1e'; } },
  { id: 'shirt-green', label: 'setShirtColor("green")', category: 'shirt', action: () => { customization.shirtColor = '#1e5f3a'; } },
  { id: 'shirt-purple', label: 'setShirtColor("purple")', category: 'shirt', action: () => { customization.shirtColor = '#3a1e5f'; } },
  { id: 'shirt-black', label: 'setShirtColor("black")', category: 'shirt', action: () => { customization.shirtColor = '#1a1a2e'; } },
  { id: 'shirt-white', label: 'setShirtColor("white")', category: 'shirt', action: () => { customization.shirtColor = '#c0c0d0'; } },
  // Shoes
  { id: 'shoes-orange', label: 'setShoesColor("orange")', category: 'shoes', action: () => { customization.shoesColor = '#ff6b35'; } },
  { id: 'shoes-black', label: 'setShoesColor("black")', category: 'shoes', action: () => { customization.shoesColor = '#2a2a3a'; } },
  { id: 'shoes-white', label: 'setShoesColor("white")', category: 'shoes', action: () => { customization.shoesColor = '#d0d0e0'; } },
  { id: 'shoes-red', label: 'setShoesColor("red")', category: 'shoes', action: () => { customization.shoesColor = '#ff3b5c'; } },
  { id: 'shoes-gold', label: 'setShoesColor("gold")', category: 'shoes', action: () => { customization.shoesColor = '#ffd700'; } },
];

let codeAreaBlocks = [];

function initCustomizer() {
  const palette = document.getElementById('block-palette-items');
  palette.innerHTML = '';

  for (const def of BLOCK_DEFS) {
    const el = document.createElement('div');
    el.className = `code-block cat-${def.category}`;
    el.textContent = def.label;
    el.draggable = true;
    el.dataset.blockId = def.id;

    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', def.id);
      el.style.opacity = '0.5';
    });
    el.addEventListener('dragend', () => { el.style.opacity = '1'; });

    // Click to add (mobile-friendly)
    el.addEventListener('click', () => {
      addBlockToCode(def.id);
    });

    palette.appendChild(el);
  }

  // Code area drop zone
  const codeArea = document.getElementById('code-area');
  codeArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    codeArea.classList.add('drag-over');
  });
  codeArea.addEventListener('dragleave', () => {
    codeArea.classList.remove('drag-over');
  });
  codeArea.addEventListener('drop', (e) => {
    e.preventDefault();
    codeArea.classList.remove('drag-over');
    const blockId = e.dataTransfer.getData('text/plain');
    addBlockToCode(blockId);
  });

  // Clear button
  document.getElementById('btn-clear-code').addEventListener('click', () => {
    codeAreaBlocks = [];
    customization = {
      bodyColor: '#00d4ff',
      hatType: 'none',
      hatColor: '#a855f7',
      shirtColor: '#1e3a5f',
      shoesColor: '#ff6b35'
    };
    renderCodeArea();
    renderPreview();
  });

  // Weapon list
  const weaponList = document.getElementById('weapon-list');
  weaponList.innerHTML = '';
  for (const [key, w] of Object.entries(WEAPONS)) {
    if (key === 'golden_wand') continue; // Can't select golden wand
    const card = document.createElement('div');
    card.className = `weapon-card${key === selectedWeapon ? ' selected' : ''}`;
    card.innerHTML = `
      <div class="weapon-dot" style="background:${w.projectileColor}; box-shadow: 0 0 8px ${w.projectileColor}"></div>
      <div class="weapon-info">
        <div class="weapon-name">${w.name}</div>
        <div class="weapon-desc">${w.description} | Spread: ${w.spread}</div>
      </div>
    `;
    card.addEventListener('click', () => {
      selectedWeapon = key;
      document.querySelectorAll('.weapon-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
    weaponList.appendChild(card);
  }

  // Join battle
  document.getElementById('btn-join-battle').addEventListener('click', () => {
    socket.emit('joinGame', {
      name: playerName,
      weapon: selectedWeapon,
      customization: customization
    });
  });
}

function addBlockToCode(blockId) {
  const def = BLOCK_DEFS.find(d => d.id === blockId);
  if (!def) return;
  codeAreaBlocks.push(def);
  def.action();
  renderCodeArea();
  renderPreview();
}

function renderCodeArea() {
  const codeArea = document.getElementById('code-area');
  const codeOutput = document.getElementById('code-output');

  if (codeAreaBlocks.length === 0) {
    codeArea.innerHTML = '<div class="code-placeholder">↓ Drag blocks here or click to add ↓</div>';
    codeOutput.textContent = '// Your code will appear here!\n// Click or drag blocks to customize your hero.';
    return;
  }

  codeArea.innerHTML = '';
  let codeText = '// My Hero Customization Code\n\n';

  codeAreaBlocks.forEach((def, i) => {
    const el = document.createElement('div');
    el.className = `code-block cat-${def.category}`;
    el.innerHTML = `${def.label} <button class="remove-block" title="Remove">×</button>`;
    el.querySelector('.remove-block').addEventListener('click', (e) => {
      e.stopPropagation();
      codeAreaBlocks.splice(i, 1);
      // Replay all actions
      customization = {
        bodyColor: '#00d4ff', hatType: 'none', hatColor: '#a855f7',
        shirtColor: '#1e3a5f', shoesColor: '#ff6b35'
      };
      codeAreaBlocks.forEach(b => b.action());
      renderCodeArea();
      renderPreview();
    });
    codeArea.appendChild(el);
    codeText += `hero.${def.label};\n`;
  });

  codeText += '\n// Run your code to see the hero!';
  codeOutput.textContent = codeText;
}

// ═══════════════════════════════════════════════
// CHARACTER PREVIEW
// ═══════════════════════════════════════════════
function renderPreview() {
  const c = document.getElementById('preview-canvas');
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);

  const cx = c.width / 2;
  const baseY = c.height - 30;

  drawCharacter(ctx, cx, baseY - 80, customization, 2.5, playerName);
}

function drawCharacter(ctx, x, y, cust, scale = 1, name = '') {
  const s = scale;
  ctx.save();
  ctx.translate(x, y);

  // Shoes
  ctx.fillStyle = cust.shoesColor;
  ctx.fillRect(-10 * s, 20 * s, 9 * s, 6 * s);
  ctx.fillRect(1 * s, 20 * s, 9 * s, 6 * s);

  // Legs
  ctx.fillStyle = '#3a3a55';
  ctx.fillRect(-8 * s, 10 * s, 7 * s, 12 * s);
  ctx.fillRect(1 * s, 10 * s, 7 * s, 12 * s);

  // Body
  ctx.fillStyle = cust.shirtColor;
  ctx.fillRect(-11 * s, -6 * s, 22 * s, 18 * s);

  // Arms
  ctx.fillStyle = cust.bodyColor;
  ctx.fillRect(-16 * s, -4 * s, 6 * s, 14 * s);
  ctx.fillRect(10 * s, -4 * s, 6 * s, 14 * s);

  // Head
  ctx.fillStyle = cust.bodyColor;
  ctx.beginPath();
  ctx.arc(0, -16 * s, 11 * s, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-4 * s, -17 * s, 2.5 * s, 0, Math.PI * 2);
  ctx.arc(4 * s, -17 * s, 2.5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(-3.5 * s, -17 * s, 1.4 * s, 0, Math.PI * 2);
  ctx.arc(4.5 * s, -17 * s, 1.4 * s, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = '#222';
  ctx.lineWidth = s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, -14 * s, 4 * s, 0.1, Math.PI - 0.1);
  ctx.stroke();

  // Hat
  drawHat(ctx, cust.hatType, cust.hatColor, s);

  // Name tag
  if (name && s < 2) {
    ctx.font = 'bold 9px Orbitron';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(name).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-tw / 2 - 4, -33 * s, tw + 8, 12);
    ctx.fillStyle = '#e8e8f0';
    ctx.fillText(name, 0, -33 * s + 9);
  }

  ctx.restore();
}

function drawHat(ctx, type, color, s) {
  ctx.fillStyle = color;
  switch (type) {
    case 'wizard':
      ctx.beginPath();
      ctx.moveTo(0, -36 * s);
      ctx.lineTo(-12 * s, -22 * s);
      ctx.lineTo(12 * s, -22 * s);
      ctx.closePath();
      ctx.fill();
      // Star on hat
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(0, -28 * s, 2 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'crown':
      ctx.beginPath();
      ctx.moveTo(-10 * s, -22 * s);
      ctx.lineTo(-10 * s, -30 * s);
      ctx.lineTo(-5 * s, -26 * s);
      ctx.lineTo(0, -32 * s);
      ctx.lineTo(5 * s, -26 * s);
      ctx.lineTo(10 * s, -30 * s);
      ctx.lineTo(10 * s, -22 * s);
      ctx.closePath();
      ctx.fill();
      break;
    case 'cap':
      ctx.beginPath();
      ctx.ellipse(0, -23 * s, 12 * s, 5 * s, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-14 * s, -24 * s, 20 * s, 3 * s);
      break;
    case 'headband':
      ctx.fillRect(-11 * s, -20 * s, 22 * s, 3 * s);
      // Knot
      ctx.fillRect(11 * s, -22 * s, 5 * s, 2 * s);
      ctx.fillRect(11 * s, -19 * s, 5 * s, 2 * s);
      break;
    default:
      break;
  }
}

// ═══════════════════════════════════════════════
// GAME CANVAS & LOOP
// ═══════════════════════════════════════════════
function initGameCanvas() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  scaleX = canvas.width / gameW;
  scaleY = canvas.height / gameH;
}

let lastFrameTime = 0;
let fps = 0;
let frameCount = 0;
let fpsTimer = 0;

function gameLoop(timestamp) {
  if (currentScreen !== 'game') return;

  frameDt = timestamp - lastFrameTime;
  const dt = frameDt;
  lastFrameTime = timestamp;

  frameCount++;
  fpsTimer += dt;
  if (fpsTimer >= 1000) {
    fps = frameCount;
    frameCount = 0;
    fpsTimer = 0;
  }

  // Send input
  sendInput();

  // Render
  render();

  // Update local particles
  updateLocalParticles();

  // Update HUD
  updateHUD();

  requestAnimationFrame(gameLoop);
}

function sendInput() {
  if (!myId) return;
  const canvasRect = canvas.getBoundingClientRect();
  const mx = (mouseX - canvasRect.left) / scaleX;
  const my = (mouseY - canvasRect.top) / scaleY;

  // Use predicted position for aim angle so crosshair feels accurate immediately
  const aimBaseX = hasPrediction ? predictX : (gs?.players?.[myId]?.x ?? 0);
  const aimBaseY = hasPrediction ? predictY : (gs?.players?.[myId]?.y ?? 0);
  const aimAngle = Math.atan2(my - aimBaseY, mx - aimBaseX);

  socket.volatile.emit('input', {
    w: keys.w, a: keys.a, s: keys.s, d: keys.d,
    shooting: mouseDown,
    aimAngle
  });

  // Client-side prediction: apply movement locally so it feels instant
  if (hasPrediction && gs?.players?.[myId]?.alive) {
    let dx = 0, dy = 0;
    if (keys.w) dy -= 1; if (keys.s) dy += 1;
    if (keys.a) dx -= 1; if (keys.d) dx += 1;
    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
    const spd = CONFIG.PLAYER_SPEED || 6;
    predictX = Math.max(CONFIG.PLAYER_RADIUS, Math.min(CONFIG.ARENA_W - CONFIG.PLAYER_RADIUS, predictX + dx * spd));
    predictY = Math.max(CONFIG.PLAYER_RADIUS, Math.min(CONFIG.ARENA_H - CONFIG.PLAYER_RADIUS, predictY + dy * spd));
  }
}

// ═══════════════════════════════════════════════
// SMOOTHNESS HELPERS
// ═══════════════════════════════════════════════
function lerp(a, b, t) { return a + (b - a) * t; }
function addShake(mag) { shakeMag = Math.max(shakeMag, mag); }

function spawnHitParticles(x, y, color) {
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 1.5 + Math.random() * 3;
    localParticles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      life: 18 + Math.random() * 12, color, size: 1.5 + Math.random() * 2 });
  }
}

function spawnDeathParticles(x, y) {
  const cols = ['#ff6b35', '#ffd700', '#ff3b5c'];
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 2 + Math.random() * 4;
    localParticles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      life: 30 + Math.random() * 20,
      color: cols[Math.floor(Math.random() * cols.length)],
      size: 2.5 + Math.random() * 3 });
  }
}

// ═══════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════
function render() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawBackground();

  // Screen shake decay
  shakeX = (Math.random() - 0.5) * shakeMag * 2;
  shakeY = (Math.random() - 0.5) * shakeMag * 2;
  shakeMag *= 0.82;

  ctx.save();
  ctx.translate(shakeX, shakeY);
  ctx.scale(scaleX, scaleY);

  if (gs) {
    // Frame-rate-independent smooth factor (~0.25 at 60 fps)
    const SMOOTH = 1 - Math.pow(0.75, frameDt / 16.67);

    // ── Advance smooth-follower positions ────────────────────
    // Pawns
    const livePawnIds = new Set();
    for (const pawn of gs.pawns) {
      livePawnIds.add(pawn.id);
      let dp = displayPos.pawns[pawn.id];
      if (!dp) { displayPos.pawns[pawn.id] = { x: pawn.x, y: pawn.y }; dp = displayPos.pawns[pawn.id]; }
      dp.x += (pawn.x - dp.x) * SMOOTH;
      dp.y += (pawn.y - dp.y) * SMOOTH;
    }
    for (const id of Object.keys(displayPos.pawns)) {
      if (!livePawnIds.has(Number(id))) delete displayPos.pawns[id];
    }

    // Boss
    if (gs.boss) {
      if (!displayPos.boss) { displayPos.boss = { x: gs.boss.x, y: gs.boss.y }; }
      else {
        displayPos.boss.x += (gs.boss.x - displayPos.boss.x) * SMOOTH;
        displayPos.boss.y += (gs.boss.y - displayPos.boss.y) * SMOOTH;
      }
    } else { displayPos.boss = null; }

    // Other players
    const livePlayerIds = new Set(Object.keys(gs.players));
    for (const [id, p] of Object.entries(gs.players)) {
      if (id === myId) continue;
      let dp = displayPos.players[id];
      if (!dp) { displayPos.players[id] = { x: p.x, y: p.y }; dp = displayPos.players[id]; }
      dp.x += (p.x - dp.x) * SMOOTH;
      dp.y += (p.y - dp.y) * SMOOTH;
    }
    for (const id of Object.keys(displayPos.players)) {
      if (!livePlayerIds.has(id)) delete displayPos.players[id];
    }

    // ── Draw arena ───────────────────────────────────────────
    ctx.strokeStyle = 'rgba(0,212,255,0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, gameW, gameH);
    ctx.strokeStyle = 'rgba(100,100,160,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < gameW; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, gameH); ctx.stroke();
    }
    for (let y = 0; y < gameH; y += 80) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(gameW, y); ctx.stroke();
    }

    // ── Draw entities using smooth positions ─────────────────
    for (const pawn of gs.pawns) {
      const dp = displayPos.pawns[pawn.id] || pawn;
      drawPawn(pawn, dp.x, dp.y);
    }

    if (gs.boss) {
      const db = displayPos.boss || gs.boss;
      drawBoss(gs.boss, db.x, db.y);
    }

    const now = performance.now();
    for (const proj of gs.projectiles) {
      drawProjectile(proj, now);
    }

    for (const [id, p] of Object.entries(gs.players)) {
      const dp = displayPos.players[id];
      const dx = (id === myId && hasPrediction) ? predictX : (dp ? dp.x : p.x);
      const dy = (id === myId && hasPrediction) ? predictY : (dp ? dp.y : p.y);
      if (p.alive) {
        drawPlayer(p, dx, dy, id === myId);
      } else {
        ctx.globalAlpha = 0.25;
        drawPlayer(p, dx, dy, id === myId);
        ctx.globalAlpha = 1;
      }
    }

    // Local particles
    for (const p of localParticles) {
      ctx.globalAlpha = Math.max(0, p.life / 80);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '10px Fira Code';
  ctx.textAlign = 'right';
  ctx.fillText(`${fps} FPS`, canvas.width - 8, 14);
}

function drawBackground() {
  // Dark gradient
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#080818');
  grad.addColorStop(0.5, '#0e0e24');
  grad.addColorStop(1, '#0a0a1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Stars
  const time = Date.now() * 0.001;
  for (const star of stars) {
    const alpha = 0.3 + 0.3 * Math.sin(time + star.a * 10);
    ctx.fillStyle = `rgba(200,200,255,${alpha})`;
    ctx.fillRect(star.x * scaleX, star.y * scaleY, star.s, star.s);
  }
}

function drawPlayer(p, x, y, isMe) {
  const cust = p.customization || customization;
  drawCharacter(ctx, x, y, cust, 1, p.name);

  // HP bar
  if (p.alive) {
    const bw = 30, bh = 4;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - bw / 2, y - 32, bw, bh);
    const hpPct = Math.max(0, p.hp / (p.maxHP || 100));
    ctx.fillStyle = hpPct > 0.5 ? '#00ff88' : hpPct > 0.25 ? '#ffd700' : '#ff3b5c';
    ctx.fillRect(x - bw / 2, y - 32, bw * hpPct, bh);
  }

  // Golden gun indicator
  if (p.hasGoldenGun) {
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.stroke();
  }

  // "You" indicator
  if (isMe && p.alive) {
    ctx.fillStyle = '#00d4ff';
    ctx.beginPath();
    ctx.moveTo(x, y - 40);
    ctx.lineTo(x - 4, y - 46);
    ctx.lineTo(x + 4, y - 46);
    ctx.closePath();
    ctx.fill();
  }
}

function drawPawn(pawn, x, y) {
  ctx.save();
  ctx.translate(x, y);

  // Body — no shadowBlur (expensive, removed for perf)
  ctx.fillStyle = '#2a1a3a';
  ctx.strokeStyle = '#ff6b35';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, pawn.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Symbol based on type (use pawn.id for stable symbol)
  ctx.fillStyle = '#ff6b35';
  ctx.font = `bold ${pawn.radius}px Orbitron`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  switch (pawn.type) {
    case 'number':
      ctx.fillText(String(pawn.id % 10), 0, 1);
      break;
    case 'operator':
      ctx.fillText(['+', '−', '×', '÷'][pawn.id % 4], 0, 1);
      break;
    case 'bracket':
      ctx.fillText(['(', ')'][pawn.id % 2], 0, 1);
      break;
    case 'binary':
      ctx.fillText(['0', '1'][pawn.id % 2], 0, 1);
      break;
  }

  // HP bar
  const hpPct = pawn.hp / pawn.maxHP;
  if (hpPct < 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-pawn.radius, -pawn.radius - 6, pawn.radius * 2, 3);
    ctx.fillStyle = '#ff6b35';
    ctx.fillRect(-pawn.radius, -pawn.radius - 6, pawn.radius * 2 * hpPct, 3);
  }

  ctx.restore();
}

function drawBoss(boss, x, y) {
  ctx.save();
  ctx.translate(x, y);

  const time = Date.now() * 0.002;
  const r = boss.radius;

  // Shield
  if (boss.shieldActive) {
    ctx.strokeStyle = 'rgba(0,212,255,0.6)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Glow
  ctx.shadowColor = '#ff0080';
  ctx.shadowBlur = 30;

  // Main body - PI SYMBOL
  ctx.fillStyle = '#1a0a2a';
  ctx.strokeStyle = '#ff0080';
  ctx.lineWidth = 4;

  // Draw Pi shape
  const piScale = r / 40;

  // Top bar of Pi
  ctx.beginPath();
  ctx.moveTo(-30 * piScale, -25 * piScale);
  ctx.lineTo(30 * piScale, -25 * piScale);
  ctx.lineWidth = 8 * piScale;
  ctx.stroke();

  // Left leg
  ctx.lineWidth = 6 * piScale;
  ctx.beginPath();
  ctx.moveTo(-15 * piScale, -25 * piScale);
  ctx.lineTo(-15 * piScale, 25 * piScale);
  ctx.stroke();

  // Right leg (curved)
  ctx.beginPath();
  ctx.moveTo(15 * piScale, -25 * piScale);
  ctx.quadraticCurveTo(15 * piScale, 15 * piScale, 8 * piScale, 25 * piScale);
  ctx.stroke();

  ctx.shadowBlur = 0;

  // Face on Pi
  ctx.fillStyle = '#ff0080';
  // Eyes
  ctx.beginPath();
  ctx.arc(-8 * piScale, -10 * piScale, 4 * piScale, 0, Math.PI * 2);
  ctx.arc(8 * piScale, -10 * piScale, 4 * piScale, 0, Math.PI * 2);
  ctx.fill();
  // Angry eyebrows
  ctx.strokeStyle = '#ff0080';
  ctx.lineWidth = 2 * piScale;
  ctx.beginPath();
  ctx.moveTo(-14 * piScale, -18 * piScale);
  ctx.lineTo(-4 * piScale, -15 * piScale);
  ctx.moveTo(14 * piScale, -18 * piScale);
  ctx.lineTo(4 * piScale, -15 * piScale);
  ctx.stroke();
  // Evil grin
  ctx.beginPath();
  ctx.arc(0, 0, 8 * piScale, 0.2, Math.PI - 0.2);
  ctx.stroke();

  // Floating pi digits
  ctx.fillStyle = 'rgba(255,0,128,0.3)';
  ctx.font = `${10 * piScale}px Fira Code`;
  ctx.textAlign = 'center';
  const digits = '3.14159265';
  for (let i = 0; i < digits.length; i++) {
    const a = time + (i / digits.length) * Math.PI * 2;
    const dx = Math.cos(a) * (r + 25);
    const dy = Math.sin(a) * (r + 25);
    ctx.fillText(digits[i], dx, dy);
  }

  // HP bar below boss (only if not full)
  const hpPct = boss.hp / boss.maxHP;
  if (hpPct < 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-50, r + 10, 100, 8);
    ctx.fillStyle = hpPct > 0.5 ? '#ff0080' : hpPct > 0.25 ? '#ffd700' : '#ff3b5c';
    ctx.fillRect(-50, r + 10, 100 * hpPct, 8);
  }

  ctx.restore();
}

function drawProjectile(proj, now) {
  // Extrapolate position between server ticks using velocity
  const dt = now !== undefined ? (now - lastStateTime) / (1000 / 60) : 0;
  const ex = proj.x + (proj.vx || 0) * dt;
  const ey = proj.y + (proj.vy || 0) * dt;
  const isBoss = proj.owner === 'boss';
  const spd = Math.hypot(proj.vx || 0, proj.vy || 0) || 1;
  const trailLen = isBoss ? 28 : 20;

  ctx.save();

  // Glowing trail behind the bullet
  const tx = ex - (proj.vx || 0) / spd * trailLen;
  const ty = ey - (proj.vy || 0) / spd * trailLen;
  ctx.lineCap = 'round';
  ctx.lineWidth = isBoss ? 4 : 3;
  ctx.strokeStyle = proj.color;
  ctx.globalAlpha = 0.35;
  ctx.shadowColor = proj.color;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Bullet head
  ctx.fillStyle = proj.color;
  ctx.shadowColor = proj.color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(ex, ey, isBoss ? 5 : 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();
}

function updateLocalParticles() {
  for (let i = localParticles.length - 1; i >= 0; i--) {
    const p = localParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1; // gravity
    p.life--;
    if (p.life <= 0) localParticles.splice(i, 1);
  }
}

// ═══════════════════════════════════════════════
// HUD UPDATES
// ═══════════════════════════════════════════════
function updateHUD() {
  if (!gs || !myId) return;

  const me = gs.players[myId];
  if (me) {
    // HP
    const hpPct = Math.max(0, me.hp / me.maxHP) * 100;
    document.getElementById('hp-fill').style.width = hpPct + '%';
    document.getElementById('hp-text').textContent = Math.max(0, Math.ceil(me.hp));

    // Weapon
    const wName = WEAPONS[me.weapon]?.name || me.weapon;
    document.getElementById('hud-weapon').textContent = wName;
    document.getElementById('hud-weapon').style.color = WEAPONS[me.weapon]?.projectileColor || '#a855f7';

    // Damage
    document.getElementById('hud-damage-value').textContent = Math.floor(me.totalDamage);

    // Streak
    const streakEl = document.getElementById('hud-streak');
    if (me.triviaStreak > 0) {
      streakEl.textContent = `🔥 Streak: ${me.triviaStreak}`;
    } else {
      streakEl.textContent = '';
    }
  }

  // Wave
  document.getElementById('hud-wave').textContent = `Wave ${gs.wave}`;

  // Timer
  if (gs.elapsedTime) {
    const secs = Math.floor(gs.elapsedTime / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    document.getElementById('hud-timer').textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  // Wave announcement
  const announceEl = document.getElementById('wave-announce');
  if (gs.waveMessage) {
    announceEl.textContent = gs.waveMessage;
    announceEl.classList.remove('hidden');
  } else {
    announceEl.classList.add('hidden');
  }

  // Boss HP
  const bossBar = document.getElementById('boss-hp-bar');
  if (gs.boss) {
    bossBar.classList.remove('hidden');
    const pct = Math.max(0, gs.boss.hp / gs.boss.maxHP) * 100;
    document.getElementById('boss-hp-fill').style.width = pct + '%';
    document.getElementById('boss-hp-text').textContent = `${Math.ceil(gs.boss.hp)} / ${gs.boss.maxHP}`;
    document.getElementById('boss-hp-bar').querySelector('.boss-hp-label').textContent =
      gs.boss.isMini ? '🥧 MINI PI' : '👑 THE MIGHTY PI';
  } else {
    bossBar.classList.add('hidden');
  }

  // Leaderboard
  if (showLeaderboard && gs.leaderboard) {
    const lbList = document.getElementById('leaderboard-list');
    lbList.innerHTML = '';
    gs.leaderboard.forEach((entry, i) => {
      const row = document.createElement('div');
      row.className = 'lb-row';
      const medals = ['🥇', '🥈', '🥉'];
      row.innerHTML = `
        <span class="lb-rank">${medals[i] || (i + 1)}</span>
        <span class="lb-name">${escHtml(entry.name)}</span>
        <span class="lb-dmg">${Math.floor(entry.damage)}</span>
      `;
      lbList.appendChild(row);
    });
  }

  // Admin info
  if (isAdmin) {
    document.getElementById('admin-player-count').textContent =
      `Players: ${Object.keys(gs.players).length}`;
    document.getElementById('admin-wave').textContent = `Wave: ${gs.wave}`;
  }
}

// ═══════════════════════════════════════════════
// TRIVIA
// ═══════════════════════════════════════════════
let currentTrivia = null;

function showTrivia(trivia) {
  currentTrivia = trivia;
  const overlay = document.getElementById('trivia-overlay');
  overlay.classList.remove('hidden');

  document.getElementById('trivia-question').textContent = trivia.q;
  document.getElementById('trivia-feedback').classList.add('hidden');

  const me = gs?.players?.[myId];
  const streak = me ? (me.triviaStreak || 0) : 0;
  const streakEl = document.getElementById('trivia-streak-display');
  if (streak > 0) {
    streakEl.textContent = `🔥 Streak: ${streak} | ${streak >= 10 ? '✨ Golden Gun chance active!' : `${10 - streak} more for Golden Gun chance!`}`;
  } else {
    streakEl.textContent = 'Answer 10 in a row for a chance at the Golden Wand!';
  }

  const choicesEl = document.getElementById('trivia-choices');
  choicesEl.innerHTML = '';
  trivia.choices.forEach((choice, i) => {
    const btn = document.createElement('button');
    btn.className = 'trivia-choice';
    btn.textContent = choice;
    btn.addEventListener('click', () => handleTriviaAnswer(i, trivia));
    choicesEl.appendChild(btn);
  });
}

function handleTriviaAnswer(choiceIndex, trivia) {
  const isCorrect = choiceIndex === trivia.answer;
  const buttons = document.querySelectorAll('.trivia-choice');

  // Disable all buttons
  buttons.forEach((btn, i) => {
    btn.style.pointerEvents = 'none';
    if (i === trivia.answer) btn.classList.add('correct');
    if (i === choiceIndex && !isCorrect) btn.classList.add('incorrect');
  });

  // Show feedback
  const feedbackEl = document.getElementById('trivia-feedback');
  feedbackEl.classList.remove('hidden', 'correct-fb', 'incorrect-fb');

  if (isCorrect) {
    feedbackEl.classList.add('correct-fb');
    feedbackEl.textContent = '✅ Correct! Respawning...';
  } else {
    feedbackEl.classList.add('incorrect-fb');
    feedbackEl.textContent = `❌ ${trivia.explanation}`;
  }

  // Send answer to server after brief delay
  setTimeout(() => {
    socket.emit('triviaAnswer', { correct: isCorrect });
    if (!isCorrect) {
      // Server will send a new question via playerDied
    }
  }, isCorrect ? 1200 : 2500);
}

function hideTrivia() {
  document.getElementById('trivia-overlay').classList.add('hidden');
}

// ═══════════════════════════════════════════════
// END SCREEN
// ═══════════════════════════════════════════════
function showEndScreen(data) {
  showScreen('end');

  const isVictory = data.phase === 'victory';
  document.getElementById('end-title').textContent = isVictory ? '🎉 Victory! 🎉' : '🏁 Game Over! 🏁';
  document.getElementById('end-subtitle').textContent = isVictory
    ? 'Pi has been defeated! Great job, heroes!'
    : 'The battle is over! Here are the results:';

  const lb = data.leaderboard || [];
  const listEl = document.getElementById('final-leaderboard-list');
  listEl.innerHTML = '';

  const medals = ['🥇', '🥈', '🥉'];
  lb.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'final-lb-row';
    row.innerHTML = `
      <span class="final-lb-rank">${medals[i] || `#${i + 1}`}</span>
      <span class="final-lb-name">${escHtml(entry.name)}</span>
      <span class="final-lb-dmg">${Math.floor(entry.damage)} DMG</span>
    `;
    listEl.appendChild(row);
  });

  // Stats
  const totalDmg = lb.reduce((s, e) => s + e.damage, 0);
  document.getElementById('end-total-damage').textContent = Math.floor(totalDmg);
  document.getElementById('end-players').textContent = lb.length;

  if (gs && gs.elapsedTime) {
    const secs = Math.floor(gs.elapsedTime / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    document.getElementById('end-time').textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  // Confetti!
  if (isVictory) spawnConfetti();
}

function spawnConfetti() {
  const colors = ['#ffd700', '#ff0080', '#00d4ff', '#00ff88', '#a855f7', '#ff6b35'];
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = (2 + Math.random() * 3) + 's';
    piece.style.animationDelay = Math.random() * 2 + 's';
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    if (Math.random() > 0.5) {
      piece.style.borderRadius = '50%';
    }
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 6000);
  }
}

function showGoldenGunEffect() {
  const flash = document.createElement('div');
  flash.className = 'golden-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1500);
}

function showWaveAnnouncement(msg) {
  const el = document.getElementById('wave-announce');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = '';
}

// ═══════════════════════════════════════════════
// INPUT HANDLERS
// ═══════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'w' || key === 'arrowup') keys.w = true;
  if (key === 'a' || key === 'arrowleft') keys.a = true;
  if (key === 's' || key === 'arrowdown') keys.s = true;
  if (key === 'd' || key === 'arrowright') keys.d = true;
  if (key === 'tab') {
    e.preventDefault();
    showLeaderboard = !showLeaderboard;
    document.getElementById('leaderboard-sidebar').classList.toggle('hidden', !showLeaderboard);
  }
});

document.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'w' || key === 'arrowup') keys.w = false;
  if (key === 'a' || key === 'arrowleft') keys.a = false;
  if (key === 's' || key === 'arrowdown') keys.s = false;
  if (key === 'd' || key === 'arrowright') keys.d = false;
});

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

document.addEventListener('mousedown', (e) => {
  if (e.button === 0 && currentScreen === 'game') {
    mouseDown = true;
  }
});

document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
});

// Prevent context menu in game
document.addEventListener('contextmenu', (e) => {
  if (currentScreen === 'game') e.preventDefault();
});

// Leaderboard button
document.getElementById('btn-show-leaderboard').addEventListener('click', () => {
  showLeaderboard = !showLeaderboard;
  document.getElementById('leaderboard-sidebar').classList.toggle('hidden', !showLeaderboard);
});

// ═══════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ═══════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════
console.log('%c🥧 Pi Battle Arena v1.0', 'font-size:20px; color:#00d4ff; font-weight:bold;');
console.log('%cEdVenture Pi Day 2026 — Made by Ty Bennett', 'font-size:12px; color:#9090b0;');
