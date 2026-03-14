# Pi Battle Arena — Presentation Outline
**Audience:** Kids (approx. grades 3–8) | **Total Time:** ~60–75 minutes

---

## 1. Opening Hook (5 min)
- Ask: *"Has anyone here played a video game? Did you ever wonder how it actually works?"*
- Show Pi Battle Arena running on the big screen — live, with the boss moving and bullets flying
- Drop the reveal: *"Someone wrote code to make all of that happen. And today, you're going to do the same thing."*

---

## 2. Programming Basics (15 min)
Keep each concept short — one real-world analogy + one game example.

### Variables — "Storing Information"
- A variable is a named box that holds a value
- Real world: a scoreboard showing a number
- In the game: `hp = 100` (your health), `x = 400` (your ship's position on screen)

### Functions — "Named Actions"
- A function is a reusable set of instructions with a name
- Real world: a recipe named "make sandwich"
- In the game: `shootBullet()`, `movePlayer()`, `killPlayer()`

### Loops — "Do It Again and Again"
- A loop repeats code a certain number of times (or forever)
- Real world: a clock ticking every second
- In the game: the server loop runs **20 times per second** — updating every ship, bullet, and enemy

### Conditionals — "Making Decisions"
- `if` checks a condition and runs code based on whether it's true or false
- Real world: if it's raining, bring an umbrella
- In the game: `if (bullet hits enemy) { deal damage }`, `if (hp <= 0) { player dies }`

### Events — "Reacting to Things That Happen"
- Events fire when something specific occurs
- Real world: a doorbell rings → you go answer the door
- In the game: when a player presses W, an event fires → the ship moves up

---

## 3. From Code to Game (10 min)
Bring it to life — walk through real lines of code on screen.

### Show: Moving a Ship
```js
// When the player presses W, their ship moves up
if (input.w) {
  player.y -= PLAYER_SPEED;
}
```
*"See how the `if` checks if W is pressed, and then moves the ship?"*

### Show: A Variable in Action
```js
let hp = 100;       // player starts with 100 health
hp -= 15;           // boss bullet hits — take 15 damage
if (hp <= 0) {      // check: are they dead?
  killPlayer();     // function call!
}
```

### Show: The Game Loop
```js
// This runs 20 times every second
setInterval(() => {
  movePlayers();
  moveBullets();
  checkCollisions();
  sendStateToAllPlayers();
}, 50);
```
*"Every 50 milliseconds — faster than you can blink — this loop runs and updates the entire game."*

### Quick Connections
| Game Feature | Programming Concept |
|---|---|
| Your ship's HP | Variable |
| Pressing WASD | Event |
| Bullet hitting enemy | Conditional (if) |
| Game updating 20×/sec | Loop |
| `killPlayer()` | Function |
| Your ship's X/Y position | Variables |

---

## 4. Customize Your Ship with Block Code (10 min)
*This connects Scratch experience to real programming.*

- Open the customizer screen
- Walk through the block panel: *"Each colored block is a function call. When you click it, you're writing real code."*
- Show the code preview panel updating live as blocks are clicked
- Let everyone pick a block and watch the code change
- Key message: *"Scratch and this game use the same idea — blocks are just code that's easy to see and click."*

**Guided activity:**
1. Set a ship body (function → changes `shipBody` variable)
2. Set a color (function → changes `shipColor` variable)
3. Watch the ship preview update live
4. Hit **Join Battle**

---

## 5. Battle Time — Play the Game! (30+ min)
- Everyone connects on their device: go to the game URL
- Walk through joining: enter name → customize ship → join
- Admin starts the game
- **During respawns:** trivia questions reinforce CS concepts — encourage kids to explain their answer

**Talk-through moments while playing:**
- *"Why do you think some bullets do more damage? (upgrades = variables changing)"*
- *"The boss is aiming at you — it's running an algorithm to find your position!"*
- *"Every time you upgrade fire rate, the code changes a number from 15 to 2 — that's it!"*

---

## 6. Wrap-Up (5 min)
- *"What programming concept did you see in the game today?"* (quick round-robin)
- The whole game — ships, bullets, boss, trivia, leaderboard — is about **800 lines of code**
- **Where to learn more:**
  - [Scratch](https://scratch.mit.edu) — drag-and-drop coding, free
  - [code.org](https://code.org) — beginner CS lessons, free
  - [Khan Academy Computing](https://www.khanacademy.org/computing) — JavaScript + CS fundamentals
  - [CS50](https://cs50.harvard.edu) — Harvard's free intro to CS (for older kids/teens)
- *"The people who built Minecraft, Roblox, Fortnite — they started exactly where you are today."*

---

## Timing Summary
| Section | Time |
|---|---|
| Opening Hook | 5 min |
| Programming Basics | 15 min |
| From Code to Game | 10 min |
| Customize Your Ship | 10 min |
| Play the Game | 30+ min |
| Wrap-Up | 5 min |
| **Total** | **~75 min** |
