const $ = _ => document.querySelector(_)
const $c = _ => document.createElement(_)

let canvas, bg, fg, cf, ntiles, tileWidth, tileHeight, texWidth,
	texHeight, map, tools, tool, activeTool, isPlacing, previousState

/* texture from https://opengameart.org/content/isometric-landscape */
const texture = new Image()
texture.src = "assets/01_130x66_130x230.png"
texture.onload = _ => init()

// --- Camera/view state (zoom) ---
let view = {
  scale: 1.0,
  min: 0.5,
  max: 2.0,
  step: 0.1
}

const applyView = () => {
  bg.setTransform(view.scale, 0, 0, view.scale, w/2, tileHeight*2)
  cf.setTransform(view.scale, 0, 0, view.scale, w/2, tileHeight*2)
}

const init = () => {
	tool = [0, 0]

	map = Array.from({length: 7}, () => Array.from({length: 7}, () => [0,0]))

	canvas = $("#bg")
	canvas.width = 910
	canvas.height = 666
	w = 910
	h = 462
	texWidth = 12
	texHeight = 6
	bg = canvas.getContext("2d")
	ntiles = 7
	tileWidth = 128
	tileHeight = 64
	applyView()

	loadHashState(document.location.hash.substring(1))
	drawMap()

	fg = $('#fg')
	fg.width = canvas.width
	fg.height = canvas.height
	cf = fg.getContext('2d')
	applyView()

	fg.addEventListener('mousemove', viz)
	fg.addEventListener('contextmenu', e => e.preventDefault())
	fg.addEventListener('mouseup', unclick)
	fg.addEventListener('mousedown', click)
	fg.addEventListener('touchend', click)
	fg.addEventListener('pointerup', click)

	tools = $('#tools')

	let toolCount = 0
	for (let i = 0; i < texHeight; i++) {
		for (let j = 0; j < texWidth; j++) {
			const div = $c('div');
			div.id = `tool_${toolCount++}`
			div.style.display = "block"
			div.style.backgroundPosition = `-${j * 130 + 2}px -${i * 230}px`
			div.addEventListener('click', e => {
				tool = [i, j]
				if (activeTool)
					$(`#${activeTool}`).classList.remove('selected')
				activeTool = e.target.id
				$(`#${activeTool}`).classList.add('selected')
			})
			tools.appendChild(div)
		}
	}

	// Toolbar events
	$('#zoomInBtn')?.addEventListener('click', () => {
	  view.scale = Math.min(view.max, +(view.scale + view.step).toFixed(2))
	  drawMap()
	})

	$('#zoomOutBtn')?.addEventListener('click', () => {
	  view.scale = Math.max(view.min, +(view.scale - view.step).toFixed(2))
	  drawMap()
	})

	$('#clearBtn')?.addEventListener('click', () => {
	  clearAll()
	})

	// Mouse wheel zoom
	fg.addEventListener('wheel', (e) => {
	  e.preventDefault()
	  const dir = Math.sign(e.deltaY)
	  const next = dir > 0 ? view.scale - view.step : view.scale + view.step
	  view.scale = Math.max(view.min, Math.min(view.max, +next.toFixed(2)))
	  drawMap()
	}, { passive:false })
}

// Base64 helpers
const ToBase64 = u8 => btoa(String.fromCharCode.apply(null, u8))
const FromBase64 = str => atob(str).split('').map(c => c.charCodeAt(0))

const updateHashState = () => {
	let c = 0
	const u8 = new Uint8Array(ntiles * ntiles)
	for (let i = 0; i < ntiles; i++) {
		for (let j = 0; j < ntiles; j++) {
			u8[c++] = map[i][j][0] * texWidth + map[i][j][1]
		}
	}
	const state = ToBase64(u8)
	if (!previousState || previousState != state) {
		history.pushState(undefined, undefined, `#${state}`)
		previousState = state
	}
}

window.addEventListener('popstate', function () {
	loadHashState(document.location.hash.substring(1))
	drawMap()
})

const loadHashState = state => {
	const u8 = FromBase64(state)
	let c = 0
	for (let i = 0; i < ntiles; i++) {
		for (let j = 0; j < ntiles; j++) {
			const t = u8[c++] || 0
			const x = Math.trunc(t / texWidth)
			const y = Math.trunc(t % texWidth)
			map[i][j] = [x, y]
		}
	}
}

const click = e => {
	const pos = getPosition(e)
	if (pos.x >= 0 && pos.x < ntiles && pos.y >= 0 && pos.y < ntiles) {
		map[pos.x][pos.y][0] = (e.which === 3) ? 0 : tool[0]
		map[pos.x][pos.y][1] = (e.which === 3) ? 0 : tool[1]
		isPlacing = true
		drawMap()
		cf.clearRect(-w*2, -h*2, w*4, h*4)
	}
	updateHashState();
}

const unclick = () => { if (isPlacing) isPlacing = false }

const drawMap = () => {
	bg.clearRect(-w*2, -h*2, w*4, h*4)
	applyView()
	for (let i = 0; i < ntiles; i++) {
		for (let j = 0; j < ntiles; j++) {
			drawImageTile(bg, i, j, map[i][j][0], map[i][j][1])
		}
	}
}

const drawTile = (c, x, y, color) => {
	c.save()
	c.translate((y - x) * tileWidth / 2, (x + y) * tileHeight / 2)
	c.beginPath()
	c.moveTo(0, 0)
	c.lineTo(tileWidth / 2, tileHeight / 2)
	c.lineTo(0, tileHeight)
	c.lineTo(-tileWidth / 2, tileHeight / 2)
	c.closePath()
	c.fillStyle = color
	c.fill()
	c.restore()
}

const drawImageTile = (c, x, y, i, j) => {
	c.save()
	c.translate((y - x) * tileWidth / 2, (x + y) * tileHeight / 2)
	j *= 130
	i *= 230
	c.drawImage(texture, j, i, 130, 230, -65, -130, 130, 230)
	c.restore()
}

const getPosition = e => {
	const _y = (e.offsetY - tileHeight * 2) / (tileHeight * view.scale)
	const _x = (e.offsetX - w/2) / (tileWidth * view.scale)
	const x = Math.floor(_y - _x + ntiles/2)
	const y = Math.floor(_x + _y)
	return { x, y }
}

const viz = (e) => {
	if (isPlacing) click(e)
	const pos = getPosition(e)
	cf.clearRect(-w*2, -h*2, w*4, h*4)
	applyView()
	if (pos.x >= 0 && pos.x < ntiles && pos.y >= 0 && pos.y < ntiles)
		drawTile(cf, pos.x, pos.y, 'rgba(0,0,0,0.2)')
}

const clearAll = () => {
  for (let i = 0; i < ntiles; i++) {
    for (let j = 0; j < ntiles; j++) {
      map[i][j] = [0,0]
    }
  }
  cf.clearRect(-w*2, -h*2, w*4, h*4)
  drawMap()
  updateHashState()
}
