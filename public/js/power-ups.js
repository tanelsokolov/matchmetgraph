// power-ups.js
import { pixelToGrid, CELL_SIZE } from './game.js';

export const POWER_UP_TYPES = {
    SPEED: 'speed',
    RANGE: 'range',
    BOMBS: 'bombs',
    SHIELD: 'shield'
};

const POWER_UP_COLORS = {
    [POWER_UP_TYPES.SPEED]: '#3498db',
    [POWER_UP_TYPES.RANGE]: '#e74c3c',
    [POWER_UP_TYPES.BOMBS]: '#f1c40f',
    [POWER_UP_TYPES.SHIELD]: '#2ecc71'
};

// Sound effect management
const SOUND_EFFECTS = {
    BOMB_PLACE: new Audio('/sounds/bomb_place.wav'),
    EXPLOSION: new Audio('/sounds/explosion.wav'),
    POWER_UP: new Audio('/sounds/power_up.wav'),
    DEATH: new Audio('/sounds/death.wav'),
    VICTORY: new Audio('/sounds/victory.wav'),
    WALL_BREAK: new Audio('/sounds/wall_break.wav')
};

// Initialize all sounds with lower volume
Object.values(SOUND_EFFECTS).forEach(sound => {
    sound.volume = 0.3;
});

class PowerUpManager {
    constructor(gameGrid) {
        this.gameGrid = gameGrid;
        this.powerUps = new Map();
        this.spawnInterval = null;
    }

    startSpawning() {
        // No automatic spawning - power-ups only appear from broken walls
    }

    stopSpawning() {
        // Clean up any existing power-ups
        this.cleanup();
    }

    spawnPowerUp(x, y, powerUpType) {
        if (this.powerUps.has(`${x},${y}`)) return;

        // Only spawn if we have a valid power-up type
        if (!powerUpType) return;

        this.powerUps.set(`${x},${y}`, {
            type: powerUpType,
            x,
            y,
            element: this.createPowerUpElement(x, y, powerUpType)
        });
    }

    createPowerUpElement(x, y, type) {
        const element = document.createElement('div');
        element.className = 'power-up';
        element.style.backgroundColor = POWER_UP_COLORS[type];
        element.style.left = `${x * CELL_SIZE + CELL_SIZE/2}px`;
        element.style.top = `${y * CELL_SIZE + CELL_SIZE/2}px`;
        
        const icon = document.createElement('span');
        icon.className = 'power-up-icon';
        icon.textContent = this.getIconForType(type);
        element.appendChild(icon);

        document.querySelector('.game-grid').appendChild(element);
        return element;
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

    checkCollision(player) {
        const gridPos = pixelToGrid(player.x, player.y);
        const key = `${gridPos.x},${gridPos.y}`;
        
        if (this.powerUps.has(key)) {
            const powerUp = this.powerUps.get(key);
            this.applyPowerUp(player, powerUp.type);
            powerUp.element.remove();
            this.powerUps.delete(key);
            SOUND_EFFECTS.POWER_UP.play();
        }
    }

    applyPowerUp(player, type) {
        switch(type) {
            case POWER_UP_TYPES.SPEED:
                player.speed *= 1.3;
                setTimeout(() => player.speed /= 1.3, 10000);
                break;
            case POWER_UP_TYPES.RANGE:
                player.bombRange += 1;
                break;
            case POWER_UP_TYPES.BOMBS:
                player.bombsAvailable += 1;
                break;
            case POWER_UP_TYPES.SHIELD:
                player.hasShield = true;
                player.element.classList.add('shielded');
                setTimeout(() => {
                    player.hasShield = false;
                    player.element.classList.remove('shielded');
                }, 15000);
                break;
        }

        // Visual feedback
        player.applyPowerUp(type);
    }

    cleanup() {
        this.powerUps.forEach(powerUp => powerUp.element.remove());
        this.powerUps.clear();
    }
}

export { PowerUpManager, SOUND_EFFECTS };
