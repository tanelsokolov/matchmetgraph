// ai-player.js
import { POWER_UP_TYPES } from './power-ups.js';
import { gridToPixel, pixelToGrid } from './game.js';
import { gameState } from './gameState.js';

// AI difficulty levels
export const AI_DIFFICULTY = {
    EASY: 'easy',
    MEDIUM: 'medium',
    HARD: 'hard'
};

// AI personality traits (customizable)
export const AI_TRAITS = {
    AGGRESSIVE: 'aggressive',   // Chases players, prioritizes combat
    CAUTIOUS: 'cautious',       // Prioritizes survival, avoids confrontation
    COLLECTOR: 'collector',     // Prioritizes power-ups
    DESTROYER: 'destroyer',     // Focuses on breaking walls
    BALANCED: 'balanced'        // Mix of all strategies
};

// Predefined AI personalities
export const AI_PERSONALITIES = [
    { name: "Rusher", trait: AI_TRAITS.AGGRESSIVE, description: "Recklessly chases other players" },
    { name: "Survivor", trait: AI_TRAITS.CAUTIOUS, description: "Avoids conflict and plays it safe" },
    { name: "Hunter", trait: AI_TRAITS.COLLECTOR, description: "Collects power-ups aggressively" },
    { name: "Demolisher", trait: AI_TRAITS.DESTROYER, description: "Breaks walls methodically" },
    { name: "Tactician", trait: AI_TRAITS.BALANCED, description: "Uses a balanced strategy" }
];

export class AIPlayer {
    constructor(player, difficulty = AI_DIFFICULTY.MEDIUM, trait = AI_TRAITS.BALANCED) {
        this.player = player;
        this.difficulty = difficulty;
        this.trait = trait;
        this.targetX = null;
        this.targetY = null;
        this.currentPath = [];
        this.lastDecisionTime = 0;
        this.bombCooldown = 0;
        this.stuckCounter = 0;
        this.lastPosition = { x: player.x, y: player.y };
        this.dangerMap = new Map();
        this.avoidingDanger = false;
        this.state = 'exploring';
        this.failureRate = this.getFailureRate();
        this.decisionInterval = this.getDecisionInterval();
        this.strategyEffectiveness = this.getStrategyEffectiveness();
        this.currentGameGrid = null;
    }

    getFailureRate() {
        // Chance the AI will fail to execute its intended action
        switch (this.difficulty) {
            case AI_DIFFICULTY.EASY: return 0.4;    // 40% chance of failure
            case AI_DIFFICULTY.MEDIUM: return 0.15; // 15% chance of failure
            case AI_DIFFICULTY.HARD: return 0.05;   // 5% chance of failure
            default: return 0.2;
        }
    }

    getDecisionInterval() {
        // How often the AI makes decisions (ms)
        switch (this.difficulty) {
            case AI_DIFFICULTY.EASY: return 300;
            case AI_DIFFICULTY.MEDIUM: return 200;
            case AI_DIFFICULTY.HARD: return 100;
            default: return 200;
        }
    }

    getStrategyEffectiveness() {
        // How good the AI is at selecting optimal strategies
        switch (this.difficulty) {
            case AI_DIFFICULTY.EASY: return 0.5;
            case AI_DIFFICULTY.MEDIUM: return 0.8;
            case AI_DIFFICULTY.HARD: return 0.95;
            default: return 0.7;
        }
    }

    update(gameGrid, players, bombs, explosions, powerUps) {
        if (!this.player.alive || gameState.gamePaused) return;

        this.currentGameGrid = gameGrid;
        const now = Date.now();
        
        // Reduce decision interval for faster reactions
        if (this.avoidingDanger) {
            // Make decisions much more frequently when in danger
            if (now - this.lastDecisionTime < 50) return; // 20 times per second
        } else {
            if (now - this.lastDecisionTime < this.decisionInterval) return;
        }
        this.lastDecisionTime = now;

        // Check if stuck
        const currentPos = { x: this.player.x, y: this.player.y };
        const distance = Math.sqrt(
            Math.pow(currentPos.x - this.lastPosition.x, 2) +
            Math.pow(currentPos.y - this.lastPosition.y, 2)
        );
        
        if (distance < 5) {
            this.stuckCounter++;
            if (this.stuckCounter > 3) { // Reduced from 5 to 3 for faster response
                this.targetX = null;
                this.targetY = null;
                this.currentPath = [];
                this.stuckCounter = 0;
            }
        } else {
            this.stuckCounter = 0;
        }
        this.lastPosition = { ...currentPos };

        // Update danger map
        this.updateDangerMap(bombs, explosions, gameGrid);
        
        // Check if in immediate danger
        const inDanger = this.isInDanger(currentPos, this.dangerMap);
        if (inDanger) {
            this.avoidingDanger = true;
            // Try to move away from danger multiple times per frame when in danger
            for (let i = 0; i < 3; i++) {
                if (this.avoidDanger(gameGrid, this.dangerMap)) break;
            }
            return;
        } else {
            this.avoidingDanger = false;
        }

        // Rest of the update logic...
        if (!this.targetX || !this.targetY || this.currentPath.length === 0) {
            this.determineNextAction(gameGrid, players, bombs, powerUps);
        }

        if (this.currentPath.length > 0) {
            // Try to move multiple times per frame for smoother movement
            for (let i = 0; i < 2; i++) {
                if (this.followPath(gameGrid)) break;
            }
        } else {
            this.moveRandomly();
        }

        this.decidePlaceBomb(gameGrid, players, bombs);
    }

    updateDangerMap(bombs, explosions, gameGrid) {
        this.dangerMap.clear();
        
        // Mark bombs and their potential explosion areas
        bombs.forEach((bomb, key) => {
            const [bombX, bombY] = key.split(',').map(Number);
            const range = bomb.player.bombRange || 2;
            
            // Mark bomb location as dangerous
            this.dangerMap.set(`${bombX},${bombY}`, 1.0);
            
            // Mark explosion range
            const directions = [[1,0], [-1,0], [0,1], [0,-1]];
            directions.forEach(([dx, dy]) => {
                for (let i = 1; i <= range; i++) {
                    const x = bombX + dx * i;
                    const y = bombY + dy * i;
                    
                    // Stop at walls
                    if (x < 0 || y < 0 || x >= gameGrid[0].length || y >= gameGrid.length || 
                        gameGrid[y][x] === 'wall') {
                        break;
                    }
                    
                    this.dangerMap.set(`${x},${y}`, 0.9);
                    
                    // Stop at breakable walls, but mark them as dangerous
                    if (gameGrid[y][x] === 'breakable') {
                        break;
                    }
                }
            });
        });
        
        // Mark explosion cells
        explosions.forEach(key => {
            this.dangerMap.set(key, 1.0);
        });
    }

    isInDanger(position, dangerMap) {
        const gridPos = pixelToGrid(position.x, position.y);
        return dangerMap.has(`${gridPos.x},${gridPos.y}`);
    }

    avoidDanger(gameGrid, dangerMap) {
        const gridPos = pixelToGrid(this.player.x, this.player.y);
        const directions = [
            { dx: 0, dy: -1 }, // up
            { dx: 1, dy: 0 },  // right
            { dx: 0, dy: 1 },  // down
            { dx: -1, dy: 0 }  // left
        ];
        
        // Shuffle directions for more natural movement
        this.shuffleArray(directions);
        
        for (const dir of directions) {
            const newX = gridPos.x + dir.dx;
            const newY = gridPos.y + dir.dy;
            
            // Check if this tile is safe
            if (newX >= 0 && newX < gameGrid[0].length && 
                newY >= 0 && newY < gameGrid.length &&
                gameGrid[newY][newX] === 'empty' &&
                !dangerMap.has(`${newX},${newY}`)) {
                
                // Try to move multiple times for faster escape
                for (let i = 0; i < 3; i++) {
                    this.player.move(dir.dx, dir.dy);
                }
                return true;
            }
        }
        
        // If no safe direction found, move randomly as a last resort
        this.moveRandomly();
        return false;
    }

    determineNextAction(gameGrid, players, bombs, powerUps) {
        let action;
        // Use strategy effectiveness as probability of choosing optimal strategy
        if (Math.random() < this.strategyEffectiveness) {
            // Make strategic decision based on trait
            switch (this.trait) {
                case AI_TRAITS.AGGRESSIVE:
                    action = 'chasePlayer';
                    break;
                case AI_TRAITS.CAUTIOUS:
                    action = 'findSafeSpot';
                    break;
                case AI_TRAITS.COLLECTOR:
                    action = 'getPowerUp';
                    break;
                case AI_TRAITS.DESTROYER:
                    action = 'breakWalls';
                    break;
                case AI_TRAITS.BALANCED:
                default:
                    // Balanced chooses based on situation
                    action = this.selectBalancedStrategy(gameGrid, players, powerUps);
                    break;
            }
        } else {
            // Choose random action when not being strategic
            const actions = ['chasePlayer', 'findSafeSpot', 'getPowerUp', 'breakWalls', 'explore'];
            action = actions[Math.floor(Math.random() * actions.length)];
        }

        // Execute selected action
        switch (action) {
            case 'chasePlayer':
                this.findTargetPlayer(players);
                break;
            case 'findSafeSpot':
                this.findSafeSpot(gameGrid, bombs);
                break;
            case 'getPowerUp':
                this.findPowerUp(gameGrid, powerUps);
                break;
            case 'breakWalls':
                this.findWallToBreak(gameGrid);
                break;
            case 'explore':
            default:
                this.exploreMap(gameGrid);
                break;
        }
    }

    selectBalancedStrategy(gameGrid, players, powerUps) {
        // Get player grid position
        const gridPos = pixelToGrid(this.player.x, this.player.y);
        
        // If low on bombs or range, prioritize power-ups
        if (this.player.bombsAvailable <= 1 || this.player.bombRange <= 1) {
            if (this.findPowerUp(gameGrid, powerUps)) {
                return 'getPowerUp';
            }
        }
        
        // If players are nearby, consider attacking
        const nearbyPlayers = this.findNearbyPlayers(players, 5);
        if (nearbyPlayers.length > 0 && Math.random() < 0.7) {
            this.findTargetPlayer(players);
            return 'chasePlayer';
        }
        
        // If surrounded by walls, break them
        const surroundedByWalls = this.countSurroundingWalls(gameGrid, gridPos) >= 2;
        if (surroundedByWalls) {
            this.findWallToBreak(gameGrid);
            return 'breakWalls';
        }
        
        // Default: explore if no better option
        this.exploreMap(gameGrid);
        return 'explore';
    }

    findNearbyPlayers(players, maxDistance) {
        const myPos = pixelToGrid(this.player.x, this.player.y);
        const nearby = [];
        
        players.forEach(player => {
            if (player === this.player || !player.alive) return;
            
            const theirPos = pixelToGrid(player.x, player.y);
            const distance = Math.abs(myPos.x - theirPos.x) + Math.abs(myPos.y - theirPos.y);
            
            if (distance <= maxDistance) {
                nearby.push({
                    player: player,
                    distance: distance
                });
            }
        });
        
        // Sort by distance
        nearby.sort((a, b) => a.distance - b.distance);
        return nearby;
    }

    countSurroundingWalls(gameGrid, pos) {
        const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        let wallCount = 0;
        
        for (const [dx, dy] of directions) {
            const nx = pos.x + dx;
            const ny = pos.y + dy;
            
            if (nx >= 0 && nx < gameGrid[0].length && 
                ny >= 0 && ny < gameGrid.length &&
                (gameGrid[ny][nx] === 'wall' || gameGrid[ny][nx] === 'breakable')) {
                wallCount++;
            }
        }
        
        return wallCount;
    }

    findTargetPlayer(players) {
        if (players.size <= 1) return false;
        
        const myPos = pixelToGrid(this.player.x, this.player.y);
        let closestPlayer = null;
        let closestDistance = Infinity;
        
        players.forEach(player => {
            if (player === this.player || !player.alive) return;
            
            const playerPos = pixelToGrid(player.x, player.y);
            const distance = Math.abs(myPos.x - playerPos.x) + Math.abs(myPos.y - playerPos.y);
            
            if (distance < closestDistance) {
                closestPlayer = player;
                closestDistance = distance;
            }
        });
        
        if (closestPlayer) {
            const targetPos = pixelToGrid(closestPlayer.x, closestPlayer.y);
            this.findPathTo(targetPos.x, targetPos.y);
            return true;
        }
        
        return false;
    }

    findSafeSpot(gameGrid, bombs) {
        if (bombs.size === 0) return false;
        
        const gridSize = gameGrid.length;
        const currentPos = pixelToGrid(this.player.x, this.player.y);
        const visited = new Set();
        const queue = [{x: currentPos.x, y: currentPos.y, distance: 0}];
        
        while (queue.length > 0) {
            const {x, y, distance} = queue.shift();
            const key = `${x},${y}`;
            
            if (visited.has(key)) continue;
            visited.add(key);
            
            // If this spot is far enough from all bombs and not in danger
            if (distance > 3 && !this.dangerMap.has(key) && gameGrid[y][x] === 'empty') {
                this.findPathTo(x, y);
                return true;
            }
            
            // Try all four directions
            const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
            for (const [dx, dy] of directions) {
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize && 
                    gameGrid[ny][nx] === 'empty') {
                    queue.push({x: nx, y: ny, distance: distance + 1});
                }
            }
        }
        
        // If no safe spot found, explore randomly
        this.exploreMap(gameGrid);
        return false;
    }

    findPowerUp(gameGrid, powerUps) {
        if (!powerUps || powerUps.size === 0) return false;
        
        const myPos = pixelToGrid(this.player.x, this.player.y);
        let closestPowerUp = null;
        let closestDistance = Infinity;
        
        powerUps.forEach((powerUp, key) => {
            const [x, y] = key.split(',').map(Number);
            const distance = Math.abs(myPos.x - x) + Math.abs(myPos.y - y);
            
            if (distance < closestDistance) {
                closestPowerUp = {x, y};
                closestDistance = distance;
            }
        });
        
        if (closestPowerUp) {
            this.findPathTo(closestPowerUp.x, closestPowerUp.y);
            return true;
        }
        
        return false;
    }

    findWallToBreak(gameGrid) {
        const gridSize = gameGrid.length;
        const myPos = pixelToGrid(this.player.x, this.player.y);
        const visited = new Set();
        const queue = [{x: myPos.x, y: myPos.y, distance: 0}];
        
        while (queue.length > 0) {
            const {x, y, distance} = queue.shift();
            const key = `${x},${y}`;
            
            if (visited.has(key)) continue;
            visited.add(key);
            
            // Check if there's a breakable wall adjacent to this position
            const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
            for (const [dx, dy] of directions) {
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                    if (gameGrid[ny][nx] === 'breakable') {
                        // Found a breakable wall, move to adjacent position
                        this.findPathTo(x, y);
                        this.targetBreakableWall = {x: nx, y: ny};
                        return true;
                    }
                }
            }
            
            // Continue BFS
            for (const [dx, dy] of directions) {
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize && 
                    gameGrid[ny][nx] === 'empty') {
                    queue.push({x: nx, y: ny, distance: distance + 1});
                }
            }
        }
        
        // If no breakable wall found, explore randomly
        this.exploreMap(gameGrid);
        return false;
    }

    exploreMap(gameGrid) {
        const gridSize = gameGrid.length;
        const visitedKey = `${this.player.name}-visited`;
        
        // Initialize visited map if it doesn't exist
        if (!window[visitedKey]) {
            window[visitedKey] = new Array(gridSize).fill(0).map(() => new Array(gridSize).fill(0));
        }
        
        const visited = window[visitedKey];
        const currentPos = pixelToGrid(this.player.x, this.player.y);
        
        // Mark current position as visited
        visited[currentPos.y][currentPos.x] += 1;
        
        // Find least visited accessible cell
        let leastVisitedCell = null;
        let leastVisits = Infinity;
        
        // Search in expanding squares from current position
        for (let radius = 1; radius < gridSize; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    // Only check perimeter of square
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                    
                    const nx = currentPos.x + dx;
                    const ny = currentPos.y + dy;
                    
                    if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize && 
                        gameGrid[ny][nx] === 'empty') {
                        
                        const visitCount = visited[ny][nx];
                        if (visitCount < leastVisits) {
                            leastVisits = visitCount;
                            leastVisitedCell = {x: nx, y: ny};
                        }
                    }
                }
            }
            
            // If found a cell in this radius, stop searching
            if (leastVisitedCell) break;
        }
        
        // If found a cell to explore, find path to it
        if (leastVisitedCell) {
            this.findPathTo(leastVisitedCell.x, leastVisitedCell.y);
            return true;
        }
        
        // Fallback: move to random empty cell
        const emptyCells = [];
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                if (gameGrid[y][x] === 'empty') {
                    emptyCells.push({x, y});
                }
            }
        }
        
        if (emptyCells.length > 0) {
            const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
            this.findPathTo(randomCell.x, randomCell.y);
            return true;
        }
        
        return false;
    }

    findPathTo(targetX, targetY) {
        if (!this.currentGameGrid) return;
        
        const startPos = pixelToGrid(this.player.x, this.player.y);
        const gridSize = this.currentGameGrid.length;
        
        // Early exit if already at target
        if (startPos.x === targetX && startPos.y === targetY) {
            this.currentPath = [];
            return;
        }
        
        // BFS for pathfinding
        const queue = [{x: startPos.x, y: startPos.y, path: []}];
        const visited = new Set();
        
        while (queue.length > 0) {
            const {x, y, path} = queue.shift();
            const key = `${x},${y}`;
            
            if (visited.has(key)) continue;
            visited.add(key);
            
            // Found target
            if (x === targetX && y === targetY) {
                this.targetX = targetX;
                this.targetY = targetY;
                this.currentPath = path;
                return;
            }
            
            // Try all four directions
            const directions = [
                {dx: 0, dy: -1, name: 'up'},
                {dx: 1, dy: 0, name: 'right'},
                {dx: 0, dy: 1, name: 'down'},
                {dx: -1, dy: 0, name: 'left'}
            ];
            
            for (const dir of directions) {
                const nx = x + dir.dx;
                const ny = y + dir.dy;
                
                if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize && 
                    this.currentGameGrid[ny][nx] === 'empty' && !this.dangerMap.has(`${nx},${ny}`)) {
                    
                    const newPath = [...path, dir.name];
                    queue.push({x: nx, y: ny, path: newPath});
                }
            }
        }
        
        // If no path found, set null target
        this.targetX = null;
        this.targetY = null;
        this.currentPath = [];
    }

    followPath(gameGrid) {
        if (this.currentPath.length === 0) return false;
        
        const nextMove = this.currentPath[0];
        let dx = 0, dy = 0;
        
        switch (nextMove) {
            case 'up': dy = -1; dx = 0; break;
            case 'right': dx = 1; dy = 0; break;
            case 'down': dy = 1; dx = 0; break;
            case 'left': dx = -1; dy = 0; break;
        }
        
        // Try to move with increased speed when in danger
        const moveSpeed = this.avoidingDanger ? 2 : 1; // Double speed when avoiding danger
        for (let i = 0; i < moveSpeed; i++) {
            const success = this.player.move(dx, dy);
            if (!success) break;
        }
        
        // Remove move from path if we've made progress
        const gridPos = pixelToGrid(this.player.x, this.player.y);
        const targetPos = this.getNextPathPosition();
        if (gridPos.x === targetPos.x && gridPos.y === targetPos.y) {
            this.currentPath.shift();
            return true;
        }
        
        return false;
    }

    getNextPathPosition() {
        if (this.currentPath.length === 0) return null;
        
        const currentPos = pixelToGrid(this.player.x, this.player.y);
        const nextMove = this.currentPath[0];
        
        switch (nextMove) {
            case 'up': return { x: currentPos.x, y: currentPos.y - 1 };
            case 'right': return { x: currentPos.x + 1, y: currentPos.y };
            case 'down': return { x: currentPos.x, y: currentPos.y + 1 };
            case 'left': return { x: currentPos.x - 1, y: currentPos.y };
            default: return currentPos;
        }
    }

    moveRandomly() {
        const directions = [
            {dx: 0, dy: -1},
            {dx: 1, dy: 0},
            {dx: 0, dy: 1},
            {dx: -1, dy: 0}
        ];
        
        this.shuffleArray(directions);
        
        for (const dir of directions) {
            if (this.player.move(dir.dx, dir.dy)) {
                break;
            }
        }
    }

    decidePlaceBomb(gameGrid, players, bombs) {
        if (this.bombCooldown > 0) {
            this.bombCooldown--;
            return;
        }
        
        const gridPos = pixelToGrid(this.player.x, this.player.y);
        
        // Don't place bomb if already in danger
        if (this.isInDanger({x: this.player.x, y: this.player.y}, this.dangerMap)) {
            return;
        }
        
        let shouldPlaceBomb = false;
        
        // Check for breakable walls in adjacent cells
        const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        for (const [dx, dy] of directions) {
            const nx = gridPos.x + dx;
            const ny = gridPos.y + dy;
            
            if (nx >= 0 && nx < gameGrid[0].length && 
                ny >= 0 && ny < gameGrid.length) {
                // Check for breakable walls
                if (gameGrid[ny][nx] === 'breakable') {
                    shouldPlaceBomb = true;
                    break;
                }
                
                // Check for players
                players.forEach(player => {
                    if (player !== this.player && player.alive) {
                        const playerPos = pixelToGrid(player.x, player.y);
                        if (playerPos.x === nx && playerPos.y === ny) {
                            shouldPlaceBomb = true;
                        }
                    }
                });
                
                if (shouldPlaceBomb) break;
            }
        }
        
        // Check for players in straight lines (up to bomb range)
        if (!shouldPlaceBomb) {
            const bombRange = this.player.bombRange || 2;
            const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
            
            for (const [dx, dy] of directions) {
                for (let i = 1; i <= bombRange; i++) {
                    const nx = gridPos.x + dx * i;
                    const ny = gridPos.y + dy * i;
                    
                    if (nx < 0 || nx >= gameGrid[0].length || 
                        ny < 0 || ny >= gameGrid.length) {
                        break;
                    }
                    
                    // Stop checking this direction if we hit a wall
                    if (gameGrid[ny][nx] === 'wall' || 
                        gameGrid[ny][nx] === 'breakable') {
                        break;
                    }
                    
                    // Check for players in range
                    players.forEach(player => {
                        if (player !== this.player && player.alive) {
                            const playerPos = pixelToGrid(player.x, player.y);
                            if (playerPos.x === nx && playerPos.y === ny) {
                                shouldPlaceBomb = true;
                            }
                        }
                    });
                    
                    if (shouldPlaceBomb) break;
                }
                if (shouldPlaceBomb) break;
            }
        }
        
        // Only place bomb if we have a safe escape route
        if (shouldPlaceBomb && this.hasEscapeRoute(gridPos, gameGrid)) {
            // Place the bomb
            this.player.placeBomb();
            this.bombCooldown = 10;
            
            // Immediately update danger map with the new bomb
            const bombRange = this.player.bombRange || 2;
            this.updateDangerMapForNewBomb(gridPos.x, gridPos.y, bombRange, gameGrid);
            
            // Find the nearest safe spot (prioritizing immediate escape)
            const safeSpot = this.findNearestSafeSpot(gridPos, gameGrid);
            
            if (safeSpot) {
                // Clear current path and set new immediate target
                this.currentPath = [];
                this.targetX = safeSpot.x;
                this.targetY = safeSpot.y;
                
                // Force immediate movement in the safe direction
                const dx = Math.sign(safeSpot.x - gridPos.x);
                const dy = Math.sign(safeSpot.y - gridPos.y);
                this.player.move(dx, dy);
                
                // Set state to escaping
                this.state = 'escaping';
                this.avoidingDanger = true;
                this.lastDecisionTime = 0;
            }
        }
    }

    // Add new method to update danger map for a newly placed bomb
    updateDangerMapForNewBomb(bombX, bombY, range, gameGrid) {
        // Mark bomb location as dangerous
        this.dangerMap.set(`${bombX},${bombY}`, 1.0);
        
        // Mark explosion range
        const directions = [[1,0], [-1,0], [0,1], [0,-1]];
        directions.forEach(([dx, dy]) => {
            for (let i = 1; i <= range; i++) {
                const x = bombX + dx * i;
                const y = bombY + dy * i;
                
                // Stop at grid boundaries
                if (x < 0 || x >= gameGrid[0].length || y < 0 || y >= gameGrid.length) {
                    break;
                }
                
                // Stop at walls
                if (gameGrid[y][x] === 'wall') {
                    break;
                }
                
                this.dangerMap.set(`${x},${y}`, 0.9);
                
                // Stop at breakable walls, but mark them as dangerous
                if (gameGrid[y][x] === 'breakable') {
                    break;
                }
            }
        });
    }

    // Add new method to find nearest safe spot
    findNearestSafeSpot(pos, gameGrid) {
        const queue = [{x: pos.x, y: pos.y, distance: 0}];
        const visited = new Set();
        const gridSize = gameGrid.length;
        
        while (queue.length > 0) {
            const current = queue.shift();
            const key = `${current.x},${current.y}`;
            
            if (visited.has(key)) continue;
            visited.add(key);
            
            // If this is a safe spot, return it
            if (!this.dangerMap.has(key) && 
                gameGrid[current.y][current.x] === 'empty' && 
                current.distance > 0) { // Don't return current position
                return current;
            }
            
            // Check all four directions
            const directions = [[0,-1], [1,0], [0,1], [-1,0]];
            for (const [dx, dy] of directions) {
                const nx = current.x + dx;
                const ny = current.y + dy;
                
                if (nx >= 0 && nx < gridSize && 
                    ny >= 0 && ny < gridSize && 
                    gameGrid[ny][nx] === 'empty') {
                    queue.push({
                        x: nx,
                        y: ny,
                        distance: current.distance + 1
                    });
                }
            }
        }
        
        return null;
    }

    isPlayerInBombRange(position, players) {
        const bombRange = this.player.bombRange || 2;
        
        for (const [name, player] of players.entries()) {
            if (player === this.player || !player.alive) continue;
            
            const playerPos = pixelToGrid(player.x, player.y);
            const xDiff = Math.abs(position.x - playerPos.x);
            const yDiff = Math.abs(position.y - playerPos.y);
            
            // Check if player is in straight line with bomb range
            if ((xDiff === 0 && yDiff <= bombRange) || (yDiff === 0 && xDiff <= bombRange)) {
                return true;
            }
        }
        
        return false;
    }

    hasEscapeRoute(position, gameGrid) {
        const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        const gridSize = gameGrid.length;
        let safePathFound = false;
        
        // Check each direction for a safe path
        for (const [dx, dy] of directions) {
            let safeCells = 0;
            let nx = position.x;
            let ny = position.y;
            
            // Look 3 cells ahead in this direction
            for (let i = 1; i <= 3; i++) {
                nx += dx;
                ny += dy;
                
                if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                    if (gameGrid[ny][nx] === 'empty' && !this.dangerMap.has(`${nx},${ny}`)) {
                        safeCells++;
                        
                        // Check perpendicular directions for additional escape routes
                        const perpDirs = [[-dy, dx], [dy, -dx]];
                        for (const [px, py] of perpDirs) {
                            const perpX = nx + px;
                            const perpY = ny + py;
                            if (perpX >= 0 && perpX < gridSize && perpY >= 0 && perpY < gridSize &&
                                gameGrid[perpY][perpX] === 'empty' && !this.dangerMap.has(`${perpX},${perpY}`)) {
                                safeCells++;
                            }
                        }
                    } else {
                        break;
                    }
                }
            }
            
            // Consider it a safe path if we found at least 3 safe cells
            if (safeCells >= 3) {
                safePathFound = true;
                break;
            }
        }
        
        return safePathFound;
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}