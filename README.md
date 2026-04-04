# Bananagrams

A local browser-based Bananagrams word game with live word suggestions.

## Setup

```bash
git clone <this-repo>
cd bananagrams
npm install
```

### Dictionary

The game needs a `data/dictionary.json` file. If you have a Word Forge `scrabble.db`:

```bash
node scripts/build-dictionary.js /path/to/scrabble.db
```

### Run

```bash
npm start
```

Open **http://localhost:3001** in your browser.

## How to Play

1. You start with 15 letter tiles in your rack
2. Drag tiles from the rack onto the board to form words
3. Words must be valid Scrabble dictionary words (2+ letters)
4. All tiles on the board must be connected
5. When all your tiles form valid connected words — you automatically get a new tile (PEEL!)
6. Keep going until the pool is empty

The right sidebar shows all possible words you can make with your current letters, with definitions.

## Controls

- **Click** a rack tile to select it, then click a board cell to place it
- **Drag** tiles from rack to board, board to board, or board back to rack
- **Click** a board tile to pick it up, then click another cell to move it
