const $ = _ => document.querySelector(_)
const $c = _ => document.createElement(_)

let cvsBG, cvsFG, ctxBG, ctxFG
let GRID_N = 14
let TILE_W = 130, TILE_H = 66
let texWidth = 12, texHeight = 6
let map = [], tool=[0,0], activeTool=null, isPlacing=false
let SCALE=1, PAN_X=0, PAN_Y=0, ORIGIN_X=0, ORIGIN_Y=0
let SHOW_GRID=true

const texture = new Image()
texture.src = "assets/01_130x66_130x230.png"
texture.onload = _ => init()

function init(){
  map = Array.from({length:GRID_N},()=>Array.from({length:GRID_N},()=>[0,0]))
  
  cvsBG = $("#bg")
  cvsFG = $("#fg")
  cvsBG.width = cvsFG.width = window.innerWidth
  cvsBG.height = cvsFG.height = window.innerHeight
  ctxBG = cvsBG.getContext("2d")
  ctxFG = cvsFG.getContext("2d")
  
  centerBoard()
  
  cvsFG.addEventListener("mousemove", viz)
  cvsFG.addEventListener("mousedown", click)
  cvsFG.addEventListener("mouseup", ()=>isPlacing=false)
  window.addEventListener("resize", sizeCanvasToFit)
  
  window.addEventListener("keydown", (e)=>{
    if(e.key.toLowerCase()==="g"){ SHOW_GRID=!SHOW_GRID; drawMap() }
    if(e.key.toLowerCase()==="r"){ SCALE=1; PAN_X=0; PAN_Y=0; applyTransform(); drawMap() }
  })
  cvsFG.addEventListener("wheel", e=>{
    e.preventDefault()
    const delta = e.deltaY<0 ? 1.1 : 0.9
    SCALE *= delta
    applyTransform()
    drawMap()
  }, {passive:false})
  
  buildTools()
  drawMap()
}

function sizeCanvasToFit(){
  cvsBG.width = cvsFG.width = window.innerWidth
  cvsBG.height = cvsFG.height = window.innerHeight
  applyTransform()
  drawMap()
}

function centerBoard(){
  ORIGIN_X = cvsBG.width/2
  ORIGIN_Y = TILE_H*2
  applyTransform()
}
function applyTransform(){
  ctxBG.setTransform(1,0,0,1,0,0)
  ctxBG.scale(SCALE,SCALE)
  ctxBG.translate(ORIGIN_X+PAN_X, ORIGIN_Y+PAN_Y)
  
  ctxFG.setTransform(1,0,0,1,0,0)
  ctxFG.scale(SCALE,SCALE)
  ctxFG.translate(ORIGIN_X+PAN_X, ORIGIN_Y+PAN_Y)
}

function buildTools(){
  const tools=$("#tools")
  let id=0
  for(let i=0;i<texHeight;i++){
    for(let j=0;j<texWidth;j++){
      const div=$c("div")
      div.id=`tool_${id++}`
      div.style.backgroundPosition=`-${j*130}px -${i*230}px`
      div.onclick=e=>{
        tool=[i,j]
        if(activeTool) $(`#${activeTool}`).classList.remove("selected")
        activeTool=e.target.id
        e.target.classList.add("selected")
      }
      tools.appendChild(div)
    }
  }
}

function getGridPosition(e){
  const rect=cvsFG.getBoundingClientRect()
  const pxRatioX = cvsFG.width/rect.width
  const pxRatioY = cvsFG.height/rect.height
  const mx=(e.clientX-rect.left)*pxRatioX
  const my=(e.clientY-rect.top)*pxRatioY
  
  const ox=(mx/SCALE)-(ORIGIN_X+PAN_X)
  const oy=(my/SCALE)-(ORIGIN_Y+PAN_Y)
  
  const _y=oy/TILE_H
  const _x=ox/TILE_W - GRID_N/2
  const gx=Math.floor(_y-_x)
  const gy=Math.floor(_x+_y)
  if(gx<0||gy<0||gx>=GRID_N||gy>=GRID_N) return null
  return {x:gx,y:gy}
}

function click(e){
  const pos=getGridPosition(e)
  if(!pos) return
  map[pos.x][pos.y]=[tool[0],tool[1]]
  isPlacing=true
  drawMap()
}

function viz(e){
  const pos=getGridPosition(e)
  ctxFG.clearRect(-cvsFG.width,-cvsFG.height,cvsFG.width*2,cvsFG.height*2)
  if(pos) drawTile(ctxFG,pos.x,pos.y,"rgba(255,0,0,0.2)")
  if(isPlacing) click(e)
}

function drawMap(){
  ctxBG.clearRect(-cvsBG.width,-cvsBG.height,cvsBG.width*2,cvsBG.height*2)
  for(let i=0;i<GRID_N;i++){
    for(let j=0;j<GRID_N;j++){
      const [ti,tj]=map[i][j]
      if(SHOW_GRID) drawTile(ctxBG,i,j,"rgba(0,0,0,0.1)")
      if(ti||tj) drawImageTile(ctxBG,i,j,ti,tj)
    }
  }
}

function drawTile(c,x,y,color){
  c.save()
  c.translate((y-x)*TILE_W/2,(x+y)*TILE_H/2)
  c.beginPath()
  c.moveTo(0,0)
  c.lineTo(TILE_W/2,TILE_H/2)
  c.lineTo(0,TILE_H)
  c.lineTo(-TILE_W/2,TILE_H/2)
  c.closePath()
  c.fillStyle=color
  c.fill()
  c.restore()
}
function drawImageTile(c,x,y,i,j){
  c.save()
  c.translate((y-x)*TILE_W/2,(x+y)*TILE_H/2)
  c.drawImage(texture,j*130,i*230,130,230,-65,-130,130,230)
  c.restore()
}
