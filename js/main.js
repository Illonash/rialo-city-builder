const $  = sel => document.querySelector(sel);
const $c = tag => document.createElement(tag);

let canvas, bg, fg, cf;
let ntiles, tileWidth, tileHeight, texWidth, texHeight;
let map, tools, tool, activeTool, isPlacing, previousState;
let w, h;

/* spritesheet (ukuran Kenney 130x66 tiles, tinggi objek 230) */
const texture = new Image();
texture.src = "assets/01_130x66_130x230.png";
texture.onload = () => init();

/* ---- state zoom/camera ---- */
const view = { scale: 1.0, min: 0.5, max: 2.0, step: 0.1 };

function applyView() {
  if (bg) bg.setTransform(view.scale, 0, 0, view.scale, w/2, tileHeight*2);
  if (cf) cf.setTransform(view.scale, 0, 0, view.scale, w/2, tileHeight*2);
}

function init() {
  tool = [0, 0];

  // peta 7x7 default
  map = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => [0, 0]));

  canvas = $("#bg");
  canvas.width  = 910;
  canvas.height = 666;
  w = 910;
  h = 462;

  texWidth  = 12;
  texHeight = 6;
  ntiles     = 7;
  tileWidth  = 128;
  tileHeight = 64;

  bg = canvas.getContext("2d");
  applyView();

  // gambar awal (setelah hash di-load)
  loadHashState(location.hash.substring(1));
  drawMap();

  fg = $("#fg");
  fg.width  = canvas.width;
  fg.height = canvas.height;
  cf = fg.getContext("2d");
  applyView();

  // interaction
  fg.addEventListener("mousemove", viz);
  fg.addEventListener("contextmenu", e => e.preventDefault());
  fg.addEventListener("mouseup",   unclick);
  fg.addEventListener("mousedown", click);
  fg.addEventListener("touchend",  click);
  fg.addEventListener("pointerup", click);

  // wheel zoom
  fg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const dir  = Math.sign(e.deltaY);
    const next = dir > 0 ? view.scale - view.step : view.scale + view.step;
    view.scale = clamp(next, view.min, view.max);
    drawMap();
  }, { passive:false });

  // tools
  tools = $("#tools");
  let toolCount = 0;
  for (let i = 0; i < texHeight; i++) {
    for (let j = 0; j < texWidth; j++) {
      const div = $c("div");
      div.id = `tool_${toolCount++}`;
      div.style.display = "block";
      div.style.backgroundPosition = `-${j*130+2}px -${i*230}px`;
      div.addEventListener("click", (e) => {
        tool = [i, j];
        if (activeTool) $(`#${activeTool}`).classList.remove("selected");
        activeTool = e.target.id;
        $(`#${activeTool}`).classList.add("selected");
      });
      tools.appendChild(div);
    }
  }

  // toolbar buttons
  $("#zoomInBtn") ?.addEventListener("click", () => { view.scale = clamp(view.scale + view.step, view.min, view.max); drawMap(); });
  $("#zoomOutBtn")?.addEventListener("click", () => { view.scale = clamp(view.scale - view.step, view.min, view.max); drawMap(); });
  $("#clearBtn")  ?.addEventListener("click", clearAll);
}

/* helpers */
const clamp = (v, a, b) => Math.max(a, Math.min(b, +v.toFixed(2)));

// Base64 compaction
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

function click(e) {
  const pos = getPosition(e);
  if (pos.x >= 0 && pos.x < ntiles && pos.y >= 0 && pos.y < ntiles) {
    map[pos.x][pos.y][0] = (e.which === 3) ? 0 : tool[0];
    map[pos.x][pos.y][1] = (e.which === 3) ? 0 : tool[1];
    isPlacing = true;
    drawMap();
    cf.clearRect(-w*2, -h*2, w*4, h*4);
  }
  updateHashState();
}

function unclick(){ if (isPlacing) isPlacing = false; }

function drawMap() {
  bg.clearRect(-w*2, -h*2, w*4, h*4);
  applyView();
  for (let i = 0; i < ntiles; i++) {
    for (let j = 0; j < ntiles; j++) {
      drawImageTile(bg, i, j, map[i][j][0], map[i][j][1]);
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

function getPosition(e) {
  // konversi posisi kursor → koordinat grid, memperhitungkan scale & origin
  const rect = fg.getBoundingClientRect();
  const px = (e.clientX - rect.left);
  const py = (e.clientY - rect.top);

  const _y = (py - tileHeight * 2 * view.scale) / (tileHeight * view.scale);
  const _x = (px - (w/2) * view.scale) / (tileWidth * view.scale);

  const x = Math.floor(_y - _x + ntiles/2);
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

function clearAll() {
  for (let i = 0; i < ntiles; i++) {
    for (let j = 0; j < ntiles; j++) {
      map[i][j] = [0,0];
    }
  }
  cf.clearRect(-w*2, -h*2, w*4, h*4);
  drawMap();
  updateHashState();
}
