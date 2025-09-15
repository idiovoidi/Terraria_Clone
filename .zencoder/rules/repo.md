---
description: Repository Information Overview
alwaysApply: true
---

# Terraria Clone Information

## Summary
A lightweight browser-based prototype inspired by Terraria. Features include a 2D tile world with procedural terrain generation, player physics (walking, jumping, gravity), collision detection, mining/placing blocks, and a simple hotbar inventory system. The game is built with vanilla JavaScript and HTML5 Canvas, requiring no build step or external dependencies.

## Structure
- `/` - Root directory containing the main game files
- `/.vscode` - VS Code configuration for the project
- `/.zencoder` - Zencoder configuration directory

## Language & Runtime
**Language**: JavaScript (ES6+)
**Runtime**: Web Browser (HTML5)
**Build System**: None (vanilla JS)
**Development Server**: VS Code Live Server (port 5501)

## Main Files
- `index.html` - Main HTML entry point with basic styling
- `main.js` - Core game logic including world generation, physics, rendering, and input handling
- `player_anim.js` - Player animation system with states (idle, run, jump, fall)

## Game Features
**World Generation**:
- Procedural terrain with layered noise-based heightmap
- Multiple tile types (grass, dirt, stone, wood, air)
- Chunked tile rendering system

**Player Mechanics**:
- Physics: gravity, jumping, collision detection
- Mining with left-click, block placement with right-click
- Hotbar inventory system with 5 slots (1-5 keys to select)

**Rendering**:
- HTML5 Canvas-based rendering
- Camera system that follows the player
- Simple parallax background
- Animated player character

## Usage & Operations
**Running the Game**:
```bash
# Simply open index.html in a browser or use VS Code Live Server
```

**Controls**:
- A/Left Arrow: Move left
- D/Right Arrow: Move right
- W/Up Arrow/Space: Jump
- Mouse Left: Mine tile
- Mouse Right: Place selected tile
- 1-5: Select hotbar slot

## Development Notes
The project is intentionally kept minimal with no external dependencies or build process. It uses vanilla JavaScript with ES6+ features and the HTML5 Canvas API for rendering. The code is organized into logical components with the main game loop in `main.js` and player animations in `player_anim.js`.

The game world is represented as a 2D array of tile IDs, with physics implemented through AABB (Axis-Aligned Bounding Box) collision detection. The rendering system only draws tiles that are within the camera's view for performance optimization.