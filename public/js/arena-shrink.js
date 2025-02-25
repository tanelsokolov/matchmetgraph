// arena-shrink.js
export class ArenaShrinkManager {
    constructor(gameGrid, gridSize) {
        this.gameGrid = gameGrid;
        this.gridSize = gridSize;
        this.shrinkStarted = false;
        this.currentWallIndex = 0;
        this.wallDropInterval = null;
        this.wallSequence = this.generateWallSequence();
        this.fallingWalls = new Set(); // Track currently falling walls
    }

    generateWallSequence() {
        const sequence = [];
        const numLayers = Math.floor(this.gridSize / 2) - 1; // Number of shrinking layers
    
        for (let layer = 1; layer <= numLayers; layer++) {
            const maxIndex = this.gridSize - 1 - layer;
            const minIndex = layer;
    
            // Bottom edge (left to right)
            for (let x = minIndex; x < maxIndex; x++) {
                sequence.push({ x, y: maxIndex });
            }
            // Right edge (bottom to top)
            for (let y = maxIndex; y > minIndex; y--) {
                sequence.push({ x: maxIndex, y });
            }
            // Top edge (right to left)
            for (let x = maxIndex; x > minIndex; x--) {
                sequence.push({ x, y: minIndex });
            }
            // Left edge (top to bottom)
            for (let y = minIndex; y < maxIndex; y++) {
                sequence.push({ x: minIndex, y });
            }
        }
    
        //console.log('Wall sequence', sequence);
        return sequence;
    }

    startShrinking() {
        if (this.shrinkStarted) return;
        this.shrinkStarted = true;
        
        // Drop a new wall every 500ms
        this.wallDropInterval = setInterval(() => {
            if (this.currentWallIndex >= this.wallSequence.length) {
                this.stopShrinking();
                return;
            }

            const wallPos = this.wallSequence[this.currentWallIndex];
            this.dropWall(wallPos.x, wallPos.y);
            this.currentWallIndex++;
        }, 500);
    }

    dropWall(x, y) {
        if (this.gameGrid[y][x] !== 'wall') {
            // Add to falling walls set
            const wallKey = `${x},${y}`;
            this.fallingWalls.add(wallKey);
            
            //console.log('Dropping wall at', x, y);
           // console.log('this.gameGrid[y][x]', this.gameGrid[y][x]);
            
            this.gameGrid[y][x] = 'wall';
            const cell = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
            //console.log('cell', cell);
            if (cell) {
                cell.className = 'cell wall falling';
                // Remove falling animation class and falling wall status after animation completes
                setTimeout(() => {
                    cell.className = 'cell wall';
                    this.fallingWalls.delete(wallKey);
                }, 500);
            }
            return { x, y };
        }
        return null;
    }

    isWallFalling(x, y) {
        return this.fallingWalls.has(`${x},${y}`);
    }

    stopShrinking() {
        if (this.wallDropInterval) {
            clearInterval(this.wallDropInterval);
            this.wallDropInterval = null;
        }
    }

    cleanup() {
        this.stopShrinking();
        this.currentWallIndex = 0;
        this.shrinkStarted = false;
        this.fallingWalls.clear();
    }
}
