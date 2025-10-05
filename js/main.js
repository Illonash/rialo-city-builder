const $  = sel => document.querySelector(sel);
const $c = tag => document.createElement(tag);

/* ====== Canvas & Grid ====== */
let canvas, bg, fg, cf;
let ntiles, tileWidth, tileHeight, texWidth, texHeight;
let map, tools, activeTool, isPlacing, previousState;
let w, h;

/* ====== Zoom/Camera ====== */
const view = { scale: 1.0, min: 0.5, max: 2.0, step: 0.1 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, +v.toFixed(2)));
function applyView() {
  if (bg) bg.setTransform(view.scale, 0, 0, view.scale, w/2, tileHeight*2);
  if (cf) cf.setTransform(view.scale, 0, 0, view.scale, w/2, tileHeight*2);
}

/* ====== Tiles spritesheet (Kenney) ====== */
const texture = new Image();
texture.src = "assets/01_130x66_130x230.png";

/* ====== Vehicles via manifest ====== */
let vehicleManifest = null;        // JSON dari assets/vehicles/manifest.json
let vehiclePalettes = [];          // daftar palette (sedan, taxi, ...)
let mode = "tiles";                // "tiles" | "vehicles"
let currentVehiclePalette = null;  // palette terpilih
let currentVehicleItem = null;     // item kendaraan terpilih (punya .img, .anchor, .src)
const vehicles = [];               // daftar {x,y,item}
let vehiclesGrid = [];             // matriks okupansi (null | index vehicles)

/* Set true kalau mau membatasi hanya di jalan (nanti kita isi whitelist) */
const ALLOW_ONLY_ON_ROAD = false;
/* Contoh whitelist index “road” (baris spritesheet * texWidth + kolom).
   Kita isi nanti kalau kamu sudah tentukan persis id tiles jalannya. */
const ROAD_TILES = new Set([
  // contoh:  (row * texWidth + col)
  // 1*12+2, 1*12+3, ...
]);

/* ====== Init ketika tiles siap ====== */
texture.onload = () => init();

async function init() {
  /* Grid awal 7x7 */
  map = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => [0, 0]));

  /* Canvas */
  canvas = $("#bg");
  canvas.width  = 910;
  canvas.height = 666;
  w = 910; h = 462;

  texWidth   = 12;
  texHeight  = 6;
  ntiles     = 7;
  tileWidth  = 128;
  tileHeight = 64;

  /* Context */
  bg = canvas.getContext("2d");
  applyView();

  /* Load state (TILES) dari hash */
  loadHashState(location.hash.substring(1));

  /* Foreground untuk hover highlight */
  fg = $("#fg");
  fg.width  = canvas.width;
  fg.height = canvas.height;
  cf = fg.getContext("2d");
  applyView();

  /* Occupancy grid kendaraan */
  vehiclesGrid = Array.from({ length: ntiles }, () => Array(ntiles).fill(null));

  /* Input */
  fg.addEventListener("mousemove", viz);
  fg.addEventListener("contextmenu", e => e.preventDefault());
  fg.addEventListener("mouseup",   unclick);
  fg.addEventListener("mousedown", click);
  fg.addEventListener("touchend",  click);
  fg.addEventListener("pointerup", click);

  fg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const dir  = Math.sign(e.deltaY);
    const next = dir > 0 ? view.scale - view.step : view.scale + view.step;
    view.scale = clamp(next, view.min, view.max);
    drawMap();
  }, { passive:false });

  tools = $("#tools");
  buildTileTools(); // default

  /* Toolbar */
  $("#zoomInBtn") ?.addEventListener("click", () => { view.scale = clamp(view.scale + view.step, view.min, view.max); drawMap(); });
  $("#zoomOutBtn")?.addEventListener("click", () => { view.scale = clamp(view.scale - view.step, view.min, view.max); drawMap(); });
  $("#clearBtn")  ?.addEventListener("click", clearAll);

  /* Manifest kendaraan */
  await loadVehicleManifest();
  populatePaletteSelect();

  $("#paletteSel").addEventListener("change", onPaletteChanged);

  /* Render awal */
  drawMap();
}

/* =========================
   Panel Tools
   ========================= */
function clearToolsPanel() {
  tools.innerHTML = "";
  activeTool = null;
}

function buildTileTools() {
  mode = "tiles";
  clearToolsPanel();

  let toolCount = 0;
  for (let i = 0; i < texHeight; i++) {
    for (let j = 0; j < texWidth; j++) {
      const div = $c("div");
      div.id = `tool_${toolCount++}`;
      div.style.display = "block";
      div.style.backgroundPosition = `-${j*130+2}px -${i*230}px`;
      // simpan index di dataset untuk dipakai saat klik
      div.dataset.ti = i;
      div.dataset.tj = j;

      div.addEventListener("click", (e) => {
        if (activeTool) $(`#${activeTool}`).classList.remove("selected");
        activeTool = e.currentTarget.id;
        e.currentTarget.classList.add("selected");
        currentVehicleItem = null;
      });

      tools.appendChild(div);
    }
  }

  const first = tools.firstElementChild;
  if (first) first.click();
}

function buildVehicleTools(paletteId) {
  mode = "vehicles";
  clearToolsPanel();
  currentVehicleItem = null;

  const pal = vehiclePalettes.find(p => p.id === paletteId);
  if (!pal) return;
  currentVehiclePalette = pal;

  for (const item of pal.items) {
    const div = $c("div");
    div.style.display = "block";
    div.style.backgroundImage = `url('${item.src}')`;
    div.style.backgroundRepeat = "no-repeat";
    div.style.backgroundSize = "contain";
    div.style.width  = "130px";
    div.style.height = "130px";
    div.style.border = "2px dashed transparent";
    div.addEventListener("click", (e) => {
      tools.querySelectorAll(".selected").forEach(el => el.classList.remove("selected"));
      div.classList.add("selected");
      currentVehicleItem = item;
      activeTool = null;
      // memperbaiki offset highlight setelah ganti palette
      applyView();
      cf && cf.clearRect(-w*2, -h*2, w*4, h*4);
    });
    tools.appendChild(div);
  }

  const first = tools.firstElementChild;
  if (first) first.click();
}

/* =========================
   Manifest Kendaraan
   ========================= */
async function loadVehicleManifest() {
  try {
    const res = await fetch("assets/vehicles/manifest.json", { cache:"no-store" });
    vehicleManifest  = await res.json();
    vehiclePalettes  = vehicleManifest?.palettes || [];

    // preload
    const promises = [];
    for (const pal of vehiclePalettes) {
      for (const it of pal.items) {
        const img = new Image();
        it.img = img;
        promises.push(new Promise(resolve => {
          img.onload = resolve; img.onerror = resolve;
          img.src = it.src;
        }));
      }
    }
    await Promise.all(promises);
  } catch (e) {
    console.warn("Failed to load vehicle manifest:", e);
  }
}

function populatePaletteSelect() {
  const sel = $("#paletteSel");
  // hapus opsi lama kecuali "Tiles"
  for (let i = sel.options.length - 1; i >= 1; i--) sel.remove(i);

  for (const pal of vehiclePalettes) {
    const opt = document.createElement("option");
    opt.value = `vehicles:${pal.id}`;
    opt.textContent = pal.label || pal.id;
    sel.appendChild(opt);
  }
}

function onPaletteChanged(e) {
  const val = e.target.value;
  if (val === "tiles") {
    buildTileTools();
  } else if (val.startsWith("vehicles:")) {
    const palId = val.split(":")[1];
    buildVehicleTools(palId);
  }
  // reset highlight
  applyView();
  cf && cf.clearRect(-w*2, -h*2, w*4, h*4);
}

/* =========================
   Hash Save/Load (Tiles saja dulu)
   ========================= */
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

/* =========================
   Input
   ========================= */
function click(e) {
  const pos = getPosition(e);
  if (!(pos.x >= 0 && pos.x < ntiles && pos.y >= 0 && pos.y < ntiles)) return;

  if (mode === "tiles") {
    let i = 0, j = 0;
    const sel = tools.querySelector(".selected");
    if (sel) { i = +sel.dataset.ti || 0; j = +sel.dataset.tj || 0; }
    map[pos.x][pos.y][0] = (e.which === 3) ? 0 : i;
    map[pos.x][pos.y][1] = (e.which === 3) ? 0 : j;
  } else {
    // vehicles
    if (e.which === 3) {
      // hapus kendaraan di sel
      const idx = vehiclesGrid[pos.x][pos.y];
      if (idx != null) {
        vehicles.splice(idx, 1);
        rebuildVehiclesGrid();
      }
    } else if (currentVehicleItem) {
      // opsional: batasi hanya di jalan
      if (ALLOW_ONLY_ON_ROAD) {
        const t = map[pos.x][pos.y][0] * texWidth + map[pos.x][pos.y][1];
        if (!ROAD_TILES.has(t)) return; // bukan jalan → stop
      }
      // satu sel satu mobil
      if (vehiclesGrid[pos.x][pos.y] == null) {
        vehicles.push({ x: pos.x, y: pos.y, item: currentVehicleItem });
        vehiclesGrid[pos.x][pos.y] = vehicles.length - 1;
      }
    }
  }

  isPlacing = true;
  drawMap();
  cf.clearRect(-w*2, -h*2, w*4, h*4);
  updateHashState(); // tiles only
}

function unclick(){ if (isPlacing) isPlacing = false; }

/* =========================
   Render
   ========================= */
function drawMap() {
  bg.clearRect(-w*2, -h*2, w*4, h*4);
  applyView();

  // ------- Painter's algorithm per sel -------
  // Gambar tiles dari i=0.., j=0..; setelah tile (i,j), gambar kendaraan di sel (i,j)
  for (let i = 0; i < ntiles; i++) {
    for (let j = 0; j < ntiles; j++) {
      drawImageTile(bg, i, j, map[i][j][0], map[i][j][1]);
      // kendaraan yang persis di sel ini
      const idx = vehiclesGrid[i][j];
      if (idx != null) {
        const v = vehicles[idx];
        drawVehicle(bg, v.x, v.y, v.item);
      }
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
  j *= 130; // kolom
  i *= 230; // baris
  c.drawImage(texture, j, i, 130, 230, -65, -130, 130, 230);
  c.restore();
}

function drawVehicle(c, x, y, item) {
  if (!item || !item.img) return;
  c.save();
  c.translate((y - x) * tileWidth / 2, (x + y) * tileHeight / 2);
  const dx = (item.anchor?.dx ?? -48);
  const dy = (item.anchor?.dy ?? -52);
  c.drawImage(item.img, dx, dy);
  c.restore();
}

/* =========================
   Posisi Kursor + Hover
   ========================= */
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

function viz(e) {
  if (isPlacing) click(e);
  const pos = getPosition(e);
  cf.clearRect(-w*2, -h*2, w*4, h*4);
  applyView();
  if (pos.x >= 0 && pos.x < ntiles && pos.y >= 0 && pos.y < ntiles) {
    drawTile(cf, pos.x, pos.y, 'rgba(0,0,0,0.2)');
  }
}

/* =========================
   Clear & Utilities
   ========================= */
function clearAll() {
  for (let i = 0; i < ntiles; i++) {
    for (let j = 0; j < ntiles; j++) {
      map[i][j] = [0,0];
      vehiclesGrid[i][j] = null;
    }
  }
  vehicles.length = 0;
  cf.clearRect(-w*2, -h*2, w*4, h*4);
  drawMap();
  updateHashState();
}

function rebuildVehiclesGrid() {
  vehiclesGrid = Array.from({ length: ntiles }, () => Array(ntiles).fill(null));
  for (let idx = 0; idx < vehicles.length; idx++) {
    const v = vehicles[idx];
    vehiclesGrid[v.x][v.y] = idx;
  }
}
