// ============================================================
// Bananagrams — Game Logic
// ============================================================

const BOARD_SIZE = 21;
const STARTING_TILES = 15;

// Bananagrams letter distribution (144 tiles)
const LETTER_DIST = {
  A:13, B:3, C:3, D:6, E:18, F:3, G:4, H:3, I:12, J:2, K:2,
  L:5, M:3, N:8, O:11, P:3, Q:2, R:9, S:6, T:9, U:6, V:3, W:3, X:2, Y:3, Z:2
};

// State
let pool = [];         // undrawn tiles
let rack = [];         // tiles in hand
let board = [];        // 2D array, null or letter
let selectedTile = null;   // { source: 'rack'|'board', index|row,col, letter }
let dictionary = null;     // loaded from server
let wordSuggestions = [];
let suggestionTimeout = null;
let validationTimeout = null;

// ============================================================
// Initialization
// ============================================================

function init() {
  buildPool();
  buildBoard();
  drawTiles(STARTING_TILES);
  renderBoard();
  renderRack();
  loadDictionary();
}

function buildPool() {
  pool = [];
  for (const [letter, count] of Object.entries(LETTER_DIST)) {
    for (let i = 0; i < count; i++) pool.push(letter);
  }
  shuffle(pool);
}

function buildBoard() {
  board = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    board[r] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      board[r][c] = null;
    }
  }
}

function drawTiles(count) {
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    rack.push(pool.pop());
  }
  updateCounts();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ============================================================
// Dictionary
// ============================================================

async function loadDictionary() {
  try {
    const res = await fetch('/api/dictionary');
    const data = await res.json();
    document.getElementById('word-count-label').textContent = `${data.wordCount.toLocaleString()} words in dictionary`;

    // Load full dictionary for client-side word finding
    const dictRes = await fetch('/data/dictionary.json');
    dictionary = await dictRes.json();

    updateWordSuggestions();
  } catch (err) {
    document.getElementById('word-count-label').textContent = 'Error loading dictionary';
  }
}

function isValidWord(word) {
  if (!dictionary) return false;
  return word.toUpperCase() in dictionary;
}

function getDefinition(word) {
  if (!dictionary) return '';
  return dictionary[word.toUpperCase()] || '';
}

// ============================================================
// Board Rendering
// ============================================================

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;

      if (board[r][c]) {
        cell.classList.add('has-tile');
        cell.textContent = board[r][c];
      }

      // Click to place/pick up
      cell.addEventListener('click', () => handleCellClick(r, c));

      // Drag and drop
      cell.addEventListener('dragover', (e) => {
        e.preventDefault();
        cell.classList.add('drag-over');
      });
      cell.addEventListener('dragleave', () => {
        cell.classList.remove('drag-over');
      });
      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('drag-over');
        handleDrop(r, c);
      });

      // Dragging from board
      if (board[r][c]) {
        cell.draggable = true;
        cell.addEventListener('dragstart', (e) => {
          selectedTile = { source: 'board', row: r, col: c, letter: board[r][c] };
          e.dataTransfer.setData('text/plain', board[r][c]);
          setTimeout(() => cell.style.opacity = '0.4', 0);
        });
        cell.addEventListener('dragend', () => {
          cell.style.opacity = '1';
        });
      }

      boardEl.appendChild(cell);
    }
  }

  scheduleValidation();
}

function renderRack() {
  const rackEl = document.getElementById('rack');
  rackEl.innerHTML = '';

  rack.forEach((letter, i) => {
    const tile = document.createElement('div');
    tile.className = 'rack-tile';
    tile.textContent = letter;
    tile.draggable = true;

    if (selectedTile && selectedTile.source === 'rack' && selectedTile.index === i) {
      tile.classList.add('selected');
    }

    // Click to select
    tile.addEventListener('click', () => {
      if (selectedTile && selectedTile.source === 'rack' && selectedTile.index === i) {
        selectedTile = null;
      } else {
        selectedTile = { source: 'rack', index: i, letter };
      }
      renderRack();
    });

    // Drag
    tile.addEventListener('dragstart', (e) => {
      selectedTile = { source: 'rack', index: i, letter };
      e.dataTransfer.setData('text/plain', letter);
      tile.classList.add('dragging');
    });
    tile.addEventListener('dragend', () => {
      tile.classList.remove('dragging');
    });

    rackEl.appendChild(tile);
  });

  document.getElementById('rack-count').textContent = `(${rack.length})`;

  // Allow dropping back to rack
  rackEl.addEventListener('dragover', (e) => e.preventDefault());
  rackEl.addEventListener('drop', (e) => {
    e.preventDefault();
    if (selectedTile && selectedTile.source === 'board') {
      const { row, col, letter } = selectedTile;
      board[row][col] = null;
      rack.push(letter);
      selectedTile = null;
      renderBoard();
      renderRack();
      scheduleWordSuggestions();
    }
  });
}

// ============================================================
// Interaction
// ============================================================

function handleCellClick(r, c) {
  if (selectedTile) {
    if (board[r][c] === null) {
      // Place the selected tile
      board[r][c] = selectedTile.letter;

      if (selectedTile.source === 'rack') {
        rack.splice(selectedTile.index, 1);
      } else if (selectedTile.source === 'board') {
        board[selectedTile.row][selectedTile.col] = null;
      }

      selectedTile = null;
      renderBoard();
      renderRack();
      scheduleWordSuggestions();
    } else if (selectedTile.source === 'board' && r === selectedTile.row && c === selectedTile.col) {
      // Deselect
      selectedTile = null;
      renderBoard();
    } else {
      // Swap tiles
      if (selectedTile.source === 'board') {
        const tempLetter = board[r][c];
        board[r][c] = selectedTile.letter;
        board[selectedTile.row][selectedTile.col] = tempLetter;
      } else if (selectedTile.source === 'rack') {
        // Pick up board tile, place rack tile
        const boardLetter = board[r][c];
        board[r][c] = selectedTile.letter;
        rack.splice(selectedTile.index, 1);
        rack.push(boardLetter);
      }
      selectedTile = null;
      renderBoard();
      renderRack();
      scheduleWordSuggestions();
    }
  } else {
    if (board[r][c]) {
      // Select this board tile
      selectedTile = { source: 'board', row: r, col: c, letter: board[r][c] };
      renderBoard();
      // Highlight selected cell
      const cells = document.querySelectorAll('.cell');
      const idx = r * BOARD_SIZE + c;
      cells[idx].classList.add('selected');
    }
  }
}

function handleDrop(r, c) {
  if (!selectedTile) return;

  if (board[r][c] === null) {
    board[r][c] = selectedTile.letter;

    if (selectedTile.source === 'rack') {
      rack.splice(selectedTile.index, 1);
    } else if (selectedTile.source === 'board') {
      board[selectedTile.row][selectedTile.col] = null;
    }

    selectedTile = null;
    renderBoard();
    renderRack();
    scheduleWordSuggestions();
  }
}

// ============================================================
// Word Validation
// ============================================================

function scheduleValidation() {
  clearTimeout(validationTimeout);
  validationTimeout = setTimeout(() => validateBoard(), 200);
}

function validateBoard() {
  const words = findBoardWords();
  const cells = document.querySelectorAll('.cell');

  // Reset highlights
  cells.forEach(c => c.classList.remove('valid-word', 'invalid-word'));

  let allValid = true;
  let hasWords = false;

  for (const w of words) {
    hasWords = true;
    const valid = isValidWord(w.word);
    if (!valid) allValid = false;

    for (const pos of w.cells) {
      const idx = pos.row * BOARD_SIZE + pos.col;
      cells[idx].classList.add(valid ? 'valid-word' : 'invalid-word');
    }
  }

  // Check for floating tiles (single letters not part of any word)
  const tilesOnBoard = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c]) tilesOnBoard.push({ r, c });
    }
  }

  const connected = tilesOnBoard.length > 0 ? checkConnectivity(tilesOnBoard) : true;
  const noFloating = tilesOnBoard.every(t => isPartOfWord(t.r, t.c));
  const rackEmpty = rack.length === 0;

  // PEEL condition: all tiles placed, all connected, all form valid words, no floating letters
  if (rackEmpty && tilesOnBoard.length > 0 && connected && allValid && hasWords && noFloating) {
    doPeel();
  }

  // Status message
  const statusEl = document.getElementById('status-msg');
  if (rackEmpty && tilesOnBoard.length > 0) {
    if (!allValid) {
      statusEl.textContent = 'Some words are invalid';
      statusEl.style.color = 'var(--invalid)';
    } else if (!connected) {
      statusEl.textContent = 'All tiles must be connected';
      statusEl.style.color = 'var(--invalid)';
    } else if (!noFloating) {
      statusEl.textContent = 'Single letters must be part of a word';
      statusEl.style.color = 'var(--invalid)';
    } else {
      statusEl.textContent = '';
    }
  } else {
    statusEl.textContent = '';
  }
}

function findBoardWords() {
  const words = [];

  // Horizontal words
  for (let r = 0; r < BOARD_SIZE; r++) {
    let c = 0;
    while (c < BOARD_SIZE) {
      if (board[r][c]) {
        let word = '';
        const cells = [];
        while (c < BOARD_SIZE && board[r][c]) {
          word += board[r][c];
          cells.push({ row: r, col: c });
          c++;
        }
        if (word.length >= 2) {
          words.push({ word, cells, direction: 'h' });
        }
      } else {
        c++;
      }
    }
  }

  // Vertical words
  for (let c = 0; c < BOARD_SIZE; c++) {
    let r = 0;
    while (r < BOARD_SIZE) {
      if (board[r][c]) {
        let word = '';
        const cells = [];
        while (r < BOARD_SIZE && board[r][c]) {
          word += board[r][c];
          cells.push({ row: r, col: c });
          r++;
        }
        if (word.length >= 2) {
          words.push({ word, cells, direction: 'v' });
        }
      } else {
        r++;
      }
    }
  }

  return words;
}

function isPartOfWord(r, c) {
  // Check if tile at (r,c) is part of a horizontal or vertical word (2+ letters)
  // Horizontal
  if ((c > 0 && board[r][c - 1]) || (c < BOARD_SIZE - 1 && board[r][c + 1])) return true;
  // Vertical
  if ((r > 0 && board[r - 1][c]) || (r < BOARD_SIZE - 1 && board[r + 1][c])) return true;
  return false;
}

function checkConnectivity(tiles) {
  if (tiles.length <= 1) return true;

  const key = (r, c) => `${r},${c}`;
  const tileSet = new Set(tiles.map(t => key(t.r, t.c)));
  const visited = new Set();
  const queue = [tiles[0]];
  visited.add(key(tiles[0].r, tiles[0].c));

  while (queue.length > 0) {
    const { r, c } = queue.shift();
    const neighbors = [
      { r: r - 1, c }, { r: r + 1, c },
      { r, c: c - 1 }, { r, c: c + 1 }
    ];
    for (const n of neighbors) {
      const k = key(n.r, n.c);
      if (tileSet.has(k) && !visited.has(k)) {
        visited.add(k);
        queue.push(n);
      }
    }
  }

  return visited.size === tiles.length;
}

// ============================================================
// PEEL — add a new tile
// ============================================================

function doPeel() {
  if (pool.length === 0) {
    document.getElementById('status-msg').textContent = 'You win! No tiles left!';
    document.getElementById('status-msg').style.color = 'var(--accent)';
    return;
  }

  drawTiles(1);
  updateCounts();

  // Flash animation
  document.getElementById('app').classList.add('peel-flash');
  setTimeout(() => document.getElementById('app').classList.remove('peel-flash'), 800);

  document.getElementById('status-msg').textContent = 'PEEL! +1 tile';
  document.getElementById('status-msg').style.color = 'var(--accent)';
  setTimeout(() => {
    document.getElementById('status-msg').textContent = '';
  }, 1500);

  renderRack();
  // Add pop-in animation to newest tile
  const rackTiles = document.querySelectorAll('.rack-tile');
  if (rackTiles.length > 0) {
    rackTiles[rackTiles.length - 1].classList.add('tile-new');
  }

  scheduleWordSuggestions();
}

function updateCounts() {
  document.getElementById('tile-count').textContent = `Tiles: ${rack.length + countBoardTiles()}`;
  document.getElementById('pool-count').textContent = `Pool: ${pool.length}`;
}

function countBoardTiles() {
  let count = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c]) count++;
    }
  }
  return count;
}

// ============================================================
// Word Suggestions Sidebar
// ============================================================

function scheduleWordSuggestions() {
  clearTimeout(suggestionTimeout);
  suggestionTimeout = setTimeout(() => updateWordSuggestions(), 500);
}

function updateWordSuggestions() {
  if (!dictionary) return;

  // Collect ALL letters (rack + board)
  const allLetters = [...rack];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c]) allLetters.push(board[r][c]);
    }
  }

  if (allLetters.length === 0) {
    document.getElementById('word-list').innerHTML = '<div style="padding:1rem;color:var(--text-muted)">No tiles yet</div>';
    return;
  }

  // Find all possible words client-side for speed
  const available = {};
  allLetters.forEach(l => {
    const u = l.toUpperCase();
    available[u] = (available[u] || 0) + 1;
  });

  const results = [];
  for (const word of Object.keys(dictionary)) {
    if (word.length < 2 || word.length > allLetters.length) continue;
    if (canMakeWord(word, available)) {
      results.push({ word, definition: dictionary[word], length: word.length });
    }
  }

  results.sort((a, b) => a.length - b.length || a.word.localeCompare(b.word));

  renderWordSuggestions(results);
}

function canMakeWord(word, available) {
  const needed = {};
  for (const ch of word) {
    needed[ch] = (needed[ch] || 0) + 1;
    if (needed[ch] > (available[ch] || 0)) return false;
  }
  return true;
}

function renderWordSuggestions(results) {
  const container = document.getElementById('word-list');
  document.getElementById('word-count-label').textContent = `${results.length.toLocaleString()} possible words from your letters`;

  // Group by length
  const groups = {};
  for (const r of results) {
    if (!groups[r.length]) groups[r.length] = [];
    groups[r.length].push(r);
  }

  let html = '';
  for (const len of Object.keys(groups).sort((a, b) => a - b)) {
    const group = groups[len];
    html += `<div class="word-group-header">${len}-letter words (${group.length})</div>`;
    for (const item of group) {
      const def = item.definition || '';
      const shortDef = def.length > 80 ? def.substring(0, 77) + '...' : def;
      html += `
        <div class="word-item">
          <div class="word-item-word">${item.word}</div>
          <div class="word-item-def">${shortDef}</div>
        </div>
      `;
    }
  }

  container.innerHTML = html;
}

// ============================================================
// Serve dictionary.json statically
// ============================================================
// (handled by Express static serving)

// ============================================================
// Start
// ============================================================

init();
