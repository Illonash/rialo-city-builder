/* ========= util DOM ========= */
const $  = sel => document.querySelector(sel);
const $c = tag => document.createElement(tag);

/* ========= canvas & grid state ========= */
let canvas, bg, fg, cf;
let ntiles, tileWidth, tileHeight, texWidth, texHeight;
let map, tools, tool, activeTool, isPlacing, previousState;
let w, h;

/* ========= mode & layers =========
   - mode "tiles": pakai spritesheet Kenney
   - mode "vehicles": pakai file per-gambar dari manifest
*/
let mode = "tiles";
let vehMap; // layer kendaraan (agar tak tumpang tindih)

/* ========= view / zoom ========= */
const view = { scale: 1.0, min: 0.5, max: 2.0, step: 0.1 };
function applyView() {
  if (bg) bg.setTransform(view.scale, 0, 0, view.scale, w/2, tileHeight*2);
  if (cf) cf.setTransform(view.scale, 0, 0, view.scale, w/2, tileHeight*2);
}

/* ========= base tiles spritesheet ========= */
const texture = new Image();
texture.src = "assets/01_130x66_130x230.png";
texture.onload = () => tryInit();

/* ========= vehicles manifest ========= */
let vehiclePalettes = [];   // [{id,label,items:[{id,src,anchor}]}]
let currentVehiclePalette = null;
let currentVehicleItem = null;

// offset global untuk fine-tune semua mobil sekaligus.
// dy > 0 = turun; dy < 0 = naik
const VEHICLE_GLOBAL_OFFSET = { dx: 0, dy: 0 };

/* Kalau mau batasi hanya di jalan:
   - Set true, lalu isi ROAD_TILES dengan index tile jalan (row*12 + col).
*/
const ALLOW_ONLY_ON_ROAD = false;
const ROAD_TILES = new Set(); // contoh: ROAD_TILES.add( (row*12) + col )

/* ========= init ========= */
let baseReady = false, manifestReady = false;
async function tryInit(){
  baseReady = true;
  if (!manifestReady) {
    try {
      const res = await fetch("assets/vehicles/manifest.json", {cache: "no-store"});
      const data = await res.json();
      vehiclePalettes = await loadVehicleImages(data.palettes || []);
      manifestReady = true;
    } catch(e){
      // manifest opsional—kalau tak ada, tetap jalan mode tiles
      console.warn("vehicles manifest missing/invalid:", e);
      manifestReady = true;
    }
  }
  init();
}

async function loadVehicleImages(palettes){
  // preload semua gambar kendaraan agar smooth
  const loadImg = (src) => new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  const out = [];
  for (const pal of palettes){
    const items = [];
    for (const it of pal.items || []){
      const img = await loadImg(it.src);
      items.push({
        id: it.id,
        src: it.src,
        img,
        anchor: it.anchor || null
      });
    }
    out.push({ id: pal.id, label: pal.label, items });
  }
  return out;
}

function init() {
  /* default tool */
  tool = [0, 0];

  /* peta 7x7 default */
  ntiles = 7;
  map = Array.from({ length: ntiles }, () => Array.from({ length: ntiles }, () => [0, 0]));
  vehMap = Array.from({ length: ntiles }, () => Array.from({ length: ntiles }, () => null));

  /* canvas */
  canvas = $("#bg");
  canvas.width  = 910;
  canvas.height = 666;
  w = 910;
  h = 462;

  /* sheet Kenney */
  texWidth  = 12;
  texHeight = 6;
  tileWidth  = 128;
  tileHeight = 64;

  /* contexts */
  bg = canvas.getContext("2d");
  applyView();

  /* load hash lalu gambar awal */
  loadHashState(location.hash.substring(1));
  drawMap();

  fg = $("#fg");
  fg.width  = canvas.width;
  fg.height = canvas.height;
  cf = fg.getContext("2d");
  applyView();

  /* interaction */
  fg.addEventListener("mousemove", viz);
  fg.addEventListener("contextmenu", e => e.preventDefault());
  fg.addEventListener("mouseup",   unclick);
  fg.addEventListener("mousedown", click);
  fg.addEventListener("touchend",  click);
  fg.addEventListener("pointerup", click);

  /* wheel zoom */
  fg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const dir  = Math.sign(e.deltaY);
    const next = dir > 0 ? view.scale - view.step : view.scale + view.step;
    view.scale = clamp(next, view.min, view.max);
    drawMap();
  }, { passive:false });

  /* tools panel */
  tools = $("#tools");
  buildTileTools();     // default tampilkan tiles

  /* toolbar buttons */
  $("#zoomInBtn") ?.addEventListener("click", () => { view.scale = clamp(view.scale + view.step, view.min, view.max); drawMap(); });
  $("#zoomOutBtn")?.addEventListener("click", () => { view.scale = clamp(view.scale - view.step, view.min, view.max); drawMap(); });
  $("#clearBtn")  ?.addEventListener("click", clearAll);

  /* palette dropdown (disisipkan ke toolbar supaya index.html kamu tak perlu diubah) */
  injectPaletteDropdown();
}

/* ========= UI: palette dropdown ========= */
function injectPaletteDropdown(){
  const bar = document.getElementById("toolbar");
  if (!bar) return;

  const wrap = $c("div");
  wrap.id = "paletteWrap";

  const label = $c("span");
  label.textContent = "Palette:";
  wrap.appendChild(label);

  const sel = $c("select");
  sel.id = "paletteSel";
  const opTiles = $c("option"); opTiles.value = "tiles"; opTiles.textContent = "Tiles";
  sel.appendChild(opTiles);

  // tambah palettes kendaraan bila ada
  for (const pal of vehiclePalettes){
    const opt = $c("option");
    opt.value = pal.id;
    opt.textContent = pal.label || pal.id;
    sel.appendChild(opt);
  }

  sel.addEventListener("change", () => {
    if (sel.value === "tiles") {
      mode = "tiles";
      buildTileTools();
    } else {
      mode = "vehicles";
      buildVehicleTools(sel.value);
    }
  });

  // sisipkan paling depan di toolbar
  bar.insertBefore(wrap, bar.firstChild);
  wrap.appendChild(sel);
}

/* ========= Tools builder ========= */
function clearToolsPanel(){
  tools.innerHTML = "";
  activeTool = null;
  currentVehicleItem = null;
}

function buildTileTools(){
  clearToolsPanel();
  for (let i = 0; i < texHeight; i++) {
    for (let j = 0; j < texWidth; j++) {
      const div = $c("div");
      div.className = "tool-tile";
      div.style.backgroundPosition = `-${j*130+2}px -${i*230}px`; // +2 utk border 2px
      div.addEventListener("click", (e) => {
        tool = [i, j];
        tools.querySelectorAll(".selected").forEach(el => el.classList.remove("selected"));
        div.classList.add("selected");
      });
      tools.appendChild(div);
    }
  }
  mode = "tiles";
}

function buildVehicleTools(paletteId){
  clearToolsPanel();
  const pal = vehiclePalettes.find(p => p.id === paletteId);
  if (!pal) return;
  currentVehiclePalette = pal;

  for (const item of pal.items){
    const div = $c("div");
    div.className = "tool-vehicle";
    div.style.backgroundImage = `url('${item.src}')`;
    div.title = item.id;
    div.addEventListener("click", () => {
      tools.querySelectorAll(".selected").forEach(el => el.classList.remove("selected"));
      div.classList.add("selected");
      currentVehicleItem = item;
    });
    tools.appendChild(div);
  }

  // auto pilih pertama
  const first = tools.firstElementChild;
  if (first) first.click();
  mode = "vehicles";
}

/* ========= helpers ========= */
const clamp = (v, a, b) => Math.max(a, Math.min(b, +v.toFixed(2)));

// Base64 compaction (map tiles saja; vehMap tidak kita serialisasi, biar ringan)
const ToBase64   = u8  => btoa(String.fromCharCode.apply(null, u8));
const FromBase64 = str => atob(str).split('').map(c => c.charCodeAt(0));

function updateHashState() {
  let c = 0;
  const u8 = new Uint8Array(ntiles * ntiles);
  for (let i = 0; i < ntiles; i++) {
    for (let j = 0; j < ntiles; j++) {
      u8[c++] = map[i][j][0] * texWidth + map[i][j][1];
    }
  }
  const state = ToBase64(u8);
  if (!previousState || previousState !== state) {
    history.pushState(undefined, undefined, `#${state}`);
    previousState = state;
  }
}

window.addEventListener("popstate", () => {
  loadHashState(location.hash.substring(1));
  drawMap();
});

function loadHashState(state) {
  const u8 = FromBase64(state || "");
  let c = 0;
  for (let i = 0; i < ntiles; i++) {
    for (let j = 0; j < ntiles; j++) {
      const t = u8[c++] || 0;
      const x = Math.trunc(t / texWidth);
      const y = Math.trunc(t % texWidth);
      map[i][j] = [x, y];
    }
  }
}

/* ========= interactions ========= */
function click(e) {
  const pos = getPosition(e);
  if (!(pos.x >= 0 && pos.x < ntiles && pos.y >= 0 && pos.y < ntiles)) return;

  // Right click = erase (kedua mode)
  const isErase = (e.which === 3) || (e.button === 2);

  if (mode === "tiles") {
    map[pos.x][pos.y][0] = isErase ? 0 : tool[0];
    map[pos.x][pos.y][1] = isErase ? 0 : tool[1];
    isPlacing = true;
    drawMap();
  } else if (mode === "vehicles") {
    if (isErase) {
      vehMap[pos.x][pos.y] = null;
      drawMap();
    } else if (currentVehicleItem) {
      // optional restriction: hanya boleh di atas tile jalan
      if (ALLOW_ONLY_ON_ROAD) {
        const t = map[pos.x][pos.y];
        const flatIndex = t[0]*texWidth + t[1];
        if (!ROAD_TILES.has(flatIndex)) {
          // bukan jalan → batal
          return;
        }
      }
      // tak boleh tumpang tindih
      if (vehMap[pos.x][pos.y]) return;
      vehMap[pos.x][pos.y] = {
        palette: currentVehiclePalette?.id || "unknown",
        item: currentVehicleItem
      };
      drawMap();
    }
  }

  updateHashState();
}

function unclick(){ if (isPlacing) isPlacing = false; }

function viz(e) {
  if (isPlacing && mode === "tiles") click(e); // drag to paint (tiles only)
  const pos = getPosition(e);
  cf.clearRect(-w*2, -h*2, w*4, h*4);
  applyView();
  if (pos.x >= 0 && pos.x < ntiles && pos.y >= 0 && pos.y < ntiles) {
    drawTile(cf, pos.x, pos.y, 'rgba(0,0,0,0.18)');
  }
}

/* ========= rendering ========= */
function drawMap() {
  bg.clearRect(-w*2, -h*2, w*4, h*4);
  applyView();

  // layer 1: tiles
  for (let i = 0; i < ntiles; i++) {
    for (let j = 0; j < ntiles; j++) {
      drawImageTile(bg, i, j, map[i][j][0], map[i][j][1]);
    }
  }

  // layer 2: vehicles (di atas tiles)
  for (let i = 0; i < ntiles; i++) {
    for (let j = 0; j < ntiles; j++) {
      const v = vehMap[i][j];
      if (v) drawVehicle(bg, i, j, v.item);
    }
  }
}

function drawTile(c, x, y, color) {
  c.save();
  c.translate((y - x) * tileWidth / 2, (x + y) * tileHeight / 2);
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(tileWidth / 2, tileHeight / 2);
  c.lineTo(0, tileHeight);
  c.lineTo(-tileWidth / 2, tileHeight / 2);
  c.closePath();
  c.fillStyle = color;
  c.fill();
  c.restore();
}

function drawImageTile(c, x, y, i, j) {
  c.save();
  c.translate((y - x) * tileWidth / 2, (x + y) * tileHeight / 2);
  j *= 130;  // offset X di spritesheet
  i *= 230;  // offset Y di spritesheet
  c.drawImage(texture, j, i, 130, 230, -65, -130, 130, 230);
  c.restore();
}

// >>> anchor fix mobil (agar tak "terbang")
function drawVehicle(c, x, y, item) {
  if (!item || !item.img) return;
  c.save();
  c.translate((y - x) * tileWidth / 2, (x + y) * tileHeight / 2);

  // fallback anchor yang lebih rendah (umumnya pas untuk set Kenney)
  const ax = (item.anchor?.dx ?? -50) + (VEHICLE_GLOBAL_OFFSET.dx || 0);
  const ay = (item.anchor?.dy ?? -44) + (VEHICLE_GLOBAL_OFFSET.dy || 0);

  c.drawImage(item.img, ax, ay);
  c.restore();
}

/* ========= math: tile picking dgn zoom ========= */
function getPosition(e) {
  const rect = fg.getBoundingClientRect();
  const px = (e.clientX - rect.left) / view.scale;
  const py = (e.clientY - rect.top)  / view.scale;

  const _y = (py - tileHeight * 2) / tileHeight;
  const _x = (px / tileWidth) - (ntiles / 2);

  const x = Math.floor(_y - _x);
  const y = Math.floor(_x + _y);
  return { x, y };
}

/* ========= clear ========= */
function clearAll() {
  for (let i = 0; i < ntiles; i++) {
    for (let j = 0; j < ntiles; j++) {
      map[i][j] = [0,0];
      vehMap[i][j] = null;
    }
  }
  cf.clearRect(-w*2, -h*2, w*4, h*4);
  drawMap();
  updateHashState();
}
