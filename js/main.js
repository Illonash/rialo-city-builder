const $  = (q) => document.querySelector(q);
const $c = (t) => document.createElement(t);

let canvas, bg, fg, cf;
let w, h;
let ntiles, tileWidth, tileHeight, texWidth, texHeight;
let map, tools, tool, activeTool, isPlacing, previousState;

// ====== konfigurasi papan ======
const HEADER_SHIFT = 120;     // ruang kosong di atas untuk judul
let   GRID_N       = 16;      // ukuran papan NxN (ubah bebas: 12/16/20)
+const TILE_W    = 130;   // match atlas Kenney (basis belah-ketupat)
+const TILE_H    = 66;    // match atlas Kenney


// ====== zoom / transform ======
let SCALE = 1.0;              // 0.6–2.0
function applyTransform(ctx) {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.translate(w / 2, HEADER_SHIFT + TILE_H * 2);
}

// ====== atlas Kenney ======
const texture = new Image();
texture.src = "assets/01_130x66_130x230.png";
texture.onload = () => init();

const init = () => {
  tool = [0, 0];

  // ====== state papan diisi 0,0 (tanah) ======
  ntiles = GRID_N;
  map = Array.from({ length: ntiles }, () =>
    Array.from({ length: ntiles }, () => [0, 0])
  );

  canvas = $("#bg");
  // ukuran kanvas adaptif biar papan lebih lega
  w = Math.max(910, (ntiles + 4) * TILE_W);
  h = Math.max(666, (ntiles + 6) * TILE_H + HEADER_SHIFT + 300);
  canvas.width  = w;
  canvas.height = h;

  texWidth  = 12;
  texHeight = 6;
  tileWidth  = TILE_W;
  tileHeight = TILE_H;

  bg = canvas.getContext("2d");
  applyTransform(bg);

  loadHashState(document.location.hash.substring(1));
  drawMap();

  fg = $("#fg");
  fg.width  = canvas.width;
  fg.height = canvas.height;
  cf = fg.getContext("2d");
  applyTransform(cf);

  fg.addEventListener("mousemove", viz);
  fg.addEventListener("contextmenu", (e) => e.preventDefault());
  fg.addEventListener("mouseup",   unclick);
  fg.addEventListener("mousedown", click);
  fg.addEventListener("touchend",  click);
  fg.addEventListener("pointerup", click);
  fg.addEventListener("wheel", onWheel, { passive: false }); // zoom

  // tombol Clear All = 'c'
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "c") {
      clearAll();
    }
  });

  // panel tools
  tools = $("#tools");
  let toolCount = 0;
  for (let i = 0; i < texHeight; i++) {
    for (let j = 0; j < texWidth; j++) {
      const div = $c("div");
      div.id = `tool_${toolCount++}`;
      div.style.display = "block";
      // 130 image + 2 border = 132
      div.style.backgroundPosition = `-${j * 130 + 2}px -${i * 230}px`;
      div.addEventListener("click", (e) => {
        tool = [i, j];
        if (activeTool) $(`#${activeTool}`).classList.remove("selected");
        activeTool = e.target.id;
        $(`#${activeTool}`).classList.add("selected");
      });
      tools.appendChild(div);
    }
  }
};

// ====== base64 utils (sama seperti sebelumnya) ======
const ToBase64 = (u8) => btoa(String.fromCharCode.apply(null, u8));
const FromBase64 = (str) => atob(str).split("").map((c) => c.charCodeAt(0));

const updateHashState = () => {
  let c = 0;
  const u8 = new Uint8Array(ntiles * ntiles);
  for (let i = 0; i < ntiles; i++) {
    for (let j = 0; j < ntiles; j++) {
      u8[c++] = map[i][j][0] * texWidth + map[i][j][1];
    }
  }
  const state = ToBase64(u8);
  if (!previousState || previousState != state) {
    history.pushState(undefined, undefined, `#${state}`);
    previousState = state;
  }
};

window.addEventListener("popstate", function () {
  loadHashState(document.location.hash.substring(1));
  drawMap();
});

const loadHashState = (state) => {
  if (!state) return;
  const u8 = FromBase64(state);
  let c = 0;
  for (let i = 0; i < ntiles; i++) {
    for (let j = 0; j < ntiles; j++) {
      const t = u8[c++] || 0;
      const x = Math.trunc(t / texWidth);
      const y = Math.trunc(t % texWidth);
      map[i][j] = [x, y];
    }
  }
};

// ====== input ======
const click = (e) => {
  const pos = getPosition(e);
  if (pos && pos.x >= 0 && pos.x < ntiles && pos.y >= 0 && pos.y < ntiles) {
    map[pos.x][pos.y][0] = e.which === 3 ? 0 : tool[0];
    map[pos.x][pos.y][1] = e.which === 3 ? 0 : tool[1];
    isPlacing = true;
    drawMap();
    cf.clearRect(-w, -h, w * 2, h * 2);
  }
  updateHashState();
};

const unclick = () => { if (isPlacing) isPlacing = false; };

// ====== zoom scroll ======
function onWheel(e) {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  const newScale = Math.min(2.0, Math.max(0.6, SCALE * factor));
  if (newScale === SCALE) return;
  SCALE = newScale;
  applyTransform(bg);
  applyTransform(cf);
  drawMap();
}

// ====== gambar ======
const drawMap = () => {
  // reset transform tiap gambar
  applyTransform(bg);
  bg.clearRect(-w, -h, w * 2, h * 2);
  for (let i = 0; i < ntiles; i++) {
    for (let j = 0; j < ntiles; j++) {
      drawImageTile(bg, i, j, map[i][j][0], map[i][j][1]);
    }
  }
};

const drawTile = (c, x, y, color) => {
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
};

const drawImageTile = (c, x, y, i, j) => {
  c.save();
  c.translate((y - x) * tileWidth / 2, (x + y) * tileHeight / 2);
  j *= 130;
  i *= 230;
  c.drawImage(texture, j, i, 130, 230, -65, -130, 130, 230);
  c.restore();
};

// klik-highlight (ghost)
const viz = (e) => {
  if (isPlacing) { click(e); return; }
  applyTransform(cf);
  const pos = getPosition(e);
  cf.clearRect(-w, -h, w * 2, h * 2);
  if (pos && pos.x >= 0 && pos.x < ntiles && pos.y >= 0 && pos.y < ntiles) {
    drawTile(cf, pos.x, pos.y, "rgba(0,0,0,0.2)");
  }
};

// ====== konversi posisi cursor → grid ======
function getGridPosition(e){
  // posisi pointer relatif ke canvas dalam pixel kanvas sebenarnya
  const rect = cvsFG.getBoundingClientRect();
  const pxRatioX = cvsFG.width  / rect.width;
  const pxRatioY = cvsFG.height / rect.height;
  const mx = (e.clientX - rect.left) * pxRatioX;
  const my = (e.clientY - rect.top)  * pxRatioY;

  // balikkan transform (scale + translate)
  const ox = (mx / SCALE) - (ORIGIN_X + PAN_X);
  const oy = (my / SCALE) - (ORIGIN_Y + PAN_Y);

  // rumus iso
  const _y = oy / TILE_H;
  const _x = ox / TILE_W - GRID_N/2;

  const gx = Math.floor(_y - _x);
  const gy = Math.floor(_x + _y);
  if(gx<0 || gy<0 || gx>=GRID_N || gy>=GRID_N) return null;
  return { x: gx, y: gy };
}

// ====== clear all ======
function clearAll() {
  for (let i = 0; i < ntiles; i++) {
    for (let j = 0; j < ntiles; j++) {
      map[i][j] = [0, 0]; // kembali ke tanah
    }
  }
  drawMap();
  updateHashState();
}

window.addEventListener("keydown", (e)=>{
  if(e.key.toLowerCase()==="g"){ SHOW_GRID = !SHOW_GRID; drawMap(); }
  if(e.code==="Space"){ document.body.classList.add("pan-mode"); }
  if(e.key.toLowerCase()==="r"){ SCALE=1; PAN_X=0; PAN_Y=0; applyTransform(); drawMap(); }
});
