/* ========= helpers ========= */
const $  = (q) => document.querySelector(q);
const $c = (t) => document.createElement(t);

/* ========= konfigurasi utama ========= */
const HEADER_H  = 120;        // ruang header
let   GRID_N    = 12;         // ukuran peta NxN (ubah sesukanya: 12/16/20/24)
const TILE_W    = 128;        // pakai 128×64 (stabil untuk hitung iso)
const TILE_H    = 64;
const TEX_W     = 12;         // kolom di sprite-sheet Kenney
const TEX_H     = 6;          // baris di sprite-sheet Kenney
const EMPTY     = -1;         // sentinel untuk sel kosong (tidak digambar)
const EMPTY_ENC = 255;        // sentinel saat disimpan ke hash (Uint8)

/* ========= kanvas & state ========= */
let cvsBG, cvsFG, bg, fg, W, H;
let map = [];                 // menyimpan [rowAtlas, colAtlas] atau EMPTY
let tool = [0,0];             // tool aktif [row,col] di atlas
let activeTool = null;
let placing = false;
let prevHash = null;
let ORIGIN_X = 0, ORIGIN_Y = 0;
let SHOW_GRID = true;

// zoom & pan
let SCALE = 1.0;              // 0.6–2.0
let PAN_X = 0, PAN_Y = 0;
let panDragging = false;
let panStart = {x:0,y:0}, panAtDragStart = {x:0,y:0};

/* ========= load sprite-sheet ========= */
const texture = new Image();
texture.src = "assets/01_130x66_130x230.png";
texture.onload = () => init();

/* ========= init ========= */
function init(){
  // map kosong
  map = Array.from({length: GRID_N}, () =>
    Array.from({length: GRID_N}, () => EMPTY)
  );

  cvsBG = $("#bg");  cvsFG = $("#fg");
  bg    = cvsBG.getContext("2d");
  fg    = cvsFG.getContext("2d");

  sizeCanvasToFit();
  buildTools();

  // interaksi
  cvsFG.addEventListener("mousemove", viz);
  cvsFG.addEventListener("contextmenu", (e)=>e.preventDefault());
  cvsFG.addEventListener("mousedown", onMouseDown);
  cvsFG.addEventListener("mouseup",   () => { placing=false; panDragging=false; });
  cvsFG.addEventListener("mouseleave",() => { placing=false; panDragging=false; });
  cvsFG.addEventListener("wheel",     onWheel, { passive: false });

  window.addEventListener("resize", () => { sizeCanvasToFit(); drawMap(); });
  window.addEventListener("keydown", (e)=>{
    if(e.key.toLowerCase()==="g"){ SHOW_GRID = !SHOW_GRID; drawMap(); }
    if(e.code==="Space"){ document.body.classList.add("pan-mode"); }
  });
  window.addEventListener("keyup", (e)=>{
    if(e.code==="Space"){ document.body.classList.remove("pan-mode"); }
  });

  // restore state dari URL (jika ada)
  loadHashState(location.hash.slice(1));
  drawMap();
}

/* ========= ukuran & pusatkan papan ========= */
function sizeCanvasToFit(){
  const isoW = (GRID_N + GRID_N) * (TILE_W/2);
  const isoH = (GRID_N + GRID_N) * (TILE_H/2) + 230; // + tinggi gedung max

  const PAD_W = 420, PAD_H = 320;
  W = Math.max(innerWidth  + 200, isoW + PAD_W);
  H = Math.max(innerHeight - HEADER_H + 100, isoH + PAD_H);

  cvsBG.width = cvsFG.width = W;
  cvsBG.height = cvsFG.height = H;

  centerBoard();
}

function centerBoard(){
  const isoW = (GRID_N + GRID_N) * (TILE_W/2);
  const isoH = (GRID_N + GRID_N) * (TILE_H/2);

  ORIGIN_X = (W - isoW)/2 + (GRID_N * TILE_W/2);
  ORIGIN_Y = Math.max(HEADER_H, (H - isoH)/2) + TILE_H;

  applyTransform();
}

function applyTransform(){
  // set transform ke kedua kanvas: scale lalu translate
  bg.setTransform(SCALE,0,0,SCALE,0,0);
  fg.setTransform(SCALE,0,0,SCALE,0,0);
  bg.translate(ORIGIN_X + PAN_X, ORIGIN_Y + PAN_Y);
  fg.translate(ORIGIN_X + PAN_X, ORIGIN_Y + PAN_Y);
}

/* ========= panel tools ========= */
function buildTools(){
  const tools = $("#tools");
  tools.innerHTML = "";
  let count = 0;
  for(let i=0;i<TEX_H;i++){
    for(let j=0;j<TEX_W;j++){
      const div = $c("div");
      div.id = `tool_${count++}`;
      div.style.backgroundImage  = "url('../assets/01_130x66_130x230.png')";
      div.style.backgroundRepeat = "no-repeat";
      div.style.backgroundPosition = `-${j*130 + 2}px -${i*230}px`;
      div.style.width  = "130px";
      div.style.height = "230px";
      div.style.border = "2px dashed transparent";
      div.style.borderRadius = "10px";
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

/* ========= gambar ========= */
function drawAtlasTile(ctx, gx, gy, row, col){
  ctx.save();
  ctx.translate((gy - gx) * (TILE_W/2), (gx + gy) * (TILE_H/2));
  const sx = col * 130, sy = row * 230;
  ctx.drawImage(texture, sx, sy, 130, 230, -65, -130, 130, 230);
  ctx.restore();
}

function drawDiamond(ctx, gx, gy, stroke="rgba(150,230,190,0.18)"){
  ctx.save();
  ctx.translate((gy - gx) * (TILE_W/2), (gx + gy) * (TILE_H/2));
  ctx.beginPath();
  ctx.moveTo(0,0);
  ctx.lineTo(TILE_W/2, TILE_H/2);
  ctx.lineTo(0, TILE_H);
  ctx.lineTo(-TILE_W/2, TILE_H/2);
  ctx.closePath();
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.restore();
}

function clearBoth(){
  // clear besar (di ruang world)
  const big = 8000;
  bg.clearRect(-big, -big, big*2, big*2);
  fg.clearRect(-big, -big, big*2, big*2);
}

function drawMap(){
  clearBoth();
  for(let i=0;i<GRID_N;i++){
    for(let j=0;j<GRID_N;j++){
      if(SHOW_GRID) drawDiamond(bg, i, j);
      const cell = map[i][j];
      if(cell !== EMPTY){
        const [r,c] = cell;
        drawAtlasTile(bg, i, j, r, c);
      }
    }
  }
}

/* ========= interaksi ========= */
function onMouseDown(e){
  const isMiddle = e.button === 1;
  const panMode  = isMiddle || (e.button===0 && document.body.classList.contains("pan-mode"));
  if(panMode){
    panDragging = true;
    panStart = { x: e.clientX, y: e.clientY };
    panAtDragStart = { x: PAN_X, y: PAN_Y };
    return;
  }

  const pos = getGridPosition(e);
  if(!pos) return;

  if(e.button === 2){ // right click = erase
    map[pos.x][pos.y] = EMPTY;
  } else if(e.button === 0){ // left click = place
    map[pos.x][pos.y] = [tool[0], tool[1]];
    placing = true;
  }
  drawMap();
  updateHashState();
}

cvsFG?.addEventListener?.("mouseup", ()=>{ placing=false; panDragging=false; });

function onWheel(e){
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  const newScale = Math.min(2.0, Math.max(0.6, SCALE * factor));

  // zoom ke posisi mouse (kurang lebih)
  const mx = e.offsetX, my = e.offsetY;
  const beforeX = (mx - (ORIGIN_X + PAN_X)*SCALE) / SCALE;
  const beforeY = (my - (ORIGIN_Y + PAN_Y)*SCALE) / SCALE;

  SCALE = newScale;
  applyTransform();

  const afterX = beforeX * SCALE + (ORIGIN_X + PAN_X)*SCALE;
  const afterY = beforeY * SCALE + (ORIGIN_Y + PAN_Y)*SCALE;
  const dx = mx - afterX;
  const dy = my - afterY;

  // konversi kembali ke pan offset
  PAN_X += dx / SCALE;
  PAN_Y += dy / SCALE;

  applyTransform();
  drawMap();
}

cvsFG?.addEventListener?.("mousemove", (e)=>{
  if(panDragging){
    const dx = (e.clientX - panStart.x) / SCALE;
    const dy = (e.clientY - panStart.y) / SCALE;
    PAN_X = panAtDragStart.x + dx;
    PAN_Y = panAtDragStart.y + dy;
    applyTransform();
    drawMap();
    return;
  }

  viz(e);
});

function viz(e){
  if(placing){ onMouseDown(e); return; }
  const pos = getGridPosition(e);
  fg.clearRect(-8000,-8000,16000,16000);
  if(!pos) return;
  drawDiamond(fg, pos.x, pos.y, "rgba(0,255,180,0.35)");
}

/* ========= konversi koordinat layar → grid iso ========= */
function getGridPosition(e){
  // balikkan transform: (offset - translate) / scale
  const ox = (e.offsetX / SCALE) - (ORIGIN_X + PAN_X);
  const oy = (e.offsetY / SCALE) - (ORIGIN_Y + PAN_Y);
  const _y = oy / TILE_H;
  const _x = ox / TILE_W - GRID_N/2;
  const gx = Math.floor(_y - _x);
  const gy = Math.floor(_x + _y);
  if(gx<0 || gy<0 || gx>=GRID_N || gy>=GRID_N) return null;
  return { x: gx, y: gy };
}

/* ========= save/load via URL hash ========= */
function toB64(u8){ return btoa(String.fromCharCode.apply(null, u8)); }
function fromB64(s){ return atob(s).split("").map(c=>c.charCodeAt(0)); }

function updateHashState(){
  let c = 0;
  const u8 = new Uint8Array(GRID_N*GRID_N);
  for(let i=0;i<GRID_N;i++){
    for(let j=0;j<GRID_N;j++){
      const cell = map[i][j];
      if(cell === EMPTY){ u8[c++] = EMPTY_ENC; }
      else {
        const [r,col] = cell;
        u8[c++] = r*TEX_W + col;
      }
    }
  }
  const state = toB64(u8);
  if(prevHash !== state){
    history.replaceState(null, "", `#${state}`);
    prevHash = state;
  }
}

function loadHashState(hash){
  if(!hash) return;
  const u8 = fromB64(hash);
  let c = 0;
  for(let i=0;i<GRID_N;i++){
    for(let j=0;j<GRID_N;j++){
      const t = u8[c++];
      if(t === undefined || t === EMPTY_ENC){ map[i][j] = EMPTY; continue; }
      const r = Math.trunc(t / TEX_W);
      const col = t % TEX_W;
      map[i][j] = [r, col];
    }
  }
}

window.addEventListener("popstate", ()=>{
  loadHashState(location.hash.slice(1));
  drawMap();
});
