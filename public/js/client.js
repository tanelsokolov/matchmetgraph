import { gameState } from './gameState.js';

// Game state
let isHost = false;
let gameStartTime = 0;
let timerInterval;
let pausedBy = null;
const MAX_GAME_LENGTH = 3 * 60 * 1000; // 3 minutes in milliseconds

// Socket.IO connection
export const socket = window.io();

// Request lobby information on page load
document.addEventListener('DOMContentLoaded', () => {
    socket.emit('lobbyRequest');
});

// Initialize game state listeners
gameState.addListener('gamePaused', (isPaused) => {
    pauseScreen.style.display = isPaused ? 'flex' : 'none';
    if (isPaused) {
        clearInterval(timerInterval);
    } else {
        startTimer();
    }
});

// DOM Elements
const joinScreen = document.getElementById('joinScreen');
const gameScreen = document.getElementById('gameScreen');
const playerNameInput = document.getElementById('playerName');
const joinButton = document.getElementById('joinButton');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const waitingPlayers = document.getElementById('waitingPlayers');
const hostControls = document.getElementById('hostControls');
const pauseButton = document.getElementById('pauseButton');
const resumeButton = document.getElementById('resumeButton');
const quitButton = document.getElementById('quitButton');
const pauseScreen = document.getElementById('pauseScreen');
const pauseMessage = document.getElementById('pauseMessage');
const gameTimer = document.getElementById('gameTimer');
const scoreBoard = document.getElementById('scoreBoard');
const messageBox = document.getElementById('messageBox');
const returnToLobbyButton = document.getElementById('returnToLobbyButton');

// Join game handling
joinButton.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (name) {
        gameState.playerName = name;
        socket.emit('joinGame', name);
    }
});

// Host controls
startButton.addEventListener('click', () => {
    if (isHost) {
        socket.emit('startGame');
    }
});

restartButton.addEventListener('click', () => {
    if (isHost) {
        socket.emit('restartGame');
    }
});

resumeButton.addEventListener('click', () => {
    if (gameState.playerName === pausedBy || isHost) {
        socket.emit('togglePause', { playerName: gameState.playerName });
    } else {
        alert('Only the player who paused the game or the host can resume it.');
    }
});

quitButton.addEventListener('click', () => {
    if (confirm('Are you sure you want to quit?')) {
        socket.emit('quitGame', { playerName: gameState.playerName });
        window.location.reload();
    }
});

// Event listener for return to lobby button
returnToLobbyButton.addEventListener('click', () => {
    window.location.reload();
});

// Socket event handlers
socket.on('joinError', (message) => {
    alert(message);
});

socket.on('playerList', (players) => {
    // Update waiting players list
    waitingPlayers.innerHTML = players
        .map(player => `
            <li>
                ${player.name} 
                ${player.isHost ? '(Host)' : ''} 
                ${player.ready ? '✓' : ''}
            </li>
        `)
        .join('');

    // Update host controls
    const player = players.find(p => p.name === gameState.playerName);
    if (player) {
        isHost = player.isHost;
        hostControls.style.display = isHost ? 'block' : 'none';
        startButton.style.display = isHost ? 'inline-block' : 'none';
        restartButton.style.display = isHost ? 'inline-block' : 'none';

        // Enable start button if enough players are ready
        if (isHost) {
            const readyPlayers = players.filter(p => p.ready).length;
            startButton.disabled = readyPlayers < 2 || readyPlayers !== players.length;
        }
    }
});

socket.on('gameStart', (state) => {
    const playerInGame = state.players.some(player => player.name === gameState.playerName);

    if (playerInGame) {
        joinScreen.style.display = 'none';
        gameScreen.style.display = 'block';
        gameState.gameActive = true;
        gameStartTime = Date.now();
        startTimer();
        updateScoreboard(state.scores);
        showMessage('Game started! Good luck!');
        if (isHost) {
            restartButton.style.display = 'inline-block';
        }
        setTimeout(() => {
            if (gameState.gameActive) {
                endGame(state.scores);
            }
        }, MAX_GAME_LENGTH);

        // Request lobby update to show "In game" status
        socket.emit('lobbyRequest');
    } else {
        showMessage('Game started, but you are not in it.');
        // Optionally, redirect back to the join screen or lobby
        joinScreen.style.display = 'block';
        gameScreen.style.display = 'none';
    }
});

socket.on('scoreUpdate', ({ scores, message }) => {
    updateScoreboard(scores);
    showMessage(message, 2000);
});

socket.on('playerList', (players) => {
    // Update waiting players list with ready status
    waitingPlayers.innerHTML = players
        .map(player => {
            let statusText = player.ready ? '✓ Ready' : 'Waiting to get ready';
            if (gameState.gameActive && player.ready) {
                statusText = 'In game';
            }
            return `
                <li class="${player.ready ? 'ready' : ''}">
                    <span>${player.name} ${player.isHost ? '(Host)' : ''}</span>
                    <span class="status">${statusText}</span>
                </li>
            `;
        })
        .join('');

    // Update host controls
    const player = players.find(p => p.name === gameState.playerName);
    if (player) {
        isHost = player.isHost;
        hostControls.style.display = isHost ? 'block' : 'none';

        // Enable start button if enough players are ready
        if (isHost) {
            const readyPlayers = players.filter(p => p.ready).length;
            const totalPlayers = players.length;
            startButton.disabled = readyPlayers < 2 || readyPlayers !== totalPlayers;
            
            if (startButton.disabled) {
                startButton.title = readyPlayers < 2 ? 
                    'Need at least 2 players' : 
                    'Waiting for all players to be ready';
            } else {
                startButton.title = 'Start the game';
            }
        }
    }
});

socket.on('gamePaused', ({ isPaused, pausedBy: playerName }) => {
    gameState.gamePaused = isPaused;
    pausedBy = isPaused ? playerName : null;
    pauseMessage.textContent = `Game ${isPaused ? 'paused' : 'resumed'} by ${playerName}`;
    showMessage(`Game ${isPaused ? 'paused' : 'resumed'} by ${playerName}`);
});

socket.on('playerDisconnected', (playerName) => {
    showMessage(`${playerName} has disconnected`);
});

socket.on('gameQuit', ({ playerName }) => {
    showMessage(`${playerName} has quit the game`);
    window.location.reload();
});

// Timer functions
function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
}

function updateTimer() {
    if (!gameState.gameActive || gameState.gamePaused) return;
    
    const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    gameTimer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Utility functions
function updateScoreboard(scores) {
    const sortedScores = Object.entries(scores)
        .sort(([,a], [,b]) => b - a);
    
    scoreBoard.innerHTML = sortedScores
        .map(([name, score], index) => 
            `<div class="score-entry ${name === gameState.playerName ? 'my-score' : ''}">
                <span class="rank">#${index + 1}</span>
                <span class="name">${name}</span>
                <span class="score">${score}</span>
            </div>`
        )
        .join('');
}

function showMessage(text, duration = 3000) {
    messageBox.textContent = text;
    messageBox.style.display = 'block';
    setTimeout(() => {
        messageBox.style.display = 'none';
    }, duration);
}

function endGame(scores) {
    gameState.gameActive = false;
    const sortedScores = Object.entries(scores).sort(([,a], [,b]) => b - a);
    const winner = sortedScores.length > 0 ? sortedScores[0][0] : null;
    const winnerMessage = document.getElementById('winnerMessage');
    winnerMessage.textContent = `${winner ? `${winner} wins!` : 'No winners!'}`;
    document.getElementById('gameOverScreen').style.display = 'flex';
    socket.emit('endGame');
}

// Ready state handling
document.addEventListener('keypress', (e) => {
    if (e.key === 'r' && !gameState.gameActive) {
        socket.emit('playerReady', true);
    }
});

// Toggle pause with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        socket.emit('togglePause', { playerName: gameState.playerName });
    }
});

// Handle window closing
window.addEventListener('beforeunload', () => {
    socket.close();
});
