# 🥧 Pi Battle Arena

> A multiplayer browser-based boss battle game built for **Pi Day 2026** at [EdVenture Children's Museum](https://edventure.org) in Columbia, SC.

![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=node.js)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-blue?logo=socket.io)
![License](https://img.shields.io/badge/License-MIT-yellow)
![Players](https://img.shields.io/badge/Players-Up%20to%2020-orange)

## What Is This?

Pi Battle Arena is an educational multiplayer game designed for elementary-school kids. Players:

1. **Create a character using block-based coding** (Scratch-style drag-and-drop)
2. **Fight a boss shaped like the Pi symbol (π)** across 8 waves of enemies
3. **Answer math and technology trivia** to respawn when defeated
4. **Compete on a live leaderboard** for top damage

The game supports **20 concurrent players** connected via WebSockets, runs at **60 FPS** in any modern browser, and is designed to spark interest in programming and STEM.

## Features

- **Block Coding Character Customizer** — Kids drag code blocks like `setBodyColor("blue")` and `setHat("wizard")` to build their hero. A live preview shows the character updating in real-time, and generated code is displayed to show what's happening under the hood.
- **8-Wave Boss Battle** — Progressive difficulty with math-symbol pawn enemies and a giant animated Pi boss with multiple attack patterns (radial burst, targeted shots, wave patterns, shield phase).
- **4 Mythical Weapons** — Crystal Wand, Storm Staff, Flame Bow, and Frost Scepter — each with unique spread patterns. No gun sprites — all magical/mythical themed.
- **Golden Wand** — Answer 10 trivia questions correctly in a row for a 1/50 chance at the legendary one-shot Golden Wand.
- **Trivia Respawn System** — 30 math and technology questions at an elementary-school level. Incorrect answers show explanations to reinforce learning.
- **Real-Time Multiplayer** — Socket.IO server supports up to 20 concurrent players with server-authoritative game state at 20 ticks/second.
- **Admin Controls** — Start, pause, stop, and reset the game from a hidden admin panel (password: `piday2026`).
- **Live Leaderboard** — In-game sidebar and a final victory screen with rankings, total damage, and confetti celebration.
- **Neo-Tokyo Educational Theme** — Dark neon aesthetic with glowing effects, circuit-board grid, and custom Google Fonts.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Server | Node.js + Express |
| Real-Time | Socket.IO 4.7 |
| Rendering | HTML5 Canvas (60 FPS) |
| Styling | CSS3 with custom properties |
| Fonts | Press Start 2P, Orbitron, Fira Code |

## Quick Start

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/pi-battle-arena.git
cd pi-battle-arena

# Install dependencies
npm install

# Start the server
npm start

# Open in browser
# http://localhost:3000
```

## How to Play

### For Kids
1. Enter your hero name on the join screen
2. Drag code blocks to customize your character's appearance
3. Pick a weapon (each has a different spread pattern!)
4. Click "Join the Battle" and wait for the Game Master to start
5. **WASD** to move, **Mouse** to aim, **Click** to shoot
6. If you get defeated, answer a trivia question correctly to respawn
7. Try to get 10 correct answers in a row for a chance at the Golden Wand!

### For the Game Master (Admin)
1. Click "Admin" on the join screen
2. Enter password: `piday2026`
3. Use the admin panel (top-left during game) to:
   - **Start** — Begin the wave sequence
   - **Pause/Resume** — Freeze the game
   - **End** — Force end and show leaderboard
   - **Reset** — Return everyone to the lobby

## Project Structure

```
pi-battle-arena/
├── server.js              # Express + Socket.IO game server
├── package.json
├── README.md
└── public/
    ├── index.html         # All screens (join, customize, game, end)
    ├── css/
    │   └── style.css      # Neo-tokyo themed styles
    └── js/
        └── main.js        # Game client (rendering, networking, UI)
```

## Configuration

Key settings in `server.js` under `CONFIG`:

| Setting | Default | Description |
|---------|---------|-------------|
| `MAX_PLAYERS` | 20 | Max concurrent connections |
| `WAVE_COUNT` | 8 | Total waves |
| `BOSS_BASE_HP` | 5000 | Boss starting HP |
| `BOSS_HP_PER_PLAYER` | 1500 | Additional boss HP per player |
| `GOLDEN_GUN_CHANCE` | 1/50 | Probability after 10-streak |
| `TRIVIA_STREAK_FOR_GOLDEN` | 10 | Correct answers needed |

## Deployment

The game runs on a single Node.js process. For the EdVenture event:

```bash
# Set a custom port if needed
PORT=8080 npm start
```

All players connect to the same URL on the local network. No database required — all state is in-memory.

## Credits

- **Built by** [Ty Bennett](https://tybennett.net) — CS Student at the University of South Carolina
- **Event** — Pi Day 2026 at EdVenture Children's Museum, Columbia, SC
- **Powered by** Node.js, Socket.IO, HTML5 Canvas

## License

MIT — Feel free to fork and adapt for your own educational events!
