// Game state manager
class GameState {
    constructor() {
        this._playerName = '';
        this._gameActive = false;
        this._gamePaused = false;
        this._gameStartTime = null;
        this._listeners = new Map();
    }

    get playerName() { return this._playerName; }
    set playerName(value) {
        this._playerName = value;
        this._notifyListeners('playerName');
    }

    get gameActive() { return this._gameActive; }
    set gameActive(value) {
        this._gameActive = value;
        this._notifyListeners('gameActive');
    }

    get gamePaused() { return this._gamePaused; }
    set gamePaused(value) {
        this._gamePaused = value;
        this._notifyListeners('gamePaused');
    }

    get gameStartTime() { return this._gameStartTime; }
    set gameStartTime(value) {
        this._gameStartTime = value;
        this._notifyListeners('gameStartTime');
    }

    addListener(property, callback) {
        if (!this._listeners.has(property)) {
            this._listeners.set(property, new Set());
        }
        this._listeners.get(property).add(callback);
    }

    removeListener(property, callback) {
        if (this._listeners.has(property)) {
            this._listeners.get(property).delete(callback);
        }
    }

    _notifyListeners(property) {
        if (this._listeners.has(property)) {
            const value = this[`_${property}`];
            this._listeners.get(property).forEach(callback => callback(value));
        }
    }
}

// Export a singleton instance
export const gameState = new GameState();
