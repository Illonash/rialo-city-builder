/* ===== helpers ===== */
const $  = q => document.querySelector(q);
const $c = t => document.createElement(t);

/* ===== config ===== */
let GRID_N   = 14;          // ubah bebas: 12/14/16/20
const TILE_W = 130;         // samakan dengan atlas Kenney
const TILE_H = 66;
const TEX_W  = 12;
const TEX_H  = 6;
const EMPTY  = -1;          // sel kosong

let SHOW_GRID = true;

/* ===== canvas & state ===== */
let cvsBG, cvsFG, bg, fg;
let ORIGIN_X = 0, ORIGIN_Y = 0;
let SCALE = 1, PAN_X = 0, PAN_Y = 0;
let placing = false, panDrag = false, panStart = {x:0,y:0}, panAtStart = {x:0,y:0};
let map = [], tool = [0,0], activeTool = null;

/* ===== sprite-sheet ===== */
const texture = new Image();
texture.src = "assets/01_130x66_130x230.png";
texture.onload = () => init();

/* ===== init ===== */
function init(){
  // map kosong
  map = Array.from({length: GRID_N}, () => Array.from({length: GRID_N}, () => EMPTY));

  cvsBG = $("#bg");  cvsFG = $("#fg");
  cvsBG.width = cvsFG.width = window.innerWidth;
  cvsBG.height = cvsFG.height = window.innerHeight;
  bg = cvsBG.getContext("2d");
  fg = cvsFG.getContext("2d");

  centerBoard();
  buildTools();
  wireEvents();
  drawMap();
}

function centerBoard(){
  ORIGIN_X = cvsBG.width/2;
  ORIGIN_Y = TILE_H * 2;        // kasih ruang header
  applyTransform();
}

function applyTransform(){
  // BG
  bg.setTransform(1,0,0,1,0,0);
  bg.scale(SCALE, SCALE);
  bg.translate(ORIGIN_X + PAN_X, ORIGIN_Y + PAN_Y);
  // FG
  fg.setTransform(1,0,0,1,0,0);
  fg.scale(SCALE, SCALE);
  fg.translate(ORIGIN_X + PAN_X, ORIGIN_Y + PAN_Y);
}

function wireEvents(){
  window.addEventListener("resize", () => {
    cvsBG.width = cvsFG.width = window.innerWidth;
    cvsBG.height = cvsFG.height = window.innerHeight;
    applyTransform(); drawMap();
  });

  // pan (middle mouse) atau Space + drag kiri
  cvsFG.addEventListener("mousedown", (e)=>{
    const spacePan = e.button===0 && document.body.classList.contains("pan-mode");
    if(e.button===1 || spacePan){
      panDrag = true;
      panStart = {x:e.clientX, y:e.clientY};
      panAtStart = {x:PAN_X, y:PAN_Y};
      return;
    }
    onPlace(e);
  });
  cvsFG.addEventListener("mouseup", ()=>{ placing=false; panDrag=false; });
  cvsFG.addEventListener("mouseleave", ()=>{ placing=false; panDrag=false; });
  cvsFG.addEventListener("contextmenu", e=>e.preventDefault());

  cvsFG.addEventListener("mousemove", e=>{
    if(panDrag){
      const dx = (e.clientX - panStart.x) / SCALE;
      const dy = (e.clientY - panStart.y) / SCALE;
      PAN_X = panAtStart.x + dx;
      PAN_Y = panAtStart.y + dy;
      applyTransform(); drawMap();
      return;
    }
    viz(e);
  });

  cvsFG.addEventListener("wheel", e=>{
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    SCALE = Math.min(2.0, Math.max(0.6, SCALE * factor));
    applyTransform(); drawMap();
  }, {passive:false});

  window.addEventListener("keydown", (e)=>{
    if(e.key.toLowerCase()==="g"){ SHOW_GRID = !SHOW_GRID; drawMap(); }
    if(e.code==="Space"){ document.body.classList.add("pan-mode"); }
    if(e.key.toLowerCase()==="r"){ SCALE=1; PAN_X=0; PAN_Y=0; applyTransform(); drawMap(); }
  });
  window.addEventListener("keyup", (e)=>{
    if(e.code==="Space"){ document.body.classList.remove("pan-mode"); }
  });
}

/* ===== tools ===== */
function buildTools(){
  const tools = $("#tools");
  tools.innerHTML = "";
  let id=0;
  for(let i=0;i<TEX_H;i++){
    for(let j=0;j<TEX_W;j++){
      const div=$c("div");
      div.id = `tool_${id++}`;
      div.style.backgroundImage  = "url('assets/01_130x66_130x230.png')";
      div.style.backgroundRepeat = "no-repeat";
      div.style.backgroundPosition = `-${j*130}px -${i*230}px`;
      div.style.width  = "130px";
      div.style.height = "230px";
      div.style.border = "2px solid transparent";
      div.style.margin = "4px";
      div.addEventListener("click", (e)=>{
        tool = [i,j];
        if(activeTool) $(`#${activeTool}`).classList.remove("selected");
        activeTool = e.currentTarget.id;
        e.currentTarget.classList.add("selected");
      });
      tools.appendChild(div);
    }
  }
}

/* ===== gambar ===== */
function strokeDiamond(c, gx, gy, col="rgba(255,255,255,0.18)"){
  c.save();
  c.translate((gy-gx)*TILE_W/2, (gx+gy)*TILE_H/2);
  c.beginPath();
  c.moveTo(0,0);
  c.lineTo(TILE_W/2, TILE_H/2);
  c.lineTo(0, TILE_H);
  c.lineTo(-TILE_W/2, TILE_H/2);
  c.closePath();
  c.strokeStyle = col;
  c.lineWidth = 1;
  c.stroke();
  c.restore();
}
function drawImageTile(c, gx, gy, r, col){
  c.save();
  c.translate((gy-gx)*TILE_W/2, (gx+gy)*TILE_H/2);
  c.drawImage(texture, col*130, r*230, 130, 230, -65, -130, 130, 230);
  c.restore();
}

function clearBoth(){
  const big=8000;
  bg.clearRect(-big,-big,big*2,big*2);
  fg.clearRect(-big,-big,big*2,big*2);
}

function drawMap(){
  clearBoth();
  for(let i=0;i<GRID_N;i++){
    for(let j=0;j<GRID_N;j++){
      if(SHOW_GRID) strokeDiamond(bg, i, j);
      const cell = map[i][j];
      if(cell!==EMPTY){
        const [r,c] = cell;
        drawImageTile(bg, i, j, r, c);
      }
    }
  }
}

/* ===== input ===== */
function onPlace(e){
  const pos = getGridPosition(e);
  if(!pos) return;
  if(e.button===2){           // right click = erase
    map[pos.x][pos.y] = EMPTY;
  }else if(e.button===0){     // left click = place
    map[pos.x][pos.y] = [tool[0], tool[1]];
    placing = true;
  }
  drawMap();
}

function viz(e){
  if(placing){ onPlace(e); return; }
  const pos = getGridPosition(e);
  fg.clearRect(-8000,-8000,16000,16000);
  if(pos) strokeDiamond(fg, pos.x, pos.y, "rgba(0,255,170,0.45)");
}

/* ===== konversi pointer → grid ===== */
function getGridPosition(e){
  const rect = cvsFG.getBoundingClientRect();
  const pxX  = cvsFG.width  / rect.width;
  const pxY  = cvsFG.height / rect.height;
  const mx   = (e.clientX - rect.left) * pxX;
  const my   = (e.clientY - rect.top)  * pxY;

  const ox = (mx / SCALE) - (ORIGIN_X + PAN_X);
  const oy = (my / SCALE) - (ORIGIN_Y + PAN_Y);

  const _y = oy / TILE_H;
  const _x = ox / TILE_W - GRID_N/2;

  const gx = Math.floor(_y - _x);
  const gy = Math.floor(_x + _y);
  if(gx<0 || gy<0 || gx>=GRID_N || gy>=GRID_N) return null;
  return {x:gx, y:gy};
}
