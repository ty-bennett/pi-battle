/**
 * Pi Battle Arena — Bot Simulator
 * Spawns fake players to test with a full lobby.
 * Usage: node bots.js [count] [url]
 *   count: number of bots (default 9)
 *   url:   server URL (default http://localhost:3000)
 *
 * Run AFTER starting the server: node server.js
 * Then in another terminal: node bots.js
 */

const { io } = require('socket.io-client');

const BOT_COUNT = parseInt(process.argv[2]) || 9;
const SERVER_URL = process.argv[3] || 'http://localhost:3000';

const BOT_NAMES = [
  'Bot-Alpha', 'Bot-Beta', 'Bot-Gamma', 'Bot-Delta', 'Bot-Epsilon',
  'Bot-Zeta', 'Bot-Eta', 'Bot-Theta', 'Bot-Iota', 'Bot-Kappa',
  'Bot-Lambda', 'Bot-Mu', 'Bot-Nu', 'Bot-Xi', 'Bot-Omicron'
];

const SHIP_BODIES = ['fighter', 'bomber', 'scout', 'cruiser'];
const SHIP_COLORS = ['#00d4ff', '#ff3b5c', '#00ff88', '#a855f7', '#ffd700', '#ff6b35'];
const UPGRADE_TYPES = ['damage', 'fireRate', 'multiShot', 'speed'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return min + Math.random() * (max - min); }

function createBot(name, index) {
  const socket = io(SERVER_URL, { transports: ['websocket'] });
  const customization = {
    shipBody:    pick(SHIP_BODIES),
    shipColor:   pick(SHIP_COLORS),
    accentColor: pick(SHIP_COLORS),
    pattern:     pick(['plain', 'stripes', 'chevron', 'dots']),
    engineColor: pick(SHIP_COLORS)
  };

  // Bot movement state
  let moveDir = { w: false, a: false, s: false, d: false };
  let aimAngle = Math.random() * Math.PI * 2;
  let inputInterval = null;
  let wanderInterval = null;

  function randomizeMovement() {
    // Pick a random direction to drift toward
    moveDir.w = Math.random() > 0.5;
    moveDir.s = !moveDir.w && Math.random() > 0.5;
    moveDir.a = Math.random() > 0.5;
    moveDir.d = !moveDir.a && Math.random() > 0.5;
    aimAngle = rand(0, Math.PI * 2);
  }

  socket.on('connect', () => {
    console.log(`[bot] ${name} connected`);
  });

  socket.on('welcome', () => {
    // Small stagger so bots don't all join at the same millisecond
    setTimeout(() => {
      socket.emit('joinGame', { name, customization });
    }, index * 200);
  });

  socket.on('joined', () => {
    console.log(`[bot] ${name} joined the game`);

    // Send input 10x/sec
    randomizeMovement();
    inputInterval = setInterval(() => {
      socket.emit('input', {
        w: moveDir.w, a: moveDir.a, s: moveDir.s, d: moveDir.d,
        shooting: true,
        aimAngle
      });
    }, 100);

    // Change direction every 1-3 seconds
    wanderInterval = setInterval(() => {
      randomizeMovement();
    }, rand(1000, 3000));
  });

  // Auto-answer trivia so bots respawn (70% correct)
  socket.on('playerDied', (data) => {
    const correct = Math.random() < 0.7;
    const delay = correct ? 1500 : 2800;
    setTimeout(() => {
      socket.emit('triviaAnswer', { correct });
    }, delay);
  });

  // Spend upgrade points on a random upgrade
  socket.on('upgradeAvailable', () => {
    setTimeout(() => {
      socket.emit('applyUpgrade', pick(UPGRADE_TYPES));
    }, rand(500, 3000));
  });

  socket.on('disconnect', () => {
    console.log(`[bot] ${name} disconnected`);
    clearInterval(inputInterval);
    clearInterval(wanderInterval);
  });

  socket.on('connect_error', (err) => {
    console.error(`[bot] ${name} connection error: ${err.message}`);
  });

  return socket;
}

console.log(`\n🤖 Starting ${BOT_COUNT} bots → ${SERVER_URL}`);
console.log('Press Ctrl+C to stop all bots.\n');

const bots = [];
for (let i = 0; i < BOT_COUNT; i++) {
  bots.push(createBot(BOT_NAMES[i % BOT_NAMES.length], i));
}

process.on('SIGINT', () => {
  console.log('\nDisconnecting all bots...');
  bots.forEach(s => s.disconnect());
  process.exit(0);
});
