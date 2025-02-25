// Imports
import { PowerUpManager, SOUND_EFFECTS, POWER_UP_TYPES } from './power-ups.js';
import { socket } from './client.js';
import { gameState } from './gameState.js';
import { ArenaShrinkManager } from './arena-shrink.js';

// Game constants
export const CELL_SIZE = 40;
const GRID_SIZE = 15;
const PLAYER_SPEED = 3;
const BOMB_TIMER = 3000;
const EXPLOSION_DURATION = 500;
const GRID_PADDING = 0;
const PLAYER_SIZE = 26;
const COLLISION_BUFFER = 1;
const TARGET_FPS = 60;
const FRAME_TIME = 1000 / TARGET_FPS;
const SHRINK_WARNING_TIME = 120000; // 2 minutes in milliseconds
const SHRINK_START_TIME = SHRINK_WARNING_TIME + 3000; // Warning + 3 seconds

// Points system
const POINTS = {
    KILL: 100,
    BREAK_WALL: 10,
    WIN: 30 //x3
};

// Game state
let gameGrid = [];
let players = new Map();
let bombs = new Map();
let lastFrameTime = 0;
let localPlayer = null;
let playerPositions = new Map();
let explosions = new Set();
let powerUpManager = null;
let frameID = null;
let fps = 0;
let frameCount = 0;
let lastFpsUpdate = 0;
let arenaShrinkManager = null;


// DOM Elements
const gameGridElement = document.getElementById('gameGrid');
const powerUpStatusElement = document.getElementById('powerUpStatus');
const powerUpIconElement = document.getElementById('powerUpIcon');
const powerUpTimerElement = document.getElementById('powerUpTimer');

// Initialize game grid
function initializeGrid(gridData) {
    if (!gridData || !Array.isArray(gridData) || gridData.length !== GRID_SIZE) {
        console.error('Invalid grid data:', gridData);
        return;
    }

    gameGrid = gridData;
    gameGridElement.innerHTML = '';
    
    for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
            const cell = document.createElement('div');
            cell.className = `cell ${gridData[i][j]}`;
            cell.dataset.x = j;
            cell.dataset.y = i;
            gameGridElement.appendChild(cell);
        }
    }

    // Initialize power-up manager
    powerUpManager = new PowerUpManager(gameGrid);
    powerUpManager.startSpawning();

    arenaShrinkManager = new ArenaShrinkManager(gameGrid, GRID_SIZE);
    
    // Set timer for arena shrinking
    //console.log('Setting shrink warning timer for', SHRINK_WARNING_TIME);
    setTimeout(showShrinkWarning, SHRINK_WARNING_TIME);
    
   //console.log('Setting shrink start timer for', SHRINK_START_TIME);
    setTimeout(() => {
        //console.log('Shrink start timer triggered', 'gameActive=', gameState.gameActive, 'gamePaused=', gameState.gamePaused);
        if (gameState.gameActive && !gameState.gamePaused) {
           // console.log('Starting arena shrinking');
            arenaShrinkManager.startShrinking();
        } else {
            //console.log('Arena shrinking not started: gameActive=', gameState.gameActive, 'gamePaused=', gameState.gamePaused);
        }
    }, SHRINK_START_TIME);
}
// Helper functions
export function gridToPixel(gridX, gridY) {
    return {
        x: gridX * CELL_SIZE + CELL_SIZE/2,
        y: gridY * CELL_SIZE + CELL_SIZE/2
    };
}

export function pixelToGrid(x, y) {
    return {
        x: Math.floor(x / CELL_SIZE),
        y: Math.floor(y / CELL_SIZE)
    };
}

function showShrinkWarning() {
    //console.log('showShrinkWarning called');
    if (!gameState.gameActive || gameState.gamePaused) return;
    
    const warning = document.createElement('div');
    warning.className = 'warning-message';
    warning.textContent = 'HURRY UP!';
    document.body.appendChild(warning);
    
   //console.log('showShrinkWarning displayed');
    // Remove warning after 3 seconds
    setTimeout(() => {
        warning.remove();
    }, 3000);
}

// Player class
class Player {
    constructor(name, color, startX, startY) {
        this.name = name;
        this.element = document.createElement('div');
        this.element.className = `player ${color}`;
        const startPos = gridToPixel(startX, startY);
        this.x = startPos.x;
        this.y = startPos.y;
        this.bombsAvailable = 1;
        this.alive = true;
        this.bombRange = 1;
        this.speed = PLAYER_SPEED;
        this.hasShield = false;
        this.activePowerUp = null;
        this.powerUpTimeout = null;
        gameGridElement.appendChild(this.element);
        this.updatePosition();
    }

    updatePosition() {
        this.element.style.left = `${this.x}px`;
        this.element.style.top = `${this.y}px`;
        
        // Check for power-up collision
        if (powerUpManager) {
            powerUpManager.checkCollision(this);
        }
    }

    move(dx, dy) {
        if (dx !== 0 && dy !== 0) {
            dx *= 0.707;
            dy *= 0.707;
        }

        const newX = this.x + dx * this.speed;
        const newY = this.y + dy * this.speed;

        if (this.checkCollision(newX, newY)) {
            return false;
        }

        const prevX = this.x;
        const prevY = this.y;

        this.x = newX;
        this.y = newY;
        this.updatePosition();

        // Lock the previous cell if a bomb is present
        const prevPos = pixelToGrid(prevX, prevY);
        const bombKey = `${prevPos.x},${prevPos.y}`;
        if (bombs.has(bombKey)) {
            if (gameGrid[prevPos.y][prevPos.x] === 'empty') {
                gameGrid[prevPos.y][prevPos.x] = 'locked';
            }
        }

        return true;
    }

    checkCollision = function(newX, newY) {
        const halfSize = PLAYER_SIZE / 2;
        const buffer = COLLISION_BUFFER;

        const checkPoints = [];
    
        checkPoints.push(
            { x: newX - halfSize + buffer, y: newY },
            { x: newX + halfSize - buffer, y: newY },
            { x: newX, y: newY - halfSize + buffer },
            { x: newX, y: newY + halfSize - buffer }
        );
    
        const diagonalBuffer = buffer * 1.4;
        checkPoints.push(
            { x: newX - halfSize + diagonalBuffer, y: newY - halfSize + diagonalBuffer },
            { x: newX + halfSize - diagonalBuffer, y: newY - halfSize + diagonalBuffer },
            { x: newX - halfSize + diagonalBuffer, y: newY + halfSize - diagonalBuffer },
            { x: newX + halfSize - diagonalBuffer, y: newY + halfSize - diagonalBuffer }
        );

        for (const point of checkPoints) {
            const gridPos = pixelToGrid(point.x, point.y);

            if (gridPos.x < 0 || gridPos.x >= GRID_SIZE ||
                gridPos.y < 0 || gridPos.y >= GRID_SIZE) {
                return true;
            }

            const cellType = gameGrid[gridPos.y][gridPos.x];
            if (cellType === 'wall' || cellType === 'breakable') {
                return true;
            }

            if (cellType === 'locked') {
                const bombKey = `${gridPos.x},${gridPos.y}`;
                const bomb = bombs.get(bombKey);

                if (bomb) {
                    const hasMoved = (pixelToGrid(this.x, this.y).x !== bomb.originalX || pixelToGrid(this.x, this.y).y !== bomb.originalY);
                    if (bomb.playerName === this.name && Date.now() - bomb.timestamp < 500) {
                        continue;
                    }
                    return true;
                }
            }
        }

        return false;
    };

    placeBomb() {
        if (this.bombsAvailable <= 0) return;
        
        const pos = pixelToGrid(this.x, this.y);
        const bombKey = `${pos.x},${pos.y}`;
        if (bombs.has(bombKey)) return;
        
        this.bombsAvailable--;
        const timestamp = Date.now();
        const bomb = createBomb(pos.x, pos.y, this, timestamp);
        bombs.set(bombKey, bomb);
        
        SOUND_EFFECTS.BOMB_PLACE.play();
        socket.emit('placeBomb', { 
            x: pos.x, 
            y: pos.y,
            timestamp: timestamp
        });
    }

    destroy() {
        if (this.hasShield) {
            this.hasShield = false;
            this.element.classList.remove('shielded');
            return;
        }
        
        this.alive = false;
        this.element.style.opacity = '0.5';
        this.element.classList.add('spectator');
        SOUND_EFFECTS.DEATH.play();
    }

    interpolatePosition(targetX, targetY, deltaTime) {
        const interpolationFactor = deltaTime / FRAME_TIME;
        const deltaX = (targetX - this.x) * interpolationFactor;
        const deltaY = (targetY - this.y) * interpolationFactor;
        this.x += deltaX;
        this.y += deltaY;
        this.updatePosition();
    }

    applyPowerUp(type) {
        if (this !== localPlayer) return;

        if (this.powerUpTimeout) {
            clearTimeout(this.powerUpTimeout);
        }

        this.activePowerUp = type;
        powerUpStatusElement.style.display = 'flex';
        powerUpIconElement.textContent = this.getIconForType(type);
        this.updatePowerUpTimer(10);

        this.powerUpTimeout = setTimeout(() => {
            this.activePowerUp = null;
            powerUpStatusElement.style.display = 'none';
        }, 10000);
    }

    updatePowerUpTimer(seconds) {
        powerUpTimerElement.textContent = `${seconds}s`;
        if (seconds > 0) {
            setTimeout(() => this.updatePowerUpTimer(seconds - 1), 1000);
        }
    }

    getIconForType(type) {
        switch(type) {
            case POWER_UP_TYPES.SPEED: return '⚡';
            case POWER_UP_TYPES.RANGE: return '🔥';
            case POWER_UP_TYPES.BOMBS: return '💣';
            case POWER_UP_TYPES.SHIELD: return '🛡️';
            default: return '?';
        }
    }
}

function createBomb(x, y, player, timestamp = Date.now()) {
    const bomb = document.createElement('div');
    bomb.className = 'bomb';
    const pos = pixelToGrid(x, y);
    const bombKey = `${pos.x},${pos.y}`;
    const cellIndex = y * GRID_SIZE + x;
    const cell = gameGridElement.children[cellIndex];
    if (!cell) {
        console.error('Invalid cell index:', cellIndex);
        return null;
    }
    cell.appendChild(bomb);

    const remainingTime = BOMB_TIMER - (Date.now() - timestamp);
    setTimeout(() => explodeBomb(x, y, player), Math.max(0, remainingTime));

    return {
        element: bomb,
        player: player,
        playerName: player.name,
        timestamp: Date.now(),
        originalX: player.x,
        originalY: player.y
    };
}

function explodeBomb(x, y, player) {
    const bombKey = `${x},${y}`;
    const bomb = bombs.get(bombKey);
    if (!bomb) return;

    // Unlock the cell
    if (gameGrid[y][x] === 'locked') {
        gameGrid[y][x] = 'empty';
    }
    
    // Emit bomb explosion to server BEFORE removing locally
    if (player === localPlayer) {
        socket.emit('bombExploded', { x, y });
    }
    
    // Now remove locally
    bombs.delete(bombKey);
    bomb.element.remove();
    player.bombsAvailable++;
    
    SOUND_EFFECTS.EXPLOSION.play();
    createExplosion(x, y, player.bombRange, player);
}

function showExplosionAnimation(x, y, cell) {
    const explosion = document.createElement('div');
    explosion.className = 'explosion';
    cell.appendChild(explosion);
    
    explosions.add(`${x},${y}`);
    
    setTimeout(() => {
        explosion.remove();
        explosions.delete(`${x},${y}`);
    }, EXPLOSION_DURATION);
}

function createExplosion(x, y, range, sourcePlayer) {
    const directions = [[0,0], [1,0], [-1,0], [0,1], [0,-1]];
    const explosionCells = [];
    
    directions.forEach(([dx, dy]) => {
        for (let i = 0; i <= range; i++) {
            const newX = x + dx * i;
            const newY = y + dy * i;
            
            if (newX < 0 || newX >= GRID_SIZE || newY < 0 || newY >= GRID_SIZE) {
                break;
            }

            const cell = gameGridElement.children[newY * GRID_SIZE + newX];
            if (gameGrid[newY][newX] === 'wall') {
                break;
            }

            showExplosionAnimation(newX, newY, cell);
            explosionCells.push({ x: newX, y: newY });
            
            if (gameGrid[newY][newX] === 'breakable') {
                gameGrid[newY][newX] = 'empty';
                cell.className = 'cell empty';
                SOUND_EFFECTS.WALL_BREAK.play();

                if (sourcePlayer === localPlayer) {
                    // Generate power-up data
                    const shouldSpawnPowerUp = Math.random() < 0.3;
                    const powerUpType = shouldSpawnPowerUp ? 
                        Object.values(POWER_UP_TYPES)[Math.floor(Math.random() * Object.values(POWER_UP_TYPES).length)] : 
                        null;

                    socket.emit('updateScore', {
                        name: localPlayer.name,
                        points: POINTS.BREAK_WALL,
                        reason: 'break'
                    });
                    socket.emit('wallBreak', { 
                        x: newX, 
                        y: newY,
                        powerUp: powerUpType
                    });

                    // Emit power-up spawn event to the server
                    if (powerUpType) {
                        socket.emit('spawnPowerUp', {
                            x: newX,
                            y: newY,
                            type: powerUpType
                        });
                    }
                }
                break;
            }

            checkExplosionDamage(newX, newY, sourcePlayer);
        }
    });

    if (sourcePlayer === localPlayer) {
        socket.emit('explosion', { x, y, range, cells: explosionCells });
    }
}

function checkExplosionDamage(x, y, sourcePlayer) {
    players.forEach((player) => {
        if (!player.alive) return;

        const pos = pixelToGrid(player.x, player.y);
        if (pos.x === x && pos.y === y) {
            player.destroy();
            if (player.alive) return; // Shield prevented death

            socket.emit('playerDied', player.name);

            if (sourcePlayer === localPlayer) {
                socket.emit('updateScore', {
                    name: localPlayer.name,
                    points: POINTS.KILL,
                    reason: 'kill'
                });
            }

            checkGameOver();
        }
    });
}

function updateFPS(timestamp) {
    frameCount++;
    
    if (timestamp - lastFpsUpdate >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastFpsUpdate = timestamp;
        
        // Optional: Display FPS
         console.log('FPS:', fps);
    }
}

function gameLoop(timestamp) {
    if (!gameState.gameActive) return;
    
    frameID = requestAnimationFrame(gameLoop);
    
    if (gameState.gamePaused) {
        lastFrameTime = timestamp;
        return;
    }
    
    const deltaTime = timestamp - lastFrameTime;
    if (deltaTime < FRAME_TIME) {
        return;
    }
    
    updateFPS(timestamp);
    
    // Check all players for falling wall collisions
    players.forEach(player => {
        if (player.alive) {
            checkFallingWallCollision(player);
        }
    });
    
    if (localPlayer && localPlayer.alive) {
        let moved = false;
        const movement = { x: 0, y: 0 };
        
        if (keys.ArrowLeft || keys.a) movement.x -= 1;
        if (keys.ArrowRight || keys.d) movement.x += 1;
        if (keys.ArrowUp || keys.w) movement.y -= 1;
        if (keys.ArrowDown || keys.s) movement.y += 1;
        
        if (movement.x !== 0 || movement.y !== 0) {
            moved = localPlayer.move(movement.x, movement.y);
            if (moved) {
                socket.emit('playerMove', {
                    x: localPlayer.x,
                    y: localPlayer.y
                });
            }
        }
    }

    // Interpolate positions for remote players
    players.forEach(player => {
        if (player !== localPlayer) {
            const targetPos = playerPositions.get(player.name);
            if (targetPos) {
                player.interpolatePosition(targetPos.x, targetPos.y, deltaTime);
            }
        }
    });
    // Update timer display
    const remainingTime = Math.max(0, gameState.gameEndTime - Date.now());
    const minutes = Math.floor(remainingTime / 60000);
    const seconds = Math.floor((remainingTime % 60000) / 1000);
    const timerElement = document.getElementById('gameTimer');
    timerElement.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

    // Check if game time is over
    if (remainingTime <= 0) {
        checkGameOver();
    }
    
    lastFrameTime = timestamp - (deltaTime % FRAME_TIME);
}

const keys = {};

document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.key] = true;
    
    if (e.code === 'Space' && localPlayer?.alive) {
        localPlayer.placeBomb();
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

socket.on('gameStart', (initialState) => {
    // Clear existing players and power-ups
    players.forEach(player => {
        if (player.element && player.element.parentNode) {
            player.element.remove();
        }
    });
    players.clear();

    if (powerUpManager) {
        powerUpManager.cleanup();
    }

    // Initialize grid
    initializeGrid(initialState.grid);

    // Create players
    const startPositions = [
        { x: 1, y: 1 },
        { x: GRID_SIZE - 2, y: GRID_SIZE - 2 },
        { x: 1, y: GRID_SIZE - 2 },
        { x: GRID_SIZE - 2, y: 1 }
    ];

    initialState.players.forEach((player, index) => {
        if (index >= startPositions.length) return;

        const newPlayer = new Player(
            player.name,
            `player-${index + 1}`,
            startPositions[index].x,
            startPositions[index].y
        );

        players.set(player.name, newPlayer);
        if (player.name === gameState.playerName) {
            localPlayer = newPlayer;
        }
    });

    // Reset game state
    gameState.gameActive = true;
    gameState.gameStartTime = Date.now();
    gameState.gameEndTime = Date.now() + 180000; // 3 minutes in milliseconds
    gameState.gamePaused = false; // Ensure game is not paused

    // Hide game over screen
    document.getElementById('gameOverScreen').style.display = 'none';

    // Hide pause screen
     document.getElementById('pauseScreen').style.display = 'none';

    lastFrameTime = performance.now();
    frameID = requestAnimationFrame(gameLoop);
});

socket.on('playerMoved', ({ name, movement }) => {
    const player = players.get(name);
    if (player && player !== localPlayer) {
        playerPositions.set(name, { x: movement.x, y: movement.y });
    }
});

socket.on('bombPlaced', ({ position, playerName, timestamp }) => {
    const player = players.get(playerName);
    if (player) {
        const bombKey = `${position.x},${position.y}`;
        if (!bombs.has(bombKey)) {
            const bomb = createBomb(position.x, position.y, player, timestamp);
            bombs.set(bombKey, bomb);
        }
    }
});

socket.on('bombExploded', ({ x, y }) => {
    const bombKey = `${x},${y}`;
    const bomb = bombs.get(bombKey);

    if (bomb) {
        bomb.element.remove();
        bombs.delete(bombKey);

        const player = bomb.player;
        if (player) {
            player.bombsAvailable++;
        }
    }
});

socket.on('explosionCreated', (data) => {
    data.cells.forEach(pos => {
        const cell = gameGridElement.children[pos.y * GRID_SIZE + pos.x];
        if (cell) {
            showExplosionAnimation(pos.x, pos.y, cell);
        }
    });
});

socket.on('wallBroken', (data) => {
    const cell = gameGridElement.children[data.y * GRID_SIZE + data.x];
    if (cell && gameGrid[data.y][data.x] === 'breakable') {
        gameGrid[data.y][data.x] = 'empty';
        cell.className = 'cell empty';
        SOUND_EFFECTS.WALL_BREAK.play();

        // Spawn power-up data
        if (data.powerUp && powerUpManager) {
            powerUpManager.spawnPowerUp(data.x, data.y, data.powerUp);
        }
    }
});

socket.on('powerUpSpawned', (data) => {
    if (powerUpManager) {
        powerUpManager.spawnPowerUp(data.x, data.y, data.type);
    }
});

socket.on('playerDied', (playerName) => {
    const player = players.get(playerName);
    if (player) {
        player.destroy();
        checkGameOver();
    }
});

socket.on('gamePaused', ({ isPaused, pausedBy }) => {
    gameState.gamePaused = isPaused;
    if (isPaused) {
        cancelAnimationFrame(frameID);
        if (arenaShrinkManager) {
            arenaShrinkManager.stopShrinking();
        }
    } else {
        lastFrameTime = performance.now();
        frameID = requestAnimationFrame(gameLoop);
        
        // Check if enough time has passed to start shrinking the arena
        if (gameState.gameStartTime && Date.now() >= gameState.gameStartTime + SHRINK_START_TIME) {
            arenaShrinkManager.startShrinking();
        } else if (arenaShrinkManager && arenaShrinkManager.shrinkStarted) {
            arenaShrinkManager.startShrinking();
        }
    }
});

socket.on('gameQuit', ({ playerName }) => {
    showMessage(`${playerName} has quit the game`);
    window.location.reload();
});

socket.on('endGame', (scores) => {
    gameState.gameActive = false;
    const sortedScores = Object.entries(scores).sort(([,a], [,b]) => b - a);
    const winnerMessage = document.getElementById('winnerMessage');
    winnerMessage.textContent = `Game over! ${winner ? `${winner} wins!` : 'No winners!'}`;
    document.getElementById('gameOverScreen').style.display = 'flex';
});

function checkFallingWallCollision(player) {
    if (!player.alive || !arenaShrinkManager) return;

    const pos = pixelToGrid(player.x, player.y);
    const halfSize = PLAYER_SIZE / 2;
    const buffer = COLLISION_BUFFER;
    
    // Check all points around the player
    const checkPoints = [
        { x: player.x, y: player.y }, // Center
        { x: player.x - halfSize + buffer, y: player.y }, // Left
        { x: player.x + halfSize - buffer, y: player.y }, // Right
        { x: player.x, y: player.y - halfSize + buffer }, // Top
        { x: player.x, y: player.y + halfSize - buffer }  // Bottom
    ];

    for (const point of checkPoints) {
        const gridPos = pixelToGrid(point.x, point.y);
        
        if (gridPos.x >= 0 && gridPos.x < GRID_SIZE && 
            gridPos.y >= 0 && gridPos.y < GRID_SIZE) {
            
                if (gameGrid[gridPos.y][gridPos.x] === 'wall' && 
                    arenaShrinkManager.isWallFalling(gridPos.x, gridPos.y)) {
                    player.destroy();
                    socket.emit('playerDied', player.name);
                    return;
                }
        }
    }
}


function checkGameOver() {
    const alivePlayers = Array.from(players.values()).filter(p => p.alive);
    
    if (alivePlayers.length <= 1) {
        const winner = alivePlayers[0];
        const gameOverScreen = document.getElementById('gameOverScreen');
        const winnerMessage = document.getElementById('winnerMessage');
        
        if (winner) {
            SOUND_EFFECTS.VICTORY.play();
            socket.emit('updateScore', {
                name: winner.name,
                points: POINTS.WIN,
                reason: 'win'
            });
        }
        
        gameOverScreen.style.display = 'flex';
        winnerMessage.textContent = winner ? 
            `${winner.name} wins!` : 
            'Game Over - No winners!';
            
        gameState.gameActive = false;
        
        if (powerUpManager) {
            powerUpManager.cleanup();
        }
        
        if (frameID) {
            cancelAnimationFrame(frameID);
        }
    }
}

window.addEventListener('resize', () => {
    if (localPlayer) {
        localPlayer.updatePosition();
    }
});

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
    if (arenaShrinkManager) {
        arenaShrinkManager.cleanup();
    }
    if (powerUpManager) {
        powerUpManager.cleanup();
    }
    if (frameID) {
        cancelAnimationFrame(frameID);
    }
});
