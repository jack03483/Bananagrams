# Bananagrams

A local browser-based Bananagrams word game with 104k+ word dictionary and live word suggestions.

## Setup

```
git clone https://github.com/YOUR-USERNAME/bananagrams.git
cd bananagrams
```

**Mac / Linux:**
```
python3 -m http.server 3001 --directory public
```

**Windows:**
```
python -m http.server 3001 --directory public
```

Open **http://localhost:3001** in your browser. Done.

## Controls

- **Click** a rack tile to select it, then click a board cell to place it
- **Drag** tiles from rack to board, board to board, or board back to rack
- **Click** a board tile to pick it up, then click another cell to move it

## Rules

1. You start with 15 letter tiles in your rack
2. Drag tiles onto the board to form words
3. Words must be valid Scrabble dictionary words (2+ letters)
4. All tiles on the board must be connected
5. When all your tiles form valid connected words you get 15 new tiles (PEEL!)
6. Keep going until the pool is empty

The right sidebar shows all possible words from your current letters with definitions.
