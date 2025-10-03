/* =========================================================
   Rialo City Builder — Patch:
   - Render base ground (ubin Kenney) agar “grid Kenney” kembali
   - Perbaiki ukuran tool & offset sprite
   - Click = place, Right-click = erase, G = toggle garis bantu
   ========================================================= */

const $ = sel => document.querySelector(sel);
const mk = tag => document.createElement(tag);

// ------- GRID & TILE
const GRID_N = 12;            // 12x12; bisa dinaikkan
const TILE_W = 130;           // lebar tile iso
const TILE_H = 66;            // tinggi tile iso
const SPRITE_W = 130;         // ukuran sprite atlas
const SPRITE_H = 230;

// ------- VIEW & CAMERA
const VIEW_W = 1800;
const VIEW_H = 1200;
const ORIGIN_Y_TILES = 3.2;   // geser peta ke bawah (dalam unit TILE_H)
let camera = { x: 0, y: 0, scale: 1 };

// ------- ATLAS KENNEY
const ATLAS_COLS = 12;
const ATLAS_ROWS = 6;
const atlasImg = new Image();
atlasImg.src = "assets/01_130x66_130x230.png";

// Pilih indeks ubin dasar dari atlas (ground polos Kenney).
// Biasanya baris 0 kolom 0 itu ubin datar. Ubah jika perlu.
const GROUND_I = 0;
const GROUND_J = 0;

// ------- ASET CUSTOM (contoh 1 gambar hotel)
const hotelImg = new Image();
hotelImg.src = "assets/hotelnew.png"; // 130x230 PNG transparan

// ------- STATE
let canvasBG, canvasFG, ctxBG, ctxFG;
let placing = false;
let showHelperGrid = true;   // garis bantu (opsional)
let activeEl = null;

// tool object: { kind:'atlas', i, j } or { kind:'image', img }
let tool = { kind: 'atlas', i: 0, j: 1 };  // default pilih salah satu atlas

// map cell object: sama bentuknya dengan tool
let map = Array.from({ length: GRID_N }, () =>
  Array.from({ length: GRID_N }, () => ({ kind:'atlas', i:0, j:0 }))
);

// =========================================================
// INIT
window.addEventListener("load", () => {
  setupCanvases();
  buildToolsPanel();
  attachStageEvents();
  draw();
});

// =========================================================
// CANVAS SETUP
function setupCanvases() {
  canvasBG = $("#bg");
  canvasFG = $("#fg");
  canvasBG.width = VIEW_W; canvasBG.height = VIEW_H;
  canvasFG.width = VIEW_W; canvasFG.height = VIEW_H;

  ctxBG = canvasBG.getContext("2d");
  ctxFG = canvasFG.getContext("2d");

  applyCamera();
  canvasFG.oncontextmenu = e => e.preventDefault();
}

// =========================================================
// TOOLS
function buildToolsPanel() {
  const tools = $("#tools");

  // Contoh pilihan dari atlas (ubah indeks sesuai selera)
  const picks = [
    { i:0, j:0 }, { i:0, j:1 }, { i:0, j:2 }, { i:0, j:3 },
    { i:1, j:0 }, { i:1, j:1 }, { i:1, j:2 }, { i:1, j:3 },
    { i:2, j:0 }, { i:2, j:1 }, { i:2, j:2 }, { i:3, j:0 },
  ];

  picks.forEach((p, idx) => {
    const t = mk("div");
    t.className = "tool atlas";
    t.style.backgroundPosition = `-${p.j*SPRITE_W}px -${p.i*SPRITE_H}px`;
    t.title = `Atlas ${p.i},${p.j}`;
    t.addEventListener("click", () => {
      selectTool(t);
      tool = { kind:'atlas', i:p.i, j:p.j };
    });
    if (idx === 0) selectTool(t);
    tools.appendChild(t);
  });

  // Tombol aset custom (hotel)
  const custom = mk("div");
  custom.className = "tool";
  custom.style.backgroundImage = "url('assets/hotelnew.png')";
  custom.style.backgroundSize = "130px 230px";
  custom.title = "Rialo Hotel (custom)";
  custom.addEventListener("click", () => {
    selectTool(custom);
    tool = { kind:'image', img: hotelImg };
  });
  tools.appendChild(custom);
}

function selectTool(el){
  if (activeEl) activeEl.classList.remove("selected");
  activeEl = el;
  el.classList.add("selected");
}

// =========================================================
// EVENTS
function attachStageEvents(){
  canvasFG.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", () => placing = false);
  canvasFG.addEventListener("mousemove", onMouseMove);
  canvasFG.addEventListener("wheel", onWheel, { passive:false });

  window.addEventListener("keydown", e => {
    if (e.key.toLowerCase() === "g"){
      showHelperGrid = !showHelperGrid;
      draw();
    }
  });

  // Middle-drag to pan
  let dragging = false, last = {x:0,y:0};
  canvasFG.addEventListener("mousedown", e => {
    if (e.button === 1){ dragging = true; last = {x:e.clientX,y:e.clientY}; e.preventDefault(); }
  });
  window.addEventListener("mousemove", e => {
    if (!dragging) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last = {x:e.clientX,y:e.clientY};
    camera.x += dx; camera.y += dy;
    applyCamera(); draw();
  });
  window.addEventListener("mouseup", () => dragging = false);
}

function onMouseDown(e){
  if (e.button === 1) return; // middle = pan
  const cell = screenToGrid(e.offsetX, e.offsetY);
  if (!cell) return;

  if (e.button === 2){
    map[cell.x][cell.y] = { kind:'atlas', i:GROUND_I, j:GROUND_J }; // erase → kembali ke ground
  }else{
    map[cell.x][cell.y] = (tool.kind === 'image')
      ? { kind:'image', img: tool.img }
      : { kind:'atlas', i: tool.i, j: tool.j };
  }
  placing = true;
  draw();
}

function onMouseMove(e){
  if (placing && (e.buttons & 1)){ onMouseDown(e); }
  drawHover(e.offsetX, e.offsetY);
}

function onWheel(e){
  e.preventDefault();
  const dir = Math.sign(e.deltaY);
  let s = camera.scale;
  s *= (dir > 0 ? 0.9 : 1.1);
  camera.scale = Math.max(0.5, Math.min(2.2, s));
  applyCamera(); draw();
}

function applyCamera(){
  // reset dan terapkan origin + kamera
  ctxBG.setTransform(1,0,0,1,0,0);
  ctxBG.translate(VIEW_W/2 + camera.x, TILE_H*ORIGIN_Y_TILES + camera.y);
  ctxBG.scale(camera.scale, camera.scale);

  ctxFG.setTransform(1,0,0,1,0,0);
  ctxFG.translate(VIEW_W/2 + camera.x, TILE_H*ORIGIN_Y_TILES + camera.y);
  ctxFG.scale(camera.scale, camera.scale);
}

// =========================================================
function draw(){
  // clear background
  ctxBG.clearRect(-5000,-5000,10000,10000);

  // 1) gambar BASE GROUND untuk seluruh papan
  for (let i=0;i<GRID_N;i++){
    for (let j=0;j<GRID_N;j++){
      drawAtlasAt(i, j, GROUND_I, GROUND_J);
    }
  }

  // 2) gambar isi cell (bangunan/objek)
  for (let i=0;i<GRID_N;i++){
    for (let j=0;j<GRID_N;j++){
      const cell = map[i][j];
      // skip ground default supaya tidak nutup
      if (cell.kind === 'atlas' && cell.i === GROUND_I && cell.j === GROUND_J) continue;
      drawCell(i, j, cell);
    }
  }

  // 3) garis bantu (optional)
  if (showHelperGrid) drawHelperGrid();
}

function drawCell(i, j, cell){
  if (cell.kind === 'image' && cell.img && cell.img.complete){
    drawImageAt(i, j, cell.img);
  }else{
    drawAtlasAt(i, j, cell.i||0, cell.j||0);
  }
}

// gambar sprite atlas pada sel (i,j)
function drawAtlasAt(i, j, ai, aj){
  const x = (j - i) * (TILE_W/2);
  const y = (i + j) * (TILE_H/2);
  ctxBG.drawImage(
    atlasImg,
    aj*SPRITE_W, ai*SPRITE_H, SPRITE_W, SPRITE_H,
    x - SPRITE_W/2, y - SPRITE_H + TILE_H,
    SPRITE_W, SPRITE_H
  );
}

// gambar image custom ukuran 130x230 pada sel (i,j)
function drawImageAt(i, j, img){
  const x = (j - i) * (TILE_W/2);
  const y = (i + j) * (TILE_H/2);
  ctxBG.drawImage(img, x - SPRITE_W/2, y - SPRITE_H + TILE_H, SPRITE_W, SPRITE_H);
}

// garis bantu diamond
function drawHelperGrid(){
  ctxBG.save();
  ctxBG.strokeStyle = "rgba(0,0,0,.15)";
  ctxBG.lineWidth = 1;
  for (let i=0;i<GRID_N;i++){
    for (let j=0;j<GRID_N;j++){
      const x = (j - i) * (TILE_W/2);
      const y = (i + j) * (TILE_H/2);
      ctxBG.beginPath();
      ctxBG.moveTo(x, y);
      ctxBG.lineTo(x + TILE_W/2, y + TILE_H/2);
      ctxBG.lineTo(x, y + TILE_H);
      ctxBG.lineTo(x - TILE_W/2, y + TILE_H/2);
      ctxBG.closePath();
      ctxBG.stroke();
    }
  }
  ctxBG.restore();
}

// =========================================================
// HOVER
function drawHover(px, py){
  ctxFG.clearRect(-5000,-5000,10000,10000);
  const cell = screenToGrid(px, py);
  if (!cell) return;
  const {x,y} = cell;

  const cx = (y - x) * (TILE_W/2);
  const cy = (x + y) * (TILE_H/2);

  ctxFG.save();
  ctxFG.fillStyle = "rgba(0,160,255,.18)";
  ctxFG.beginPath();
  ctxFG.moveTo(cx, cy);
  ctxFG.lineTo(cx + TILE_W/2, cy + TILE_H/2);
  ctxFG.lineTo(cx, cy + TILE_H);
  ctxFG.lineTo(cx - TILE_W/2, cy + TILE_H/2);
  ctxFG.closePath();
  ctxFG.fill();
  ctxFG.restore();
}

// =========================================================
// COORD CONVERSIONS
function screenToGrid(px, py){
  // konversi screen -> world (balik transform kamera & origin)
  const wx = (px - (VIEW_W/2 + camera.x)) / camera.scale;
  const wy = (py - (TILE_H*ORIGIN_Y_TILES + camera.y)) / camera.scale;

  // inverse iso
  const gx = Math.floor((wy/TILE_H + (-wx)/(TILE_W/2)));
  const gy = Math.floor((wy/TILE_H + ( wx)/(TILE_W/2)));

  if (gx<0 || gx>=GRID_N || gy<0 || gy>=GRID_N) return null;
  return { x: gx, y: gy };
}
