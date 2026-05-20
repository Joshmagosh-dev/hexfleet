# HexFleet

Standalone first playable built from the locked GDD v0.1 foundation and updated against TDD v0.2.

## Run

Open `index.html` in a browser.

No Phaser, no build step, no package install, no local server required.

## Test

```bash
node tests/core.test.js
```

## What Is Implemented

- Deterministic seed-based map generation
- Finite radius-7 hex map
- Single fleet token
- Hull, fuel, and sensor range
- Move, scan, and hold orders
- Two-turn scan jobs
- Unknown and scanned hex knowledge
- Hazards and drift contacts
- Tiered salvage discovery and harvest rewards
- Tiered enemies with turn-scaled spawning
- Turn-based combat with weapons, ammo, reload, flee, and counterattacks
- Fleet upgrades for mining, combat, and armor
- Save/load persistence through localStorage and JSON export
- Permanent chronological intel log
- JSON-serializable state export
- Failure when hull reaches 0 or fuel reaches 0 in deep space

Core rules live in `src/core`. Rendering and DOM wiring live in `src/ui` and `src/main.js`.
