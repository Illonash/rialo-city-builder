/* =========================================================
   Rialo City Builder — Minimal sandbox with:
   - Kenney atlas (01_130x66_130x230.png)
   - One custom image asset: assets/hotelnew.png
   Click = place, Right-click = erase, G = toggle grid
   ========================================================= */

const $ = sel => document.querySelector(sel);
const mk = tag => document.createElement(tag);

// --- CANVAS & GRID SETTINGS
const GRID_N = 12;             // jumlah sel tiap sisi (bisa 12~20)
const TILE_W = 130;            // lebar tile iso (px)
const TILE_H = 66;             // tinggi tile iso (px)
const VIEW_W = 1800;           // ukuran awal kanvas
const VIEW_H = 1200;
const ORIGIN_Y_TILES = 3.2;    // geser peta turun (dalam satuan tinggi tile)

// --- ATLAS SETTINGS (Kenney sheet)
const ATLAS_COLS = 12;
const ATLAS_ROWS = 6;
const SPRITE_W = 130;
const SPRITE_H = 230;

// --- IMAGES
const atlasImg = new Image();
atlasImg.src = "assets/01_130x66_130x230.png";

const hotelImg = new Image();
hotelImg.src = "assets/hotelnew.png"; // 130x230 png transparan

// --- STATE
let canvasBG, canvasFG, ctxBG, ctxFG;
let placing = false;
let showGrid = true;
let activeEl = null;
let camera = { x: 0, y: 0, scale: 1 };

// tool object: { kind:'atlas', i, j } or { kind:'image', img }
let tool = { kind: 'atlas', i: 0, j: 0 };

// map cell object: same shape as tool
let map = Array.from({ length: GRID_N }, () =>
  Array.from({ length: GRID_N }, () => ({ kind: 'atlas', i: 0, j: 0 }))
);

// --- INIT
window.addEventListener("load", () => {
  setupCanvases();
  buildToolsPanel();
  attachStageEvents();
  draw();
});

// ---------------------------------------------------------
// CANVAS SETUP
function setupCanvases() {
  const stage = $("#stage");
  canvasBG = $("#bg");
  canvasFG = $("#fg");

  canvasBG.width = VIEW_W;
  canvasBG.height = VIEW_H;
  canvasFG.width = VIEW_W;
  canvasFG.height = VIEW_H;

  ctxBG = canvasBG.getContext("2d");
  ctxFG = canvasFG.getContext("2d");

  // tempatkan origin di tengah horizontal, dan geser ke bawah sedikit
  ctxBG.setTransform(1,0,0,1,0,0);
  ctxBG.translate(VIEW_W/2, TILE_H * ORIGIN_Y_TILES);
  ctxFG.setTransform(1,0,0,1,0,0);
  ctxFG.translate(VIEW_W/2, TILE_H * ORIGIN_Y_TILES);

  canvasFG.oncontextmenu = e => e.preventDefault(); // disable menu right-click
}

// ---------------------------------------------------------
// TOOLS PANEL
function buildToolsPanel() {
  const tools = $("#tools");

  // Generate beberapa contoh tombol dari atlas Kenney (baris 0, kolom 0..8)
  // Kamu bisa tambah/ubah indeks sesuai kebutuhan
  const picks = [
    { i:0, j:0 }, { i:0, j:1 }, { i:0, j:2 }, { i:0, j:3 },
    { i:1, j:0 }, { i:1, j:1 }, { i:1, j:2 }, { i:1, j:3 },
    { i:2, j:0 }, { i:2, j:1 }, { i:2, j:2 }, { i:3, j:0 }
  ];

  picks.forEach((p, idx) => {
    const t = mk("div");
    t.className = "tool atlas";
    t.style.backgroundPosition = `-${p.j*SPRITE_W}px -${p.i*SPRITE_H}px`;
    t.title = `Atlas ${p.i},${p.j}`;
    t.addEventListener("click", () => {
      selectTool(t);
      tool = { kind: 'atlas', i: p.i, j: p.j };
    });
    if (idx === 0) { selectTool(t); } // default selected
    tools.appendChild(t);
  });

  // Tambahkan tombol untuk aset custom: hotelnew.png
  const custom = mk("div");
  custom.className = "tool";
  custom.style.backgroundImage = "url('assets/hotelnew.png')";
  custom.style.backgroundSize = "130px 230px";
  custom.title = "Rialo Hotel (custom)";
  custom.addEventListener("click", () => {
    selectTool(custom);
    tool = { kind: 'image', img: hotelImg };
  });
  tools.appendChild(custom);
}

function selectTool(el) {
  if (activeEl) activeEl.classList.remove("selected");
  activeEl = el;
  el.classList.add("selected");
}

// ---------------------------------------------------------
// EVENTS (place, erase, pan, zoom, grid toggle)
function attachStageEvents() {
  canvasFG.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", () => (placing = false));
  canvasFG.addEventListener("mousemove", onMouseMove);
  canvasFG.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", e => {
    if (e.key.toLowerCase() === "g") {
      showGrid = !showGrid; draw();
    }
  });

  // simple drag to pan
  let dragging = false, last = {x:0,y:0};
  canvasFG.addEventListener("mousedown", e => {
    if (e.button === 1) { // middle button for pan
      dragging = true; last = {x:e.clientX,y:e.clientY}; e.preventDefault();
    }
  });
  window.addEventListener("mousemove", e => {
    if (!dragging) return;
    const dx = (e.clientX - last.x);
    const dy = (e.clientY - last.y);
    last = {x:e.clientX,y:e.clientY};
    camera.x += dx;
    camera.y += dy;
    applyCamera();
    draw();
  });
  window.addEventListener("mouseup", () => dragging = false);
}

function onMouseDown(e) {
  if (e.button === 1) return; // middle = pan only
  const cell = screenToGrid(e.offsetX, e.offsetY);
  if (!cell) return;
  const {x,y} = cell;

  if (e.button === 2) {
    // erase → set atlas(0,0)
    map[x][y] = { kind:'atlas', i:0, j:0 };
  } else {
    // place current tool
    map[x][y] = (tool.kind === 'image')
      ? { kind:'image', img: tool.img }
      : { kind:'atlas', i: tool.i, j: tool.j };
  }
  placing = true;
  draw();
}

function onMouseMove(e) {
  if (placing && e.buttons & 1) { // keep placing while dragging left
    onMouseDown(e);
  }
  drawHover(e.offsetX, e.offsetY);
}

function onWheel(e) {
  e.preventDefault();
  const delta = Math.sign(e.deltaY);
  let s = camera.scale;
  s *= (delta > 0 ? 0.9 : 1.1);
  s = Math.max(0.4, Math.min(2.2, s));
  camera.scale = s;
  applyCamera();
  draw();
}

function applyCamera() {
  // reset transforms, reapply origin & camera
  ctxBG.setTransform(1,0,0,1,0,0);
  ctxBG.translate(VIEW_W/2 + camera.x, TILE_H*ORIGIN_Y_TILES + camera.y);
  ctxBG.scale(camera.scale, camera.scale);

  ctxFG.setTransform(1,0,0,1,0,0);
  ctxFG.translate(VIEW_W/2 + camera.x, TILE_H*ORIGIN_Y_TILES + camera.y);
  ctxFG.scale(camera.scale, camera.scale);
}

// ---------------------------------------------------------
// RENDER
function draw() {
  // clear both
  ctxBG.clearRect(-5000,-5000,10000,10000);

  // map
  for (let i=0;i<GRID_N;i++){
    for (let j=0;j<GRID_N;j++){
      drawCell(i,j,map[i][j]);
    }
  }

  // grid overlay
  if (showGrid) drawGrid();
}

function drawCell(i, j, cell) {
  ctxBG.save();
  ctxBG.translate((j - i) * (TILE_W/2), (i + j) * (TILE_H/2));

  if (cell.kind === 'image' && cell.img && cell.img.complete) {
    ctxBG.drawImage(cell.img, -SPRITE_W/2, -SPRITE_H + TILE_H, SPRITE_W, SPRITE_H);
  } else {
    const sx = (cell.j||0) * SPRITE_W;
    const sy = (cell.i||0) * SPRITE_H;
    ctxBG.drawImage(atlasImg, sx, sy, SPRITE_W, SPRITE_H, -SPRITE_W/2, -SPRITE_H + TILE_H, SPRITE_W, SPRITE_H);
  }
  ctxBG.restore();
}

function drawGrid() {
  ctxBG.save();
  ctxBG.strokeStyle = "rgba(0,0,0,.12)";
  ctxBG.lineWidth = 1;
  for (let i=0;i<GRID_N;i++){
    for (let j=0;j<GRID_N;j++){
      ctxBG.save();
      ctxBG.translate((j - i) * (TILE_W/2), (i + j) * (TILE_H/2));
      diamondPath(ctxBG);
      ctxBG.stroke();
      ctxBG.restore();
    }
  }
  ctxBG.restore();
}

function diamondPath(c){
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(TILE_W/2, TILE_H/2);
  c.lineTo(0, TILE_H);
  c.lineTo(-TILE_W/2, TILE_H/2);
  c.closePath();
}

// hover highlight only
function drawHover(px, py){
  ctxFG.clearRect(-5000,-5000,10000,10000);
  const cell = screenToGrid(px, py);
  if (!cell) return;
  const {x,y} = cell;

  ctxFG.save();
  ctxFG.translate((y - x) * (TILE_W/2), (x + y) * (TILE_H/2));
  ctxFG.fillStyle = "rgba(0,160,255,.18)";
  diamondPath(ctxFG);
  ctxFG.fill();
  ctxFG.restore();
}

// ---------------------------------------------------------
// COORD CONVERSIONS
function screenToGrid(px, py){
  // balik transform: dari screen ke world lalu ke grid
  // kompensasi camera & origin yang sudah diterapkan ke context
  const worldX = (px - (VIEW_W/2 + camera.x)) / camera.scale;
  const worldY = (py - (TILE_H*ORIGIN_Y_TILES + camera.y)) / camera.scale;

  // inverse iso transform
  const _y = worldY / (TILE_H/2);
  const _x = worldX / (TILE_W/2);
  const gx = Math.floor((_y - _x)/2);
  const gy = Math.floor((_y + _x)/2);

  if (gx<0 || gx>=GRID_N || gy<0 || gy>=GRID_N) return null;
  return { x: gx, y: gy };
}
