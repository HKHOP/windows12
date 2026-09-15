# Riftbound Runner

A store-distributed Windows 12 web-OS game app: a precision 2D side-scrolling platformer with 4 worlds × 7 levels.

## Worlds
1. Glasswild — momentum and moving terrain
2. Emberworks — heat, switches, gates and conveyors
3. Moonfall — altered gravity and orbital movement
4. Nullspire — logic gates, timing and precision puzzles

## Integration
Copy this folder to `js/apps/riftboundRunner/` in the Windows 12 OS project, then run:

```sh
node build-registry.js
```

The manifest uses `distribution: "store"`, so registry generation will expose it to the simulated Microsoft Store.

The game's persistent save is stored only at `/system/programs data/riftboundRunner/save.json`, following the OS app-data rules.

## Controls
- A / D or Left / Right — move
- W / Up / Space — jump
- World Map — choose unlocked levels
- Restart — restart the current level

The app uses the OS WindowManager and FileSystem APIs and does not use native alert/confirm/prompt or direct localStorage.
