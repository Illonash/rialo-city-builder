// ===== helpers
const $ = s => document.querySelector(s);
const $c = s => document.createElement(s);

// ===== grid constants
const TILE_W = 130, TILE_H = 230;      // sprite size in Kenney sheet
const DIAMOND_W = 128, DIAMOND_H = 64; // logical grid diamond
const GRID_N = 7;

// ===== cars grid expectation (only enable if this matches the image)
const CAR_SPR_W = 64, CAR_SPR_H = 64;  // expected cell size if cars sheet is grid
let CAR_COLS = 0, CAR_ROWS = 0;

// ===== state
let canvas, bg, fg, cf, w, h;
let ntiles, tileWidth, tileHeight;
let texWidth, texHeight;
let map, mapCars;
let tools, tool, activeTool, isPlacing, previousState;
let showGrid = true;
let vehiclesEnabled = false;

// textures
const texture = new Image();   // tiles/buildings from Kenney
texture.src = "assets/01_130x66_130x230.png";

const carsTex = new Image();   // cars overlay (may or may not be grid spritesheet)
carsTex.src = "assets/cars.png";

// wait for both
let readyCount = 0;
const onReady = () => { if (++readyCount === 2) init(); };
texture.onload = onReady;
carsTex.onload = onReady;

function checkCarsGrid() {
  // enable only if image dimensions are exact multiples of CAR_SPR_W/H
  const okW = carsTex.width  % CAR_SPR_W === 0;
  const okH = carsTex.height % CAR_SPR_H === 0;
  vehiclesEnabled = okW && okH;
  if (vehiclesEnabled) {
    CAR_COLS = carsTex.width  / CAR_SPR_W;
    CAR_ROWS = carsTex.height / CAR_SPR_H;
  } else {
    console.warn(
      "[Vehicles disabled] assets/cars.png is not a grid spritesheet.",
      "Expected each car in a fixed 64×64 cell and the image size to be multiples of 64.",
      `Got ${carsTex.width}×${carsTex.height}.`
    );
  }
}

function init(){
  checkCarsGrid();

  tool = { kind: "tile", i:0, j:0 };

  // base map
  map = Array.from({length: GRID_N}, () => Array.from({length: GRID_N}, () => [0,0]));
  // cars overlay
  mapCars = Array.from({length: GRID_N}, () => Array.from({length: GRID_N}, () => null));

  canvas = $("#bg");
  canvas.width = 910;
  canvas.height = 666;
  w = canvas.width;
  h = canvas.height;

  texWidth = 12; // columns in Kenney sheet
  texHeight = 6; // rows    in Kenney sheet

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

  fg.addEventListener("mousemove", viz);
  fg.addEventListener("contextmenu", e => e.preventDefault());
  fg.addEventListener("mouseup", unclick);
  fg.addEventListener("mousedown", click);
  fg.addEventListener("touchend", click);
  fg.addEventListener("pointerup", click);
  document.addEventListener("keydown", e=>{
    if(e.key.toLowerCase()==='g'){ showGrid = !showGrid; drawMap(); }
  });

  // palette/UI
  tools = $("#tools");
  buildToolsTiles(); // always available

  // hook palette switch only if vehicles truly available
  const paletteSel = $("#palette");
  if (paletteSel) {
    if (!vehiclesEnabled) {
      // hide/disable Vehicles option
      [...paletteSel.options].forEach(o=>{
        if (o.value === "cars") o.disabled = true;
      });
    }
    paletteSel.addEventListener("change", e=>{
      tools.innerHTML = "";
      if(e.target.value === "cars" && vehiclesEnabled) buildToolsCars();
      else buildToolsTiles();
    });
  }

  // clear
  const btnClear = $("#btnClear");
  if (btnClear) {
    btnClear.addEventListener("click", ()=>{
      for(let x=0;x<ntiles;x++){
        for(let y=0;y<ntiles;y++){
          map[x][y] = [0,0];
          mapCars[x][y] = null;
        }
      }
      updateHashState();
      drawMap();
    });
  }

  loadHashState(location.hash.substring(1));
  drawMap();
}

// ---------- build palettes
function buildToolsTiles(){
  let toolCount = 0;
  for (let i = 0; i < texHeight; i++) {
    for (let j = 0; j < texWidth; j++) {
      const div = $c('div');
      div.className = "tool";
      div.id = `tool_${toolCount++}`;
      div.style.backgroundImage = `url('assets/01_130x66_130x230.png')`;
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
  // only called if vehiclesEnabled === true
  let id = 0;
  for(let i=0;i<CAR_ROWS;i++){
    for(let j=0;j<CAR_COLS;j++){
      const div = $c('div');
      div.className = "tool car";
      div.id = `car_${id++}`;
      div.style.backgroundImage = `url('assets/cars.png')`;
      div.style.backgroundSize = `${carsTex.width}px ${carsTex.height}px`;
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

// ---------- hash save/load (base + cars)
function ToBase64(u8){ return btoa(String.fromCharCode.apply(null, u8)); }
function FromBase64(str){ return atob(str).split('').map(c=>c.charCodeAt(0)); }

function updateHashState(){
  const total = ntiles*ntiles;
  const u8 = new Uint8Array(total*3);
  let k=0;
  for(let i=0;i<ntiles;i++){
    for(let j=0;j<ntiles;j++){
      const baseIdx = map[i][j][0]*texWidth + map[i][j][1];
      u8[k++] = baseIdx;
      const car = mapCars[i][j];
      u8[k++] = car ? car[0]+1 : 0;
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

// ---------- drawing & input
function click(e){
  const pos = getPosition(e);
  if(pos.x>=0 && pos.x<ntiles && pos.y>=0 && pos.y<ntiles){
    if(e.which===3 || e.button===2){
      if(tool.kind==='car'){ mapCars[pos.x][pos.y] = null; }
      else { map[pos.x][pos.y] = [0,0]; mapCars[pos.x][pos.y] = null; }
    } else {
      if(tool.kind==='car' && vehiclesEnabled){
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

  for(let i=0;i<ntiles;i++){
    for(let j=0;j<ntiles;j++){
      drawImageTile(bg, i, j, map[i][j][0], map[i][j][1]);
    }
  }

  if(showGrid){
    bg.save();
    bg.strokeStyle = "rgba(0,0,0,.10)"; // subtle on white
    for(let i=0;i<ntiles;i++){
      for(let j=0;j<ntiles;j++){
        drawDiamondStroke(bg, i, j);
      }
    }
    bg.restore();
  }

  if(vehiclesEnabled){
    for(let i=0;i<ntiles;i++){
      for(let j=0;j<ntiles;j++){
        const car = mapCars[i][j];
        if(car) drawCar(bg, i, j, car[0], car[1]);
      }
    }
  }
}

function drawDiamondStroke(c, x, y){
  c.save();
  c.translate((y-x)*DIAMOND_W/2, (x+y)*DIAMOND_H/2);
  c.beginPath();
  c.moveTo(0,0);
  c.lineTo(DIAMOND_W/2, DIAMOND_H/2);
  c.lineTo(0, DIAMOND_H);
  c.lineTo(-DIAMOND_W/2, DIAMOND_H/2);
  c.closePath();
  c.stroke();
  c.restore();
}

function drawImageTile(c, x, y, i, j){
  c.save();
  c.translate((y-x)*DIAMOND_W/2, (x+y)*DIAMOND_H/2);
  const sx = j*TILE_W, sy = i*TILE_H;
  // same placement you already use
  c.drawImage(texture, sx, sy, TILE_W, TILE_H, -TILE_W/2, -TILE_H+100, TILE_W, TILE_H);
  c.restore();
}

function drawCar(c, x, y, i, j){
  c.save();
  c.translate((y-x)*DIAMOND_W/2, (x+y)*DIAMOND_H/2);
  const sx = j*CAR_SPR_W, sy = i*CAR_SPR_H;
  // center the 64×64 on tile center and lift a bit
  c.drawImage(carsTex, sx, sy, CAR_SPR_W, CAR_SPR_H, -CAR_SPR_W/2, -CAR_SPR_H*0.80, CAR_SPR_W, CAR_SPR_H);
  c.restore();
}

function getPosition(e){
  const rect = fg.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;

  const _y = (py - DIAMOND_H*2)/DIAMOND_H;
  const _x = px/DIAMOND_W - ntiles/2;
  const x = Math.floor(_y - _x);
  const y = Math.floor(_x + _y);
  return { x, y };
}

function viz(e){
  if(isPlacing) click(e);
  const pos = getPosition(e);
  cf.clearRect(-w,-h,w*2,h*2);
  if(pos.x>=0 && pos.x<ntiles && pos.y>=0 && pos.y<ntiles){
    cf.save();
    cf.fillStyle = 'rgba(0,0,0,0.08)';
    cf.translate((pos.y-pos.x)*DIAMOND_W/2, (pos.x+pos.y)*DIAMOND_H/2);
    cf.beginPath();
    cf.moveTo(0,0);
    cf.lineTo(DIAMOND_W/2, DIAMOND_H/2);
    cf.lineTo(0, DIAMOND_H);
    cf.lineTo(-DIAMOND_W/2, DIAMOND_H/2);
    cf.closePath();
    cf.fill();
    cf.restore();
  }
}
