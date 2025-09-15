/*
  Minimal Terraria-like prototype
  - Chunked tile world (stone, dirt, grass, air)
  - Player physics: walk, jump, gravity, friction
  - Camera follows player
  - Mining/placing within reach using mouse
  - Simple hotbar (1..5)
*/

// Config
const TILE_SIZE = 24;
const WORLD_WIDTH = 200; // tiles
const WORLD_HEIGHT = 120; // tiles
const GRAVITY = 0.6;
const TERMINAL_VELOCITY = 18;
const MOVE_ACCEL = 0.9;
const AIR_ACCEL = 0.5;
const FRICTION = 0.85;
const JUMP_VELOCITY = -12.5;
const MAX_RUN_SPEED = 5.2;
const REACH = 6; // tiles

// Day/Night cycle
const DAY_NIGHT_CYCLE_DURATION = 600; // seconds for a full day/night cycle
const DAY_PORTION = 0.7; // 70% day, 30% night

// Tile IDs
const TILE = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
  SAND: 5,
  GLASS: 6,
  TORCH: 7,
  BRICK: 8,
};

const TILE_COLORS = {
  [TILE.AIR]: null,
  [TILE.GRASS]: '#4db050',
  [TILE.DIRT]: '#7a4b25',
  [TILE.STONE]: '#888a8c',
  [TILE.WOOD]: '#a3713a',
  [TILE.SAND]: '#e6d098',
  [TILE.GLASS]: 'rgba(175, 238, 238, 0.7)',
  [TILE.TORCH]: '#ffcc33',
  [TILE.BRICK]: '#bc4a3c',
};

// Tile properties
const TILE_PROPS = {
  [TILE.TORCH]: { emitsLight: true, lightRadius: 120 },
};

// World data
const world = new Array(WORLD_HEIGHT)
  .fill(0)
  .map(() => new Array(WORLD_WIDTH).fill(TILE.AIR));

// Utility RNG
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateWorld(seed = 1337) {
  const rand = mulberry32(seed);
  // Simple 1D heightmap using layered noise-ish perturbations
  let base = Math.floor(WORLD_HEIGHT * 0.55);
  const heights = [];
  let h = base;
  for (let x = 0; x < WORLD_WIDTH; x++) {
    // random walk with bounds
    const step = (rand() - 0.5) * 2;
    h += Math.sign(step) * (rand() < 0.55 ? 1 : 0);
    h = Math.max(20, Math.min(WORLD_HEIGHT - 15, h));
    heights.push(h);
  }

  // Generate biome regions
  const biomes = [];
  let currentBiome = 'forest';
  let biomeLength = 20 + Math.floor(rand() * 30);
  
  for (let x = 0; x < WORLD_WIDTH; x++) {
    if (biomeLength <= 0) {
      // Switch biome
      currentBiome = currentBiome === 'forest' ? 'desert' : 'forest';
      biomeLength = 20 + Math.floor(rand() * 30);
    }
    biomes.push(currentBiome);
    biomeLength--;
  }

  for (let x = 0; x < WORLD_WIDTH; x++) {
    const groundY = heights[x];
    const biome = biomes[x];
    
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      if (y > groundY + 20) {
        world[y][x] = TILE.STONE;
      } else if (y > groundY + 3) {
        world[y][x] = TILE.DIRT;
      } else if (y === groundY) {
        // Surface tile depends on biome
        if (biome === 'desert') {
          world[y][x] = TILE.SAND;
        } else {
          world[y][x] = TILE.GRASS;
        }
      } else if (y > groundY && y <= groundY + 3) {
        // Top layers depend on biome
        if (biome === 'desert') {
          world[y][x] = TILE.SAND;
        } else {
          world[y][x] = TILE.DIRT;
        }
      } else {
        world[y][x] = TILE.AIR;
      }
    }
    
    // Sprinkle some stone patches
    if (rand() < 0.1) {
      const sy = groundY + 5 + Math.floor(rand() * 10);
      const sh = 3 + Math.floor(rand() * 4);
      const sw = 3 + Math.floor(rand() * 6);
      for (let yy = sy; yy < sy + sh && yy < WORLD_HEIGHT; yy++) {
        for (let xx = x; xx < x + sw && xx < WORLD_WIDTH; xx++) {
          if (world[yy][xx] !== TILE.AIR) world[yy][xx] = TILE.STONE;
        }
      }
    }
    
    // Add some wood in forest biomes
    if (biome === 'forest' && rand() < 0.03) {
      const treeHeight = 5 + Math.floor(rand() * 3);
      for (let ty = 0; ty < treeHeight; ty++) {
        const treeY = groundY - ty - 1;
        if (treeY >= 0) {
          world[treeY][x] = TILE.WOOD;
        }
      }
    }
  }
}

// World helpers
function inBounds(tx, ty) {
  return tx >= 0 && ty >= 0 && tx < WORLD_WIDTH && ty < WORLD_HEIGHT;
}
function isSolid(tileId) {
  return tileId !== TILE.AIR;
}
function getTile(tx, ty) {
  if (!inBounds(tx, ty)) return TILE.STONE; // treat out-of-bounds as solid
  return world[ty][tx];
}
function setTile(tx, ty, id) {
  if (!inBounds(tx, ty)) return;
  world[ty][tx] = id;
}

// Player
const player = {
  x: (WORLD_WIDTH / 2) * TILE_SIZE,
  y: 0,
  vx: 0,
  vy: 0,
  width: 18,
  height: 34,
  onGround: false,
  facing: 1,
  anim: { time: 0, walk: 0, state: 'idle' },
  health: 100,
  maxHealth: 100,
  invulnerableTime: 0, // Invulnerability after taking damage
  lastDamageTime: 0,
};

// Camera
const camera = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
};

// Game state
const gameState = {
  dayTime: 0, // 0 to 1 representing time of day
  totalTime: 0, // total game time in seconds
  isDaytime: true,
  showCraftingMenu: false,
  inventory: {}, // Count of each item type
  weather: {
    type: 'clear', // 'clear', 'rain', 'storm'
    intensity: 0, // 0 to 1
    timeLeft: 0, // seconds
    particles: [] // rain/snow particles
  }
};

// Crafting recipes
const RECIPES = [
  { input: { [TILE.SAND]: 2 }, output: { [TILE.GLASS]: 1 }, name: "Glass" },
  { input: { [TILE.STONE]: 3 }, output: { [TILE.BRICK]: 1 }, name: "Brick" },
  { input: { [TILE.WOOD]: 1, [TILE.STONE]: 1 }, output: { [TILE.TORCH]: 4 }, name: "Torch" },
];

// Input
const keys = new Set();
let mouse = { x: 0, y: 0, tx: 0, ty: 0, left: false, right: false };

// Inventory / hotbar
const HOTBAR = [TILE.DIRT, TILE.STONE, TILE.WOOD, TILE.SAND, TILE.BRICK, TILE.GLASS, TILE.TORCH, TILE.GRASS, TILE.AIR];
let selectedHotbar = 0; // index
const HOTBAR_SIZE = 9; // Number of slots

// Canvas setup
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.width = window.innerWidth;
  camera.height = window.innerHeight;
}
window.addEventListener('resize', resize);

// Controls
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  
  // Hotbar selection (1-9)
  if (e.key >= '1' && e.key <= '9') {
    selectedHotbar = parseInt(e.key, 10) - 1;
  }
  
  // Scroll through hotbar with Q and E
  if (e.key.toLowerCase() === 'q') {
    selectedHotbar = (selectedHotbar - 1 + HOTBAR_SIZE) % HOTBAR_SIZE;
  }
  if (e.key.toLowerCase() === 'e') {
    selectedHotbar = (selectedHotbar + 1) % HOTBAR_SIZE;
  }
  
  // Toggle crafting menu with C
  if (e.key.toLowerCase() === 'c') {
    gameState.showCraftingMenu = !gameState.showCraftingMenu;
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) mouse.left = true;
  if (e.button === 2) mouse.right = true;
});
canvas.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.left = false;
  if (e.button === 2) mouse.right = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Physics and collision
function aabbVsTiles(px, py, pw, ph, dx, dy) {
  // returns corrected position and whether grounded
  let newX = px + dx;
  let newY = py + dy;
  let grounded = false;

  // Horizontal resolution
  if (dx !== 0) {
    const dir = Math.sign(dx);
    const step = dir * Math.min(Math.abs(dx), TILE_SIZE);
    for (let moved = 0; moved < Math.abs(dx); moved += Math.abs(step)) {
      const nextX = px + Math.min(Math.abs(dx), moved + Math.abs(step)) * dir;
      const left = Math.floor((nextX - pw / 2) / TILE_SIZE);
      const right = Math.floor((nextX + pw / 2) / TILE_SIZE);
      const top = Math.floor((py - ph / 2) / TILE_SIZE);
      const bottom = Math.floor((py + ph / 2 - 1) / TILE_SIZE);
      let collided = false;
      for (let ty = top; ty <= bottom; ty++) {
        const tx = dir > 0 ? right : left;
        if (isSolid(getTile(tx, ty))) {
          collided = true;
          break;
        }
      }
      if (collided) {
        newX = dir > 0 ? (right * TILE_SIZE - pw / 2) : ((left + 1) * TILE_SIZE + pw / 2);
        // stop horizontal motion
        return { x: newX, y: py, grounded: false, hitX: true, hitY: false };
      }
      newX = nextX;
    }
  }

  // Vertical resolution
  if (dy !== 0) {
    const dir = Math.sign(dy);
    const step = dir * Math.min(Math.abs(dy), TILE_SIZE);
    for (let moved = 0; moved < Math.abs(dy); moved += Math.abs(step)) {
      const nextY = py + Math.min(Math.abs(dy), moved + Math.abs(step)) * dir;
      const left = Math.floor((newX - pw / 2) / TILE_SIZE);
      const right = Math.floor((newX + pw / 2) / TILE_SIZE);
      const top = Math.floor((nextY - ph / 2) / TILE_SIZE);
      const bottom = Math.floor((nextY + ph / 2 - 1) / TILE_SIZE);
      let collided = false;
      for (let tx = left; tx <= right; tx++) {
        const ty = dir > 0 ? bottom : top;
        if (isSolid(getTile(tx, ty))) {
          collided = true;
          break;
        }
      }
      if (collided) {
        if (dir > 0) {
          grounded = true;
          newY = bottom * TILE_SIZE - ph / 2;
        } else {
          newY = (top + 1) * TILE_SIZE + ph / 2;
        }
        return { x: newX, y: newY, grounded, hitX: false, hitY: true };
      }
      newY = nextY;
    }
  }

  return { x: newX, y: newY, grounded, hitX: false, hitY: false };
}

function update(dt) {
  // Update day/night cycle
  gameState.totalTime += dt / 60; // Convert to seconds
  gameState.dayTime = (gameState.totalTime % DAY_NIGHT_CYCLE_DURATION) / DAY_NIGHT_CYCLE_DURATION;
  gameState.isDaytime = gameState.dayTime < DAY_PORTION;
  
  // Update weather
  updateWeather(dt);
  
  // Update player health and damage
  updatePlayerHealth(dt);
  
  // Update message system
  updateMessage(dt);
  
  // Movement input
  const left = keys.has('a') || keys.has('arrowleft');
  const right = keys.has('d') || keys.has('arrowright');
  const jump = keys.has('w') || keys.has('arrowup') || keys.has(' ');

  const accel = player.onGround ? MOVE_ACCEL : AIR_ACCEL;
  if (left && !right) player.vx -= accel;
  if (right && !left) player.vx += accel;
  if (left && !right) player.facing = -1;
  if (right && !left) player.facing = 1;
  if (!(left ^ right)) player.vx *= FRICTION; // no input → slow down
  player.vx = Math.max(-MAX_RUN_SPEED, Math.min(MAX_RUN_SPEED, player.vx));

  if (jump && player.onGround) {
    player.vy = JUMP_VELOCITY;
    player.onGround = false;
  }

  // Gravity
  player.vy = Math.min(TERMINAL_VELOCITY, player.vy + GRAVITY);

  // Integrate with collisions
  const resultX = aabbVsTiles(player.x, player.y, player.width, player.height, player.vx, 0);
  player.x = resultX.x;
  if (resultX.hitX) player.vx = 0;

  const resultY = aabbVsTiles(player.x, player.y, player.width, player.height, 0, player.vy);
  player.y = resultY.y;
  if (resultY.hitY) player.vy = 0;
  player.onGround = resultY.grounded;

  // Update animation state
  if (window.PlayerAnim) {
    window.PlayerAnim.update(player, dt);
  }

  // Camera follow
  const marginX = camera.width * 0.3;
  const marginY = camera.height * 0.3;
  const targetX = player.x - camera.width / 2;
  const targetY = player.y - camera.height / 2;
  camera.x += (targetX - camera.x) * 0.15;
  camera.y += (targetY - camera.y) * 0.15;
  camera.x = Math.max(0, Math.min(camera.x, WORLD_WIDTH * TILE_SIZE - camera.width));
  camera.y = Math.max(0, Math.min(camera.y, WORLD_HEIGHT * TILE_SIZE - camera.height));

  // Mouse to tile
  const worldMouseX = camera.x + mouse.x;
  const worldMouseY = camera.y + mouse.y;
  mouse.tx = Math.floor(worldMouseX / TILE_SIZE);
  mouse.ty = Math.floor(worldMouseY / TILE_SIZE);

  // Interact: mine/place
  const pxTile = player.x / TILE_SIZE;
  const pyTile = player.y / TILE_SIZE;
  const dist = Math.hypot(mouse.tx - pxTile, mouse.ty - pyTile);
  const inReach = dist <= REACH;

  if (inReach) {
    if (mouse.left) {
      // mine (remove solid tile)
      const t = getTile(mouse.tx, mouse.ty);
      if (t !== TILE.AIR) {
        // Add to inventory
        gameState.inventory[t] = (gameState.inventory[t] || 0) + 1;
        
        // Remove from world
        setTile(mouse.tx, mouse.ty, TILE.AIR);
      }
    } else if (mouse.right) {
      // place selected if empty and not inside player
      const placeId = HOTBAR[selectedHotbar];
      if (placeId !== TILE.AIR && getTile(mouse.tx, mouse.ty) === TILE.AIR) {
        // Check if we have this item in inventory
        if (gameState.inventory[placeId] > 0 || placeId === TILE.DIRT) { // Dirt is infinite
          // prevent placing inside player's AABB
          const tileWorldX = mouse.tx * TILE_SIZE + TILE_SIZE / 2;
          const tileWorldY = mouse.ty * TILE_SIZE + TILE_SIZE / 2;
          const intersectsX =
            Math.abs(tileWorldX - player.x) < (TILE_SIZE + player.width) / 2;
          const intersectsY =
            Math.abs(tileWorldY - player.y) < (TILE_SIZE + player.height) / 2;
          
          if (!(intersectsX && intersectsY)) {
            setTile(mouse.tx, mouse.ty, placeId);
            
            // Remove from inventory (except dirt which is infinite)
            if (placeId !== TILE.DIRT) {
              gameState.inventory[placeId]--;
            }
          }
        }
      }
    }
  }
}

function draw() {
  // Sky with day/night cycle
  const timeOfDay = gameState.dayTime;
  let skyColor;
  
  if (timeOfDay < 0.25) { // Dawn
    const t = timeOfDay / 0.25;
    skyColor = lerpColor('#0a1a40', '#87ceeb', t);
  } else if (timeOfDay < 0.75) { // Day
    const t = (timeOfDay - 0.25) / 0.5;
    skyColor = lerpColor('#87ceeb', '#ff9e4f', t); // Day to sunset
  } else { // Dusk to night
    const t = (timeOfDay - 0.75) / 0.25;
    skyColor = lerpColor('#ff9e4f', '#0a1a40', t); // Sunset to night
  }
  
  ctx.fillStyle = skyColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Add stars at night
  if (timeOfDay > 0.8 || timeOfDay < 0.2) {
    drawStars();
  }
  
  // Apply weather effects to sky
  if (gameState.weather.type !== 'clear') {
    // Darken sky during rain/storm
    const darkenAmount = gameState.weather.intensity * 0.3;
    ctx.fillStyle = `rgba(0, 0, 0, ${darkenAmount})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Visible tile bounds
  const startX = Math.max(0, Math.floor(camera.x / TILE_SIZE) - 1);
  const endX = Math.min(WORLD_WIDTH, Math.ceil((camera.x + camera.width) / TILE_SIZE) + 1);
  const startY = Math.max(0, Math.floor(camera.y / TILE_SIZE) - 1);
  const endY = Math.min(WORLD_HEIGHT, Math.ceil((camera.y + camera.height) / TILE_SIZE) + 1);

  // Parallax background hills (simple)
  ctx.save();
  ctx.translate(-camera.x * 0.3, -camera.y * 0.2);
  ctx.fillStyle = '#8fd08f';
  for (let i = 0; i < 6; i++) {
    const baseY = 200 + i * 30;
    ctx.fillRect(i * 300, baseY, 260, 9999);
  }
  ctx.restore();

  // Find light sources
  const lightSources = [];
  
  // Player is always a light source
  lightSources.push({
    x: player.x,
    y: player.y,
    radius: 150
  });
  
  // Find torch tiles in visible area
  if (!gameState.isDaytime) {
    for (let ty = startY; ty < endY; ty++) {
      for (let tx = startX; tx < endX; tx++) {
        const t = world[ty][tx];
        if (t === TILE.TORCH) {
          lightSources.push({
            x: tx * TILE_SIZE + TILE_SIZE/2,
            y: ty * TILE_SIZE + TILE_SIZE/2,
            radius: TILE_PROPS[TILE.TORCH].lightRadius
          });
        }
      }
    }
  }
  
  // Ground tiles with lighting
  const isDark = !gameState.isDaytime;
  const darknessFactor = isDark ? 0.7 : 0;
  
  for (let ty = startY; ty < endY; ty++) {
    for (let tx = startX; tx < endX; tx++) {
      const t = world[ty][tx];
      if (t === TILE.AIR) continue;
      
      let color = TILE_COLORS[t] || '#000';
      
      // Apply darkness based on time of day
      if (isDark) {
        const tileX = tx * TILE_SIZE + TILE_SIZE/2;
        const tileY = ty * TILE_SIZE + TILE_SIZE/2;
        
        // Calculate light level from all sources
        let lightLevel = 0;
        
        for (const source of lightSources) {
          const distX = Math.abs(tileX - source.x);
          const distY = Math.abs(tileY - source.y);
          const dist = Math.sqrt(distX * distX + distY * distY);
          
          // Add light from this source
          const sourceLightFactor = Math.max(0, Math.min(1, 1 - (dist / source.radius)));
          lightLevel = Math.max(lightLevel, sourceLightFactor);
        }
        
        // Darken tiles based on light level
        color = darkenColor(color, darknessFactor * (1 - lightLevel));
      }
      
      const sx = Math.floor(tx * TILE_SIZE - camera.x);
      const sy = Math.floor(ty * TILE_SIZE - camera.y);
      
      // Special rendering for certain tiles
      if (t === TILE.TORCH) {
        // Draw torch base
        ctx.fillStyle = '#8B4513'; // Brown for torch stick
        ctx.fillRect(sx + TILE_SIZE/2 - 2, sy + TILE_SIZE/2, 4, TILE_SIZE/2);
        
        // Draw flame with animation
        const flameSize = 1 + Math.sin(gameState.totalTime * 10) * 0.5;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(sx + TILE_SIZE/2, sy + TILE_SIZE/2 - 6 * flameSize);
        ctx.lineTo(sx + TILE_SIZE/2 - 4, sy + TILE_SIZE/2);
        ctx.lineTo(sx + TILE_SIZE/2 + 4, sy + TILE_SIZE/2);
        ctx.closePath();
        ctx.fill();
        
        // Draw glow effect
        if (isDark) {
          const gradient = ctx.createRadialGradient(
            sx + TILE_SIZE/2, sy + TILE_SIZE/2 - 3, 0,
            sx + TILE_SIZE/2, sy + TILE_SIZE/2 - 3, TILE_SIZE
          );
          gradient.addColorStop(0, 'rgba(255, 200, 0, 0.3)');
          gradient.addColorStop(1, 'rgba(255, 200, 0, 0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(sx - TILE_SIZE, sy - TILE_SIZE, TILE_SIZE * 3, TILE_SIZE * 3);
        }
      } else if (t === TILE.GLASS) {
        // Glass is semi-transparent
        ctx.fillStyle = color;
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
        
        // Add reflection highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(sx + 2, sy + 2, 5, 5);
      } else {
        // Standard tile rendering
        ctx.fillStyle = color;
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
      }
      
      // outline
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }
  }

  // Player (animated)
  if (window.PlayerAnim) {
    window.PlayerAnim.draw(ctx, player, camera);
  }

  // Cursor highlight
  const hx = Math.floor(mouse.tx * TILE_SIZE - camera.x);
  const hy = Math.floor(mouse.ty * TILE_SIZE - camera.y);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(hx + 1, hy + 1, TILE_SIZE - 2, TILE_SIZE - 2);

  // Hotbar
  const barW = HOTBAR_SIZE * (TILE_SIZE + 8) + 8;
  const barX = (camera.width - barW) / 2;
  const barY = 12;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(barX, barY, barW, TILE_SIZE + 16);
  
  for (let i = 0; i < HOTBAR.length; i++) {
    const x = barX + 8 + i * (TILE_SIZE + 8);
    const y = barY + 8;
    
    // Selected slot highlight
    ctx.fillStyle = i === selectedHotbar ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)';
    ctx.fillRect(x - 2, y - 2, TILE_SIZE + 4, TILE_SIZE + 4);
    
    const id = HOTBAR[i];
    if (id !== TILE.AIR) {
      // Draw tile
      ctx.fillStyle = TILE_COLORS[id];
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      
      // Special rendering for torch
      if (id === TILE.TORCH) {
        // Draw flame
        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.moveTo(x + TILE_SIZE/2, y + 4);
        ctx.lineTo(x + TILE_SIZE/2 - 3, y + 10);
        ctx.lineTo(x + TILE_SIZE/2, y + 8);
        ctx.lineTo(x + TILE_SIZE/2 + 3, y + 10);
        ctx.closePath();
        ctx.fill();
      }
      
      // Draw outline
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }
    
    // Draw slot number
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px sans-serif';
    ctx.fillText((i + 1).toString(), x + 3, y + TILE_SIZE - 3);
  }
  
  // Show current item name
  const currentItem = Object.keys(TILE).find(key => TILE[key] === HOTBAR[selectedHotbar]);
  if (currentItem) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '14px sans-serif';
    ctx.fillText(currentItem.toLowerCase(), barX + barW / 2, barY + TILE_SIZE + 30);
  }
  
  // Draw health bar
  const healthBarWidth = 200;
  const healthBarHeight = 15;
  const healthBarX = 20;
  const healthBarY = 20;
  
  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
  
  // Health amount
  const healthPercent = player.health / player.maxHealth;
  let healthColor;
  
  if (healthPercent > 0.6) {
    healthColor = '#4CAF50'; // Green
  } else if (healthPercent > 0.3) {
    healthColor = '#FFC107'; // Yellow
  } else {
    healthColor = '#F44336'; // Red
  }
  
  // Flash when recently damaged
  if (player.invulnerableTime > 0) {
    const flashIntensity = Math.sin(gameState.totalTime * 30) * 0.5 + 0.5;
    healthColor = lerpColor(healthColor, '#FFFFFF', flashIntensity * 0.7);
  }
  
  ctx.fillStyle = healthColor;
  ctx.fillRect(
    healthBarX + 2, 
    healthBarY + 2, 
    (healthBarWidth - 4) * healthPercent, 
    healthBarHeight - 4
  );
  
  // Health text
  ctx.fillStyle = 'white';
  ctx.font = '12px sans-serif';
  ctx.fillText(
    `${Math.ceil(player.health)} / ${player.maxHealth}`, 
    healthBarX + healthBarWidth / 2 - 20, 
    healthBarY + healthBarHeight - 3
  );
  
  // Draw minimap
  drawMinimap();
  
  // Draw weather particles
  drawWeather();
  
  // Draw game message
  drawMessage();
  
  // Draw crafting menu if open
  if (gameState.showCraftingMenu) {
    drawCraftingMenu();
  }
}

function drawWeather() {
  const weather = gameState.weather;
  
  if (weather.type === 'clear') return;
  
  // Draw rain/storm particles
  ctx.strokeStyle = weather.type === 'rain' ? 
    'rgba(180, 200, 255, 0.7)' : 
    'rgba(200, 200, 255, 0.9)';
  ctx.lineWidth = weather.type === 'rain' ? 1 : 2;
  
  for (const particle of weather.particles) {
    const x = particle.x - camera.x;
    const y = particle.y - camera.y;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    
    // Angle depends on weather type
    const angle = weather.type === 'rain' ? Math.PI / 12 : Math.PI / 8;
    const endX = x - Math.sin(angle) * particle.length;
    const endY = y + Math.cos(angle) * particle.length;
    
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }
  
  // Add lightning for storms
  if (weather.type === 'storm' && Math.random() < 0.01 * weather.intensity) {
    drawLightning();
  }
}

function drawMinimap() {
  const minimapWidth = 150;
  const minimapHeight = 100;
  const minimapX = camera.width - minimapWidth - 20;
  const minimapY = 20;
  const scale = minimapWidth / (WORLD_WIDTH * TILE_SIZE);
  
  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(minimapX, minimapY, minimapWidth, minimapHeight);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.strokeRect(minimapX, minimapY, minimapWidth, minimapHeight);
  
  // Draw world tiles (simplified)
  const tileStep = Math.max(1, Math.floor(1 / scale)); // Skip tiles for performance
  
  for (let y = 0; y < WORLD_HEIGHT; y += tileStep) {
    for (let x = 0; x < WORLD_WIDTH; x += tileStep) {
      const t = world[y][x];
      if (t === TILE.AIR) continue;
      
      const color = TILE_COLORS[t];
      const mx = minimapX + x * TILE_SIZE * scale;
      const my = minimapY + y * TILE_SIZE * scale;
      const mw = Math.max(1, TILE_SIZE * scale * tileStep);
      const mh = Math.max(1, TILE_SIZE * scale * tileStep);
      
      ctx.fillStyle = color;
      ctx.fillRect(mx, my, mw, mh);
    }
  }
  
  // Draw player position
  const playerX = minimapX + player.x * scale;
  const playerY = minimapY + player.y * scale;
  
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(playerX, playerY, 3, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw view area
  const viewX = minimapX + camera.x * scale;
  const viewY = minimapY + camera.y * scale;
  const viewWidth = camera.width * scale;
  const viewHeight = camera.height * scale;
  
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(viewX, viewY, viewWidth, viewHeight);
}

function drawLightning() {
  // Flash the screen
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw lightning bolt
  const startX = camera.x + Math.random() * camera.width;
  const startY = camera.y;
  const endY = camera.y + camera.height * 0.7;
  
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 2 + Math.random() * 2;
  
  ctx.beginPath();
  ctx.moveTo(startX - camera.x, 0);
  
  let currentX = startX;
  let currentY = startY;
  
  // Create zig-zag pattern
  while (currentY < endY) {
    const nextY = currentY + 20 + Math.random() * 30;
    const nextX = currentX + (Math.random() * 100 - 50);
    
    ctx.lineTo(nextX - camera.x, nextY - camera.y);
    
    currentX = nextX;
    currentY = nextY;
  }
  
  ctx.stroke();
}

function drawCraftingMenu() {
  const menuWidth = 300;
  const menuHeight = 250;
  const menuX = (camera.width - menuWidth) / 2;
  const menuY = (camera.height - menuHeight) / 2;
  
  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(menuX, menuY, menuWidth, menuHeight);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.strokeRect(menuX, menuY, menuWidth, menuHeight);
  
  // Title
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('Crafting', menuX + 20, menuY + 30);
  
  // Instructions
  ctx.font = '12px sans-serif';
  ctx.fillText('Click a recipe to craft. Press C to close.', menuX + 20, menuY + 50);
  
  // Inventory
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('Inventory:', menuX + 20, menuY + 80);
  
  let invY = menuY + 100;
  for (const [tileId, count] of Object.entries(gameState.inventory)) {
    if (count <= 0) continue;
    
    const tileName = Object.keys(TILE).find(key => TILE[key] == tileId);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '12px sans-serif';
    ctx.fillText(`${tileName}: ${count}`, menuX + 30, invY);
    
    // Draw tile icon
    ctx.fillStyle = TILE_COLORS[tileId];
    ctx.fillRect(menuX + 20, invY - 10, 10, 10);
    
    invY += 20;
  }
  
  // Recipes
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText('Recipes:', menuX + menuWidth/2, menuY + 80);
  
  let recipeY = menuY + 100;
  for (const recipe of RECIPES) {
    // Check if we can craft this
    let canCraft = true;
    for (const [inputId, count] of Object.entries(recipe.input)) {
      if ((gameState.inventory[inputId] || 0) < count) {
        canCraft = false;
        break;
      }
    }
    
    // Recipe name
    ctx.fillStyle = canCraft ? 'rgba(255,255,255,0.9)' : 'rgba(150,150,150,0.5)';
    ctx.font = '12px sans-serif';
    ctx.fillText(recipe.name, menuX + menuWidth/2, recipeY);
    
    // Recipe details
    let inputText = '';
    for (const [inputId, count] of Object.entries(recipe.input)) {
      const inputName = Object.keys(TILE).find(key => TILE[key] == inputId);
      inputText += `${count} ${inputName}, `;
    }
    inputText = inputText.slice(0, -2);
    
    let outputText = '';
    for (const [outputId, count] of Object.entries(recipe.output)) {
      const outputName = Object.keys(TILE).find(key => TILE[key] == outputId);
      outputText += `${count} ${outputName}`;
    }
    
    ctx.fillStyle = canCraft ? 'rgba(200,200,200,0.7)' : 'rgba(150,150,150,0.5)';
    ctx.font = '10px sans-serif';
    ctx.fillText(`${inputText} → ${outputText}`, menuX + menuWidth/2, recipeY + 15);
    
    // Craft button
    if (canCraft) {
      ctx.fillStyle = 'rgba(100,200,100,0.6)';
      ctx.fillRect(menuX + menuWidth - 70, recipeY - 10, 50, 20);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText('Craft', menuX + menuWidth - 55, recipeY + 2);
      
      // Check for click
      if (mouse.left && 
          mouse.x >= menuX + menuWidth - 70 && 
          mouse.x <= menuX + menuWidth - 20 &&
          mouse.y >= recipeY - 10 && 
          mouse.y <= recipeY + 10) {
        
        // Consume inputs
        for (const [inputId, count] of Object.entries(recipe.input)) {
          gameState.inventory[inputId] -= count;
        }
        
        // Add outputs
        for (const [outputId, count] of Object.entries(recipe.output)) {
          gameState.inventory[outputId] = (gameState.inventory[outputId] || 0) + count;
        }
        
        // Reset mouse to prevent multiple crafts
        mouse.left = false;
      }
    }
    
    recipeY += 40;
  }
}

// Game loop
let last = 0;
function frame(ts) {
  const dt = Math.min(50, ts - last) / 16.6667; // ~60fps normalized
  last = ts;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

// Helper function to darken a color
function darkenColor(color, amount) {
  // Convert hex to RGB
  const r = parseInt(color.substring(1, 3), 16);
  const g = parseInt(color.substring(3, 5), 16);
  const b = parseInt(color.substring(5, 7), 16);
  
  // Darken
  const factor = 1 - amount;
  const newR = Math.max(0, Math.floor(r * factor));
  const newG = Math.max(0, Math.floor(g * factor));
  const newB = Math.max(0, Math.floor(b * factor));
  
  // Convert back to hex
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

// Helper function to interpolate between colors
function lerpColor(color1, color2, t) {
  // Convert hex to RGB
  const r1 = parseInt(color1.substring(1, 3), 16);
  const g1 = parseInt(color1.substring(3, 5), 16);
  const b1 = parseInt(color1.substring(5, 7), 16);
  
  const r2 = parseInt(color2.substring(1, 3), 16);
  const g2 = parseInt(color2.substring(3, 5), 16);
  const b2 = parseInt(color2.substring(5, 7), 16);
  
  // Interpolate
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  
  // Convert back to hex
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Player health system
function updatePlayerHealth(dt) {
  // Update invulnerability timer
  if (player.invulnerableTime > 0) {
    player.invulnerableTime -= dt / 60;
  }
  
  // Fall damage
  if (player.vy > TERMINAL_VELOCITY * 0.8 && player.onGround && !player.wasOnGround) {
    const fallDamage = Math.max(0, Math.floor((player.vy - TERMINAL_VELOCITY * 0.7) * 5));
    if (fallDamage > 0) {
      damagePlayer(fallDamage);
    }
  }
  player.wasOnGround = player.onGround;
  
  // Lightning damage
  if (gameState.weather.type === 'storm' && 
      !gameState.isDaytime && 
      Math.random() < 0.0001 * dt && 
      !isSolid(getTile(Math.floor(player.x / TILE_SIZE), Math.floor((player.y / TILE_SIZE) - 2)))) {
    // Player is outside during a storm
    damagePlayer(10 + Math.floor(Math.random() * 10));
    drawLightning(); // Visual feedback
  }
  
  // Health regeneration (slow)
  if (player.health < player.maxHealth && 
      gameState.totalTime - player.lastDamageTime > 5) { // 5 seconds since last damage
    player.health = Math.min(player.maxHealth, player.health + 0.01 * dt / 60);
  }
  
  // Death check
  if (player.health <= 0) {
    // Respawn player
    player.health = player.maxHealth;
    spawnPlayerOnSurface();
  }
}

function damagePlayer(amount) {
  if (player.invulnerableTime > 0) return;
  
  player.health = Math.max(0, player.health - amount);
  player.invulnerableTime = 1; // 1 second of invulnerability
  player.lastDamageTime = gameState.totalTime;
}

// Weather system
function updateWeather(dt) {
  const weather = gameState.weather;
  
  // Update existing weather
  if (weather.timeLeft > 0) {
    weather.timeLeft -= dt / 60; // Convert to seconds
    
    if (weather.timeLeft <= 0) {
      // Weather is ending
      weather.type = 'clear';
      weather.intensity = 0;
      weather.particles = [];
    }
  } else if (Math.random() < 0.001 * dt) {
    // Random chance to start new weather
    startNewWeather();
  }
  
  // Update particles
  updateWeatherParticles(dt);
}

function startNewWeather() {
  const weather = gameState.weather;
  const rand = Math.random();
  
  if (rand < 0.7) {
    // Rain
    weather.type = 'rain';
    weather.intensity = 0.3 + Math.random() * 0.7;
    weather.timeLeft = 30 + Math.random() * 120; // 30-150 seconds
  } else {
    // Storm
    weather.type = 'storm';
    weather.intensity = 0.6 + Math.random() * 0.4;
    weather.timeLeft = 20 + Math.random() * 60; // 20-80 seconds
  }
  
  // Initialize particles
  weather.particles = [];
}

function updateWeatherParticles(dt) {
  const weather = gameState.weather;
  
  if (weather.type === 'clear') return;
  
  // Add new particles
  const particleCount = weather.type === 'rain' ? 
    Math.floor(weather.intensity * 3 * dt) : 
    Math.floor(weather.intensity * 5 * dt);
  
  for (let i = 0; i < particleCount; i++) {
    const x = camera.x + Math.random() * camera.width;
    const y = camera.y;
    const speed = weather.type === 'rain' ? 
      10 + Math.random() * 15 : 
      15 + Math.random() * 20;
    
    weather.particles.push({
      x,
      y,
      speed,
      length: weather.type === 'rain' ? 10 + Math.random() * 15 : 5 + Math.random() * 10
    });
  }
  
  // Update existing particles
  for (let i = weather.particles.length - 1; i >= 0; i--) {
    const particle = weather.particles[i];
    
    // Move particle
    particle.y += particle.speed * dt / 5;
    
    // Check if particle is out of view
    if (particle.y > camera.y + camera.height) {
      // Remove particle
      weather.particles.splice(i, 1);
    } else {
      // Check collision with tiles
      const tx = Math.floor(particle.x / TILE_SIZE);
      const ty = Math.floor(particle.y / TILE_SIZE);
      
      if (isSolid(getTile(tx, ty))) {
        // Hit solid tile, remove particle
        weather.particles.splice(i, 1);
        
        // If it's raining on sand, small chance to convert to dirt
        if (weather.type === 'rain' && getTile(tx, ty) === TILE.SAND && Math.random() < 0.001) {
          setTile(tx, ty, TILE.DIRT);
        }
      }
    }
  }
}

// Draw stars in the night sky
function drawStars() {
  const starCount = 100;
  const starOpacity = Math.min(1, Math.max(0, (gameState.dayTime > 0.8 ? 
                                              (gameState.dayTime - 0.8) / 0.1 : 
                                              (0.2 - gameState.dayTime) / 0.1)));
  
  ctx.fillStyle = `rgba(255, 255, 255, ${starOpacity * 0.7})`;
  
  // Use a deterministic pattern based on camera position
  const seed = Math.floor(camera.x / 100);
  const rand = mulberry32(seed);
  
  for (let i = 0; i < starCount; i++) {
    const x = (rand() * camera.width) + (camera.x * 0.1) % 20;
    const y = rand() * camera.height * 0.7;
    const size = rand() < 0.2 ? 2 : 1;
    
    ctx.fillRect(x, y, size, size);
  }
}

function spawnPlayerOnSurface() {
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    const t = getTile(Math.floor(WORLD_WIDTH / 2), y);
    if (t === TILE.GRASS) {
      player.x = (WORLD_WIDTH / 2) * TILE_SIZE;
      player.y = (y - 2) * TILE_SIZE;
      return;
    }
  }
}

// Save/Load system
function saveGame() {
  const saveData = {
    world: world,
    player: {
      x: player.x,
      y: player.y,
      health: player.health,
      maxHealth: player.maxHealth
    },
    inventory: gameState.inventory
  };
  
  try {
    localStorage.setItem('terrariaCloneSave', JSON.stringify(saveData));
    console.log('Game saved successfully');
    
    // Show save indicator
    showMessage('Game saved!');
  } catch (e) {
    console.error('Failed to save game:', e);
  }
}

function loadGame() {
  try {
    const saveData = JSON.parse(localStorage.getItem('terrariaCloneSave'));
    
    if (saveData && saveData.world) {
      // Load world
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let x = 0; x < WORLD_WIDTH; x++) {
          world[y][x] = saveData.world[y][x];
        }
      }
      
      // Load player
      if (saveData.player) {
        player.x = saveData.player.x;
        player.y = saveData.player.y;
        player.health = saveData.player.health;
        player.maxHealth = saveData.player.maxHealth;
      }
      
      // Load inventory
      if (saveData.inventory) {
        gameState.inventory = saveData.inventory;
      }
      
      console.log('Game loaded successfully');
      showMessage('Game loaded!');
      return true;
    }
  } catch (e) {
    console.error('Failed to load game:', e);
  }
  
  return false;
}

// Message system
let gameMessage = { text: '', timer: 0 };

function showMessage(text, duration = 3) {
  gameMessage.text = text;
  gameMessage.timer = duration;
}

function updateMessage(dt) {
  if (gameMessage.timer > 0) {
    gameMessage.timer -= dt / 60;
  }
}

function drawMessage() {
  if (gameMessage.timer <= 0) return;
  
  const opacity = Math.min(1, gameMessage.timer);
  ctx.fillStyle = `rgba(0,0,0,${opacity * 0.7})`;
  ctx.fillRect(camera.width / 2 - 100, 70, 200, 40);
  
  ctx.fillStyle = `rgba(255,255,255,${opacity})`;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(gameMessage.text, camera.width / 2, 95);
  ctx.textAlign = 'left'; // Reset alignment
}

// Add save/load key handlers
window.addEventListener('keydown', (e) => {
  // Save game with F5
  if (e.key === 'F5') {
    e.preventDefault();
    saveGame();
  }
  
  // Load game with F9
  if (e.key === 'F9') {
    e.preventDefault();
    loadGame();
  }
});

// Boot
resize();

// Try to load saved game, or generate new world
if (!loadGame()) {
  generateWorld();
  spawnPlayerOnSurface();
}

requestAnimationFrame(frame);


