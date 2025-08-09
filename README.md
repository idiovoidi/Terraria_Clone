# Terraria Clone (Basic)

A lightweight browser prototype inspired by Terraria.

## Features
- 2D tile world (grass, dirt, stone, wood)
- Procedural terrain
- Player physics: walk, jump, gravity
- Collision against tiles
- Mining with left-click, placing with right-click
- Hotbar with 5 slots (1..5 to select)
- Camera follows the player

## Run
Open `index.html` in a modern browser. No build step needed.

## Controls
- A / Left: move left
- D / Right: move right
- W / Up / Space: jump
- Mouse left: mine tile
- Mouse right: place selected tile
- 1..5: select hotbar slot

## Notes
- This is a minimal, single-file JS prototype to keep things simple.
- Out-of-bounds is treated as solid to keep the player within the world.
