// ============================================================
// Bananagrams — Game Logic
// ============================================================

const BOARD_SIZE = 31;
const STARTING_TILES = 15;

// Bananagrams letter distribution (144 tiles)
const LETTER_DIST = {
  A:13, B:3, C:3, D:6, E:18, F:3, G:4, H:3, I:12, J:2, K:2,
  L:5, M:3, N:8, O:11, P:3, Q:2, R:9, S:6, T:9, U:6, V:3, W:3, X:2, Y:3, Z:2
};

// State
let pool = [];
let rack = [];
let board = [];
let selectedTile = null;
let dictionary = null;
let suggestionTimeout = null;
let validationTimeout = null;
let peelCooldown = false;
let cursorRow = Math.floor(BOARD_SIZE / 2);
let cursorCol = Math.floor(BOARD_SIZE / 2);
let boardFocused = false;

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
    const res = await fetch('dictionary.json');
    dictionary = await res.json();
    const count = Object.keys(dictionary).length;
    document.getElementById('word-count-label').textContent = `${count.toLocaleString()} words in dictionary`;
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

      if (boardFocused && r === cursorRow && c === cursorCol) {
        cell.classList.add('cursor');
      }

      cell.addEventListener('click', () => {
        cursorRow = r; cursorCol = c;
        boardFocused = true;
        handleCellClick(r, c);
      });
      cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('drag-over'); });
      cell.addEventListener('dragleave', () => { cell.classList.remove('drag-over'); });
      cell.addEventListener('drop', (e) => { e.preventDefault(); cell.classList.remove('drag-over'); handleDrop(r, c); });

      if (board[r][c]) {
        cell.draggable = true;
        cell.addEventListener('dragstart', (e) => {
          selectedTile = { source: 'board', row: r, col: c, letter: board[r][c] };
          e.dataTransfer.setData('text/plain', board[r][c]);
          setTimeout(() => cell.style.opacity = '0.4', 0);
        });
        cell.addEventListener('dragend', () => { cell.style.opacity = '1'; });
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

    tile.addEventListener('click', () => {
      if (selectedTile && selectedTile.source === 'rack' && selectedTile.index === i) {
        selectedTile = null;
      } else {
        selectedTile = { source: 'rack', index: i, letter };
      }
      renderRack();
    });

    tile.addEventListener('dragstart', (e) => {
      selectedTile = { source: 'rack', index: i, letter };
      e.dataTransfer.setData('text/plain', letter);
      tile.classList.add('dragging');
    });
    tile.addEventListener('dragend', () => { tile.classList.remove('dragging'); });

    rackEl.appendChild(tile);
  });

  document.getElementById('rack-count').textContent = `(${rack.length})`;

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
// Swap 1→3 (main game)
// ============================================================

document.getElementById('main-swap-btn').addEventListener('click', () => {
  if (!selectedTile || selectedTile.source !== 'rack') {
    const statusEl = document.getElementById('status-msg');
    statusEl.textContent = 'Click a rack tile first, then Swap';
    statusEl.style.color = 'var(--accent)';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
    return;
  }
  if (pool.length < 3) {
    const statusEl = document.getElementById('status-msg');
    statusEl.textContent = 'Not enough tiles in the pool!';
    statusEl.style.color = 'var(--invalid)';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
    return;
  }

  // Remove selected tile from rack, put back in pool
  const removed = rack.splice(selectedTile.index, 1)[0];
  pool.push(removed);
  shuffle(pool);

  // Draw 3
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    rack.push(pool.pop());
  }

  selectedTile = null;
  updateCounts();
  renderRack();
  scheduleWordSuggestions();

  const statusEl = document.getElementById('status-msg');
  statusEl.textContent = `Swapped ${removed} for 3 new tiles`;
  statusEl.style.color = 'var(--accent)';
  setTimeout(() => { statusEl.textContent = ''; }, 2000);
});

// ============================================================
// Interaction
// ============================================================

function handleCellClick(r, c) {
  if (selectedTile) {
    if (board[r][c] === null) {
      board[r][c] = selectedTile.letter;
      if (selectedTile.source === 'rack') rack.splice(selectedTile.index, 1);
      else if (selectedTile.source === 'board') board[selectedTile.row][selectedTile.col] = null;
      selectedTile = null;
      renderBoard(); renderRack(); scheduleWordSuggestions();
    } else if (selectedTile.source === 'board' && r === selectedTile.row && c === selectedTile.col) {
      selectedTile = null; renderBoard();
    } else {
      if (selectedTile.source === 'board') {
        const temp = board[r][c];
        board[r][c] = selectedTile.letter;
        board[selectedTile.row][selectedTile.col] = temp;
      } else if (selectedTile.source === 'rack') {
        const boardLetter = board[r][c];
        board[r][c] = selectedTile.letter;
        rack.splice(selectedTile.index, 1);
        rack.push(boardLetter);
      }
      selectedTile = null;
      renderBoard(); renderRack(); scheduleWordSuggestions();
    }
  } else {
    if (board[r][c]) {
      selectedTile = { source: 'board', row: r, col: c, letter: board[r][c] };
      renderBoard();
      const cells = document.querySelectorAll('.cell');
      cells[r * BOARD_SIZE + c].classList.add('selected');
    }
  }
}

function handleDrop(r, c) {
  if (!selectedTile || board[r][c] !== null) return;
  board[r][c] = selectedTile.letter;
  if (selectedTile.source === 'rack') rack.splice(selectedTile.index, 1);
  else if (selectedTile.source === 'board') board[selectedTile.row][selectedTile.col] = null;
  selectedTile = null;
  renderBoard(); renderRack(); scheduleWordSuggestions();
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
  cells.forEach(c => c.classList.remove('valid-word', 'invalid-word'));

  let allValid = true;
  let hasWords = false;

  for (const w of words) {
    hasWords = true;
    const valid = isValidWord(w.word);
    if (!valid) allValid = false;
    for (const pos of w.cells) {
      cells[pos.row * BOARD_SIZE + pos.col].classList.add(valid ? 'valid-word' : 'invalid-word');
    }
  }

  const tilesOnBoard = [];
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (board[r][c]) tilesOnBoard.push({ r, c });

  const connected = tilesOnBoard.length > 0 ? checkConnectivity(tilesOnBoard) : true;
  const noFloating = tilesOnBoard.every(t => isPartOfWord(t.r, t.c));
  const rackEmpty = rack.length === 0;

  if (rackEmpty && tilesOnBoard.length > 0 && connected && allValid && hasWords && noFloating && !peelCooldown) {
    doPeel();
  }

  const statusEl = document.getElementById('status-msg');
  if (rackEmpty && tilesOnBoard.length > 0) {
    if (!allValid) { statusEl.textContent = 'Some words are invalid'; statusEl.style.color = 'var(--invalid)'; }
    else if (!connected) { statusEl.textContent = 'All tiles must be connected'; statusEl.style.color = 'var(--invalid)'; }
    else if (!noFloating) { statusEl.textContent = 'Single letters must be part of a word'; statusEl.style.color = 'var(--invalid)'; }
    else { statusEl.textContent = ''; }
  } else {
    statusEl.textContent = '';
  }
}

function findBoardWords() {
  const words = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    let c = 0;
    while (c < BOARD_SIZE) {
      if (board[r][c]) {
        let word = ''; const cs = [];
        while (c < BOARD_SIZE && board[r][c]) { word += board[r][c]; cs.push({ row: r, col: c }); c++; }
        if (word.length >= 2) words.push({ word, cells: cs, direction: 'h' });
      } else c++;
    }
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    let r = 0;
    while (r < BOARD_SIZE) {
      if (board[r][c]) {
        let word = ''; const cs = [];
        while (r < BOARD_SIZE && board[r][c]) { word += board[r][c]; cs.push({ row: r, col: c }); r++; }
        if (word.length >= 2) words.push({ word, cells: cs, direction: 'v' });
      } else r++;
    }
  }
  return words;
}

function isPartOfWord(r, c) {
  if ((c > 0 && board[r][c - 1]) || (c < BOARD_SIZE - 1 && board[r][c + 1])) return true;
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
    for (const n of [{ r: r-1, c }, { r: r+1, c }, { r, c: c-1 }, { r, c: c+1 }]) {
      const k = key(n.r, n.c);
      if (tileSet.has(k) && !visited.has(k)) { visited.add(k); queue.push(n); }
    }
  }
  return visited.size === tiles.length;
}

// ============================================================
// Confetti
// ============================================================

function fireConfetti(duration) {
  const canvas = document.getElementById('confetti-canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const particles = [];
  const colors = ['#f1c40f', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c'];

  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 10 + 5,
      h: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 10
    });
  }

  const start = Date.now();
  function frame() {
    const elapsed = Date.now() - start;
    if (elapsed > duration) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fade = elapsed > duration - 500 ? (duration - elapsed) / 500 : 1;
    ctx.globalAlpha = fade;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  }
  frame();
}

// ============================================================
// PEEL — add new tiles
// ============================================================

const PEEL_COUNT = 15;

function doPeel() {
  peelCooldown = true;

  if (pool.length === 0) {
    // VICTORY — all 144 tiles placed!
    fireConfetti(8000);
    showVictoryScreen();
    return;
  }

  // Confetti burst
  fireConfetti(2500);

  // Show PEEL overlay
  const overlay = document.getElementById('peel-overlay');
  overlay.classList.remove('hidden');
  const peelText = overlay.querySelector('.peel-text');
  const count = Math.min(PEEL_COUNT, pool.length);
  peelText.textContent = `PEEL! +${count}`;
  peelText.style.animation = 'none';
  peelText.offsetHeight; // reflow
  peelText.style.animation = '';

  setTimeout(() => { overlay.classList.add('hidden'); }, 1200);

  drawTiles(count);
  updateCounts();

  document.getElementById('app').classList.add('peel-flash');
  setTimeout(() => document.getElementById('app').classList.remove('peel-flash'), 800);

  renderRack();
  const rackTiles = document.querySelectorAll('.rack-tile');
  for (let i = Math.max(0, rackTiles.length - count); i < rackTiles.length; i++) {
    rackTiles[i].classList.add('tile-new');
  }

  scheduleWordSuggestions();
  setTimeout(() => { peelCooldown = false; }, 1500);
}

function updateCounts() {
  document.getElementById('tile-count').textContent = `Tiles: ${rack.length + countBoardTiles()}`;
  document.getElementById('pool-count').textContent = `Pool: ${pool.length}`;
}

function countBoardTiles() {
  let count = 0;
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (board[r][c]) count++;
  return count;
}

// ============================================================
// Victory Screen
// ============================================================

function showVictoryScreen() {
  fireConfetti(8000);
  document.getElementById('victory-screen').classList.remove('hidden');
}

document.getElementById('challenge-alun-btn').addEventListener('click', () => {
  document.getElementById('victory-screen').classList.add('hidden');
  startBossBattle();
});

document.getElementById('play-again-btn').addEventListener('click', () => {
  location.reload();
});

// ============================================================
// Boss Battle — Speed Round
// ============================================================

let bossLetters = [];
let bossUsedWords = [];
let alunHp = 50;
let playerBossHp = 50;
let bossTimer = null;
let bossTimeLeft = 300; // 5 minutes in seconds
let bossPool = []; // the 144-letter pool for swaps
let swapLetterIndex = null;

function startBossBattle() {
  // Build 50 random letters
  const allLetters = [];
  for (const [letter, count] of Object.entries(LETTER_DIST)) {
    for (let i = 0; i < count; i++) allLetters.push(letter);
  }
  shuffle(allLetters);
  bossLetters = allLetters.slice(0, 50);
  bossPool = allLetters.slice(50); // remaining for swaps

  bossUsedWords = [];
  alunHp = 50;
  playerBossHp = 50;
  bossTimeLeft = 300;
  swapLetterIndex = null;

  document.getElementById('boss-battle').classList.remove('hidden');
  renderBossState();
  document.getElementById('boss-word-input').value = '';
  document.getElementById('boss-word-input').focus();
  document.getElementById('boss-feedback').textContent = '';
  document.getElementById('boss-feedback').className = 'boss-feedback';

  // Start timer
  updateBossTimer();
  bossTimer = setInterval(() => {
    bossTimeLeft--;
    updateBossTimer();
    if (bossTimeLeft <= 0) {
      clearInterval(bossTimer);
      // Time's up — check who won
      if (alunHp <= 0) bossVictory();
      else bossDefeat('Time ran out! Boss survives with ' + alunHp + ' HP.');
    }
  }, 1000);
}

function updateBossTimer() {
  const m = Math.floor(bossTimeLeft / 60);
  const s = bossTimeLeft % 60;
  const el = document.getElementById('boss-timer');
  el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  if (bossTimeLeft <= 30) el.style.animation = 'bossNamePulse 0.5s infinite';
  else el.style.animation = '';
}

function renderBossState() {
  // HP bars
  document.getElementById('alun-hp-fill').style.width = `${(alunHp / 50) * 100}%`;
  document.getElementById('player-hp-fill').style.width = `${(playerBossHp / 50) * 100}%`;
  document.getElementById('alun-hp-text').textContent = `${alunHp} / 50 HP`;
  document.getElementById('player-hp-text-boss').textContent = `${playerBossHp} / 50 HP`;

  // Letters
  const container = document.getElementById('boss-letters');
  container.innerHTML = '';
  bossLetters.forEach((letter, i) => {
    const tile = document.createElement('div');
    tile.className = 'boss-letter-tile';
    if (swapLetterIndex === i) tile.classList.add('selected-swap');
    tile.textContent = letter;
    tile.addEventListener('click', () => {
      swapLetterIndex = (swapLetterIndex === i) ? null : i;
      renderBossState();
    });
    container.appendChild(tile);
  });
  document.getElementById('boss-letter-count').textContent = bossLetters.length;

  // Used words
  const usedContainer = document.getElementById('boss-words-used');
  usedContainer.innerHTML = '';
  bossUsedWords.forEach(w => {
    const tag = document.createElement('span');
    tag.className = 'boss-used-word ' + (w.valid ? 'valid-used' : 'invalid-used');
    tag.textContent = w.word + (w.valid ? ' +' + w.word.length : ' -' + w.word.length);
    usedContainer.appendChild(tag);
  });
}

// Submit word
function bossSubmitWord() {
  const input = document.getElementById('boss-word-input');
  const word = input.value.trim().toUpperCase();
  input.value = '';
  input.focus();

  if (!word) return;

  // Check if word was already used
  if (bossUsedWords.some(w => w.word === word)) {
    showBossFeedback('Already used!', false);
    return;
  }

  const fb = document.getElementById('boss-feedback');

  if (isValidWord(word) && canMakeFromBossLetters(word)) {
    // CORRECT — remove letters, damage the Boss
    removeBossLetters(word);
    alunHp = Math.max(0, alunHp - word.length);
    bossUsedWords.push({ word, valid: true });
    showBossFeedback(`${word} — ${word.length} damage to Boss!`, true);
  } else if (!isValidWord(word)) {
    // INCORRECT — damage player, keep letters
    playerBossHp = Math.max(0, playerBossHp - word.length);
    bossUsedWords.push({ word, valid: false });
    showBossFeedback(`${word} is not a valid word! You take ${word.length} damage!`, false);
  } else {
    // Valid word but can't make it from letters
    showBossFeedback(`You don't have the letters for ${word}!`, false);
    return;
  }

  renderBossState();

  // Check win/lose
  if (alunHp <= 0) {
    clearInterval(bossTimer);
    setTimeout(() => bossVictory(), 500);
  } else if (playerBossHp <= 0) {
    clearInterval(bossTimer);
    setTimeout(() => bossDefeat('Too many bad words! The boss wins this round.'), 500);
  }
}

function canMakeFromBossLetters(word) {
  const available = {};
  bossLetters.forEach(l => { available[l] = (available[l] || 0) + 1; });
  for (const ch of word) {
    if (!available[ch] || available[ch] <= 0) return false;
    available[ch]--;
  }
  return true;
}

function removeBossLetters(word) {
  const toRemove = word.split('');
  for (const ch of toRemove) {
    const idx = bossLetters.indexOf(ch);
    if (idx !== -1) bossLetters.splice(idx, 1);
  }
}

function showBossFeedback(msg, correct) {
  const fb = document.getElementById('boss-feedback');
  fb.textContent = msg;
  fb.className = 'boss-feedback ' + (correct ? 'correct-fb' : 'incorrect-fb');
  // Re-trigger animation for incorrect
  if (!correct) {
    fb.style.animation = 'none';
    fb.offsetHeight;
    fb.style.animation = '';
  }
}

// Swap: return 1 selected letter, get 3 new ones
document.getElementById('boss-swap-btn').addEventListener('click', () => {
  if (swapLetterIndex === null) {
    showBossFeedback('Click a letter tile first, then swap', false);
    return;
  }
  if (bossPool.length < 3) {
    showBossFeedback('Not enough letters in the pool to swap!', false);
    return;
  }

  // Remove selected letter, add to pool
  const removed = bossLetters.splice(swapLetterIndex, 1)[0];
  bossPool.push(removed);
  shuffle(bossPool);

  // Draw 3
  for (let i = 0; i < 3 && bossPool.length > 0; i++) {
    bossLetters.push(bossPool.pop());
  }

  swapLetterIndex = null;
  showBossFeedback(`Swapped ${removed} for 3 new letters!`, true);
  renderBossState();
});

// Enter to submit
document.getElementById('boss-word-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); bossSubmitWord(); }
});

document.getElementById('boss-submit-btn').addEventListener('click', bossSubmitWord);

// Boss Victory
function bossVictory() {
  document.getElementById('boss-battle').classList.add('hidden');
  document.getElementById('boss-victory').classList.remove('hidden');
  fireConfetti(10000);

  const msgs = [
    'Every letter bent to your will. Every word a weapon. You are the SUPREME WORDSMITH!',
    '50 letters. 5 minutes. Zero mercy. You crushed it.',
    'The dictionary fears you. Absolute domination.'
  ];
  document.getElementById('boss-victory-msg').textContent = msgs[Math.floor(Math.random() * msgs.length)];
}

// Boss Defeat
function bossDefeat(reason) {
  document.getElementById('boss-battle').classList.add('hidden');
  document.getElementById('boss-defeat').classList.remove('hidden');

  const msgs = [
    `${reason} Not this time. But the letters are still there. Go again.`,
    `${reason} Close, but not close enough. You know more words than you think.`,
    `${reason} Shake it off. The speed round doesn't forgive, but you can.`
  ];
  document.getElementById('boss-defeat-msg').textContent = msgs[Math.floor(Math.random() * msgs.length)];
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

  const allLetters = [...rack];

  if (allLetters.length === 0) {
    document.getElementById('word-list').innerHTML = '<div style="padding:1rem;color:var(--text-muted)">No loose tiles</div>';
    document.getElementById('word-count-label').textContent = 'Place all tiles to PEEL';
    return;
  }

  const available = {};
  allLetters.forEach(l => { available[l.toUpperCase()] = (available[l.toUpperCase()] || 0) + 1; });

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
  document.getElementById('word-count-label').textContent = `${results.length.toLocaleString()} possible words from rack`;

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
      html += `<div class="word-item"><div class="word-item-word">${item.word}</div><div class="word-item-def">${shortDef}</div></div>`;
    }
  }

  container.innerHTML = html;
}

// ============================================================
// Keyboard Navigation
// ============================================================

document.addEventListener('keydown', (e) => {
  // Don't intercept if boss battle input is focused or an overlay is visible
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  if (!document.getElementById('boss-battle').classList.contains('hidden')) return;
  if (!document.getElementById('victory-screen').classList.contains('hidden')) return;

  const key = e.key;

  // Arrow keys — move cursor
  if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
    e.preventDefault();
    boardFocused = true;
    if (key === 'ArrowUp') cursorRow = Math.max(0, cursorRow - 1);
    if (key === 'ArrowDown') cursorRow = Math.min(BOARD_SIZE - 1, cursorRow + 1);
    if (key === 'ArrowLeft') cursorCol = Math.max(0, cursorCol - 1);
    if (key === 'ArrowRight') cursorCol = Math.min(BOARD_SIZE - 1, cursorCol + 1);
    renderBoard();
    // Scroll cursor into view
    const idx = cursorRow * BOARD_SIZE + cursorCol;
    const cells = document.querySelectorAll('.cell');
    if (cells[idx]) cells[idx].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return;
  }

  // Letter key — place tile from rack at cursor
  if (/^[a-zA-Z]$/.test(key) && boardFocused) {
    e.preventDefault();
    const letter = key.toUpperCase();
    const rackIdx = rack.indexOf(letter);
    if (rackIdx === -1) return; // don't have that letter

    if (board[cursorRow][cursorCol] === null) {
      // Place letter
      board[cursorRow][cursorCol] = letter;
      rack.splice(rackIdx, 1);
      // Auto-advance cursor right
      if (cursorCol < BOARD_SIZE - 1) cursorCol++;
      selectedTile = null;
      renderBoard(); renderRack(); scheduleWordSuggestions();
    } else if (board[cursorRow][cursorCol] !== letter) {
      // Swap: pick up board tile, place typed letter
      const existing = board[cursorRow][cursorCol];
      board[cursorRow][cursorCol] = letter;
      rack.splice(rackIdx, 1);
      rack.push(existing);
      if (cursorCol < BOARD_SIZE - 1) cursorCol++;
      selectedTile = null;
      renderBoard(); renderRack(); scheduleWordSuggestions();
    }
    return;
  }

  // Backspace / Delete — pick up tile at cursor back to rack
  if ((key === 'Backspace' || key === 'Delete') && boardFocused) {
    e.preventDefault();
    if (board[cursorRow][cursorCol]) {
      rack.push(board[cursorRow][cursorCol]);
      board[cursorRow][cursorCol] = null;
      if (key === 'Backspace' && cursorCol > 0) cursorCol--;
      selectedTile = null;
      renderBoard(); renderRack(); scheduleWordSuggestions();
    } else if (key === 'Backspace' && cursorCol > 0) {
      cursorCol--;
      if (board[cursorRow][cursorCol]) {
        rack.push(board[cursorRow][cursorCol]);
        board[cursorRow][cursorCol] = null;
        selectedTile = null;
        renderBoard(); renderRack(); scheduleWordSuggestions();
      } else {
        renderBoard();
      }
    }
    return;
  }

  // Escape — deselect / unfocus board
  if (key === 'Escape') {
    boardFocused = false;
    selectedTile = null;
    renderBoard();
    return;
  }
});

// ============================================================
// DEV: Skip to boss (remove before git push)
// ============================================================

document.getElementById('dev-skip-btn').addEventListener('click', () => {
  showVictoryScreen();
});

// ============================================================
// Start
// ============================================================

init();
