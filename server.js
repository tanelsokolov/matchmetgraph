const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const ngrok = require('ngrok');
const port = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static('public'));

// Game state
const games = new Map(); // Map to store active games
const players = new Map(); // Map to store player information

// Socket.IO connection handling
io.on('connection', (socket) => {
    //console.log('A user connected');

    // Handle player joining
    socket.on('joinGame', (playerName) => {
        // Check if a game is already in session
        const currentGame = games.get('currentGame');
        if (currentGame && currentGame.isActive) {
            socket.emit('joinError', 'Game in session. Please wait until the current game finishes.');
            return;
        }

        // Check if name is already taken
        if (Array.from(players.values()).some(p => p.name === playerName)) {
            socket.emit('joinError', 'Name already taken');
            return;
        }

        players.set(socket.id, {
            name: playerName,
            isHost: players.size === 0, // First player is host
            ready: false
        });

        // Broadcast updated player list
        io.emit('playerList', Array.from(players.values()));
    });

    // Handle lobby request
    socket.on('lobbyRequest', () => {
        io.emit('playerList', Array.from(players.values()));
    });

    // Handle game start (host only)
    socket.on('startGame', () => {
        const player = players.get(socket.id);
        if (player && player.isHost) {
            const gameState = {
                players: Array.from(players.values()),
                grid: generateInitialGrid(),
                gameStartTime: Date.now(),
                isActive: true,
                scores: {}
            };

            // Initialize player data
            players.forEach((player) => {
                gameState.scores[player.name] = 0;
                player.score = 0;
                player.kills = 0;
            });

            games.set('currentGame', gameState);
            io.emit('gameStart', gameState);
            io.emit('playerList', Array.from(players.values()));
        }
    });

    // Handle power-up spawning
    socket.on('spawnPowerUp', (data) => {
        const player = players.get(socket.id);
        if (player && games.get('currentGame')?.isActive) {
            // Broadcast power-up spawn to all clients
            io.emit('powerUpSpawned', data);
        }
    });

    // Handle score updates
    socket.on('updateScore', ({ name, points, reason }) => {
        const player = players.get(socket.id);
        if (player && games.get('currentGame')?.isActive) {
            const game = games.get('currentGame');
            game.scores[name] = (game.scores[name] || 0) + points;
            
            if (reason === 'kill') {
                player.kills++;
            }
            
            io.emit('scoreUpdate', {
                scores: game.scores,
                message: `${name} ${reason === 'kill' ? 'eliminated a player' : 'broke a wall'} (+${points})`
            });
        }
    });

    // Handle player movement
    socket.on('playerMove', (movement) => {
        const player = players.get(socket.id);
        if (player && games.get('currentGame')?.isActive) {
            // Broadcast movement to all players except sender
            socket.broadcast.emit('playerMoved', {
                name: player.name,
                movement
            });
        }
    });

    // Handle bomb placement
    socket.on('placeBomb', (data) => {
        const player = players.get(socket.id);
        if (player && games.get('currentGame')?.isActive) {
            io.emit('bombPlaced', {
                position: { x: data.x, y: data.y },
                playerName: player.name,
                timestamp: data.timestamp
            });
        }
    });

    // Handle wall breaks
    socket.on('wallBreak', (data) => {
        const player = players.get(socket.id);
        if (player && games.get('currentGame')?.isActive) {
            // Broadcast wall break and power-up info to all clients
            io.emit('wallBroken', {
                x: data.x,
                y: data.y,
                powerUp: data.powerUp
            });
        }
    });

    // Handle explosions
    socket.on('explosion', (data) => {
        const player = players.get(socket.id);
        if (player && games.get('currentGame')?.isActive) {
            socket.broadcast.emit('explosionCreated', data);
        }
    });

    // Handle player ready state
    socket.on('playerReady', (ready) => {
        const player = players.get(socket.id);
        if (player) {
            player.ready = ready;
            players.set(socket.id, player);
            io.emit('playerList', Array.from(players.values()));
        }
    });

    // Handle pause/resume
    socket.on('togglePause', () => {
        const game = games.get('currentGame');
        if (game) {
            game.isActive = !game.isActive;
            io.emit('gamePaused', {
                isPaused: !game.isActive,
                pausedBy: players.get(socket.id).name
            });
        }
    });

    // Handle player death
    socket.on('playerDied', (playerName) => {
        io.emit('playerDied', playerName);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        const player = players.get(socket.id);
        if (player) {
            // If host disconnects, assign new host
            if (player.isHost) {
                const remainingPlayers = Array.from(players.values());
                if (remainingPlayers.length > 1) {
                    const newHost = players.entries().next().value;
                    if (newHost) {
                        newHost[1].isHost = true;
                    }
                }
            }
            players.delete(socket.id);
            io.emit('playerList', Array.from(players.values()));
            io.emit('playerDisconnected', player.name);

            // If no players are left, clear the game
            if (players.size === 0) {
                games.delete('currentGame');
            }
        }
    });

    // Handle game restart (host only)
    socket.on('restartGame', () => {
        const player = players.get(socket.id);
        if (player && player.isHost) {
            const gameState = {
                players: Array.from(players.values()),
                grid: generateInitialGrid(),
                gameStartTime: Date.now(),
                isActive: true,
                scores: {}
            };

            // Initialize player data
            players.forEach((player) => {
                gameState.scores[player.name] = 0;
                player.score = 0;
                player.kills = 0;
            });

            games.set('currentGame', gameState);
            io.emit('gameStart', gameState);
            io.emit('scoreUpdate', {
                scores: gameState.scores,
                message: 'Game restarted! Scores reset.'
            });
        }
    });

    function emitBombExploded(x, y, playerName) {
        io.emit('bombExploded', { x, y, playerName });
    }

    socket.on('explosion', (data) => {
        const player = players.get(socket.id);
        if (player && games.get('currentGame')?.isActive) {
            emitBombExploded(data.x, data.y);
            socket.broadcast.emit('explosionCreated', data);
        }
    });
});

// Helper function to generate initial grid
function generateInitialGrid() {
    const grid = [];
    const size = 15;

    // Initialize grid with walls
    for (let i = 0; i < size; i++) {
        grid[i] = [];
        for (let j = 0; j < size; j++) {
            // Border walls and fixed pattern walls
            if (i === 0 || i === size - 1 || j === 0 || j === size - 1 || 
                (i % 2 === 0 && j % 2 === 0)) {
                grid[i][j] = 'wall';
            } else {
                grid[i][j] = 'empty';
            }
        }
    }

    // Add breakable walls (avoiding player starting positions)
    const startingAreas = [
        { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 1 },  // Top-left
        { x: size-2, y: size-2 }, { x: size-2, y: size-3 }, { x: size-3, y: size-2 },  // Bottom-right
        { x: 1, y: size-2 }, { x: 1, y: size-3 }, { x: 2, y: size-2 },  // Bottom-left
        { x: size-2, y: 1 }, { x: size-2, y: 2 }, { x: size-3, y: 1 }   // Top-right
    ];

    for (let i = 1; i < size - 1; i++) {
        for (let j = 1; j < size - 1; j++) {
            if (grid[i][j] === 'empty') {
                // Check if current position is in starting areas
                const isStartingArea = startingAreas.some(pos => pos.x === j && pos.y === i);
                if (!isStartingArea && Math.random() < 0.4) {  // 40% chance for breakable walls
                    grid[i][j] = 'breakable';
                }
            }
        }
    }

    return grid;
}

// Start server and ngrok
async function startServer() {
    try {
        // Start the HTTP server first
        http.listen(port, () => {
            //console.log(`Local server running at http://localhost:${port}`);
        });

        try {
            // If you have an authtoken, configure it here
            await ngrok.authtoken('2ZXxXyQoDgf5eZzCmDW9RvBZbhZ_77p6LqJQCSjPPoSRjkFSJ');

            // Start ngrok tunnel
            const url = await ngrok.connect({
                addr: port,
                proto: 'http'
            });

            console.log(`
            =================================
            🎮 Bomberman Game Server Running!
            ---------------------------------
            Local URL: http://localhost:${port}
            Public URL: ${url}
            
            Share the Public URL with players!
            =================================
            `);

        } catch (ngrokError) {
            console.log(`
            =================================
            🎮 Bomberman Game Server Running!
            ---------------------------------
            Local URL: http://localhost:${port}
            
            ⚠️  Ngrok tunnel failed to start: ${ngrokError.message}
            To enable external access:
            1. Sign up at https://ngrok.com
            2. Get your authtoken from the dashboard
            3. Add your authtoken to the code
            
            For now, the game is only accessible locally
            =================================
            `);
        }

    } catch (err) {
        console.error('Error starting server:', err);
        process.exit(1);
    }
}

// Handle cleanup on server shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down server...');
    await ngrok.kill();
    process.exit(0);
});

// Handle cleanup on Ctrl+C
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    await ngrok.kill();
    process.exit(0);
});

startServer();
