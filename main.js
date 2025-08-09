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

// Tile IDs
const TILE = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
};

const TILE_COLORS = {
  [TILE.AIR]: null,
  [TILE.GRASS]: '#4db050',
  [TILE.DIRT]: '#7a4b25',
  [TILE.STONE]: '#888a8c',
  [TILE.WOOD]: '#a3713a',
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

  for (let x = 0; x < WORLD_WIDTH; x++) {
    const groundY = heights[x];
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      if (y > groundY + 20) {
        world[y][x] = TILE.STONE;
      } else if (y > groundY + 3) {
        world[y][x] = TILE.DIRT;
      } else if (y === groundY) {
        world[y][x] = TILE.GRASS;
      } else if (y > groundY && y <= groundY + 3) {
        world[y][x] = TILE.DIRT;
      } else {
        world[y][x] = TILE.AIR;
      }
    }
    // Sprinkle some stone patches
    if (Math.random() < 0.1) {
      const sy = groundY + 5 + Math.floor(rand() * 10);
      const sh = 3 + Math.floor(rand() * 4);
      const sw = 3 + Math.floor(rand() * 6);
      for (let yy = sy; yy < sy + sh && yy < WORLD_HEIGHT; yy++) {
        for (let xx = x; xx < x + sw && xx < WORLD_WIDTH; xx++) {
          if (world[yy][xx] !== TILE.AIR) world[yy][xx] = TILE.STONE;
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
};

// Camera
const camera = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
};

// Input
const keys = new Set();
let mouse = { x: 0, y: 0, tx: 0, ty: 0, left: false, right: false };

// Inventory / hotbar
const HOTBAR = [TILE.DIRT, TILE.STONE, TILE.WOOD, TILE.GRASS, TILE.AIR];
let selectedHotbar = 0; // index

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
  if (e.key >= '1' && e.key <= '5') {
    selectedHotbar = parseInt(e.key, 10) - 1;
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
  // Movement input
  const left = keys.has('a') || keys.has('arrowleft');
  const right = keys.has('d') || keys.has('arrowright');
  const jump = keys.has('w') || keys.has('arrowup') || keys.has(' ');

  const accel = player.onGround ? MOVE_ACCEL : AIR_ACCEL;
  if (left && !right) player.vx -= accel;
  if (right && !left) player.vx += accel;
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
      if (t !== TILE.AIR) setTile(mouse.tx, mouse.ty, TILE.AIR);
    } else if (mouse.right) {
      // place selected if empty and not inside player
      const placeId = HOTBAR[selectedHotbar];
      if (placeId !== TILE.AIR && getTile(mouse.tx, mouse.ty) === TILE.AIR) {
        // prevent placing inside player's AABB
        const tileWorldX = mouse.tx * TILE_SIZE + TILE_SIZE / 2;
        const tileWorldY = mouse.ty * TILE_SIZE + TILE_SIZE / 2;
        const intersectsX =
          Math.abs(tileWorldX - player.x) < (TILE_SIZE + player.width) / 2;
        const intersectsY =
          Math.abs(tileWorldY - player.y) < (TILE_SIZE + player.height) / 2;
        if (!(intersectsX && intersectsY)) setTile(mouse.tx, mouse.ty, placeId);
      }
    }
  }
}

function draw() {
  // Sky
  ctx.fillStyle = '#87ceeb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

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

  // Ground tiles
  for (let ty = startY; ty < endY; ty++) {
    for (let tx = startX; tx < endX; tx++) {
      const t = world[ty][tx];
      if (t === TILE.AIR) continue;
      const color = TILE_COLORS[t] || '#000';
      const sx = Math.floor(tx * TILE_SIZE - camera.x);
      const sy = Math.floor(ty * TILE_SIZE - camera.y);
      ctx.fillStyle = color;
      ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
      // outline
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }
  }

  // Player
  const px = Math.floor(player.x - camera.x - player.width / 2);
  const py = Math.floor(player.y - camera.y - player.height / 2);
  ctx.fillStyle = '#3b6cff';
  ctx.fillRect(px, py, player.width, player.height);
  // eyes
  ctx.fillStyle = '#fff';
  ctx.fillRect(px + 5, py + 10, 4, 4);
  ctx.fillRect(px + 12, py + 10, 4, 4);

  // Cursor highlight
  const hx = Math.floor(mouse.tx * TILE_SIZE - camera.x);
  const hy = Math.floor(mouse.ty * TILE_SIZE - camera.y);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(hx + 1, hy + 1, TILE_SIZE - 2, TILE_SIZE - 2);

  // Hotbar
  const barW = 5 * (TILE_SIZE + 8) + 8;
  const barX = (camera.width - barW) / 2;
  const barY = 12;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(barX, barY, barW, TILE_SIZE + 16);
  for (let i = 0; i < HOTBAR.length; i++) {
    const x = barX + 8 + i * (TILE_SIZE + 8);
    const y = barY + 8;
    ctx.fillStyle = i === selectedHotbar ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)';
    ctx.fillRect(x - 2, y - 2, TILE_SIZE + 4, TILE_SIZE + 4);
    const id = HOTBAR[i];
    if (id !== TILE.AIR) {
      ctx.fillStyle = TILE_COLORS[id];
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }
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

// Boot
resize();
generateWorld();
spawnPlayerOnSurface();
requestAnimationFrame(frame);


