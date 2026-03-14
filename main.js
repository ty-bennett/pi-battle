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
let customization = {
  shipBody:    'fighter',
  shipColor:   '#00d4ff',
  accentColor: '#ff3b5c',
  pattern:     'plain',
  engineColor: '#ffd700'
};

// Game state (from server)
let gs = null;

// Input
const keys = { w: false, a: false, s: false, d: false };
let mouseX = 0, mouseY = 0;
let mouseDown = false;
let lastAimAngle = 0;

// Canvas & rendering
let canvas, ctx;
let gameW, gameH;
let scaleX = 1, scaleY = 1;
let cameraX = 0, cameraY = 0;

// Particles (client-side only for effects)
let localParticles = [];

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

// Upgrade tracking
let myUpgradePoints = 0;
let myUpgrades = { damage: 0, fireRate: 0, multiShot: 0, speed: 0 };

// Stars background
let stars = [];
for (let i = 0; i < 120; i++) {
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

  setTimeout(() => {
    showScreen('join');
    initCustomizer();
  }, 2200);
});

socket.on('joined', (data) => {
  myId = data.id;
  showScreen('game');
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

  // Pawn deaths → burst particles
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
      } else {
        const drift = Math.hypot(me.x - predictX, me.y - predictY);
        if (drift > 150) {
          predictX = me.x; predictY = me.y;
        } else {
          predictX += (me.x - predictX) * 0.15;
          predictY += (me.y - predictY) * 0.15;
        }
      }
    } else {
      hasPrediction = false;
    }

    // Sync upgrade data from state
    if (me.upgradePoints !== undefined) myUpgradePoints = me.upgradePoints;
    if (me.upgrades) myUpgrades = me.upgrades;
    // Refresh panel in case it opened before points arrived
    const upgradePanel = document.getElementById('upgrade-panel');
    if (upgradePanel && !upgradePanel.classList.contains('hidden')) {
      updateUpgradePanel();
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
  // Hide upgrade panel when next wave starts
  document.getElementById('upgrade-panel').classList.add('hidden');
});

socket.on('bossDefeated', () => {
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
  if (data.goldenGun) showGoldenGunEffect();
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

socket.on('upgradeAvailable', () => {
  document.getElementById('upgrade-panel').classList.remove('hidden');
  updateUpgradePanel();
});

socket.on('upgradeConfirmed', (data) => {
  myUpgradePoints = data.points;
  myUpgrades = data.upgrades;
  updateUpgradePanel();
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

document.getElementById('btn-admin-toggle').addEventListener('click', () => {
  document.getElementById('admin-login').classList.toggle('hidden');
});
document.getElementById('btn-admin-auth').addEventListener('click', () => {
  socket.emit('adminAuth', { password: document.getElementById('admin-password').value });
});

document.getElementById('btn-admin-start').addEventListener('click', () => socket.emit('adminStart'));
document.getElementById('btn-admin-pause').addEventListener('click', () => socket.emit('adminPause'));
document.getElementById('btn-admin-stop').addEventListener('click', () => socket.emit('adminStop'));
document.getElementById('btn-admin-reset').addEventListener('click', () => socket.emit('adminReset'));

// ═══════════════════════════════════════════════
// BLOCK CODING CUSTOMIZER
// ═══════════════════════════════════════════════
const BLOCK_DEFS = [
  // Ship body
  { id: 'body-fighter', label: 'setBody("fighter")', display: '🚀 Fighter Ship',  category: 'body', action: () => { customization.shipBody = 'fighter'; } },
  { id: 'body-bomber',  label: 'setBody("bomber")',  display: '💣 Bomber Ship',   category: 'body', action: () => { customization.shipBody = 'bomber'; } },
  { id: 'body-scout',   label: 'setBody("scout")',   display: '⚡ Scout Ship',    category: 'body', action: () => { customization.shipBody = 'scout'; } },
  { id: 'body-cruiser', label: 'setBody("cruiser")', display: '🛸 Cruiser Ship',  category: 'body', action: () => { customization.shipBody = 'cruiser'; } },
  // Hull color
  { id: 'color-cyan',   label: 'setColor("cyan")',   display: 'hull <span class="bsw" style="background:#00d4ff"></span> cyan',   category: 'shipColor', action: () => { customization.shipColor = '#00d4ff'; } },
  { id: 'color-red',    label: 'setColor("red")',    display: 'hull <span class="bsw" style="background:#ff3b5c"></span> red',    category: 'shipColor', action: () => { customization.shipColor = '#ff3b5c'; } },
  { id: 'color-green',  label: 'setColor("green")',  display: 'hull <span class="bsw" style="background:#00ff88"></span> green',  category: 'shipColor', action: () => { customization.shipColor = '#00ff88'; } },
  { id: 'color-purple', label: 'setColor("purple")', display: 'hull <span class="bsw" style="background:#a855f7"></span> purple', category: 'shipColor', action: () => { customization.shipColor = '#a855f7'; } },
  { id: 'color-gold',   label: 'setColor("gold")',   display: 'hull <span class="bsw" style="background:#ffd700"></span> gold',   category: 'shipColor', action: () => { customization.shipColor = '#ffd700'; } },
  { id: 'color-white',  label: 'setColor("white")',  display: 'hull <span class="bsw" style="background:#dde0f0"></span> white',  category: 'shipColor', action: () => { customization.shipColor = '#dde0f0'; } },
  { id: 'color-orange', label: 'setColor("orange")', display: 'hull <span class="bsw" style="background:#ff6b35"></span> orange', category: 'shipColor', action: () => { customization.shipColor = '#ff6b35'; } },
  // Accent color
  { id: 'accent-red',    label: 'setAccent("red")',    display: 'accent <span class="bsw" style="background:#ff3b5c"></span> red',    category: 'accentColor', action: () => { customization.accentColor = '#ff3b5c'; } },
  { id: 'accent-cyan',   label: 'setAccent("cyan")',   display: 'accent <span class="bsw" style="background:#00d4ff"></span> cyan',   category: 'accentColor', action: () => { customization.accentColor = '#00d4ff'; } },
  { id: 'accent-gold',   label: 'setAccent("gold")',   display: 'accent <span class="bsw" style="background:#ffd700"></span> gold',   category: 'accentColor', action: () => { customization.accentColor = '#ffd700'; } },
  { id: 'accent-green',  label: 'setAccent("green")',  display: 'accent <span class="bsw" style="background:#00ff88"></span> green',  category: 'accentColor', action: () => { customization.accentColor = '#00ff88'; } },
  { id: 'accent-purple', label: 'setAccent("purple")', display: 'accent <span class="bsw" style="background:#a855f7"></span> purple', category: 'accentColor', action: () => { customization.accentColor = '#a855f7'; } },
  { id: 'accent-orange', label: 'setAccent("orange")', display: 'accent <span class="bsw" style="background:#ff6b35"></span> orange', category: 'accentColor', action: () => { customization.accentColor = '#ff6b35'; } },
  // Pattern
  { id: 'pattern-plain',   label: 'setPattern("plain")',   display: '▪ plain',    category: 'pattern', action: () => { customization.pattern = 'plain'; } },
  { id: 'pattern-stripes', label: 'setPattern("stripes")', display: '☰ stripes',  category: 'pattern', action: () => { customization.pattern = 'stripes'; } },
  { id: 'pattern-chevron', label: 'setPattern("chevron")', display: '⋀ chevron',  category: 'pattern', action: () => { customization.pattern = 'chevron'; } },
  { id: 'pattern-dots',    label: 'setPattern("dots")',    display: '⬤ dots',     category: 'pattern', action: () => { customization.pattern = 'dots'; } },
  // Engine glow
  { id: 'engine-blue',   label: 'setEngine("blue")',   display: 'engine <span class="bsw" style="background:#00d4ff"></span> blue',   category: 'engineColor', action: () => { customization.engineColor = '#00d4ff'; } },
  { id: 'engine-orange', label: 'setEngine("orange")', display: 'engine <span class="bsw" style="background:#ff6b35"></span> orange', category: 'engineColor', action: () => { customization.engineColor = '#ff6b35'; } },
  { id: 'engine-purple', label: 'setEngine("purple")', display: 'engine <span class="bsw" style="background:#a855f7"></span> purple', category: 'engineColor', action: () => { customization.engineColor = '#a855f7'; } },
  { id: 'engine-green',  label: 'setEngine("green")',  display: 'engine <span class="bsw" style="background:#00ff88"></span> green',  category: 'engineColor', action: () => { customization.engineColor = '#00ff88'; } },
  { id: 'engine-gold',   label: 'setEngine("gold")',   display: 'engine <span class="bsw" style="background:#ffd700"></span> gold',   category: 'engineColor', action: () => { customization.engineColor = '#ffd700'; } },
  { id: 'engine-red',    label: 'setEngine("red")',    display: 'engine <span class="bsw" style="background:#ff3b5c"></span> red',    category: 'engineColor', action: () => { customization.engineColor = '#ff3b5c'; } },
];

let codeAreaBlocks = [];

const CATEGORY_LABELS = {
  body:        '🚀 Ship Body',
  shipColor:   '🎨 Hull Color',
  accentColor: '✨ Accent Color',
  pattern:     '🔷 Pattern',
  engineColor: '🔥 Engine Glow'
};

const DEFAULT_CUST = () => ({
  shipBody: 'fighter', shipColor: '#00d4ff',
  accentColor: '#ff3b5c', pattern: 'plain', engineColor: '#ffd700'
});

function initCustomizer() {
  const palette = document.getElementById('block-palette-items');
  palette.innerHTML = '';

  const categories = ['body', 'shipColor', 'accentColor', 'pattern', 'engineColor'];
  for (const cat of categories) {
    const defs = BLOCK_DEFS.filter(d => d.category === cat);
    if (!defs.length) continue;

    const header = document.createElement('div');
    header.className = 'palette-section-header';
    header.textContent = CATEGORY_LABELS[cat] || cat;
    palette.appendChild(header);

    const group = document.createElement('div');
    group.className = 'palette-section-group';
    for (const def of defs) {
      const el = document.createElement('div');
      el.className = `code-block cat-${def.category}`;
      el.innerHTML = def.display;
      el.draggable = true;
      el.dataset.blockId = def.id;

      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', def.id);
        el.style.opacity = '0.5';
      });
      el.addEventListener('dragend', () => { el.style.opacity = '1'; });
      el.addEventListener('click', () => { addBlockToCode(def.id); });

      group.appendChild(el);
    }
    palette.appendChild(group);
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
    customization = DEFAULT_CUST();
    renderCodeArea();
    renderPreview();
  });

  // Join battle
  document.getElementById('btn-join-battle').addEventListener('click', () => {
    socket.emit('joinGame', {
      name: playerName,
      customization: customization
    });
  });

  // Upgrade buttons
  document.querySelectorAll('.upgrade-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      socket.emit('applyUpgrade', btn.dataset.type);
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
    codeArea.innerHTML = '<div class="code-placeholder">↓ Click blocks to add them ↓</div>';
    codeOutput.textContent = '// Your code will appear here!\n// Click blocks to customize your ship.';
    return;
  }

  codeArea.innerHTML = '';
  let codeText = '// My Ship Customization Code\n\n';

  codeAreaBlocks.forEach((def, i) => {
    const el = document.createElement('div');
    el.className = `code-block cat-${def.category}`;
    el.style.zIndex = codeAreaBlocks.length - i;
    el.innerHTML = `<span class="block-label">${def.display}</span><button class="remove-block" title="Remove">×</button>`;
    el.querySelector('.remove-block').addEventListener('click', (e) => {
      e.stopPropagation();
      codeAreaBlocks.splice(i, 1);
      customization = DEFAULT_CUST();
      codeAreaBlocks.forEach(b => b.action());
      renderCodeArea();
      renderPreview();
    });
    codeArea.appendChild(el);
    codeText += `ship.${def.label};\n`;
  });

  codeText += '\n// Launch your ship!';
  codeOutput.textContent = codeText;
}

function updateUpgradePanel() {
  const panel = document.getElementById('upgrade-panel');
  if (!panel) return;
  document.getElementById('upgrade-points-display').textContent = `Points: ${myUpgradePoints}`;
  const maxLevels = { damage: 5, fireRate: 5, multiShot: 3, speed: 3 };
  panel.querySelectorAll('.upgrade-btn').forEach(btn => {
    const type = btn.dataset.type;
    const level = myUpgrades[type] || 0;
    const max = maxLevels[type];
    btn.disabled = myUpgradePoints < 1 || level >= max;
    btn.querySelector('span').textContent = `Level ${level}/${max}`;
  });
}

// ═══════════════════════════════════════════════
// SHIP PREVIEW
// ═══════════════════════════════════════════════
function renderPreview() {
  const c = document.getElementById('preview-canvas');
  const pctx = c.getContext('2d');
  pctx.clearRect(0, 0, c.width, c.height);
  // Dark bg
  pctx.fillStyle = '#0a0a1a';
  pctx.fillRect(0, 0, c.width, c.height);
  drawSpaceship(pctx, c.width / 2, c.height / 2, customization, 2.5, -Math.PI / 2);
}

// ═══════════════════════════════════════════════
// SPACESHIP RENDERING
// ═══════════════════════════════════════════════
function drawSpaceship(ctx, x, y, cust, scale, aimAngle) {
  if (scale === undefined) scale = 1;
  if (aimAngle === undefined) aimAngle = -Math.PI / 2;
  const s = scale;
  const body = cust.shipBody || 'fighter';
  const hull = cust.shipColor || '#00d4ff';
  const accent = cust.accentColor || '#ff3b5c';
  const pattern = cust.pattern || 'plain';
  const engColor = cust.engineColor || '#ffd700';

  ctx.save();
  ctx.translate(x, y);
  // Ship is drawn pointing up (-y), rotate so nose faces aimAngle direction
  ctx.rotate(aimAngle + Math.PI / 2);

  switch (body) {
    case 'bomber':  drawBomber(ctx, s, hull, accent, pattern, engColor); break;
    case 'scout':   drawScout(ctx, s, hull, accent, pattern, engColor); break;
    case 'cruiser': drawCruiser(ctx, s, hull, accent, pattern, engColor); break;
    default:        drawFighter(ctx, s, hull, accent, pattern, engColor);
  }

  ctx.restore();
}

function drawFighter(ctx, s, hull, accent, pattern, engColor) {
  // Main hull — narrow elongated wedge pointing up
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(0, -22 * s);       // nose tip
  ctx.lineTo(8 * s, -2 * s);   // right mid
  ctx.lineTo(7 * s, 12 * s);   // right rear
  ctx.lineTo(0, 9 * s);        // center rear notch
  ctx.lineTo(-7 * s, 12 * s);  // left rear
  ctx.lineTo(-8 * s, -2 * s);  // left mid
  ctx.closePath();
  ctx.fill();

  // Swept wings
  ctx.globalAlpha = 0.82;
  ctx.beginPath(); // left wing
  ctx.moveTo(-7 * s, 3 * s);
  ctx.lineTo(-22 * s, 12 * s);
  ctx.lineTo(-14 * s, 16 * s);
  ctx.lineTo(-7 * s, 10 * s);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); // right wing
  ctx.moveTo(7 * s, 3 * s);
  ctx.lineTo(22 * s, 12 * s);
  ctx.lineTo(14 * s, 16 * s);
  ctx.lineTo(7 * s, 10 * s);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Center spine highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = s;
  ctx.beginPath();
  ctx.moveTo(0, -20 * s);
  ctx.lineTo(0, 8 * s);
  ctx.stroke();

  // Cockpit window
  ctx.fillStyle = 'rgba(150,230,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(0, -10 * s, 3 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pattern overlay
  applyPattern(ctx, s, accent, pattern);

  // Twin engines at rear
  drawEngines(ctx, s, engColor, [[-4 * s, 12 * s], [4 * s, 12 * s]], 3, 4);
}

function drawBomber(ctx, s, hull, accent, pattern, engColor) {
  // Wide rounded heavy hull
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.ellipse(0, -2 * s, 15 * s, 20 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Broad wings
  ctx.globalAlpha = 0.78;
  ctx.beginPath(); // left
  ctx.moveTo(-13 * s, -4 * s);
  ctx.lineTo(-32 * s, 6 * s);
  ctx.lineTo(-28 * s, 16 * s);
  ctx.lineTo(-13 * s, 10 * s);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); // right
  ctx.moveTo(13 * s, -4 * s);
  ctx.lineTo(32 * s, 6 * s);
  ctx.lineTo(28 * s, 16 * s);
  ctx.lineTo(13 * s, 10 * s);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Cockpit dome
  ctx.fillStyle = 'rgba(150,230,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, -12 * s, 5 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  applyPattern(ctx, s, accent, pattern);

  // 4 engine nozzles
  drawEngines(ctx, s, engColor, [[-9 * s, 18 * s], [-3 * s, 19 * s], [3 * s, 19 * s], [9 * s, 18 * s]], 3, 4);
}

function drawScout(ctx, s, hull, accent, pattern, engColor) {
  // Small sleek oval
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.ellipse(0, -2 * s, 7 * s, 17 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Thin swept wings
  ctx.globalAlpha = 0.75;
  ctx.beginPath(); // left
  ctx.moveTo(-5 * s, 4 * s);
  ctx.lineTo(-20 * s, 9 * s);
  ctx.lineTo(-15 * s, 15 * s);
  ctx.lineTo(-5 * s, 10 * s);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); // right
  ctx.moveTo(5 * s, 4 * s);
  ctx.lineTo(20 * s, 9 * s);
  ctx.lineTo(15 * s, 15 * s);
  ctx.lineTo(5 * s, 10 * s);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Sleek cockpit
  ctx.fillStyle = 'rgba(150,230,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(0, -8 * s, 2.5 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  applyPattern(ctx, s, accent, pattern);

  // Single large engine
  drawEngines(ctx, s, engColor, [[0, 14 * s]], 4, 5);
}

function drawCruiser(ctx, s, hull, accent, pattern, engColor) {
  // Hexagonal heavy hull
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(0, -22 * s);
  ctx.lineTo(14 * s, -12 * s);
  ctx.lineTo(17 * s, 4 * s);
  ctx.lineTo(11 * s, 16 * s);
  ctx.lineTo(-11 * s, 16 * s);
  ctx.lineTo(-17 * s, 4 * s);
  ctx.lineTo(-14 * s, -12 * s);
  ctx.closePath();
  ctx.fill();

  // Heavy wing extensions
  ctx.globalAlpha = 0.68;
  ctx.beginPath(); // left
  ctx.moveTo(-17 * s, 0);
  ctx.lineTo(-33 * s, 10 * s);
  ctx.lineTo(-28 * s, 18 * s);
  ctx.lineTo(-13 * s, 14 * s);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); // right
  ctx.moveTo(17 * s, 0);
  ctx.lineTo(33 * s, 10 * s);
  ctx.lineTo(28 * s, 18 * s);
  ctx.lineTo(13 * s, 14 * s);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Armor plate details
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = s;
  ctx.beginPath();
  ctx.moveTo(-9 * s, -17 * s); ctx.lineTo(9 * s, -17 * s);
  ctx.moveTo(-13 * s, -4 * s); ctx.lineTo(13 * s, -4 * s);
  ctx.stroke();

  // Wide cockpit bridge
  ctx.fillStyle = 'rgba(150,230,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(0, -8 * s, 5 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  applyPattern(ctx, s, accent, pattern);

  // Triple engine bank
  drawEngines(ctx, s, engColor, [[-8 * s, 17 * s], [0, 19 * s], [8 * s, 17 * s]], 4, 5);
}

function applyPattern(ctx, s, accent, pattern) {
  if (pattern === 'plain') return;
  ctx.fillStyle = accent;
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.65;

  switch (pattern) {
    case 'stripes':
      ctx.fillRect(-1.5 * s, -16 * s, 3 * s, 22 * s);
      break;
    case 'chevron':
      ctx.lineWidth = 2.5 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-9 * s, -5 * s);
      ctx.lineTo(0, -14 * s);
      ctx.lineTo(9 * s, -5 * s);
      ctx.stroke();
      break;
    case 'dots':
      for (const [dx, dy] of [[-4, -10], [0, -5], [4, -10]]) {
        ctx.beginPath();
        ctx.arc(dx * s, dy * s, 2.5 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
  }
  ctx.globalAlpha = 1;
}

function drawEngines(ctx, s, engColor, positions, rw, rh) {
  ctx.save();
  ctx.shadowColor = engColor;
  ctx.shadowBlur = 10;

  ctx.fillStyle = engColor;
  for (const [ex, ey] of positions) {
    ctx.beginPath();
    ctx.ellipse(ex, ey, rw * s, rh * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bright white core
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (const [ex, ey] of positions) {
    ctx.beginPath();
    ctx.ellipse(ex, ey, rw * 0.45 * s, rh * 0.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
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
  lastFrameTime = timestamp;

  frameCount++;
  fpsTimer += frameDt;
  if (fpsTimer >= 1000) {
    fps = frameCount;
    frameCount = 0;
    fpsTimer = 0;
  }

  sendInput();
  render();
  updateLocalParticles();
  updateHUD();

  requestAnimationFrame(gameLoop);
}

function sendInput() {
  if (!myId) return;
  const canvasRect = canvas.getBoundingClientRect();
  const mx = (mouseX - canvasRect.left) / scaleX;
  const my = (mouseY - canvasRect.top) / scaleY;

  const aimBaseX = hasPrediction ? predictX : (gs?.players?.[myId]?.x ?? 0);
  const aimBaseY = hasPrediction ? predictY : (gs?.players?.[myId]?.y ?? 0);
  const aimAngle = Math.atan2(my - aimBaseY, mx - aimBaseX);
  lastAimAngle = aimAngle;

  socket.volatile.emit('input', {
    w: keys.w, a: keys.a, s: keys.s, d: keys.d,
    shooting: mouseDown,
    aimAngle
  });

  // Client-side prediction: time-based, frame-rate independent
  if (hasPrediction && gs?.players?.[myId]?.alive) {
    let dx = 0, dy = 0;
    if (keys.w) dy -= 1; if (keys.s) dy += 1;
    if (keys.a) dx -= 1; if (keys.d) dx += 1;
    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
    const tickMs = 1000 / (CONFIG.TICK_RATE || 20);
    const dt = Math.min(frameDt, 100) / tickMs;
    const spd = (CONFIG.PLAYER_SPEED || 4) * dt;
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

  shakeX = (Math.random() - 0.5) * shakeMag * 2;
  shakeY = (Math.random() - 0.5) * shakeMag * 2;
  shakeMag *= 0.82;

  ctx.save();
  ctx.translate(shakeX, shakeY);
  ctx.scale(scaleX, scaleY);

  if (gs) {
    const SMOOTH = 1 - Math.pow(0.5, frameDt / 16.67);

    // Advance smooth-follower positions
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

    if (gs.boss) {
      if (!displayPos.boss) { displayPos.boss = { x: gs.boss.x, y: gs.boss.y }; }
      else {
        displayPos.boss.x += (gs.boss.x - displayPos.boss.x) * SMOOTH;
        displayPos.boss.y += (gs.boss.y - displayPos.boss.y) * SMOOTH;
      }
    } else { displayPos.boss = null; }

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

    const now = performance.now();

    // Arena border & grid
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

    // Entities
    for (const pawn of gs.pawns) {
      const dp = displayPos.pawns[pawn.id] || pawn;
      drawPawn(pawn, dp.x, dp.y);
    }

    if (gs.boss) {
      const db = displayPos.boss || gs.boss;
      drawBoss(gs.boss, db.x, db.y);
    }

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
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#060616');
  grad.addColorStop(0.5, '#0b0b20');
  grad.addColorStop(1, '#080818');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const time = Date.now() * 0.001;
  for (const star of stars) {
    const alpha = 0.25 + 0.3 * Math.sin(time + star.a * 10);
    ctx.fillStyle = `rgba(200,210,255,${alpha})`;
    ctx.fillRect(star.x * scaleX, star.y * scaleY, star.s, star.s);
  }
}

function drawPlayer(p, x, y, isMe) {
  const cust = p.customization || customization;
  // aimAngle: use lastAimAngle for local player, server-broadcast for others
  const aimAngle = isMe ? lastAimAngle : (p.aimAngle || 0);
  drawSpaceship(ctx, x, y, cust, 1, aimAngle);

  // HP bar + name drawn at fixed coords (not rotated with ship)
  if (p.alive) {
    const bw = 38, bh = 5;
    const barY = y - 36;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - bw / 2, barY, bw, bh);
    const hpPct = Math.max(0, p.hp / (p.maxHP || 100));
    ctx.fillStyle = hpPct > 0.5 ? '#00ff88' : hpPct > 0.25 ? '#ffd700' : '#ff3b5c';
    ctx.fillRect(x - bw / 2, barY, bw * hpPct, bh);

    ctx.font = 'bold 8px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillStyle = isMe ? '#00d4ff' : '#e8e8f0';
    ctx.fillText(p.name, x, barY - 3);
  }

  // "You" arrow indicator
  if (isMe && p.alive) {
    ctx.fillStyle = '#00d4ff';
    ctx.beginPath();
    ctx.moveTo(x, y - 46);
    ctx.lineTo(x - 4, y - 52);
    ctx.lineTo(x + 4, y - 52);
    ctx.closePath();
    ctx.fill();
  }
}

function drawPawn(pawn, x, y) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#2a1a3a';
  ctx.strokeStyle = '#ff6b35';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, pawn.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ff6b35';
  ctx.font = `bold ${pawn.radius}px Orbitron`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  switch (pawn.type) {
    case 'number':   ctx.fillText(String(pawn.id % 10), 0, 1); break;
    case 'operator': ctx.fillText(['+', '−', '×', '÷'][pawn.id % 4], 0, 1); break;
    case 'bracket':  ctx.fillText(['(', ')'][pawn.id % 2], 0, 1); break;
    case 'binary':   ctx.fillText(['0', '1'][pawn.id % 2], 0, 1); break;
  }

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

  if (boss.shieldActive) {
    ctx.strokeStyle = 'rgba(0,212,255,0.6)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.shadowColor = '#ff0080';
  ctx.shadowBlur = 30;

  ctx.fillStyle = '#1a0a2a';
  ctx.strokeStyle = '#ff0080';
  ctx.lineWidth = 4;

  const piScale = r / 40;

  ctx.beginPath();
  ctx.moveTo(-30 * piScale, -25 * piScale);
  ctx.lineTo(30 * piScale, -25 * piScale);
  ctx.lineWidth = 8 * piScale;
  ctx.stroke();

  ctx.lineWidth = 6 * piScale;
  ctx.beginPath();
  ctx.moveTo(-15 * piScale, -25 * piScale);
  ctx.lineTo(-15 * piScale, 25 * piScale);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(15 * piScale, -25 * piScale);
  ctx.quadraticCurveTo(15 * piScale, 15 * piScale, 8 * piScale, 25 * piScale);
  ctx.stroke();

  ctx.shadowBlur = 0;

  ctx.fillStyle = '#ff0080';
  ctx.beginPath();
  ctx.arc(-8 * piScale, -10 * piScale, 4 * piScale, 0, Math.PI * 2);
  ctx.arc(8 * piScale, -10 * piScale, 4 * piScale, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ff0080';
  ctx.lineWidth = 2 * piScale;
  ctx.beginPath();
  ctx.moveTo(-14 * piScale, -18 * piScale); ctx.lineTo(-4 * piScale, -15 * piScale);
  ctx.moveTo(14 * piScale, -18 * piScale);  ctx.lineTo(4 * piScale, -15 * piScale);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, 8 * piScale, 0.2, Math.PI - 0.2);
  ctx.stroke();

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
  // Galactic laser bolt — elongated ellipse rotated along velocity
  const tickMs = 1000 / (CONFIG.TICK_RATE || 20);
  const dt = now !== undefined ? Math.min((now - lastStateTime) / tickMs, 1.5) : 0;
  const ex = proj.x + (proj.vx || 0) * dt;
  const ey = proj.y + (proj.vy || 0) * dt;
  const isBoss = proj.owner === 'boss';
  const angle = Math.atan2(proj.vy || 0, proj.vx || 0);

  const boltW = isBoss ? 5 : 3;
  const boltH = isBoss ? 18 : 12;

  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(angle + Math.PI / 2); // orient along velocity

  // Outer glow
  ctx.shadowColor = proj.color;
  ctx.shadowBlur = isBoss ? 14 : 8;

  // Main bolt body
  ctx.fillStyle = proj.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, boltW, boltH, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bright inner core
  ctx.shadowBlur = 0;
  ctx.fillStyle = isBoss ? '#ffaacc' : '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.ellipse(0, 0, boltW * 0.45, boltH * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.restore();
}

function updateLocalParticles() {
  for (let i = localParticles.length - 1; i >= 0; i--) {
    const p = localParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
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
    const hpPct = Math.max(0, me.hp / me.maxHP) * 100;
    document.getElementById('hp-fill').style.width = hpPct + '%';
    document.getElementById('hp-text').textContent = Math.max(0, Math.ceil(me.hp));

    document.getElementById('hud-damage-value').textContent = Math.floor(me.totalDamage);

    const streakEl = document.getElementById('hud-streak');
    if (me.triviaStreak > 0) {
      streakEl.textContent = `🔥 Streak: ${me.triviaStreak}`;
    } else {
      streakEl.textContent = '';
    }

    // Show upgrade points in HUD
    const upEl = document.getElementById('hud-upgrades');
    if (me.upgradePoints > 0) {
      upEl.textContent = `⚡ ${me.upgradePoints} pts`;
    } else {
      upEl.textContent = '';
    }
  }

  document.getElementById('hud-wave').textContent = `Wave ${gs.wave}`;

  if (gs.elapsedTime) {
    const secs = Math.floor(gs.elapsedTime / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    document.getElementById('hud-timer').textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  const announceEl = document.getElementById('wave-announce');
  if (gs.waveMessage) {
    announceEl.textContent = gs.waveMessage;
    announceEl.classList.remove('hidden');
  } else {
    announceEl.classList.add('hidden');
  }

  const bossBar = document.getElementById('boss-hp-bar');
  if (gs.boss) {
    bossBar.classList.remove('hidden');
    const pct = Math.max(0, gs.boss.hp / gs.boss.maxHP) * 100;
    document.getElementById('boss-hp-fill').style.width = pct + '%';
    document.getElementById('boss-hp-text').textContent = `${Math.ceil(gs.boss.hp)} / ${gs.boss.maxHP}`;
    bossBar.querySelector('.boss-hp-label').textContent =
      gs.boss.isMini ? '🥧 MINI PI' : '👑 THE MIGHTY PI';
  } else {
    bossBar.classList.add('hidden');
  }

  // Leaderboard — always update (always visible)
  if (gs.leaderboard) {
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

  buttons.forEach((btn, i) => {
    btn.style.pointerEvents = 'none';
    if (i === trivia.answer) btn.classList.add('correct');
    if (i === choiceIndex && !isCorrect) btn.classList.add('incorrect');
  });

  const feedbackEl = document.getElementById('trivia-feedback');
  feedbackEl.classList.remove('hidden', 'correct-fb', 'incorrect-fb');

  if (isCorrect) {
    feedbackEl.classList.add('correct-fb');
    feedbackEl.textContent = '✅ Correct! Respawning...';
  } else {
    feedbackEl.classList.add('incorrect-fb');
    feedbackEl.textContent = `❌ ${trivia.explanation}`;
  }

  setTimeout(() => {
    socket.emit('triviaAnswer', { correct: isCorrect });
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
    ? 'Pi has been defeated! Great job, pilots!'
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

  const totalDmg = lb.reduce((s, e) => s + e.damage, 0);
  document.getElementById('end-total-damage').textContent = Math.floor(totalDmg);
  document.getElementById('end-players').textContent = lb.length;

  if (gs && gs.elapsedTime) {
    const secs = Math.floor(gs.elapsedTime / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    document.getElementById('end-time').textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

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
    if (Math.random() > 0.5) piece.style.borderRadius = '50%';
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
  el.offsetHeight;
  el.style.animation = '';
}

// ═══════════════════════════════════════════════
// INPUT HANDLERS
// ═══════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'w' || key === 'arrowup')    keys.w = true;
  if (key === 'a' || key === 'arrowleft')  keys.a = true;
  if (key === 's' || key === 'arrowdown')  keys.s = true;
  if (key === 'd' || key === 'arrowright') keys.d = true;
});

document.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'w' || key === 'arrowup')    keys.w = false;
  if (key === 'a' || key === 'arrowleft')  keys.a = false;
  if (key === 's' || key === 'arrowdown')  keys.s = false;
  if (key === 'd' || key === 'arrowright') keys.d = false;
});

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

document.addEventListener('mousedown', (e) => {
  if (e.button === 0 && currentScreen === 'game') mouseDown = true;
});

document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
});

document.addEventListener('contextmenu', (e) => {
  if (currentScreen === 'game') e.preventDefault();
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
console.log('%c🥧 Pi Battle Arena v2.0', 'font-size:20px; color:#00d4ff; font-weight:bold;');
console.log('%cEdVenture Pi Day 2026 — Spaceships Edition', 'font-size:12px; color:#9090b0;');
