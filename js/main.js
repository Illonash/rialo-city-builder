/* ========= helpers ========= */
const $  = (q) => document.querySelector(q);
const $c = (t) => document.createElement(t);

/* ========= konfigurasi utama ========= */
const HEADER_H  = 120;          // ruang header (sinkron dengan CSS)
let   GRID_N    = 16;           // ukuran peta NxN (ubah sesuka: 12/16/20/24 ...)
const TILE_W    = 130;          // ukuran grid Kenney
const TILE_H    = 66;
const TEX_W     = 12;           // kolom di sprite-sheet
const TEX_H     = 6;            // baris di sprite-sheet

/* ========= kanvas & state ========= */
let cvsBG, cvsFG, bg, fg, W, H;
let map = [];                   // menyimpan [rowAtlas, colAtlas]
let tool = [0,0];               // tool aktif [row,col] di atlas
let activeTool = null;
let isPlacing = false;
let prevState = null;
let ORIGIN_X = 0, ORIGIN_Y = 0;

/* ========= load sprite-sheet ========= */
const texture = new Image();
texture.src = "assets/01_130x66_130x230.png";
texture.onload = () => init();

/* ========= init ========= */
function init(){
  // siapkan map NxN berisi 0
  map = Array.from({length: GRID_N}, () =>
    Array.from({length: GRID_N}, () => [0,0])
  );

  cvsBG = $("#bg");  cvsFG = $("#fg");
  bg    = cvsBG.getContext("2d");
  fg    = cvsFG.getContext("2d");

  // ukuran kanvas dihitung dari besar grid (biar muat)
  sizeCanvasToFit();

  // event interaksi
  cvsFG.addEventListener("mousemove", viz);
  cvsFG.addEventListener("contextmenu", (e)=>e.preventDefault());
  cvsFG.addEventListener("mousedown", click);
  cvsFG.addEventListener("mouseup",   () => isPlacing=false);
  cvsFG.addEventListener("pointerup", () => isPlacing=false);
  window.addEventListener("resize",   () => { sizeCanvasToFit(); drawMap(); });

  // build panel tools
  buildTools();

  // restore state dari URL jika ada
  loadHashState(location.hash.slice(1));
  drawMap();
}

/* ========= hitung & pusatkan papan ========= */
function sizeCanvasToFit(){
  const isoW = (GRID_N + GRID_N) * (TILE_W/2);
  const isoH = (GRID_N + GRID_N) * (TILE_H/2) + 230; // + tinggi gedung max

  const PAD_W = 420, PAD_H = 320;
  W = Math.max(innerWidth  + 200, isoW + PAD_W);
  H = Math.max(innerHeight - HEADER_H + 100, isoH + PAD_H);

  cvsBG.width = cvsFG.width = W;
  cvsBG.height = cvsFG.height = H;

  // pusatkan papan dan geser di bawah header
  ORIGIN_X = (W - isoW)/2 + (GRID_N * TILE_W/2);
  ORIGIN_Y = Math.max(HEADER_H, (H - isoH)/2) + TILE_H;

  bg.setTransform(1,0,0,1,0,0);
  fg.setTransform(1,0,0,1,0,0);
  bg.translate(ORIGIN_X, ORIGIN_Y);
  fg.translate(ORIGIN_X, ORIGIN_Y);
}

/* ========= panel tools (ambil dari atlas) ========= */
function buildTools(){
  const tools = $("#tools");
  tools.innerHTML = "";
  let count = 0;
  for(let i=0;i<TEX_H;i++){
    for(let j=0;j<TEX_W;j++){
      const div = $c("div");
      div.id = `tool_${count++}`;
      // 130×230 per slot; +2px offset kecil agar border di PNG kebaca pas
      div.style.backgroundPosition = `-${j*130 + 2}px -${i*230}px`;
      div.addEventListener("click", (e)=>{
        tool = [i, j];
        if(activeTool) $(`#${activeTool}`).classList.remove("selected");
        activeTool = e.target.id;
        $(`#${activeTool}`).classList.add("selected");
      });
      tools.appendChild(div);
    }
  }
}

/* ========= gambar satu tile dari atlas ========= */
function drawAtlasTile(ctx, gridX, gridY, row, col){
  ctx.save();
  // konversi grid iso → posisi layar
  ctx.translate((gridY - gridX) * (TILE_W/2), (gridX + gridY) * (TILE_H/2));
  const sx = col * 130, sy = row * 230;
  ctx.drawImage(texture, sx, sy, 130, 230, -65, -130, 130, 230);
  ctx.restore();
}

/* ========= highlight diamond ========= */
function drawDiamond(ctx, gx, gy, stroke="rgba(170,255,170,0.18)"){
  ctx.save();
  ctx.translate((gy - gx) * (TILE_W/2), (gx + gy) * (TILE_H/2));
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(TILE_W/2, TILE_H/2);
  ctx.lineTo(0, TILE_H);
  ctx.lineTo(-TILE_W/2, TILE_H/2);
  ctx.closePath();
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.restore();
}

/* ========= render peta ========= */
function drawMap(){
  bg.clearRect(-ORIGIN_X-2000, -ORIGIN_Y-2000, W+4000, H+4000);
  for(let i=0;i<GRID_N;i++){
    for(let j=0;j<GRID_N;j++){
      // grid overlay tipis (bisa dimatikan nanti via toggle)
      drawDiamond(bg, i, j);
      const [r,c] = map[i][j];
      drawAtlasTile(bg, i, j, r, c);
    }
  }
}

/* ========= interaksi ========= */
function click(e){
  const pos = getGridPosition(e);
  if(!pos) return;
  if(e.which === 3) map[pos.x][pos.y] = [0,0];      // klik kanan = "hapus" (tile kosong di atlas)
  else              map[pos.x][pos.y] = [tool[0], tool[1]];
  isPlacing = true;
  drawMap();
  fg.clearRect(-ORIGIN_X-2000, -ORIGIN_Y-2000, W+4000, H+4000);
  updateHashState();
}

function viz(e){
  if(isPlacing) return click(e);
  const pos = getGridPosition(e);
  fg.clearRect(-ORIGIN_X-2000, -ORIGIN_Y-2000, W+4000, H+4000);
  if(!pos) return;
  drawDiamond(fg, pos.x, pos.y, "rgba(0,255,180,0.35)");
}

/* ========= konversi koordinat layar → grid iso ========= */
function getGridPosition(e){
  const offX = e.offsetX - ORIGIN_X;
  const offY = e.offsetY - ORIGIN_Y;
  const _y = offY / TILE_H;
  const _x = offX / TILE_W - GRID_N/2;
  const gx = Math.floor(_y - _x);
  const gy = Math.floor(_x + _y);
  if(gx<0 || gy<0 || gx>=GRID_N || gy>=GRID_N) return null;
  return { x: gx, y: gy };
}

/* ========= save/load state via URL hash ========= */
function toB64(u8){ return btoa(String.fromCharCode.apply(null, u8)); }
function fromB64(s){ return atob(s).split("").map(c=>c.charCodeAt(0)); }

function updateHashState(){
  let c = 0;
  const u8 = new Uint8Array(GRID_N*GRID_N);
  for(let i=0;i<GRID_N;i++){
    for(let j=0;j<GRID_N;j++){
      const [r,col] = map[i][j];
      u8[c++] = r*TEX_W + col;
    }
  }
  const state = toB64(u8);
  if(prevState !== state){
    history.replaceState(null, "", `#${state}`);
    prevState = state;
  }
}

function loadHashState(hash){
  if(!hash) return;
  const u8 = fromB64(hash);
  let c = 0;
  for(let i=0;i<GRID_N;i++){
    for(let j=0;j<GRID_N;j++){
      const t = u8[c++] ?? 0;
      const r = Math.trunc(t / TEX_W);
      const col = t % TEX_W;
      map[i][j] = [r, col];
    }
  }
}

window.addEventListener("popstate", () => {
  loadHashState(location.hash.slice(1));
  drawMap();
});

/* ========= shortcut kecil ========= */
window.addEventListener("keydown", (e)=>{
  if(e.key.toLowerCase()==="g"){
    // toggle grid overlay: cukup redraw dengan/ tanpa stroke
    // sederhana: ubah opacity via CSS var (disini kita pakai flag cepat)
    SHOW_GRID = !SHOW_GRID;
  }
});
