# CLAUDE.md — House Rules

## Who you're working with

Two 9-year-olds who have never used Claude Code. A parent is nearby but the
kids are driving. They are not here to read code — they are here to describe
ideas out loud and watch them appear in the game.

- Explain every change in ONE sentence a 9-year-old understands.
- "The bad guys are hot dogs now" — not "I updated the enemy render method."
- Never show them code unless they ask. Never explain how it works.
- Two or three lines of reply, then stop. No walls of text.
- If they ask for something impossible today, say so in one friendly sentence
  and offer the closest thing that IS possible.

## What this project is

A fork of an open-source browser survivor game. It already works. The job is
to make it THEIRS — new characters, new enemies, new weapons, new look, new
name, new feel.

## Running and previewing it

The game is a static site served by `server.js`, a tiny zero-dependency Node
server. No `npm install` is needed. Double-clicking `index.html` does NOT work
— the game uses ES modules and needs a real HTTP origin.

In the desktop app, the preview server is configured in `.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "survivor-arena",
      "program": "server.js",
      "port": 3000
    }
  ]
}
```

If that file is missing, create it with exactly those contents. Do not change
the port or swap it to an npm script — `program: "server.js"` runs
`node server.js`, which is correct for this project.

Start the server and keep the game visible in the Browser pane so the kids see
every change land. If a change doesn't seem to show up, restart the server from
the server dropdown before assuming the change failed.

## The most important rules

- **Never break the game.** After every change it must still run. If a change
  breaks it, revert immediately and try another way.
- **One change at a time.** Make it, tell them to look at the game, then wait.
- **Smallest possible edit.** Never refactor, reorganize, optimize, or rewrite
  a file "while you're in there."
- **Go straight to the right file** using the map below. Do not read the whole
  codebase for a small change — `src/main.js` alone is 78KB.
- **Don't add features nobody asked for.** One suggestion, once, one sentence.
- **Ignore linting, formatting, and code style.** They don't matter today.
- After every change that works:
  `git add -A && git commit -m "short description" && git push`
  Pushing to GitHub auto-deploys to the live Netlify site in about a minute.

## Codebase map (verified against this repo)

**Enemies, weapons, bosses, balance data** — `src/data.js`
Exports `WEAPONS`, `PASSIVES`, `ENEMIES`, `BOSSES`, `WAVES`, `ACHIEVEMENTS`,
`UNLOCKS`. A new enemy type or new weapon starts here.

**How things LOOK** — `src/entities.js`
Classes `Player`, `Enemy`, `EnemyProjectile`, `Projectile`, `OrbitShard`,
`Mine`, `ExpOrb`, `Particle`, `FloatingText`. Each has a `render(ctx)` method.
All character art changes happen in these render methods.

**Tunable numbers** — `src/config.js`
The `CONFIG` object: `PLAYER_SPEED`, `PLAYER_SIZE`, `MAX_ENEMIES`,
`SPAWN_RADIUS`, `INVINCIBILITY_TIME`, arena size, weapon caps. "Make me faster"
lives here.

**Weapon behaviour** — `src/weapons.js` (the `Weapon` class)

**Maps and backgrounds** — `src/stages.js` (`STAGES`, `getBackgroundFor`)

**On-screen text and names** — `src/i18n.js` (the `en` object)

**HUD, menus, overlays, level-up cards** — `src/ui.js`

**Sounds** — `src/audio.js` (`AudioEngine`, Web Audio synthesis)

**Visual effects** — `src/effects.js`

**Game loop and wiring** — `src/main.js` (large — only touch when necessary)

## Art and characters

Draw everything in code inside the `render(ctx)` methods — shapes, arcs, paths,
colors. No image files, no downloads, no sprite sheets.

This keeps every visual detail promptable. When they say "make his hat bigger"
or "give her sunglasses," that must be a small edit to drawing code, not an
asset hunt. Build characters from simple separate shapes so any one part can
change on its own.

Emoji drawn as canvas text are also fine and often look great.

## Sound

Web Audio beeps generated in code, via the existing `AudioEngine`. No sound
files, ever.

## When they report a bug

Ask what they SAW on screen before guessing. "I picked the pizza weapon and
nothing came out" is the useful kind of answer. Don't ask them to open the
console.
