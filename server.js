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
  BOSS_BASE_HP: 5000,
  BOSS_HP_PER_PLAYER: 1500,
  WAVE_COUNT: 7,
  PAWN_HP: 60,
  PAWN_SPEED: 1.5,
  PAWN_RADIUS: 14,
  PAWN_DAMAGE: 8,
  BOSS_DAMAGE: 15,
  PROJECTILE_SPEED: 15,
  PROJECTILE_LIFETIME: 80,  // frames
  GOLDEN_GUN_CHANCE: 1 / 50,
  TRIVIA_STREAK_FOR_GOLDEN: 10,
  RESPAWN_DELAY: 1000
};

// ─── TRIVIA BANK ────────────────────────────────────────────
const TRIVIA = [
  // Quick math
  { q: "What is 8 × 7?", choices: ["54", "56", "63", "64"], answer: 1, explanation: "8 × 7 = 56. Tip: 8×7 = (8×5) + (8×2) = 40 + 16 = 56!" },
  { q: "What is 4 × 4?", choices: ["12", "16", "18", "20"], answer: 1, explanation: "4 × 4 = 16. It's a perfect square — 4 rows of 4!" },
  { q: "What is 100 − 25?", choices: ["65", "70", "75", "80"], answer: 2, explanation: "100 − 25 = 75. A quarter of 100 is 25, so three quarters is 75!" },
  { q: "What is 6 × 6?", choices: ["30", "36", "42", "48"], answer: 1, explanation: "6 × 6 = 36. Six sixes are thirty-six!" },
  { q: "What is 3 × 9?", choices: ["24", "27", "30", "33"], answer: 1, explanation: "3 × 9 = 27. Tip: 9 × anything — the digits always add up to 9 (2+7=9)!" },
  { q: "What is 50 + 50?", choices: ["90", "95", "100", "110"], answer: 2, explanation: "50 + 50 = 100. Two halves make a whole!" },
  { q: "What is 12 × 3?", choices: ["30", "33", "36", "39"], answer: 2, explanation: "12 × 3 = 36. Try: 10×3=30, plus 2×3=6, total 36!" },
  { q: "What are the first 3 digits of Pi?", choices: ["3.14", "3.41", "2.71", "3.15"], answer: 0, explanation: "Pi = 3.14159... It goes on forever and never repeats — that's what makes it special!" },
  { q: "What is 2 to the power of 3?", choices: ["6", "8", "9", "16"], answer: 1, explanation: "2³ = 2×2×2 = 8. Computers double things like this all the time!" },
  { q: "What is 5 × 5 × 2?", choices: ["25", "40", "50", "60"], answer: 2, explanation: "5×5=25, then 25×2=50. Breaking it into steps is how computers think!" },
  // Coding fundamentals
  { q: "In coding, what is a 'variable'?", choices: ["A type of loop", "A named container for storing data", "A kind of bug", "A programming language"], answer: 1, explanation: "A variable stores data! In this game, 'hp' is a variable that holds your health points." },
  { q: "What does a loop do in programming?", choices: ["Crashes the program", "Repeats a block of code", "Deletes data", "Connects to the internet"], answer: 1, explanation: "A loop repeats code! This game runs a loop 20 times per second to update every ship and bullet." },
  { q: "What is a 'function' in code?", choices: ["A math equation only", "A bug in the program", "A named block of reusable code", "A type of computer"], answer: 2, explanation: "Functions are reusable actions! This game has functions like movePlayer() and shootBullet()." },
  { q: "What does 'if' do in programming?", choices: ["Repeats code forever", "Checks a condition and decides what to do", "Stores a number", "Prints text to screen"], answer: 1, explanation: "If-statements make decisions! Like: if (bullet hits enemy) { damage them }." },
  { q: "What is a 'bug' in programming?", choices: ["An insect in the computer", "A fast piece of code", "An error or mistake in code", "Extra memory"], answer: 2, explanation: "A bug is a mistake in code! The term came from an actual moth found inside an early computer in 1947." },
  { q: "What language was this game built with?", choices: ["Python", "Java", "Scratch", "JavaScript"], answer: 3, explanation: "Pi Battle Arena runs on JavaScript! It's the language that makes websites and games interactive." },
  { q: "What does HTML stand for?", choices: ["HyperText Makeup Language", "HyperText Markup Language", "HighTech Modern Language", "How To Make Links"], answer: 1, explanation: "HTML = HyperText Markup Language. It's the skeleton of every web page!" },
  { q: "What does CSS do on a website?", choices: ["Connects to databases", "Controls styling and appearance", "Runs the game logic", "Handles user logins"], answer: 1, explanation: "CSS controls how things look — colors, fonts, layouts. It's what makes a website beautiful!" },
  { q: "What does CPU stand for?", choices: ["Computer Power Unit", "Central Processing Unit", "Core Program Utility", "Central Power Updater"], answer: 1, explanation: "CPU = Central Processing Unit — the brain of a computer that runs all your code!" },
  { q: "How many bits are in one byte?", choices: ["2", "4", "8", "16"], answer: 2, explanation: "1 byte = 8 bits. A bit is the tiniest piece of data: just a 0 or 1. 8 bits can store 256 different values!" },
  { q: "In binary, what does '1 + 1' equal?", choices: ["2", "11", "10", "0"], answer: 2, explanation: "In binary, 1 + 1 = 10 (which means 2). Computers only use 0s and 1s to do ALL math!" },
  { q: "What does RAM stand for?", choices: ["Random Access Memory", "Run All Machines", "Read Any Media", "Really Awesome Memory"], answer: 0, explanation: "RAM = Random Access Memory — your computer's short-term workspace while programs run!" },
  { q: "What is an algorithm?", choices: ["A type of computer chip", "A programming language", "A step-by-step recipe for solving a problem", "A kind of variable"], answer: 2, explanation: "An algorithm is a step-by-step plan! The AI in this game uses algorithms to aim at players." },
  { q: "What is 'debugging'?", choices: ["Adding new features", "Finding and fixing errors in code", "Deleting old code", "Running a program faster"], answer: 1, explanation: "Debugging = finding and fixing bugs! Professional coders spend a lot of time debugging." },
  { q: "What is a server?", choices: ["A waiter at a restaurant", "A computer that delivers data to other computers", "A type of keyboard", "A programming language"], answer: 1, explanation: "A server is a computer that shares resources! Right now, a server is running this entire game." },
  { q: "What does '==' mean in most programming languages?", choices: ["Set a variable", "Multiply two numbers", "Check if two values are equal", "Print to the screen"], answer: 2, explanation: "== checks equality! In this game: if (hp == 0) means 'if health equals zero, the player is dead.'" },
  { q: "What is a 'boolean'?", choices: ["A type of loop", "A value that is either true or false", "A big number", "A color in CSS"], answer: 1, explanation: "A boolean is true or false — like a light switch! In this game, 'alive' is a boolean: true or false." },
  { q: "What does the internet use to send data?", choices: ["Fax machines", "Packets", "USB cables only", "Telephone calls"], answer: 1, explanation: "The internet breaks data into small pieces called packets that travel separately and reassemble!" },
  { q: "What does 'open source' mean?", choices: ["The code is secret", "Anyone can view and contribute to the code", "The program is free forever", "The computer is always on"], answer: 1, explanation: "Open source means the code is public! Many famous tools like Linux, Python, and VS Code are open source." },
  { q: "What is a pixel?", choices: ["A type of coding error", "A unit of memory", "The smallest dot of color on a screen", "A network connection"], answer: 2, explanation: "A pixel is a tiny square of color. Your screen has millions of them — this whole game is made of pixels!" },
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
    { // Wave 1
      message: "⚡ Wave 1 — The Numbers Awaken!",
      pawns: Math.floor(8 + pc * 2),
      pawnHP: 40,
      pawnSpeed: 3.5,
      bossActive: false,
      spawnInterval: 80
    },
    { // Wave 2
      message: "📐 Wave 2 — Geometry Strikes!",
      pawns: Math.floor(14 + pc * 2.5),
      pawnHP: 50,
      pawnSpeed: 4.0,
      bossActive: false,
      spawnInterval: 70
    },
    { // Wave 3
      message: "⚠️ Wave 3 — Pi Sends Its Minions!",
      pawns: Math.floor(22 + pc * 3),
      pawnHP: 60,
      pawnSpeed: 5.0,
      bossActive: false,
      spawnInterval: 55
    },
    { // Wave 4 - Mini boss
      message: "🔥 Wave 4 — Mini Pi Appears!",
      pawns: Math.floor(12 + pc * 2),
      pawnHP: 70,
      pawnSpeed: 4.5,
      bossActive: true,
      bossHPMult: 0.3,
      spawnInterval: 65
    },
    { // Wave 5
      message: "💀 Wave 5 — The Numbers Strike Back!",
      pawns: Math.floor(26 + pc * 4),
      pawnHP: 70,
      pawnSpeed: 5.5,
      bossActive: false,
      spawnInterval: 50
    },
    { // Wave 6
      message: "🌀 Wave 6 — Infinite Sequence!",
      pawns: Math.floor(30 + pc * 4),
      pawnHP: 80,
      pawnSpeed: 6.5,
      bossActive: false,
      spawnInterval: 45
    },
    { // Wave 7 - FINAL BOSS
      message: "👑 FINAL WAVE — THE MIGHTY PI AWAKENS!",
      pawns: Math.floor(16 + pc * 2),
      pawnHP: 90,
      pawnSpeed: 7.0,
      bossActive: true,
      bossHPMult: 1.0,
      spawnInterval: 60
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
