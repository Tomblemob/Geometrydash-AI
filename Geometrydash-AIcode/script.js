const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// ========== CONFIG ==========
canvas.width = 1000;
canvas.height = 500;
const GROUND_Y = 440;
const GRID_SIZE = 40;
const GAME_SPEED = 7.5;

// ========== STATE ==========
let gameState = "menu";
let frames = 0;
let cameraX = 0;
let cameraY = 0;
let currentLevelIndex = 0;
let editorTool = "block";
let isHolding = false;
let currentAttempts = 1;
let currentTab = "cube";
let particles = [];
let screenShake = 0;

const COLORS = [
    "#00ffff", "#ffff00", "#ff00ff", "#00ff00", 
    "#ff4500", "#ffffff", "#5555ff", "#ff0000", 
    "#ffaa00", "#0088ff", "#aaff00", "#ff0088"
];

const player = {
    x: 240, y: 0, w: 40, h: 40, vy: 0,
    rotation: 0, grounded: false, dead: false,
    mode: "cube", color: "#00ffff",
    cubeIcon: 0, waveIcon: 0,
    trail: [],
    gravity: 1 // 1 = normal, -1 = flipped
};

// ========== LEVELS ==========
let defaultLevels = [
    {
        name: "Stereo Madness Ultra",
        mode: "cube",
        data: [], 
        length: 12000,
        id: "level_1"
    },
    {
        name: "Wave Practice Level",
        mode: "wave",
        data: [],
        length: 12000,
        id: "level_2"
    },
    {
        name: "Portal Maze",
        mode: "cube",
        data: [],
        length: 10000,
        id: "level_3"
    }
];

// Stereo Madness - varied obstacles
for(let i=0; i<30; i++) {
    defaultLevels[0].data.push({x: 600 + i*400, y: 0, type: "spike"});
    defaultLevels[0].data.push({x: 800 + i*400, y: 0, type: "block"});
    if(i % 3 === 0) defaultLevels[0].data.push({x: 700 + i*400, y: 80, type: "orb_yellow"});
    if(i % 5 === 0) defaultLevels[0].data.push({x: 900 + i*400, y: 120, type: "orb_pink"});
    if(i % 4 === 0) defaultLevels[0].data.push({x: 1000 + i*400, y: 80, type: "block"});
}

// Wave practice - sine wave with portals
for(let i=0; i<50; i++) {
    let waveY = Math.sin(i*0.5)*120 + 150;
    defaultLevels[1].data.push({x: 400 + i*200, y: waveY, type: "spike"});
    defaultLevels[1].data.push({x: 500 + i*200, y: waveY + 100, type: "spike"});
}

// Portal maze - mode switching level
for(let i=0; i<20; i++) {
    if(i % 4 === 0) {
        defaultLevels[2].data.push({x: 500 + i*500, y: 40, type: "portal_wave"});
    } else if(i % 4 === 2) {
        defaultLevels[2].data.push({x: 500 + i*500, y: 40, type: "portal_cube"});
    }
    defaultLevels[2].data.push({x: 600 + i*400, y: 0, type: "spike"});
    defaultLevels[2].data.push({x: 700 + i*400, y: 80, type: "orb_blue"});
}

let levels = JSON.parse(localStorage.getItem("gd_ultra_levels")) || defaultLevels;

// Ensure IDs and modes exist
levels.forEach((l, i) => {
    if(!l.id) l.id = `level_${Date.now()}_${i}`;
    if(!l.mode) l.mode = "cube";
});

// ========== PARTICLE SYSTEM ==========
class Particle {
    constructor(x, y, color, vx, vy, size) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = vx || (Math.random()-0.5)*10;
        this.vy = vy || (Math.random()-0.5)*10 - 2;
        this.life = 1;
        this.size = size || Math.random()*4 + 2;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random()-0.5) * 0.2;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.3; // gravity
        this.vx *= 0.98; // air resistance
        this.life -= 0.025;
        this.rotation += this.rotationSpeed;
    }
    
    draw() {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.fillRect(-this.size/2, -this.size/2, this.size, this.size);
        ctx.restore();
    }
}

function createParticles(x, y, color, count = 15) {
    for(let i=0; i<count; i++) {
        particles.push(new Particle(x, y, color));
    }
}

// ========== INITIALIZATION ==========
function init() {
    // Populate color palette
    const palette = document.getElementById("colorPalette");
    COLORS.forEach((c, idx) => {
        let div = document.createElement("div");
        div.className = "color-swatch";
        if(idx === 0) div.classList.add("selected");
        div.style.backgroundColor = c;
        div.onclick = () => {
            player.color = c;
            document.querySelectorAll(".color-swatch").forEach(s => s.classList.remove("selected"));
            div.classList.add("selected");
        };
        palette.appendChild(div);
    });

    refreshIcons();
    refreshLevelList();
    updateLevelInfo();
    requestAnimationFrame(loop);
}

function refreshIcons() {
    const selector = document.getElementById("iconSelector");
    selector.innerHTML = "";
    for(let i=0; i<4; i++) {
        let div = document.createElement("div");
        div.className = "icon-swatch";
        div.innerText = i + 1;
        if(i === 0) div.classList.add("selected");
        div.onclick = () => {
            if(currentTab === "cube") player.cubeIcon = i;
            else player.waveIcon = i;
            document.querySelectorAll(".icon-swatch").forEach(s => s.classList.remove("selected"));
            div.classList.add("selected");
        };
        selector.appendChild(div);
    }
}

function updateLevelInfo() {
    let level = levels[currentLevelIndex];
    document.getElementById("levelMode").innerText = `Mode: ${level.mode.toUpperCase()}`;
    document.getElementById("levelLength").innerText = `Length: ${Math.floor(level.length/40)}m`;
}

// ========== MAIN GAME LOOP ==========
function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Screen shake effect
    if(screenShake > 0) {
        ctx.save();
        ctx.translate(
            (Math.random()-0.5)*screenShake,
            (Math.random()-0.5)*screenShake
        );
        screenShake *= 0.9;
        if(screenShake < 0.1) screenShake = 0;
    }
    
    if (gameState === "playing" || gameState === "dead") {
        updateGame();
        drawGame();
    } else if (gameState === "editor") {
        updateEditor();
        drawEditor();
    } else if (gameState === "menu") {
        drawMenuBG();
    }

    // Update and draw particles
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        p.update();
        p.draw();
    });

    if(screenShake > 0) ctx.restore();
    
    frames++;
    requestAnimationFrame(loop);
}

// ========== GAME UPDATE ==========
function updateGame() {
    if (gameState === "dead") {
        if (frames % 40 === 0) resetLevel(false);
        return;
    }

    cameraX += GAME_SPEED;

    if (player.mode === "cube") {
        updateCubeMode();
    } else if (player.mode === "wave") {
        updateWaveMode();
    }

    checkCollisions();
    checkPortals();

    // Victory check
    if (cameraX > levels[currentLevelIndex].length) {
        gameState = "victory";
        document.getElementById("victoryUI").style.display = "block";
        document.getElementById("statAttempts").innerText = currentAttempts;
        createParticles(500, 250, "#00ff00", 40);
    }
}

function updateCubeMode() {
    player.vy += 0.7 * player.gravity;
    player.y += player.vy;
    
    let groundLevel = player.gravity === 1 ? GROUND_Y - 40 : 0;
    let isOnGround = player.gravity === 1 ? player.y >= groundLevel : player.y <= groundLevel;
    
    if (isOnGround) {
        player.y = groundLevel;
        player.vy = 0;
        player.grounded = true;
        player.rotation = Math.round(player.rotation/90)*90;
    } else {
        player.grounded = false;
        player.rotation += 5 * player.gravity;
    }
    
    if (isHolding && player.grounded) { 
        player.vy = -12 * player.gravity;
        player.grounded = false;
        createParticles(player.x + 20, player.y + 40, player.color, 8);
    }
}

function updateWaveMode() {
    player.vy = isHolding ? -6 : 6;
    player.y += player.vy;
    player.rotation = isHolding ? -30 : 30;
    
    // Trail system - FIXED to match player position properly
    if (frames % 2 === 0) {
        player.trail.push({
            x: cameraX + player.x, // Store absolute world position
            y: player.y + 20
        });
    }
    if(player.trail.length > 50) player.trail.shift();
    
    // Boundary check
    if (player.y > GROUND_Y - 40 || player.y < 0) die();
}

// ========== COLLISION DETECTION ==========
function checkCollisions() {
    let data = levels[currentLevelIndex].data;
    let pRect = { 
        l: player.x + 5, 
        r: player.x + 35, 
        t: player.y + 5, 
        b: player.y + 35 
    };

    for (let obj of data) {
        let ox = obj.x - cameraX + 300;
        let oy = GROUND_Y - obj.y - 40;
        
        if (ox < -100 || ox > 1100) continue;

        let objHeight = obj.type === "slab" ? 20 : 40;
        let objWidth = 40;
        
        // Portal types don't collide
        if (obj.type.startsWith("portal_")) continue;
        
        if (pRect.r > ox && pRect.l < ox + objWidth && 
            pRect.b > oy && pRect.t < oy + objHeight) {
            
            if (obj.type === "spike") {
                die();
            } else if (obj.type.startsWith("orb_")) {
                handleOrbCollision(obj, ox, oy);
            } else if (obj.type === "block" || obj.type === "slab") { 
                if (player.mode === "wave") {
                    die();
                } else {
                    // Platform collision for cube mode
                    if (player.vy * player.gravity > 0 && pRect.b < oy + 20) { 
                        player.y = oy - 40; 
                        player.vy = 0; 
                        player.grounded = true; 
                    } else {
                        die();
                    }
                }
            }
        }
    }
}

function handleOrbCollision(obj, ox, oy) {
    if (!isHolding || player.orbLock) return;
    
    player.orbLock = true;
    setTimeout(() => player.orbLock = false, 200);
    
    let orbColor, jumpStrength;
    
    switch(obj.type) {
        case "orb_yellow":
            orbColor = "yellow";
            jumpStrength = -12;
            break;
        case "orb_pink":
            orbColor = "#ff00ff";
            jumpStrength = -15; // Higher jump
            break;
        case "orb_blue":
            orbColor = "#0088ff";
            jumpStrength = -10;
            player.gravity *= -1; // Flip gravity!
            break;
    }
    
    player.vy = jumpStrength * player.gravity;
    createParticles(ox + 20, oy + 20, orbColor, 15);
}

function checkPortals() {
    let data = levels[currentLevelIndex].data;
    
    for (let obj of data) {
        if (!obj.type.startsWith("portal_")) continue;
        
        let ox = obj.x - cameraX + 300;
        let oy = GROUND_Y - obj.y - 40;
        
        if (ox < -50 || ox > 1050) continue;
        
        // Check if player passes through portal
        if (player.x + 20 > ox && player.x + 20 < ox + 40) {
            if (obj.type === "portal_cube" && player.mode !== "cube") {
                switchMode("cube");
            } else if (obj.type === "portal_wave" && player.mode !== "wave") {
                switchMode("wave");
            }
        }
    }
}

function switchMode(newMode) {
    player.mode = newMode;
    player.trail = [];
    player.rotation = 0;
    createParticles(player.x + 20, player.y + 20, "#ffffff", 20);
}

function die() {
    if (gameState === "dead") return;
    gameState = "dead";
    currentAttempts++;
    screenShake = 12;
    createParticles(player.x + 20, player.y + 20, player.color, 30);
}

function resetLevel(fullReset) {
    if(fullReset) currentAttempts = 1;
    cameraX = 0;
    player.y = GROUND_Y - 80;
    player.vy = 0;
    player.rotation = 0;
    player.dead = false;
    player.trail = [];
    player.gravity = 1;
    player.mode = levels[currentLevelIndex].mode; // Use level's start mode
    gameState = "playing";
    document.getElementById("victoryUI").style.display = "none";
}

// ========== DRAWING FUNCTIONS ==========
function drawPlayer() {
    ctx.save();
    ctx.translate(player.x + 20, player.y + 20);
    ctx.rotate(player.rotation * Math.PI / 180);
    
    // Glow effect
    ctx.shadowBlur = 15;
    ctx.shadowColor = player.color;
    
    ctx.fillStyle = player.color;
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;

    if (player.mode === "cube") {
        // Draw cube
        ctx.fillRect(-20, -20, 40, 40);
        ctx.strokeRect(-20, -20, 40, 40);
        
        // Icon patterns
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        if(player.cubeIcon === 1) {
            ctx.fillRect(-10, -10, 20, 20);
        } else if(player.cubeIcon === 2) { 
            ctx.beginPath(); 
            ctx.moveTo(-20,0); 
            ctx.lineTo(20,0); 
            ctx.moveTo(0,-20); 
            ctx.lineTo(0,20); 
            ctx.stroke(); 
        } else if(player.cubeIcon === 3) {
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI*2);
            ctx.fill();
        }
    } else {
        // Draw wave (arrow/triangle)
        ctx.beginPath();
        ctx.moveTo(-15, -15); 
        ctx.lineTo(15, 0); 
        ctx.lineTo(-15, 15); 
        ctx.closePath();
        ctx.fill(); 
        ctx.stroke();
        
        // Wave icon detail
        if(player.waveIcon === 1) {
            ctx.fillStyle = "rgba(0,0,0,0.3)";
            ctx.beginPath();
            ctx.moveTo(-5, -8);
            ctx.lineTo(8, 0);
            ctx.lineTo(-5, 8);
            ctx.fill();
        }
    }
    
    ctx.shadowBlur = 0;
    ctx.restore();
}

function drawGame() {
    drawBackground();
    
    // Enhanced wave trail - FIXED POSITIONING
    if(player.mode === "wave" && player.trail.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = player.color;
        ctx.lineWidth = 6;
        ctx.shadowBlur = 10;
        ctx.shadowColor = player.color;
        
        player.trail.forEach((p, i) => {
            // Convert absolute world position to screen position
            let tx = p.x - cameraX + 300;
            let ty = p.y;
            
            if (i === 0) {
                ctx.moveTo(tx, ty);
            } else {
                ctx.lineTo(tx, ty);
            }
        });
        
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
    
    drawLevel(cameraX, 0);
    drawPlayer();
    
    // Progress bar
    let progress = cameraX / levels[currentLevelIndex].length;
    ctx.fillStyle = "rgba(0,255,255,0.4)";
    ctx.fillRect(0, 0, progress * 1000, 4);
    ctx.fillStyle = "#00ffff";
    ctx.fillRect(0, 0, progress * 1000, 2);
    
    // Current mode indicator
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(10, 10, 120, 30);
    ctx.fillStyle = "#00ffff";
    ctx.font = "14px Arial";
    ctx.fillText(`Mode: ${player.mode.toUpperCase()}`, 20, 30);
}

function updateEditor() {
    // Auto-save camera position
    if(frames % 60 === 0) {
        levels[currentLevelIndex].name = document.getElementById("levelNameInput").value || "Untitled";
    }
}

function drawEditor() {
    drawBackground();
    
    // Grid
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1;
    for(let x = (300-cameraX)%40; x<canvas.width; x+=40) { 
        ctx.beginPath(); 
        ctx.moveTo(x,0); 
        ctx.lineTo(x,500); 
        ctx.stroke(); 
    }
    for(let y = (cameraY)%40; y<canvas.height; y+=40) { 
        ctx.beginPath(); 
        ctx.moveTo(0,y); 
        ctx.lineTo(1000,y); 
        ctx.stroke(); 
    }
    
    drawLevel(cameraX, cameraY);
    
    // Coordinates display
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(5, 470, 150, 25);
    ctx.fillStyle = "white";
    ctx.font = "12px monospace";
    ctx.fillText(`X: ${Math.floor(cameraX)} Y: ${Math.floor(cameraY)}`, 10, 488);
}

function drawLevel(cx, cy) {
    let data = levels[currentLevelIndex].data;
    ctx.strokeStyle = "#00ffff";
    ctx.lineWidth = 2;
    
    for (let obj of data) {
        let x = obj.x - cx + 300;
        let y = GROUND_Y - obj.y - 40 + cy;
        if (x < -100 || x > 1100) continue;

        if (obj.type === "block") {
            drawBlock(x, y);
        } else if (obj.type === "slab") {
            drawSlab(x, y);
        } else if (obj.type === "spike") {
            drawSpike(x, y);
        } else if (obj.type.startsWith("orb_")) {
            drawOrb(x, y, obj.type);
        } else if (obj.type.startsWith("portal_")) {
            drawPortal(x, y, obj.type);
        }
    }
    
    // Floor
    ctx.fillStyle = "#000022"; 
    ctx.fillRect(0, GROUND_Y + cy, canvas.width, 500);
    ctx.strokeStyle = "#00ffff";
    ctx.lineWidth = 2;
    ctx.beginPath(); 
    ctx.moveTo(0, GROUND_Y+cy); 
    ctx.lineTo(canvas.width, GROUND_Y+cy); 
    ctx.stroke();
}

function drawBlock(x, y) {
    ctx.fillStyle = "#111"; 
    ctx.fillRect(x, y, 40, 40); 
    ctx.strokeRect(x, y, 40, 40);
    ctx.fillStyle = "#222";
    ctx.fillRect(x+5, y+5, 30, 30);
    ctx.strokeRect(x+5, y+5, 30, 30);
}

function drawSlab(x, y) {
    ctx.fillStyle = "#111";
    ctx.fillRect(x, y+20, 40, 20);
    ctx.strokeRect(x, y+20, 40, 20);
    ctx.fillStyle = "#222";
    ctx.fillRect(x+5, y+25, 30, 10);
}

function drawSpike(x, y) {
    ctx.fillStyle = "red";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "red";
    ctx.beginPath(); 
    ctx.moveTo(x, y+40); 
    ctx.lineTo(x+20, y); 
    ctx.lineTo(x+40, y+40); 
    ctx.fill();
    ctx.shadowBlur = 0;
}

function drawOrb(x, y, type) {
    let color;
    switch(type) {
        case "orb_yellow": color = "yellow"; break;
        case "orb_pink": color = "#ff00ff"; break;
        case "orb_blue": color = "#0088ff"; break;
        default: color = "yellow";
    }
    
    ctx.fillStyle = color;
    ctx.shadowBlur = 15;
    ctx.shadowColor = color;
    ctx.beginPath(); 
    ctx.arc(x+20, y+20, 15, 0, Math.PI*2); 
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Inner highlight
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(x+20, y+20, 8, 0, Math.PI*2);
    ctx.fill();
}

function drawPortal(x, y, type) {
    let color = type === "portal_cube" ? "#0088ff" : "#ffff00";
    
    // Portal frame
    ctx.fillStyle = "#222";
    ctx.fillRect(x, y, 40, 80);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, 40, 80);
    
    // Animated portal effect
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3 + Math.sin(frames * 0.1) * 0.2;
    ctx.fillRect(x+5, y+5, 30, 70);
    ctx.globalAlpha = 1;
    
    // Icon in center
    ctx.fillStyle = color;
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.fillText(type === "portal_cube" ? "■" : "▶", x+20, y+45);
    ctx.textAlign = "left";
}

function drawBackground() {
    let gradient = ctx.createLinearGradient(0, 0, 0, 500);
    gradient.addColorStop(0, "#0a0a15");
    gradient.addColorStop(1, "#000005");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, 500);
    
    // Animated stars
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    for(let i=0; i<40; i++) {
        let x = (i * 123 + frames * 0.5) % 1000;
        let y = (i * 79) % 500;
        let twinkle = Math.sin(frames * 0.05 + i) * 0.5 + 0.5;
        ctx.globalAlpha = twinkle;
        ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
}

function drawMenuBG() { 
    drawBackground(); 
    drawLevel(frames*2, 0); 
}

// ========== CONTROLS ==========
canvas.addEventListener("wheel", e => {
    if(gameState === "editor") {
        e.preventDefault();
        if(e.ctrlKey) {
            cameraY -= e.deltaY;
        } else {
            cameraX += e.deltaY;
        }
    }
}, {passive: false});

window.onkeydown = e => { 
    if(e.code === "Space") {
        e.preventDefault();
        isHolding = true;
        if(gameState === "menu") {
            document.getElementById("playBtn").click();
        }
    }
    if(e.code === "Escape" && gameState === "playing") {
        gameState = "paused";
        document.getElementById("pauseMenu").style.display = "block";
    }
};

window.onkeyup = e => { 
    if(e.code === "Space") {
        e.preventDefault();
        isHolding = false;
    }
};

canvas.onmousedown = e => {
    if(gameState === "editor") {
        let rect = canvas.getBoundingClientRect();
        let mx = e.clientX - rect.left;
        let my = e.clientY - rect.top;
        
        // FIXED: Proper grid calculation with correct offset
        let worldX = mx + cameraX - 300;
        let worldY = GROUND_Y - (my - cameraY);
        
        let gx = Math.floor(worldX / 40) * 40;
        let gy = Math.floor(worldY / 40) * 40;
        
        if(editorTool === "eraser") {
            levels[currentLevelIndex].data = levels[currentLevelIndex].data.filter(
                o => !(o.x === gx && o.y === gy)
            );
        } else {
            // Check if object already exists at this position
            let exists = levels[currentLevelIndex].data.some(o => o.x === gx && o.y === gy);
            if(!exists) {
                levels[currentLevelIndex].data.push({x: gx, y: gy, type: editorTool});
            }
        }
    } else {
        isHolding = true;
    }
};

canvas.onmouseup = () => isHolding = false;

// ========== UI HANDLERS ==========
document.querySelectorAll(".tab-btn").forEach(b => {
    b.onclick = () => {
        document.querySelectorAll(".tab-btn").forEach(t => t.classList.remove("active"));
        b.classList.add("active");
        currentTab = b.dataset.tab;
        refreshIcons();
    };
});

document.getElementById("playBtn").onclick = () => { 
    gameState = "playing"; 
    document.getElementById("menu").style.display = "none"; 
    resetLevel(true); 
};

document.getElementById("editorBtn").onclick = () => { 
    gameState = "editor"; 
    document.getElementById("menu").style.display = "none"; 
    document.getElementById("editorUI").style.display = "block";
    document.getElementById("levelNameInput").value = levels[currentLevelIndex].name;
    document.getElementById("levelModeSelect").value = levels[currentLevelIndex].mode;
};

document.getElementById("levelModeSelect").onchange = (e) => {
    levels[currentLevelIndex].mode = e.target.value;
};

document.getElementById("saveLevelBtn").onclick = () => {
    levels[currentLevelIndex].name = document.getElementById("levelNameInput").value || "Untitled";
    levels[currentLevelIndex].mode = document.getElementById("levelModeSelect").value;
    localStorage.setItem("gd_ultra_levels", JSON.stringify(levels));
    refreshLevelList();
    alert("✅ Level saved!");
};

document.getElementById("exitEditorBtn").onclick = () => { 
    gameState = "menu"; 
    document.getElementById("editorUI").style.display = "none"; 
    document.getElementById("menu").style.display = "block"; 
    localStorage.setItem("gd_ultra_levels", JSON.stringify(levels));
    refreshLevelList();
};

document.getElementById("replayBtn").onclick = () => resetLevel(true);

document.getElementById("victoryHomeBtn").onclick = () => { 
    gameState = "menu"; 
    document.getElementById("victoryUI").style.display = "none"; 
    document.getElementById("menu").style.display = "block"; 
};

document.getElementById("resumeBtn").onclick = () => {
    gameState = "playing";
    document.getElementById("pauseMenu").style.display = "none";
};

document.getElementById("menuBtn").onclick = () => {
    gameState = "menu";
    document.getElementById("pauseMenu").style.display = "none";
    document.getElementById("menu").style.display = "block";
};

// Tool switching
document.querySelectorAll(".tool").forEach(t => {
    t.onclick = () => {
        document.querySelectorAll(".tool").forEach(i => i.classList.remove("selected"));
        t.classList.add("selected");
        editorTool = t.dataset.type;
    };
});

// NEW LEVEL
document.getElementById("newLevelBtn").onclick = () => {
    let name = prompt("Enter level name:", "New Level");
    if(!name) return;
    
    let newLevel = {
        name: name,
        mode: "cube",
        data: [],
        length: 5000,
        id: `level_${Date.now()}`
    };
    
    levels.push(newLevel);
    currentLevelIndex = levels.length - 1;
    localStorage.setItem("gd_ultra_levels", JSON.stringify(levels));
    refreshLevelList();
    updateLevelInfo();
    
    document.getElementById("levelList").style.transform = 
        `translateX(-${currentLevelIndex * 300}px)`;
};

// DELETE LEVEL
document.getElementById("deleteLevelBtn").onclick = () => {
    if(levels.length <= 1) {
        alert("❌ Cannot delete the last level!");
        return;
    }
    
    if(confirm(`Delete "${levels[currentLevelIndex].name}"?`)) {
        levels.splice(currentLevelIndex, 1);
        currentLevelIndex = Math.max(0, currentLevelIndex - 1);
        localStorage.setItem("gd_ultra_levels", JSON.stringify(levels));
        refreshLevelList();
        updateLevelInfo();
        document.getElementById("levelList").style.transform = 
            `translateX(-${currentLevelIndex * 300}px)`;
    }
};

// Level navigation
document.getElementById("levelLeft").onclick = () => {
    if(currentLevelIndex > 0) {
        currentLevelIndex--;
        updateLevelInfo();
        document.getElementById("levelList").style.transform = 
            `translateX(-${currentLevelIndex * 300}px)`;
        refreshLevelList();
    }
};

document.getElementById("levelRight").onclick = () => {
    if(currentLevelIndex < levels.length - 1) {
        currentLevelIndex++;
        updateLevelInfo();
        document.getElementById("levelList").style.transform = 
            `translateX(-${currentLevelIndex * 300}px)`;
        refreshLevelList();
    }
};

function refreshLevelList() {
    const list = document.getElementById("levelList");
    list.innerHTML = "";
    levels.forEach((l, i) => {
        let d = document.createElement("div");
        d.className = "level-title";
        if(i === currentLevelIndex) d.classList.add("active");
        d.innerHTML = `
            <div class="level-name">${l.name}</div>
            <div class="level-meta">${l.mode.toUpperCase()} • ${Math.floor(l.length/40)}m</div>
        `;
        d.onclick = () => {
            currentLevelIndex = i;
            updateLevelInfo();
            document.querySelectorAll(".level-title").forEach(t => t.classList.remove("active"));
            d.classList.add("active");
            document.getElementById("levelList").style.transform = 
                `translateX(-${currentLevelIndex * 300}px)`;
        };
        list.appendChild(d);
    });
}

// ========== UPLOAD/DOWNLOAD ==========
document.getElementById("uploadLevelBtn").onclick = () => {
    document.getElementById("uploadUI").style.display = "block";
    document.getElementById("uploadLevelName").innerText = levels[currentLevelIndex].name;
};

document.getElementById("confirmUploadBtn").onclick = async () => {
    let author = document.getElementById("uploadAuthor").value || "Anonymous";
    let description = document.getElementById("uploadDescription").value || "";
    
    let upload = {
        level: levels[currentLevelIndex],
        author: author,
        description: description,
        timestamp: Date.now(),
        plays: 0
    };
    
    try {
        let key = `community_${levels[currentLevelIndex].id}`;
        await window.storage.set(key, JSON.stringify(upload), true);
        alert("✅ Level uploaded successfully!");
        document.getElementById("uploadUI").style.display = "none";
        document.getElementById("uploadAuthor").value = "";
        document.getElementById("uploadDescription").value = "";
    } catch(e) {
        alert("❌ Upload failed. Storage might not be available.");
        console.error(e);
    }
};

document.getElementById("cancelUploadBtn").onclick = () => {
    document.getElementById("uploadUI").style.display = "none";
};

document.getElementById("browseLevelsBtn").onclick = async () => {
    document.getElementById("browseLevelsUI").style.display = "block";
    await loadCommunityLevels();
};

document.getElementById("closeBrowseBtn").onclick = () => {
    document.getElementById("browseLevelsUI").style.display = "none";
};

async function loadCommunityLevels() {
    let list = document.getElementById("communityLevelsList");
    list.innerHTML = "<p>Loading...</p>";
    
    try {
        let result = await window.storage.list("community_", true);
        
        if(!result || !result.keys || result.keys.length === 0) {
            list.innerHTML = "<p>No community levels yet. Be the first to upload!</p>";
            return;
        }
        
        list.innerHTML = "";
        
        for(let key of result.keys) {
            try {
                let data = await window.storage.get(key, true);
                if(!data) continue;
                
                let upload = JSON.parse(data.value);
                
                let item = document.createElement("div");
                item.className = "community-item";
                item.innerHTML = `
                    <h3>${upload.level.name}</h3>
                    <p class="meta">By: ${upload.author} • ${upload.level.mode.toUpperCase()} • ${Math.floor(upload.level.length/40)}m</p>
                    <p>${upload.description}</p>
                    <button class="download-btn">⬇ DOWNLOAD</button>
                `;
                
                item.querySelector(".download-btn").onclick = () => {
                    let downloaded = {...upload.level};
                    downloaded.id = `level_${Date.now()}`;
                    downloaded.name = `[DL] ${downloaded.name}`;
                    levels.push(downloaded);
                    localStorage.setItem("gd_ultra_levels", JSON.stringify(levels));
                    refreshLevelList();
                    alert("✅ Level downloaded!");
                };
                
                list.appendChild(item);
            } catch(e) {
                console.error("Error loading level:", e);
            }
        }
    } catch(e) {
        list.innerHTML = "<p>Could not load community levels.</p>";
        console.error(e);
    }
}

// ========== COMMENTS ==========
document.getElementById("commentsBtn").onclick = () => {
    document.getElementById("commentsUI").style.display = "block";
    loadComments();
};

document.getElementById("closeCommentsBtn").onclick = () => {
    document.getElementById("commentsUI").style.display = "none";
};

document.getElementById("postCommentBtn").onclick = async () => {
    let text = document.getElementById("commentInput").value.trim();
    if(!text) return;
    
    let comment = {
        text: text,
        levelId: levels[currentLevelIndex].id,
        timestamp: Date.now(),
        author: "Player"
    };
    
    try {
        let key = `comment_${levels[currentLevelIndex].id}_${Date.now()}`;
        await window.storage.set(key, JSON.stringify(comment), true);
        document.getElementById("commentInput").value = "";
        loadComments();
    } catch(e) {
        alert("Could not post comment.");
        console.error(e);
    }
};

async function loadComments() {
    let list = document.getElementById("commentsList");
    list.innerHTML = "<p>Loading comments...</p>";
    
    try {
        let prefix = `comment_${levels[currentLevelIndex].id}_`;
        let result = await window.storage.list(prefix, true);
        
        if(!result || !result.keys || result.keys.length === 0) {
            list.innerHTML = "<p>No comments yet. Be the first!</p>";
            return;
        }
        
        list.innerHTML = "";
        let comments = [];
        
        for(let key of result.keys) {
            try {
                let data = await window.storage.get(key, true);
                if(data) comments.push(JSON.parse(data.value));
            } catch(e) {
                console.error("Error loading comment:", e);
            }
        }
        
        comments.sort((a, b) => b.timestamp - a.timestamp);
        
        comments.forEach(c => {
            let item = document.createElement("div");
            item.className = "comment-item";
            let date = new Date(c.timestamp).toLocaleDateString();
            item.innerHTML = `
                <strong>${c.author}</strong> <span class="comment-date">${date}</span>
                <p>${c.text}</p>
            `;
            list.appendChild(item);
        });
    } catch(e) {
        list.innerHTML = "<p>Could not load comments.</p>";
        console.error(e);
    }
}

init();
