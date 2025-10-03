// ====== tiny helpers
const $ = s => document.querySelector(s);
const $c = s => document.createElement(s);

// ====== constants & state
const TILE_W = 130, TILE_H = 230;      // sprite size in tilesheet
const DIAMOND_W = 128, DIAMOND_H = 64; // logic grid diamond
const GRID_N = 7;                      // 7x7 seperti awal

// cars sheet info: 1024x512 => 16x8 grid of 64x64 sprites
const CAR_SPR_W = 64, CAR_SPR_H = 64;
const CAR_SHEET_W = 1024, CAR_SHEET_H = 512;
const CAR_COLS = CAR_SHEET_W / CAR_SPR_W; // 16
const CAR_ROWS = CAR_SHEET_H / CAR_SPR_H; // 8
// offset agar ban mobil "nempel" ke tengah tile
const CAR_OFFSET_X = -CAR_SPR_W/2;        // center horizontally
const CAR_OFFSET_Y = -CAR_SPR_H*0.80;     // naik sedikit

let canvas, bg, fg, cf, w, h;
let ntiles, tileWidth, tileHeight;
let texWidth, texHeight;
let map, mapCars;            // base layer & car layer
let tools, tool, activeTool, isPlacing, previousState;
let showGrid = true;

// textures
const texture = new Image();   // tiles/buildings from Kenney
texture.src = "assets/01_130x66_130x230.png";

const carsTex = new Image();   // cars overlay
carsTex.src = "assets/cars.png";

// init when both textures are ready
let readyCount = 0;
const onReady = () => { if (++readyCount === 2) init(); };
texture.onload = onReady;
carsTex.onload = onReady;

function init(){
  tool = { kind: "tile", i:0, j:0 };

  // base tiles map: store [i,j] into tilesheet
  map = Array.from({length: GRID_N}, () => Array.from({length: GRID_N}, () => [0,0]));
  // cars map: store [i,j] into car sheet, or null if empty
  mapCars = Array.from({length: GRID_N}, () => Array.from({length: GRID_N}, () => null));

  canvas = $("#bg");
  canvas.width = 910;
  canvas.height = 666;
  w = canvas.width;
  h = canvas.height;

  texWidth = 12; // columns in 01_130x66_130x230.png
  texHeight = 6; // rows    in 01_130x66_130x230.png

  bg = canvas.getContext("2d");
  ntiles = GRID_N;
  tileWidth = DIAMOND_W;
  tileHeight = DIAMOND_H;
  bg.translate(w/2, tileHeight*2);

  fg = $("#fg");
  fg.width = canvas.width;
  fg.height = canvas.height;
  cf = fg.getContext("2d");
  cf.translate(w/2, tileHeight*2);

  // interactions
  fg.addEventListener("mousemove", viz);
  fg.addEventListener("contextmenu", e => e.preventDefault());
  fg.addEventListener("mouseup", unclick);
  fg.addEventListener("mousedown", click);
  fg.addEventListener("touchend", click);
  fg.addEventListener("pointerup", click);
  document.addEventListener("keydown", e=>{
    if(e.key.toLowerCase()==='g'){ showGrid = !showGrid; drawMap(); }
  });

  // UI palette
  tools = $("#tools");
  buildToolsTiles(); // default
  $("#palette").addEventListener("change", e=>{
    tools.innerHTML = "";
    if(e.target.value === "cars") buildToolsCars();
    else buildToolsTiles();
  });

  // Clear all
  $("#btnClear").addEventListener("click", ()=>{
    for(let x=0;x<ntiles;x++){
      for(let y=0;y<ntiles;y++){
        map[x][y] = [0,0];
        mapCars[x][y] = null;
      }
    }
    updateHashState();
    drawMap();
  });

  // hash load/save (base + cars)
  loadHashState(location.hash.substring(1));
  drawMap();
}

// ===== tool builders
function buildToolsTiles(){
  let toolCount = 0;
  for (let i = 0; i < texHeight; i++) {
    for (let j = 0; j < texWidth; j++) {
      const div = $c('div');
      div.className = "tool";
      div.id = `tool_${toolCount++}`;
      div.style.backgroundImage = `url('assets/01_130x66_130x230.png')`;
      // +2 agar tidak “kecolok” border
      div.style.backgroundPosition = `-${j*130+2}px -${i*230}px`;
      div.addEventListener('click', e=>{
        tool = { kind:"tile", i, j };
        if (activeTool) $(`#${activeTool}`).classList.remove('selected');
        activeTool = e.target.id;
        $(`#${activeTool}`).classList.add('selected');
      });
      tools.appendChild(div);
    }
  }
}

function buildToolsCars(){
  // tampilkan beberapa baris mobil (seluruh sheet juga boleh)
  let id = 0;
  for(let i=0;i<CAR_ROWS;i++){
    for(let j=0;j<CAR_COLS;j++){
      const div = $c('div');
      div.className = "tool car";
      div.id = `car_${id++}`;
      div.style.backgroundImage = `url('assets/cars.png')`;
      div.style.backgroundPosition = `-${j*CAR_SPR_W}px -${i*CAR_SPR_H}px`;
      div.addEventListener("click", e=>{
        tool = { kind:"car", i, j };
        if (activeTool) $(`#${activeTool}`).classList.remove('selected');
        activeTool = e.target.id;
        $(`#${activeTool}`).classList.add('selected');
      });
      tools.appendChild(div);
    }
  }
}

// ===== state <-> hash (serialize both layers)
function ToBase64(u8){ return btoa(String.fromCharCode.apply(null, u8)); }
function FromBase64(str){ return atob(str).split('').map(c=>c.charCodeAt(0)); }

function updateHashState(){
  const total = ntiles*ntiles;
  const u8 = new Uint8Array(total*3); // [baseIdx, carR, carC]
  let k=0;
  for(let i=0;i<ntiles;i++){
    for(let j=0;j<ntiles;j++){
      const baseIdx = map[i][j][0]*texWidth + map[i][j][1];
      u8[k++] = baseIdx;
      const car = mapCars[i][j];
      u8[k++] = car ? car[0]+1 : 0; // +1 supaya 0 = kosong
      u8[k++] = car ? car[1]+1 : 0;
    }
  }
  const state = ToBase64(u8);
  if(!previousState || previousState!==state){
    history.replaceState(undefined, undefined, `#${state}`);
    previousState = state;
  }
}

function loadHashState(state){
  if(!state) return;
  const arr = FromBase64(state);
  let k=0;
  for(let i=0;i<ntiles;i++){
    for(let j=0;j<ntiles;j++){
      const t = arr[k++] ?? 0;
      const bx = Math.trunc(t/texWidth);
      const by = Math.trunc(t%texWidth);
      map[i][j] = [bx, by];
      const cr = (arr[k++] ?? 0) - 1;
      const cc = (arr[k++] ?? 0) - 1;
      mapCars[i][j] = (cr>=0 && cc>=0) ? [cr,cc] : null;
    }
  }
}

// ===== input & drawing
function click(e){
  const pos = getPosition(e);
  if(pos.x>=0 && pos.x<ntiles && pos.y>=0 && pos.y<ntiles){
    if(e.which===3 || e.button===2){
      // Erase: kalau palette cars aktif → hapus mobil, kalau tiles → hapus base & mobil
      if(tool.kind==='car'){ mapCars[pos.x][pos.y] = null; }
      else { map[pos.x][pos.y] = [0,0]; mapCars[pos.x][pos.y] = null; }
    } else {
      if(tool.kind==='car'){
        mapCars[pos.x][pos.y] = [tool.i, tool.j];
      } else {
        map[pos.x][pos.y] = [tool.i, tool.j];
      }
    }
    isPlacing = true;
    drawMap();
    cf.clearRect(-w,-h,w*2,h*2);
  }
  updateHashState();
}
function unclick(){ if(isPlacing) isPlacing=false; }

function drawMap(){
  bg.clearRect(-w,-h,w*2,h*2);

  // base tiles
  for(let i=0;i<ntiles;i++){
    for(let j=0;j<ntiles;j++){
      drawImageTile(bg, i, j, map[i][j][0], map[i][j][1]);
    }
  }

  // overlay grid (opsional)
  if(showGrid){
    bg.save();
    bg.strokeStyle = "rgba(255,255,255,.09)";
    for(let i=0;i<ntiles;i++){
      for(let j=0;j<ntiles;j++){
        drawDiamondStroke(bg, i, j);
      }
    }
    bg.restore();
  }

  // cars overlay
  for(let i=0;i<ntiles;i++){
    for(let j=0;j<ntiles;j++){
      const car = mapCars[i][j];
      if(car) drawCar(bg, i, j, car[0], car[1]);
    }
  }
}

function drawDiamondStroke(c, x, y){
  c.save();
  c.translate((y-x)*tileWidth/2, (x+y)*tileHeight/2);
  c.beginPath();
  c.moveTo(0,0);
  c.lineTo(tileWidth/2, tileHeight/2);
  c.lineTo(0, tileHeight);
  c.lineTo(-tileWidth/2, tileHeight/2);
  c.closePath();
  c.stroke();
  c.restore();
}

function drawImageTile(c, x, y, i, j){
  c.save();
  c.translate((y-x)*tileWidth/2, (x+y)*tileHeight/2);
  const sx = j*TILE_W, sy = i*TILE_H;
  c.drawImage(texture, sx, sy, TILE_W, TILE_H, -TILE_W/2, -TILE_H+100, TILE_W, TILE_H);
  // -TILE_H+100: posisi yang dipakai repo asli (top diangkat), tetap nyaman dengan aset Kenney
  c.restore();
}

function drawCar(c, x, y, i, j){
  c.save();
  c.translate((y-x)*tileWidth/2, (x+y)*tileHeight/2);
  const sx = j*CAR_SPR_W, sy = i*CAR_SPR_H;
  c.drawImage(carsTex, sx, sy, CAR_SPR_W, CAR_SPR_H, CAR_OFFSET_X, CAR_OFFSET_Y, CAR_SPR_W, CAR_SPR_H);
  c.restore();
}

function getPosition(e){
  const rect = fg.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;

  const _y = (py - tileHeight*2)/tileHeight;
  const _x = px/tileWidth - ntiles/2;
  const x = Math.floor(_y - _x);
  const y = Math.floor(_x + _y);
  return { x, y };
}

function viz(e){
  if(isPlacing) click(e);
  const pos = getPosition(e);
  cf.clearRect(-w,-h,w*2,h*2);
  if(pos.x>=0 && pos.x<ntiles && pos.y>=0 && pos.y<ntiles){
    // highlight diamond
    drawDiamond(cf, pos.x, pos.y, 'rgba(255,255,255,0.15)');
  }
}

function drawDiamond(c, x, y, color){
  c.save();
  c.translate((y-x)*tileWidth/2, (x+y)*tileHeight/2);
  c.beginPath();
  c.moveTo(0,0);
  c.lineTo(tileWidth/2, tileHeight/2);
  c.lineTo(0, tileHeight);
  c.lineTo(-tileWidth/2, tileHeight/2);
  c.closePath();
  c.fillStyle = color;
  c.fill();
  c.restore();
}
