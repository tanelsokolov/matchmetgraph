# Bomberman Game

## Description

Bomberman is a classic multiplayer game where players navigate a grid, place bombs to destroy walls and eliminate opponents. The last player standing or the player with the most points at the end of the game wins!

## Features

- **Classic Bomberman Gameplay:** Place bombs to destroy walls and eliminate opponents.
- **Multiplayer Support:** Play with your friends over the internet.
- **Game restart:** Host is able to restart the game.
- **Power-ups:** Collect power-ups to enhance your abilities:
  - **Speed:** Increases player movement speed.
  - **Range:** Increases the explosion range of bombs.
  - **Bombs:** Allows the player to place more bombs simultaneously.
  - **Shield:** Protects the player from one explosion.

## Game End and Win Conditions

- A game lasts for 3 minutes.
- The arena starts shrinking after 1 minute.
- The winner is the player who survives the longest or has the most points at the end of the game.

## How to Run the Game

1. Install dependencies:
    ```sh
    npm install
    ```

2. Set up ngrok authtoken:
    ```sh
    ngrok config add-authtoken $YOUR_AUTHTOKEN
    OR
    You can also add ngrok authtoken in server.js file.
    ```

3. Start the local server and expose it to the internet using ngrok:
    ```sh
    npm start
    ```

4. Ngrok will provide a public URL. Share this URL with other players so they can join the game.

5. Open the provided ngrok URL in your browser to start playing the game.

## Requirements

- Node.js
- npm

## Optional

- If you would like to run in docker use command "docker build -t bomberman ."