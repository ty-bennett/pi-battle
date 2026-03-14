/**
 * Pi Battle Arena — Server
 * Real-time multiplayer boss-battle game server
 * Express + Socket.IO
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 2000,
  pingTimeout: 5000
});

// In Docker: files are at ./public/ (built by Dockerfile)
// In local dev: files are at project root; remap the subpaths HTML expects
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
} else {
  app.use(express.static(__dirname));
  app.get('/js/main.js',    (_req, res) => res.sendFile(path.join(__dirname, 'main.js')));
  app.get('/css/style.css', (_req, res) => res.sendFile(path.join(__dirname, 'style.css')));
}

// ─── CONFIGURATION ──────────────────────────────────────────
const CONFIG = {
  TICK_RATE: 20,            // Server updates per second
  ARENA_W: 1600,
  ARENA_H: 900,
  MAX_PLAYERS: 20,
  PLAYER_SPEED: 4,
  PLAYER_HP: 100,
  PLAYER_RADIUS: 18,
  BOSS_BASE_HP: 1500,
  BOSS_HP_PER_PLAYER: 400,
  WAVE_COUNT: 1,
  PAWN_HP: 60,
  PAWN_SPEED: 1.5,
  PAWN_RADIUS: 14,
  PAWN_DAMAGE: 5,
  BOSS_DAMAGE: 10,
  PROJECTILE_SPEED: 15,
  PROJECTILE_LIFETIME: 80,  // frames
  GOLDEN_GUN_CHANCE: 1 / 50,
  TRIVIA_STREAK_FOR_GOLDEN: 10,
  RESPAWN_DELAY: 1000
};

// ─── TRIVIA BANK ────────────────────────────────────────────
const TRIVIA = [
  // Simple math
  { q: "What is 5 + 3?", choices: ["6", "7", "8", "9"], answer: 2, explanation: "5 + 3 = 8. Count up from 5: 6, 7, 8!" },
  { q: "What is 10 − 4?", choices: ["4", "5", "6", "7"], answer: 2, explanation: "10 − 4 = 6. Count back from 10: 9, 8, 7, 6!" },
  { q: "What is 7 + 6?", choices: ["11", "12", "13", "14"], answer: 2, explanation: "7 + 6 = 13. Try: 7 + 3 = 10, then add 3 more = 13!" },
  { q: "What is 15 − 7?", choices: ["6", "7", "8", "9"], answer: 2, explanation: "15 − 7 = 8. Think: 7 + ? = 15. Count up 7 steps from 7 to get 8!" },
  { q: "What is 9 + 9?", choices: ["16", "17", "18", "19"], answer: 2, explanation: "9 + 9 = 18. Double 9! Or: 10 + 10 = 20, minus 2 = 18." },
  { q: "What is 20 − 5?", choices: ["13", "14", "15", "16"], answer: 2, explanation: "20 − 5 = 15. Count back 5 steps from 20!" },
  { q: "What is 4 + 8?", choices: ["10", "11", "12", "13"], answer: 2, explanation: "4 + 8 = 12. Flip it: 8 + 4. Start at 8, count up 4: 9, 10, 11, 12!" },
  { q: "What is 30 − 12?", choices: ["16", "17", "18", "19"], answer: 2, explanation: "30 − 12 = 18. Try: 30 − 10 = 20, then 20 − 2 = 18!" },
  { q: "What is 6 + 7?", choices: ["11", "12", "13", "14"], answer: 2, explanation: "6 + 7 = 13. Remember: 6 + 6 = 12, so 6 + 7 is one more = 13!" },
  { q: "What are the first 3 digits of Pi?", choices: ["3.14", "3.41", "2.71", "3.15"], answer: 0, explanation: "Pi = 3.14159... It goes on forever and never repeats — that's what makes it special!" },
  { q: "What is 3 + 4?", choices: ["5", "6", "7", "8"], answer: 2, explanation: "3 + 4 = 7. Count up 4 from 3: 4, 5, 6, 7!" },
  { q: "What is 8 − 3?", choices: ["3", "4", "5", "6"], answer: 2, explanation: "8 − 3 = 5. Count back 3 from 8: 7, 6, 5!" },
  { q: "What is 2 + 2?", choices: ["2", "3", "4", "5"], answer: 2, explanation: "2 + 2 = 4. Two pairs make four!" },
  { q: "What is 10 − 3?", choices: ["5", "6", "7", "8"], answer: 2, explanation: "10 − 3 = 7. Count back from 10: 9, 8, 7!" },
  { q: "What is 5 + 5?", choices: ["8", "9", "10", "11"], answer: 2, explanation: "5 + 5 = 10. Two fives always make ten!" },
  { q: "What is 12 − 4?", choices: ["6", "7", "8", "9"], answer: 2, explanation: "12 − 4 = 8. Count back 4 from 12: 11, 10, 9, 8!" },
  { q: "What is 6 + 4?", choices: ["8", "9", "10", "11"], answer: 2, explanation: "6 + 4 = 10. Any number that adds to 10 is called a 'ten pair'!" },
  { q: "What is 14 − 6?", choices: ["6", "7", "8", "9"], answer: 2, explanation: "14 − 6 = 8. Think: 6 + ? = 14. Count up: 7, 8, 9 ... that's 8 steps!" },
  { q: "What is 3 + 3 + 3?", choices: ["6", "7", "8", "9"], answer: 3, explanation: "3 + 3 + 3 = 9. Three groups of 3!" },
  { q: "What is 11 − 5?", choices: ["4", "5", "6", "7"], answer: 2, explanation: "11 − 5 = 6. Count back 5 from 11: 10, 9, 8, 7, 6!" },
];

// ─── WEAPON DEFINITIONS ─────────────────────────────────────
const WEAPONS = {
  laser: {
    name: "Laser",
    damage: 8,
    fireRate: 15,
    spread: 1,
    spreadAngle: 0,
    projectileColor: '#00d4ff',
    projectileSize: 4,
    description: "Standard laser cannon"
  }
};

// ─── GAME STATE ─────────────────────────────────────────────
let gameState = {
  phase: 'lobby',  // lobby | customizing | playing | paused | victory | gameover
  wave: 0,
  waveTimer: 0,
  waveMessage: '',
  waveMessageTimer: 0,
  players: {},
  boss: null,
  pawns: [],
  projectiles: [],
  particles: [],
  leaderboard: {},
  totalBossHP: 0,
  bossMaxHP: 0,
  startTime: 0,
  elapsedTime: 0
};

let adminSocket = null;
let triviaTimers = {};
let gameInterval = null;

// ─── WAVE DEFINITIONS ───────────────────────────────────────
function getWaveConfig(wave, playerCount) {
  const pc = Math.max(playerCount, 1);
  const waves = [
    { // Wave 1 - Boss battle
      message: "👑 BATTLE BEGINS — DEFEAT THE MIGHTY PI!",
      pawns: Math.floor(5 + pc),
      pawnHP: 30,
      pawnSpeed: 2.0,
      bossActive: true,
      bossHPMult: 0.6,
      spawnInterval: 90
    }
  ];
  return waves[Math.min(wave, waves.length - 1)];
}

// ─── HELPER FUNCTIONS ───────────────────────────────────────
function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function randomEdgeSpawn() {
  const side = Math.floor(Math.random() * 4);
  switch (side) {
    case 0: return { x: Math.random() * CONFIG.ARENA_W, y: -30 };
    case 1: return { x: CONFIG.ARENA_W + 30, y: Math.random() * CONFIG.ARENA_H };
    case 2: return { x: Math.random() * CONFIG.ARENA_W, y: CONFIG.ARENA_H + 30 };
    case 3: return { x: -30, y: Math.random() * CONFIG.ARENA_H };
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

let nextId = 1;
function uid() { return nextId++; }

// ─── BOSS CREATION ──────────────────────────────────────────
function createBoss(hpMult = 1.0) {
  const playerCount = Object.keys(gameState.players).length;
  const hp = Math.floor((CONFIG.BOSS_BASE_HP + playerCount * CONFIG.BOSS_HP_PER_PLAYER) * hpMult);
  gameState.bossMaxHP = hp;
  gameState.totalBossHP = hp;
  gameState.boss = {
    id: uid(),
    x: CONFIG.ARENA_W / 2,
    y: 160,
    hp: hp,
    maxHP: hp,
    radius: hpMult < 1 ? 55 : 80,
    phase: 0,
    attackTimer: 0,
    moveTimer: 0,
    targetX: CONFIG.ARENA_W / 2,
    targetY: 160,
    isMini: hpMult < 1,
    shieldActive: false,
    shieldTimer: 0
  };
}

// ─── PAWN SPAWNING ──────────────────────────────────────────
function spawnPawn(hp, speed) {
  const spawn = randomEdgeSpawn();
  const types = ['number', 'operator', 'bracket', 'binary'];
  gameState.pawns.push({
    id: uid(),
    x: spawn.x,
    y: spawn.y,
    hp: hp,
    maxHP: hp,
    speed: speed,
    radius: CONFIG.PAWN_RADIUS,
    type: types[Math.floor(Math.random() * types.length)],
    attackTimer: 0
  });
}

// ─── GAME TICK ──────────────────────────────────────────────
let waveSpawnTimer = 0;
let waveSpawned = 0;
let waveConfig = null;
let betweenWaveTimer = 0;
let tickCount = 0;

function gameTick() {
  if (gameState.phase !== 'playing') return;

  tickCount++;
  const playerCount = Object.keys(gameState.players).length;
  gameState.elapsedTime = Date.now() - gameState.startTime;

  // Wave message timer
  if (gameState.waveMessageTimer > 0) {
    gameState.waveMessageTimer--;
  }

  // Between wave cooldown
  if (betweenWaveTimer > 0) {
    betweenWaveTimer--;
    if (betweenWaveTimer === 0) {
      startNextWave();
    }
    broadcastState();
    return;
  }

  // Check if wave is complete
  if (waveConfig && waveSpawned >= waveConfig.pawns && gameState.pawns.length === 0) {
    if (waveConfig.bossActive && gameState.boss && gameState.boss.hp > 0) {
      // Boss still alive, keep going
    } else {
      // Wave complete
      if (gameState.boss && gameState.boss.hp <= 0) {
        gameState.boss = null;
      }
      if (gameState.wave >= CONFIG.WAVE_COUNT - 1) {
        // VICTORY
        gameState.phase = 'victory';
        io.emit('gamePhase', { phase: 'victory', leaderboard: getSortedLeaderboard() });
        broadcastState();
        return;
      }
      // Award 1 upgrade point to surviving players
      for (const p of Object.values(gameState.players)) {
        if (p.alive) {
          p.upgradePoints = (p.upgradePoints || 0) + 1;
          io.to(p.socketId).emit('upgradeAvailable', { wave: gameState.wave + 1 });
        }
      }
      gameState.projectiles = []; // clear lingering bullets so they don't glitch frozen
      betweenWaveTimer = CONFIG.TICK_RATE * 20; // 20 second break for kids to choose upgrades
      gameState.waveMessage = `✅ Wave ${gameState.wave + 1} Complete! Choose an upgrade!`;
      gameState.waveMessageTimer = CONFIG.TICK_RATE * 3;
    }
  }

  // Spawn pawns
  if (waveConfig && waveSpawned < waveConfig.pawns) {
    waveSpawnTimer++;
    if (waveSpawnTimer >= waveConfig.spawnInterval / (CONFIG.TICK_RATE / 20)) {
      spawnPawn(waveConfig.pawnHP, waveConfig.pawnSpeed);
      waveSpawned++;
      waveSpawnTimer = 0;
    }
  }

  // Update pawns
  updatePawns();

  // Update boss
  updateBoss();

  // Update projectiles
  updateProjectiles();

  // Update players
  updatePlayers();

  broadcastState();
}

function startNextWave() {
  gameState.wave++;
  if (gameState.wave >= CONFIG.WAVE_COUNT) {
    gameState.wave = CONFIG.WAVE_COUNT - 1;
  }
  const playerCount = Object.keys(gameState.players).length;
  waveConfig = getWaveConfig(gameState.wave, playerCount);
  waveSpawned = 0;
  waveSpawnTimer = 0;

  gameState.waveMessage = waveConfig.message;
  gameState.waveMessageTimer = CONFIG.TICK_RATE * 3;

  if (waveConfig.bossActive) {
    createBoss(waveConfig.bossHPMult || 1.0);
  }

  io.emit('waveStart', { wave: gameState.wave + 1, message: waveConfig.message });
}

function updatePawns() {
  const players = Object.values(gameState.players).filter(p => p.alive);
  if (players.length === 0) return;

  for (let i = gameState.pawns.length - 1; i >= 0; i--) {
    const pawn = gameState.pawns[i];

    // Find nearest player
    let nearest = null;
    let nearDist = Infinity;
    for (const p of players) {
      const d = dist(pawn, p);
      if (d < nearDist) { nearDist = d; nearest = p; }
    }

    if (nearest) {
      const dx = nearest.x - pawn.x;
      const dy = nearest.y - pawn.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 30) {
        pawn.x += (dx / d) * pawn.speed;
        pawn.y += (dy / d) * pawn.speed;
      }

      // Attack player
      if (d < 40 && pawn.attackTimer <= 0) {
        nearest.hp -= CONFIG.PAWN_DAMAGE;
        pawn.attackTimer = CONFIG.TICK_RATE; // 1 second cooldown
        if (nearest.hp <= 0) {
          killPlayer(nearest);
        }
      }
    }

    if (pawn.attackTimer > 0) pawn.attackTimer--;

    // Remove dead pawns
    if (pawn.hp <= 0) {
      gameState.pawns.splice(i, 1);
    }
  }
}

function updateBoss() {
  const boss = gameState.boss;
  if (!boss || boss.hp <= 0) {
    if (boss && boss.hp <= 0) {
      gameState.boss = null;
      gameState.waveMessage = "🎉 BOSS DEFEATED!";
      gameState.waveMessageTimer = CONFIG.TICK_RATE * 3;
      io.emit('bossDefeated', {});
    }
    return;
  }

  const players = Object.values(gameState.players).filter(p => p.alive);

  // Boss movement
  boss.moveTimer++;
  if (boss.moveTimer > CONFIG.TICK_RATE * 3) {
    boss.targetX = 200 + Math.random() * (CONFIG.ARENA_W - 400);
    boss.targetY = 80 + Math.random() * 250;
    boss.moveTimer = 0;
  }
  boss.x += (boss.targetX - boss.x) * 0.02;
  boss.y += (boss.targetY - boss.y) * 0.02;

  // Boss attacks
  boss.attackTimer++;
  const attackInterval = boss.isMini ? CONFIG.TICK_RATE * 2 : CONFIG.TICK_RATE * 1.5;

  if (boss.attackTimer >= attackInterval && players.length > 0) {
    boss.attackTimer = 0;
    boss.phase = (boss.phase + 1) % 3;

    switch (boss.phase) {
      case 0: // Radial burst
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
          gameState.projectiles.push({
            id: uid(),
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 4,
            vy: Math.sin(a) * 4,
            damage: CONFIG.BOSS_DAMAGE,
            owner: 'boss',
            life: CONFIG.PROJECTILE_LIFETIME,
            color: '#ff0080'
          });
        }
        break;
      case 1: // Targeted shots
        for (const p of players.slice(0, 3)) {
          const dx = p.x - boss.x;
          const dy = p.y - boss.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          gameState.projectiles.push({
            id: uid(),
            x: boss.x,
            y: boss.y,
            vx: (dx / d) * 5,
            vy: (dy / d) * 5,
            damage: CONFIG.BOSS_DAMAGE + 5,
            owner: 'boss',
            life: CONFIG.PROJECTILE_LIFETIME,
            color: '#ff3366'
          });
        }
        break;
      case 2: // Wave pattern
        const t = tickCount * 0.1;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + t;
          gameState.projectiles.push({
            id: uid(),
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 3.5,
            vy: Math.sin(a) * 3.5,
            damage: CONFIG.BOSS_DAMAGE,
            owner: 'boss',
            life: CONFIG.PROJECTILE_LIFETIME,
            color: '#ff6699'
          });
        }
        break;
    }
  }

  // Shield phase at low health
  if (boss.hp < boss.maxHP * 0.25 && !boss.isMini) {
    boss.shieldTimer++;
    if (boss.shieldTimer % (CONFIG.TICK_RATE * 8) < CONFIG.TICK_RATE * 2) {
      boss.shieldActive = true;
    } else {
      boss.shieldActive = false;
    }
  }
}

function updateProjectiles() {
  for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
    const proj = gameState.projectiles[i];
    proj.x += proj.vx;
    proj.y += proj.vy;
    proj.life--;

    if (proj.life <= 0 ||
        proj.x < -50 || proj.x > CONFIG.ARENA_W + 50 ||
        proj.y < -50 || proj.y > CONFIG.ARENA_H + 50) {
      gameState.projectiles.splice(i, 1);
      continue;
    }

    if (proj.owner === 'boss') {
      // Hit players
      for (const p of Object.values(gameState.players)) {
        if (!p.alive) continue;
        if (dist(proj, p) < p.radius + 6) {
          p.hp -= proj.damage;
          gameState.projectiles.splice(i, 1);
          if (p.hp <= 0) killPlayer(p);
          break;
        }
      }
    } else {
      // Player projectile — hit pawns
      let hit = false;
      for (let j = gameState.pawns.length - 1; j >= 0; j--) {
        const pawn = gameState.pawns[j];
        if (dist(proj, pawn) < pawn.radius + 5) {
          pawn.hp -= proj.damage;
          if (pawn.hp <= 0) {
            addDamage(proj.owner, pawn.maxHP);
          } else {
            addDamage(proj.owner, proj.damage);
          }
          gameState.projectiles.splice(i, 1);
          hit = true;
          break;
        }
      }
      // Hit boss
      if (!hit && gameState.boss && gameState.boss.hp > 0) {
        if (dist(proj, gameState.boss) < gameState.boss.radius + 5) {
          if (!gameState.boss.shieldActive) {
            const dmg = Math.min(proj.damage, gameState.boss.hp);
            gameState.boss.hp -= proj.damage;
            addDamage(proj.owner, dmg);
          }
          gameState.projectiles.splice(i, 1);
        }
      }
    }
  }
}

function updatePlayers() {
  for (const p of Object.values(gameState.players)) {
    if (!p.alive) continue;

    // Apply movement from input
    let dx = 0, dy = 0;
    if (p.input.w) dy -= 1;
    if (p.input.s) dy += 1;
    if (p.input.a) dx -= 1;
    if (p.input.d) dx += 1;

    if (dx !== 0 && dy !== 0) {
      dx *= 0.707;
      dy *= 0.707;
    }

    p.x += dx * CONFIG.PLAYER_SPEED;
    p.y += dy * CONFIG.PLAYER_SPEED;
    p.x = clamp(p.x, CONFIG.PLAYER_RADIUS, CONFIG.ARENA_W - CONFIG.PLAYER_RADIUS);
    p.y = clamp(p.y, CONFIG.PLAYER_RADIUS, CONFIG.ARENA_H - CONFIG.PLAYER_RADIUS);

    // Shooting
    if (p.input.shooting && p.fireTimer <= 0) {
      const ups = p.upgrades || { damage: 0, fireRate: 0, multiShot: 0, speed: 0 };
      const dmg      = 8  + ups.damage   * 10;
      const fr       = Math.max(2, 15 - ups.fireRate  * 2.5);
      const spread   = 1  + ups.multiShot;
      const bspeed   = CONFIG.PROJECTILE_SPEED + ups.speed * 5;
      const angle    = p.input.aimAngle || 0;
      const bcolor   = '#00d4ff';

      for (let s = 0; s < spread; s++) {
        const offset = spread > 1 ? (s - (spread - 1) / 2) * 0.18 : 0;
        const a = angle + offset;
        gameState.projectiles.push({
          id: uid(),
          x: p.x + Math.cos(a) * 16,
          y: p.y + Math.sin(a) * 16,
          vx: Math.cos(a) * bspeed,
          vy: Math.sin(a) * bspeed,
          damage: dmg,
          owner: p.id,
          life: CONFIG.PROJECTILE_LIFETIME,
          color: bcolor
        });
      }
      p.fireTimer = fr;
    }
    if (p.fireTimer > 0) p.fireTimer -= (CONFIG.TICK_RATE / 20);
  }
}

function killPlayer(player) {
  player.alive = false;
  player.hp = 0;
  player.deaths = (player.deaths || 0) + 1;
  io.to(player.socketId).emit('playerDied', { triviaQuestion: getRandomTrivia() });
}

function getRandomTrivia() {
  return TRIVIA[Math.floor(Math.random() * TRIVIA.length)];
}

function addDamage(playerId, amount) {
  if (!gameState.leaderboard[playerId]) {
    gameState.leaderboard[playerId] = { damage: 0, name: '' };
  }
  gameState.leaderboard[playerId].damage += amount;
  const player = gameState.players[playerId];
  if (player) {
    gameState.leaderboard[playerId].name = player.name;
    player.totalDamage = (player.totalDamage || 0) + amount;
  }
}

function getSortedLeaderboard() {
  return Object.entries(gameState.leaderboard)
    .map(([id, data]) => ({ id, name: data.name, damage: data.damage }))
    .sort((a, b) => b.damage - a.damage);
}

function broadcastState() {
  // Send minimal state to all clients
  const minimal = {
    phase: gameState.phase,
    wave: gameState.wave + 1,
    waveMessage: gameState.waveMessageTimer > 0 ? gameState.waveMessage : '',
    elapsedTime: gameState.elapsedTime,
    players: {},
    boss: gameState.boss ? {
      x: gameState.boss.x,
      y: gameState.boss.y,
      hp: gameState.boss.hp,
      maxHP: gameState.boss.maxHP,
      radius: gameState.boss.radius,
      phase: gameState.boss.phase,
      isMini: gameState.boss.isMini,
      shieldActive: gameState.boss.shieldActive
    } : null,
    pawns: gameState.pawns.map(p => ({
      id: p.id, x: p.x, y: p.y, hp: p.hp, maxHP: p.maxHP,
      radius: p.radius, type: p.type
    })),
    projectiles: gameState.projectiles.map(p => ({
      id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, color: p.color, owner: p.owner
    })),
    leaderboard: getSortedLeaderboard().slice(0, 10)
  };

  for (const [id, p] of Object.entries(gameState.players)) {
    minimal.players[id] = {
      x: p.x, y: p.y, hp: p.hp, maxHP: CONFIG.PLAYER_HP,
      alive: p.alive, name: p.name, weapon: p.weapon,
      customization: p.customization, totalDamage: p.totalDamage || 0,
      hasGoldenGun: p.weapon === 'golden_wand',
      triviaStreak: p.triviaStreak || 0,
      aimAngle: p.input?.aimAngle || 0,
      upgradePoints: p.upgradePoints || 0,
      upgrades: p.upgrades || { damage: 0, fireRate: 0, multiShot: 0, speed: 0 }
    };
  }

  io.emit('gameState', minimal);
}

function resetGame() {
  gameState = {
    phase: 'lobby',
    wave: -1,
    waveTimer: 0,
    waveMessage: '',
    waveMessageTimer: 0,
    players: {},
    boss: null,
    pawns: [],
    projectiles: [],
    particles: [],
    leaderboard: {},
    totalBossHP: 0,
    bossMaxHP: 0,
    startTime: 0,
    elapsedTime: 0
  };
  waveSpawnTimer = 0;
  waveSpawned = 0;
  waveConfig = null;
  betweenWaveTimer = 0;
  tickCount = 0;

  if (gameInterval) {
    clearInterval(gameInterval);
    gameInterval = null;
  }
}

// ─── SOCKET HANDLERS ────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  socket.emit('welcome', {
    config: CONFIG,
    weapons: WEAPONS,
    phase: gameState.phase
  });

  // Player joins
  socket.on('joinGame', (data) => {
    if (Object.keys(gameState.players).length >= CONFIG.MAX_PLAYERS) {
      socket.emit('error', { message: 'Server full!' });
      return;
    }

    const playerId = socket.id;
    gameState.players[playerId] = {
      id: playerId,
      socketId: socket.id,
      name: (data.name || 'Player').substring(0, 16),
      x: 200 + Math.random() * (CONFIG.ARENA_W - 400),
      y: CONFIG.ARENA_H - 150 + Math.random() * 80,
      hp: CONFIG.PLAYER_HP,
      radius: CONFIG.PLAYER_RADIUS,
      alive: true,
      weapon: 'laser',
      customization: data.customization || {},
      input: { w: false, a: false, s: false, d: false, shooting: false, aimAngle: 0 },
      fireTimer: 0,
      totalDamage: 0,
      deaths: 0,
      triviaStreak: 0,
      upgradePoints: 0,
      upgrades: { damage: 0, fireRate: 0, multiShot: 0, speed: 0 }
    };

    gameState.leaderboard[playerId] = { damage: 0, name: data.name || 'Player' };

    socket.emit('joined', { id: playerId });
    io.emit('playerList', getPlayerList());
    console.log(`[*] ${data.name} joined (${Object.keys(gameState.players).length} players)`);
  });

  // Player input
  socket.on('input', (data) => {
    const player = gameState.players[socket.id];
    if (player && player.alive) {
      player.input = {
        w: !!data.w,
        a: !!data.a,
        s: !!data.s,
        d: !!data.d,
        shooting: !!data.shooting,
        aimAngle: data.aimAngle || 0
      };
    }
  });

  // Upgrade application
  socket.on('applyUpgrade', (type) => {
    const p = gameState.players[socket.id];
    if (!p || (p.upgradePoints || 0) < 1) return;
    const maxLevels = { damage: 5, fireRate: 5, multiShot: 3, speed: 3 };
    if (!maxLevels[type] || (p.upgrades[type] || 0) >= maxLevels[type]) return;
    p.upgradePoints--;
    p.upgrades[type]++;
    socket.emit('upgradeConfirmed', { upgrades: p.upgrades, points: p.upgradePoints });
  });

  // Trivia answer
  socket.on('triviaAnswer', (data) => {
    const player = gameState.players[socket.id];
    if (!player || player.alive) return;

    const isCorrect = data.correct;
    if (isCorrect) {
      player.triviaStreak = (player.triviaStreak || 0) + 1;

      // Golden gun check
      let gotGolden = false;
      if (player.triviaStreak >= CONFIG.TRIVIA_STREAK_FOR_GOLDEN) {
        if (Math.random() < CONFIG.GOLDEN_GUN_CHANCE) {
          player.weapon = 'golden_wand';
          gotGolden = true;
          socket.emit('goldenGun', {});
        }
      }

      // Respawn
      player.alive = true;
      player.hp = CONFIG.PLAYER_HP;
      player.x = 200 + Math.random() * (CONFIG.ARENA_W - 400);
      player.y = CONFIG.ARENA_H - 150 + Math.random() * 80;
      socket.emit('respawned', { goldenGun: gotGolden, streak: player.triviaStreak });
    } else {
      player.triviaStreak = 0;
      // Send another question
      socket.emit('playerDied', { triviaQuestion: getRandomTrivia() });
    }
  });

  // ─── ADMIN CONTROLS ─────────────────────────────────────
  socket.on('adminAuth', (data) => {
    if (data.password === 'piday2026') {
      adminSocket = socket.id;
      socket.emit('adminConfirmed', {});
      console.log('[!] Admin authenticated');
    }
  });

  socket.on('adminStart', () => {
    if (socket.id !== adminSocket) return;
    if (gameState.phase === 'lobby' || gameState.phase === 'victory' || gameState.phase === 'gameover') {
      // Preserve players but reset game state
      const existingPlayers = { ...gameState.players };
      resetGame();
      // Restore players with reset stats
      for (const [id, p] of Object.entries(existingPlayers)) {
        if (io.sockets.sockets.get(id)) {
          p.hp = CONFIG.PLAYER_HP;
          p.alive = true;
          p.totalDamage = 0;
          p.deaths = 0;
          p.triviaStreak = 0;
          p.fireTimer = 0;
          p.x = 200 + Math.random() * (CONFIG.ARENA_W - 400);
          p.y = CONFIG.ARENA_H - 150 + Math.random() * 80;
          if (p.weapon === 'golden_wand') p.weapon = 'laser';
          p.upgradePoints = 0;
          p.upgrades = { damage: 0, fireRate: 0, multiShot: 0, speed: 0 };
          gameState.players[id] = p;
          gameState.leaderboard[id] = { damage: 0, name: p.name };
        }
      }

      gameState.phase = 'playing';
      gameState.wave = -1;
      gameState.startTime = Date.now();

      gameInterval = setInterval(gameTick, 1000 / CONFIG.TICK_RATE);
      startNextWave();

      io.emit('gamePhase', { phase: 'playing' });
      console.log('[!] Game started by admin');
    }
  });

  socket.on('adminPause', () => {
    if (socket.id !== adminSocket) return;
    if (gameState.phase === 'playing') {
      gameState.phase = 'paused';
      io.emit('gamePhase', { phase: 'paused' });
    } else if (gameState.phase === 'paused') {
      gameState.phase = 'playing';
      io.emit('gamePhase', { phase: 'playing' });
    }
  });

  socket.on('adminStop', () => {
    if (socket.id !== adminSocket) return;
    gameState.phase = 'gameover';
    io.emit('gamePhase', { phase: 'gameover', leaderboard: getSortedLeaderboard() });
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = null;
  });

  socket.on('adminReset', () => {
    if (socket.id !== adminSocket) return;
    resetGame();
    io.emit('gamePhase', { phase: 'lobby' });
    io.emit('fullReset', {});
    console.log('[!] Game reset by admin');
  });

  // Disconnect
  socket.on('disconnect', () => {
    const player = gameState.players[socket.id];
    if (player) {
      console.log(`[-] ${player.name} disconnected`);
      delete gameState.players[socket.id];
      io.emit('playerList', getPlayerList());
    }
    if (socket.id === adminSocket) {
      adminSocket = null;
      console.log('[!] Admin disconnected');
    }
  });
});

function getPlayerList() {
  return Object.values(gameState.players).map(p => ({
    id: p.id, name: p.name, weapon: p.weapon, customization: p.customization
  }));
}

// ─── START SERVER ───────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║     🥧 Pi Battle Arena Server 🥧        ║
  ║     Running on port ${PORT}                ║
  ║     Admin password: piday2026            ║
  ╚══════════════════════════════════════════╝
  `);
});
