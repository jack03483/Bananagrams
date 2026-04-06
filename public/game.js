// ============================================================
// Bananagrams — Game Logic
// ============================================================

const BOARD_SIZE = 25;
const STARTING_TILES = 15;
const TILES_TO_WIN = 100;
const PEEL_COUNT = 15;

const LETTER_DIST = {
  A:13, B:3, C:3, D:6, E:18, F:3, G:4, H:3, I:12, J:2, K:2,
  L:5, M:3, N:8, O:11, P:3, Q:2, R:9, S:6, T:9, U:6, V:3, W:3, X:2, Y:3, Z:2
};

// Boss level config: [bossHp, playerHp, minWordLength]
// Level 0 = first encounter (no level shown), then levels 1-5
const BOSS_LEVELS = [
  [50, 50, 2],   // Level 0 (first encounter)
  [60, 40, 3],   // Level 1
  [70, 30, 4],   // Level 2
  [80, 20, 5],   // Level 3
  [90, 10, 6],   // Level 4
  [100, 1, 7],   // Level 5
];

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
let typingDir = 'right'; // 'right' or 'down'
let bossLevel = -1; // -1 = not started, 0 = first encounter, 1-5 = levels

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
    for (let c = 0; c < BOARD_SIZE; c++) board[r][c] = null;
  }
}

function drawTiles(count) {
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) rack.push(pool.pop());
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
    document.getElementById('word-count-label').textContent =
      `${Object.keys(dictionary).length.toLocaleString()} words in dictionary`;
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
        cell.classList.add(typingDir === 'right' ? 'cursor-right' : 'cursor-down');
      }

      cell.addEventListener('click', () => {
        cursorRow = r; cursorCol = c; boardFocused = true;
        handleCellClick(r, c);
      });

      // Double click to return tile to rack
      cell.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (board[r][c]) {
          rack.push(board[r][c]);
          board[r][c] = null;
          selectedTile = null;
          renderBoard(); renderRack(); scheduleWordSuggestions();
        }
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

    if (selectedTile && selectedTile.source === 'rack' && selectedTile.index === i)
      tile.classList.add('selected');

    tile.addEventListener('click', () => {
      if (selectedTile && selectedTile.source === 'rack' && selectedTile.index === i) selectedTile = null;
      else selectedTile = { source: 'rack', index: i, letter };
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
      board[selectedTile.row][selectedTile.col] = null;
      rack.push(selectedTile.letter);
      selectedTile = null;
      renderBoard(); renderRack(); scheduleWordSuggestions();
    }
  });
}

// ============================================================
// Swap 1→3 (main game)
// ============================================================

document.getElementById('main-swap-btn').addEventListener('click', () => {
  if (!selectedTile || selectedTile.source !== 'rack') {
    showStatus('Click a rack tile first, then Swap', 'var(--accent)');
    return;
  }
  if (pool.length < 3) { showStatus('Not enough tiles in the pool!', 'var(--invalid)'); return; }

  const removed = rack.splice(selectedTile.index, 1)[0];
  pool.push(removed); shuffle(pool);
  for (let i = 0; i < 3 && pool.length > 0; i++) rack.push(pool.pop());

  selectedTile = null;
  updateCounts(); renderRack(); scheduleWordSuggestions();
  showStatus(`Swapped ${removed} for 3 new tiles`, 'var(--accent)');
});

function showStatus(msg, color) {
  const el = document.getElementById('status-msg');
  el.textContent = msg; el.style.color = color;
  setTimeout(() => { el.textContent = ''; }, 2000);
}

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
        const temp = board[r][c]; board[r][c] = selectedTile.letter; board[selectedTile.row][selectedTile.col] = temp;
      } else if (selectedTile.source === 'rack') {
        const bl = board[r][c]; board[r][c] = selectedTile.letter; rack.splice(selectedTile.index, 1); rack.push(bl);
      }
      selectedTile = null;
      renderBoard(); renderRack(); scheduleWordSuggestions();
    }
  } else {
    if (board[r][c]) {
      selectedTile = { source: 'board', row: r, col: c, letter: board[r][c] };
      renderBoard();
      document.querySelectorAll('.cell')[r * BOARD_SIZE + c].classList.add('selected');
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

  let allValid = true, hasWords = false;
  for (const w of words) {
    hasWords = true;
    const valid = isValidWord(w.word);
    if (!valid) allValid = false;
    for (const pos of w.cells) cells[pos.row * BOARD_SIZE + pos.col].classList.add(valid ? 'valid-word' : 'invalid-word');
  }

  const tilesOnBoard = [];
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (board[r][c]) tilesOnBoard.push({ r, c });

  const connected = tilesOnBoard.length > 0 ? checkConnectivity(tilesOnBoard) : true;
  const noFloating = tilesOnBoard.every(t => isPartOfWord(t.r, t.c));
  const rackEmpty = rack.length === 0;

  // Check win: >= TILES_TO_WIN on board, all valid, connected, no floaters (rack doesn't need to be empty)
  if (tilesOnBoard.length >= TILES_TO_WIN && connected && allValid && hasWords && noFloating && !peelCooldown) {
    peelCooldown = true;
    fireConfetti(8000);
    showVictoryScreen();
    return;
  }

  if (rackEmpty && tilesOnBoard.length > 0 && connected && allValid && hasWords && noFloating && !peelCooldown) {
    doPeel();
  }

  const statusEl = document.getElementById('status-msg');
  if (rackEmpty && tilesOnBoard.length > 0) {
    if (!allValid) { statusEl.textContent = 'Some words are invalid'; statusEl.style.color = 'var(--invalid)'; }
    else if (!connected) { statusEl.textContent = 'All tiles must be connected'; statusEl.style.color = 'var(--invalid)'; }
    else if (!noFloating) { statusEl.textContent = 'Single letters must be part of a word'; statusEl.style.color = 'var(--invalid)'; }
    else statusEl.textContent = '';
  } else statusEl.textContent = '';
}

function findBoardWords() {
  const words = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    let c = 0;
    while (c < BOARD_SIZE) {
      if (board[r][c]) {
        let word = ''; const cs = [];
        while (c < BOARD_SIZE && board[r][c]) { word += board[r][c]; cs.push({ row: r, col: c }); c++; }
        if (word.length >= 2) words.push({ word, cells: cs });
      } else c++;
    }
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    let r = 0;
    while (r < BOARD_SIZE) {
      if (board[r][c]) {
        let word = ''; const cs = [];
        while (r < BOARD_SIZE && board[r][c]) { word += board[r][c]; cs.push({ row: r, col: c }); r++; }
        if (word.length >= 2) words.push({ word, cells: cs });
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
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const particles = [];
  const colors = ['#f1c40f', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c'];

  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 10 + 5, h: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3 + 2,
      rot: Math.random() * 360, vr: (Math.random() - 0.5) * 10
    });
  }

  const start = Date.now();
  function frame() {
    const elapsed = Date.now() - start;
    if (elapsed > duration) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = elapsed > duration - 500 ? (duration - elapsed) / 500 : 1;
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color; ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); ctx.restore();
    }
    requestAnimationFrame(frame);
  }
  frame();
}

// ============================================================
// PEEL
// ============================================================

function doPeel() {
  peelCooldown = true;
  if (pool.length === 0) { peelCooldown = false; return; }

  fireConfetti(2500);

  const overlay = document.getElementById('peel-overlay');
  overlay.classList.remove('hidden');
  const peelText = overlay.querySelector('.peel-text');
  const count = Math.min(PEEL_COUNT, pool.length);
  peelText.textContent = `PEEL! +${count}`;
  peelText.style.animation = 'none'; peelText.offsetHeight; peelText.style.animation = '';
  setTimeout(() => { overlay.classList.add('hidden'); }, 1200);

  drawTiles(count); updateCounts();
  document.getElementById('app').classList.add('peel-flash');
  setTimeout(() => document.getElementById('app').classList.remove('peel-flash'), 800);
  renderRack();

  const rackTiles = document.querySelectorAll('.rack-tile');
  for (let i = Math.max(0, rackTiles.length - count); i < rackTiles.length; i++) rackTiles[i].classList.add('tile-new');

  scheduleWordSuggestions();
  setTimeout(() => { peelCooldown = false; }, 1500);
}

function updateCounts() {
  const onBoard = countBoardTiles();
  document.getElementById('tile-count').textContent = `Board: ${onBoard} / ${TILES_TO_WIN}`;
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
// Victory Screen → Boss Reveal
// ============================================================

function showVictoryScreen() {
  fireConfetti(8000);
  const vs = document.getElementById('victory-screen');
  document.getElementById('victory-sub-text').textContent =
    bossLevel < 0 ? `You placed ${TILES_TO_WIN}+ tiles!` : `Level ${bossLevel} complete!`;
  vs.classList.remove('hidden');

  setTimeout(() => {
    vs.style.transition = 'opacity 1.5s ease'; vs.style.opacity = '0';
    setTimeout(() => {
      vs.classList.add('hidden'); vs.style.opacity = ''; vs.style.transition = '';
      document.getElementById('boss-reveal').classList.remove('hidden');
    }, 1500);
  }, 3000);
}

function handleBossRevealContinue() {
  const reveal = document.getElementById('boss-reveal');
  if (reveal.classList.contains('hidden')) return;
  reveal.classList.add('hidden');
  startBossBattle();
}

document.getElementById('boss-reveal').addEventListener('click', handleBossRevealContinue);

// ============================================================
// Boss Battle — Speed Round with Levels
// ============================================================

let bossLetters = [];
let bossUsedWords = [];
let bossHp = 50;
let playerBossHp = 50;
let bossMaxHp = 50;
let playerMaxHp = 50;
let bossMinWordLen = 2;
let bossTimer = null;
let bossTimeLeft = 300;
let bossPool = [];
let swapLetterIndex = null;

function startBossBattle() {
  bossLevel = Math.min(bossLevel + 1, 5);
  const [bHp, pHp, minLen] = BOSS_LEVELS[bossLevel];
  bossMaxHp = bHp; playerMaxHp = pHp; bossMinWordLen = minLen;
  bossHp = bHp; playerBossHp = pHp;

  // Build letters
  const allLetters = [];
  for (const [letter, count] of Object.entries(LETTER_DIST)) {
    for (let i = 0; i < count; i++) allLetters.push(letter);
  }
  shuffle(allLetters);
  bossLetters = allLetters.slice(0, bHp);
  bossPool = allLetters.slice(bHp);

  bossUsedWords = [];
  bossTimeLeft = 300;
  swapLetterIndex = null;

  // Update UI
  document.getElementById('boss-level-display').textContent = bossLevel > 0 ? `Level ${bossLevel}` : '';
  document.getElementById('boss-min-word-len').textContent =
    bossMinWordLen > 2 ? `Min ${bossMinWordLen} letters` : '';

  document.getElementById('boss-battle').classList.remove('hidden');
  renderBossState();
  document.getElementById('boss-word-input').value = '';
  document.getElementById('boss-word-input').focus();
  document.getElementById('boss-feedback').textContent = '';
  document.getElementById('boss-feedback').className = 'boss-feedback';

  updateBossTimer();
  bossTimer = setInterval(() => {
    bossTimeLeft--;
    updateBossTimer();
    if (bossTimeLeft <= 0) {
      clearInterval(bossTimer);
      if (bossHp <= 0) bossVictory();
      else bossDefeat(`Time's up. Boss had ${bossHp} HP left.`);
    }
  }, 1000);
}

function updateBossTimer() {
  const m = Math.floor(bossTimeLeft / 60);
  const s = bossTimeLeft % 60;
  const el = document.getElementById('boss-timer');
  el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  el.style.color = bossTimeLeft <= 30 ? '#ff4444' : '';
}

function renderBossState() {
  document.getElementById('alun-hp-fill').style.width = `${(bossHp / bossMaxHp) * 100}%`;
  document.getElementById('player-hp-fill').style.width = `${(playerBossHp / playerMaxHp) * 100}%`;
  document.getElementById('alun-hp-text').textContent = `${bossHp} / ${bossMaxHp} HP`;
  document.getElementById('player-hp-text-boss').textContent = `${playerBossHp} / ${playerMaxHp} HP`;

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

  const usedContainer = document.getElementById('boss-words-used');
  usedContainer.innerHTML = '';
  bossUsedWords.forEach(w => {
    const tag = document.createElement('span');
    tag.className = 'boss-used-word ' + (w.valid ? 'valid-used' : 'invalid-used');
    tag.textContent = w.word + (w.valid ? ' +' + w.word.length : ' -' + w.word.length);
    usedContainer.appendChild(tag);
  });

  // Word suggestions from available letters
  updateBossWordSuggestions();
}

function updateBossWordSuggestions() {
  if (!dictionary) return;
  const container = document.getElementById('boss-word-list');

  const available = {};
  bossLetters.forEach(l => { available[l] = (available[l] || 0) + 1; });

  const usedSet = new Set(bossUsedWords.filter(w => w.valid).map(w => w.word));
  const results = [];

  for (const word of Object.keys(dictionary)) {
    if (word.length < bossMinWordLen || word.length > bossLetters.length) continue;
    if (usedSet.has(word)) continue;
    if (canMakeFromBossLetters2(word, available)) results.push(word);
    if (results.length >= 200) break;
  }

  results.sort((a, b) => b.length - a.length || a.localeCompare(b));

  // Auto-add 3 letters if no words can be made
  if (results.length === 0 && bossLetters.length > 0 && bossPool.length >= 3) {
    for (let i = 0; i < 3 && bossPool.length > 0; i++) bossLetters.push(bossPool.pop());
    showBossFeedback('No words possible — 3 letters added!', true);
    renderBossState();
    return;
  }

  container.innerHTML = results.map(w =>
    `<span class="boss-suggest-word">${w}</span>`
  ).join('');
}

function canMakeFromBossLetters2(word, available) {
  const needed = {};
  for (const ch of word) {
    needed[ch] = (needed[ch] || 0) + 1;
    if (needed[ch] > (available[ch] || 0)) return false;
  }
  return true;
}

function bossSubmitWord() {
  const input = document.getElementById('boss-word-input');
  const word = input.value.trim().toUpperCase();
  input.value = ''; input.focus();
  if (!word) return;

  if (bossUsedWords.some(w => w.word === word)) { showBossFeedback('Already used!', false); return; }

  const valid = isValidWord(word);
  const canMake = canMakeFromBossLetters(word);

  // Show definition above timer
  const defEl = document.getElementById('boss-last-def');
  if (valid) {
    const def = getDefinition(word);
    defEl.innerHTML = `<strong>${word}</strong>: ${def || 'valid word'}`;
  } else {
    defEl.innerHTML = `<strong>${word}</strong>: not in dictionary`;
  }

  if (valid && canMake && word.length >= bossMinWordLen) {
    removeBossLetters(word);
    bossHp = Math.max(0, bossHp - word.length);
    bossUsedWords.push({ word, valid: true });
    showBossFeedback(`${word} — ${word.length} damage!`, true);
  } else if (valid && canMake && word.length < bossMinWordLen) {
    playerBossHp = Math.max(0, playerBossHp - word.length);
    bossUsedWords.push({ word, valid: false });
    showBossFeedback(`${word} — too short! Need ${bossMinWordLen}+. You take ${word.length}!`, false);
  } else if (!valid) {
    playerBossHp = Math.max(0, playerBossHp - word.length);
    bossUsedWords.push({ word, valid: false });
    showBossFeedback(`${word} — not a word! You take ${word.length}!`, false);
  } else {
    playerBossHp = Math.max(0, playerBossHp - word.length);
    bossUsedWords.push({ word, valid: false });
    showBossFeedback(`${word} — wrong letters! You take ${word.length}!`, false);
  }

  renderBossState();

  if (bossHp <= 0) { clearInterval(bossTimer); setTimeout(() => bossVictory(), 500); }
  else if (playerBossHp <= 0) { clearInterval(bossTimer); setTimeout(() => bossDefeat('You ran out of HP.'), 500); }
}

function canMakeFromBossLetters(word) {
  const available = {};
  bossLetters.forEach(l => { available[l] = (available[l] || 0) + 1; });
  for (const ch of word) { if (!available[ch] || available[ch] <= 0) return false; available[ch]--; }
  return true;
}

function removeBossLetters(word) {
  for (const ch of word.split('')) {
    const idx = bossLetters.indexOf(ch);
    if (idx !== -1) bossLetters.splice(idx, 1);
  }
}

function showBossFeedback(msg, correct) {
  const fb = document.getElementById('boss-feedback');
  fb.textContent = msg;
  fb.className = 'boss-feedback ' + (correct ? 'correct-fb' : 'incorrect-fb');
  if (!correct) { fb.style.animation = 'none'; fb.offsetHeight; fb.style.animation = ''; }
}

// Swap
document.getElementById('boss-swap-btn').addEventListener('click', () => {
  if (swapLetterIndex === null) { showBossFeedback('Click a letter first, then swap', false); return; }
  if (bossPool.length < 3) { showBossFeedback('Not enough letters to swap!', false); return; }
  const removed = bossLetters.splice(swapLetterIndex, 1)[0];
  bossPool.push(removed); shuffle(bossPool);
  for (let i = 0; i < 3 && bossPool.length > 0; i++) bossLetters.push(bossPool.pop());
  swapLetterIndex = null;
  showBossFeedback(`Swapped ${removed} for 3 new letters`, true);
  renderBossState();
});

document.getElementById('boss-word-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); bossSubmitWord(); }
});
document.getElementById('boss-submit-btn').addEventListener('click', bossSubmitWord);

// Boss Victory
function bossVictory() {
  document.getElementById('boss-battle').classList.add('hidden');

  if (bossLevel >= 5) {
    // FINAL VICTORY — beat all 5 levels
    showFinalVictory();
    return;
  }

  // Level up — show victory then go back to board game
  const bv = document.getElementById('boss-victory');
  bv.classList.remove('hidden');
  fireConfetti(10000);
  document.getElementById('boss-victory-msg').textContent =
    bossLevel === 0 ? 'Boss defeated.' : `Level ${bossLevel} cleared.`;
  document.getElementById('boss-next-action').textContent = 'Next Round';
  document.getElementById('boss-next-action').onclick = () => {
    bv.classList.add('hidden');
    // Reset board for next round
    pool = []; buildPool(); board = []; buildBoard();
    rack = []; drawTiles(STARTING_TILES);
    peelCooldown = false;
    renderBoard(); renderRack(); updateCounts(); scheduleWordSuggestions();
  };
}

function bossDefeat(reason) {
  document.getElementById('boss-battle').classList.add('hidden');
  document.getElementById('boss-defeat').classList.remove('hidden');
  document.getElementById('boss-defeat-msg').textContent = reason;
}

// ============================================================
// Final Victory — After Level 5
// ============================================================

function showFinalVictory() {
  fireConfetti(12000);
  const fv = document.getElementById('final-victory');
  fv.classList.remove('hidden');

  // After 4 seconds, fade to Continue? image
  setTimeout(() => {
    fv.style.transition = 'opacity 2s ease'; fv.style.opacity = '0';
    setTimeout(() => {
      fv.classList.add('hidden'); fv.style.opacity = ''; fv.style.transition = '';
      document.getElementById('final-continue').classList.remove('hidden');
    }, 2000);
  }, 4000);
}

// Click/key on final continue → Sentence Game
document.getElementById('final-continue').addEventListener('click', () => {
  document.getElementById('final-continue').classList.add('hidden');
  startSentenceGame();
});

// ============================================================
// ENDGAME: Sentence Completion Game
// ============================================================

let sgScore = 0;
let sgStreak = 0;
let sgCurrentWord = null;
let sgSkillPoints = 0;
let sgSkillLevel = 0;
let sgMasteredWords = JSON.parse(localStorage.getItem('sg-mastered') || '[]');
let sgDictKeys = [];

let sgCorrecting = false;
let sgHintsUsed = 0;
let sgRevealedLetters = [];

function generateSentence(word, def) {
  return '';
}

function startSentenceGame() {
  if (!dictionary) return;
  sgDictKeys = Object.keys(dictionary).filter(w => w.length >= 3 && w.length <= 10 && dictionary[w].length > 5);
  sgScore = 0;
  sgStreak = 0;
  sgCorrecting = false;
  sgSkillPoints = parseInt(localStorage.getItem('sg-skillpoints') || '0');
  sgSkillLevel = parseInt(localStorage.getItem('sg-skilllevel') || '0');
  sgMasteredWords = JSON.parse(localStorage.getItem('sg-mastered') || '[]');

  document.getElementById('sentence-game').classList.remove('hidden');
  document.getElementById('sg-score').textContent = '0';
  document.getElementById('sg-correction-panel').classList.add('hidden');
  updateSkillDisplay();
  document.getElementById('sg-mastered-count').textContent = sgMasteredWords.length;
  nextSentence();
}

function buildBlankDisplay(word, revealed) {
  return word.split('').map((ch, i) =>
    revealed.includes(i) ? `<span class="sg-revealed-letter">${ch}</span>` : '_'
  ).join(' ');
}

function nextSentence() {
  const masteredSet = new Set(sgMasteredWords);
  let word, def;
  for (let tries = 0; tries < 50; tries++) {
    word = sgDictKeys[Math.floor(Math.random() * sgDictKeys.length)];
    if (!masteredSet.has(word)) break;
  }
  def = dictionary[word];
  sgCurrentWord = word;
  sgCorrecting = false;
  sgHintsUsed = 0;

  // Start with first letter revealed
  sgRevealedLetters = [0];

  const sentence = generateSentence(word, def);
  document.getElementById('sg-sentence').innerHTML = sentence;
  updateHintDisplay();
  document.getElementById('sg-feedback').textContent = '';
  document.getElementById('sg-feedback').className = 'sg-feedback';
  document.getElementById('sg-correction-panel').classList.add('hidden');
  document.getElementById('sg-input').value = '';
  document.getElementById('sg-input').disabled = false;
  document.getElementById('sg-input').focus();
  document.getElementById('sg-streak').textContent = sgStreak > 0 ? `Streak: ${sgStreak}` : '';
}

function updateHintDisplay() {
  const word = sgCurrentWord;
  const def = dictionary[word];

  // Build the letter reveal
  const letterDisplay = buildBlankDisplay(word, sgRevealedLetters);

  // Build extra hints based on how many hints used
  let extraHints = '';

  if (sgHintsUsed >= 1) {
    // Reveal last letter too
    if (!sgRevealedLetters.includes(word.length - 1)) {
      sgRevealedLetters.push(word.length - 1);
    }
    extraHints += `<div class="sg-extra-hint">Starts with <strong>${word[0]}</strong>, ends with <strong>${word[word.length-1]}</strong></div>`;
  }

  if (sgHintsUsed >= 2) {
    // Reveal a middle letter
    const mid = Math.floor(word.length / 2);
    if (!sgRevealedLetters.includes(mid)) sgRevealedLetters.push(mid);
    // Show what it rhymes with (find a rhyming word)
    const ending = word.slice(-3);
    const rhyme = sgDictKeys.find(w => w !== word && w.endsWith(ending) && w.length <= 8);
    if (rhyme) extraHints += `<div class="sg-extra-hint">Rhymes with <strong>${rhyme.toLowerCase()}</strong></div>`;
  }

  if (sgHintsUsed >= 3) {
    // Reveal more letters
    for (let i = 1; i < word.length - 1; i += 2) {
      if (!sgRevealedLetters.includes(i)) { sgRevealedLetters.push(i); break; }
    }
    // Show number of vowels
    const vowels = word.split('').filter(c => 'AEIOU'.includes(c)).length;
    extraHints += `<div class="sg-extra-hint">Contains <strong>${vowels}</strong> vowel${vowels !== 1 ? 's' : ''}</div>`;
  }

  if (sgHintsUsed >= 4) {
    // Reveal even more
    for (let i = 2; i < word.length - 1; i++) {
      if (!sgRevealedLetters.includes(i)) { sgRevealedLetters.push(i); break; }
    }
    // Scrambled letters hint
    const scrambled = word.split('').sort(() => Math.random() - 0.5).join('').toLowerCase();
    extraHints += `<div class="sg-extra-hint">Scrambled: <strong>${scrambled}</strong></div>`;
  }

  const updatedBlank = buildBlankDisplay(word, sgRevealedLetters);

  document.getElementById('sg-hint').innerHTML =
    `<div class="sg-hint-letters">${updatedBlank}</div>` +
    `<div class="sg-hint-def"><strong>${word.length} letters</strong> &mdash; ${def}</div>` +
    extraHints +
    `<button type="button" id="sg-hint-btn" class="sg-hint-btn">Hint (${sgHintsUsed}/4)</button>`;

  // Re-bind hint button
  document.getElementById('sg-hint-btn').addEventListener('click', () => {
    if (sgHintsUsed < 4) {
      sgHintsUsed++;
      updateHintDisplay();
    }
  });
}

function showCorrectionPanel() {
  sgCorrecting = true;
  document.getElementById('sg-input').disabled = true;
  const panel = document.getElementById('sg-correction-panel');
  panel.classList.remove('hidden');
  document.getElementById('sg-correction-word').textContent = sgCurrentWord;
  document.getElementById('sg-correction-def').textContent = dictionary[sgCurrentWord] || '';
  const corrInput = document.getElementById('sg-correction-input');
  corrInput.value = '';
  corrInput.focus();
}

// Submit answer
document.getElementById('sg-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (sgCorrecting) return;
  const input = document.getElementById('sg-input');
  const answer = input.value.trim().toUpperCase();

  // Empty submit = reveal a hint
  if (!answer) {
    if (sgHintsUsed < 4) { sgHintsUsed++; updateHintDisplay(); }
    return;
  }

  const fb = document.getElementById('sg-feedback');

  if (answer === sgCurrentWord) {
    sgScore += sgCurrentWord.length;
    sgStreak++;
    sgSkillPoints++;
    localStorage.setItem('sg-skillpoints', sgSkillPoints);

    const newLevel = Math.floor(sgSkillPoints / 3);
    if (newLevel > sgSkillLevel) {
      sgSkillLevel = newLevel;
      localStorage.setItem('sg-skilllevel', sgSkillLevel);
      const wrap = document.getElementById('sg-skill-btn');
      wrap.classList.add('sg-skill-levelup');
      setTimeout(() => wrap.classList.remove('sg-skill-levelup'), 1000);
    }

    document.getElementById('sg-score').textContent = sgScore;
    updateSkillDisplay();

    fb.textContent = `Correct!  +${sgCurrentWord.length} points`;
    fb.className = 'sg-feedback sg-correct';

    setTimeout(() => nextSentence(), 1000);
  } else {
    sgStreak = 0;
    fb.textContent = 'Incorrect.';
    fb.className = 'sg-feedback sg-incorrect';
    showCorrectionPanel();
  }
});

// Correction panel — type the word to dismiss
document.getElementById('sg-correction-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const answer = document.getElementById('sg-correction-input').value.trim().toUpperCase();
  if (answer === sgCurrentWord) {
    document.getElementById('sg-correction-panel').classList.add('hidden');
    sgCorrecting = false;
    setTimeout(() => nextSentence(), 300);
  }
});

document.getElementById('sg-correction-input').addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    e.preventDefault();
    document.getElementById('sg-correction-form').requestSubmit();
  }
});

// Spacebar also submits main form
document.getElementById('sg-input').addEventListener('keydown', (e) => {
  if (e.key === ' ') { e.preventDefault(); document.getElementById('sg-form').requestSubmit(); }
});

// Skip
document.getElementById('sg-skip-btn').addEventListener('click', () => {
  if (sgCorrecting) return;
  sgStreak = 0;
  showCorrectionPanel();
});

function updateSkillDisplay() {
  document.getElementById('sg-skill-level').textContent = sgSkillLevel;
  const progress = (sgSkillPoints % 3) / 3 * 100;
  document.getElementById('sg-skill-fill').style.width = progress + '%';

  // Show green badge with unspent points
  const badge = document.getElementById('sg-skill-badge');
  if (sgSkillPoints > 0) {
    badge.textContent = '+' + sgSkillPoints;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// Skill search modal
document.getElementById('sg-skill-btn').addEventListener('click', () => {
  document.getElementById('sg-search-modal').classList.remove('hidden');
  document.getElementById('sg-search-input').value = '';
  document.getElementById('sg-search-input').focus();

  // Show suggested common words to master
  const masteredSet = new Set(sgMasteredWords);
  const common = ['HELLO','WORLD','HOUSE','WATER','LIGHT','MUSIC','DREAM','HEART','SMILE',
    'DANCE','LAUGH','SLEEP','BRAIN','TABLE','CHAIR','KNIFE','THROW','CATCH','CLIMB',
    'SPEAK','WRITE','YOUNG','GREAT','SMALL','LARGE','THREE','UNDER','NEVER','AFTER',
    'PLACE','EVERY','STILL','THINK','RIGHT','ABOUT','PEOPLE','COULD','WOULD','THEIR',
    'WHICH','THERE','PLANT','RIVER','STONE','BREAD','QUIET','STORM','OCEAN','FLAME',
    'FROST','BLOOM','BRAVE','SWIFT','GRACE','POWER','BEAST','CROWN','FORGE','QUEST'];
  const suggestions = common.filter(w => w in dictionary && !masteredSet.has(w)).slice(0, 12);

  let html = '<div class="sg-search-suggestions"><div class="sg-search-suggest-label">Suggested words to master:</div>';
  html += '<div class="sg-search-suggest-grid">';
  suggestions.forEach(w => {
    html += `<button class="sg-suggest-chip" onclick="document.getElementById('sg-search-input').value='${w}';document.getElementById('sg-search-input').dispatchEvent(new Event('input'))">${w.toLowerCase()}</button>`;
  });
  html += '</div></div>';
  document.getElementById('sg-search-result').innerHTML = html;
});

document.getElementById('sg-search-close').addEventListener('click', () => {
  document.getElementById('sg-search-modal').classList.add('hidden');
});

document.getElementById('sg-search-input').addEventListener('input', () => {
  const word = document.getElementById('sg-search-input').value.trim().toUpperCase();
  const resultEl = document.getElementById('sg-search-result');

  if (!word || word.length < 2) { resultEl.innerHTML = ''; return; }

  if (word in dictionary) {
    const def = dictionary[word];
    const alreadyMastered = sgMasteredWords.includes(word);
    resultEl.innerHTML = `
      <div class="sg-search-word">${word}</div>
      <div class="sg-search-def">${def}</div>
      ${alreadyMastered
        ? '<div style="color:#9b59b6;font-weight:600;margin-top:0.5rem;">Already mastered</div>'
        : sgSkillPoints > 0
          ? `<button class="sg-master-word-btn" onclick="masterWord('${word}')">Master this word (1 skill point)</button>`
          : '<div style="color:var(--text-muted);margin-top:0.5rem;">Need skill points to master words</div>'
      }
    `;
  } else {
    resultEl.innerHTML = '<div style="color:var(--text-muted)">Not in dictionary</div>';
  }
});

function masterWord(word) {
  if (sgSkillPoints <= 0) return;
  sgSkillPoints--;
  localStorage.setItem('sg-skillpoints', sgSkillPoints);
  sgMasteredWords.push(word);
  localStorage.setItem('sg-mastered', JSON.stringify(sgMasteredWords));
  updateSkillDisplay();
  document.getElementById('sg-mastered-count').textContent = sgMasteredWords.length;

  // Re-trigger search to update button
  document.getElementById('sg-search-input').dispatchEvent(new Event('input'));
}

// Mastered review modal
let sgMasteredIdx = 0;
let sgMasteredCurrent = null;

document.getElementById('sg-mastered-btn').addEventListener('click', () => {
  if (sgMasteredWords.length === 0) return;
  sgMasteredIdx = 0;
  document.getElementById('sg-mastered-modal').classList.remove('hidden');
  showMasteredCard();
});

document.getElementById('sg-mastered-close').addEventListener('click', () => {
  document.getElementById('sg-mastered-modal').classList.add('hidden');
});

function showMasteredCard() {
  if (sgMasteredWords.length === 0) return;
  sgMasteredIdx = sgMasteredIdx % sgMasteredWords.length;
  sgMasteredCurrent = sgMasteredWords[sgMasteredIdx];
  const def = dictionary[sgMasteredCurrent] || 'No definition';

  document.getElementById('sg-mastered-card').innerHTML = `
    <div class="sg-mastered-def">${def}</div>
    <div class="sg-mastered-hint">${'_ '.repeat(sgMasteredCurrent.length).trim()} (${sgMasteredCurrent.length} letters)</div>
  `;
  document.getElementById('sg-mastered-input').value = '';
  document.getElementById('sg-mastered-feedback').textContent = '';
  document.getElementById('sg-mastered-input').focus();
}

document.getElementById('sg-mastered-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const answer = document.getElementById('sg-mastered-input').value.trim().toUpperCase();
  const fb = document.getElementById('sg-mastered-feedback');

  if (answer === sgMasteredCurrent) {
    fb.textContent = `Correct! ${sgMasteredCurrent}`;
    fb.className = 'sg-feedback sg-correct';
    setTimeout(() => { sgMasteredIdx++; showMasteredCard(); }, 1000);
  } else {
    fb.textContent = `The word was ${sgMasteredCurrent}`;
    fb.className = 'sg-feedback sg-incorrect';
    setTimeout(() => { sgMasteredIdx++; showMasteredCard(); }, 1500);
  }
});

document.getElementById('sg-mastered-next').addEventListener('click', () => {
  sgMasteredIdx++;
  showMasteredCard();
});

/**** DEAD TETRIS CODE START (remove later) ***
function _dead() {
  tetrisGrid = [];
  for (let r = 0; r < TETRIS_ROWS; r++) {
    tetrisGrid[r] = [];
    for (let c = 0; c < TETRIS_COLS; c++) tetrisGrid[r][c] = null;
  }

  tetrisActive = true;
  tetrisScore = 0;
  tetrisSpeed = 1;
  tetrisHold = null;
  tetrisLastWord = null;
  tetrisNext = [randomTetrisLetter(), randomTetrisLetter(), randomTetrisLetter()];
  tetrisFalling = null;

  const el = document.getElementById('word-tetris');
  el.classList.remove('hidden');

  const canvas = document.getElementById('tetris-canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = TETRIS_COLS * TETRIS_CELL * dpr;
  canvas.height = TETRIS_ROWS * TETRIS_CELL * dpr;
  canvas.style.width = TETRIS_COLS * TETRIS_CELL + 'px';
  canvas.style.height = TETRIS_ROWS * TETRIS_CELL + 'px';
  canvas.getContext('2d').scale(dpr, dpr);

  document.getElementById('tetris-score').textContent = '0';
  document.getElementById('tetris-speed').textContent = '1';
  renderTetrisHoldNext();

  spawnTetrisPiece();
  tetrisLastDrop = Date.now();
  tetrisAnimFrame = requestAnimationFrame(tetrisLoop);
}

function spawnTetrisPiece() {
  const letter = tetrisNext.shift();
  tetrisNext.push(randomTetrisLetter());
  tetrisFalling = { letter, col: Math.floor(TETRIS_COLS / 2), row: 0 };
  renderTetrisHoldNext();

  // Check if spawn spot is occupied = game over
  if (tetrisGrid[0][tetrisFalling.col]) {
    tetrisActive = false;
    tetrisGameOver();
  }
}

function tetrisLoop() {
  if (!tetrisActive) return;

  const now = Date.now();
  const dropInterval = Math.max(100, 800 - tetrisSpeed * 60);

  if (now - tetrisLastDrop > dropInterval && tetrisFalling) {
    tetrisFalling.row++;
    // Check landing
    if (tetrisFalling.row >= TETRIS_ROWS || tetrisGrid[tetrisFalling.row]?.[tetrisFalling.col]) {
      tetrisFalling.row--;
      tetrisGrid[tetrisFalling.row][tetrisFalling.col] = tetrisFalling.letter;
      tetrisFalling = null;
      checkTetrisWords();
      if (tetrisActive) spawnTetrisPiece();
    }
    tetrisLastDrop = now;
  }

  renderTetris();
  tetrisAnimFrame = requestAnimationFrame(tetrisLoop);
}

function findBestWord(letters, positions) {
  // Given a string of letters and their positions, find the longest valid word substring
  let bestWord = null;
  let bestStart = -1;
  let bestLen = 0;

  for (let start = 0; start < letters.length; start++) {
    for (let end = start + 3; end <= letters.length; end++) {
      const sub = letters.substring(start, end);
      if (sub.length > bestLen && isValidWord(sub)) {
        bestWord = sub;
        bestStart = start;
        bestLen = sub.length;
      }
    }
  }

  if (!bestWord) return null;
  return { word: bestWord, positions: positions.slice(bestStart, bestStart + bestLen) };
}

function checkTetrisWords() {
  let cleared = true;
  while (cleared) {
    cleared = false;

    // Check horizontal sequences
    for (let r = 0; r < TETRIS_ROWS; r++) {
      let c = 0;
      while (c < TETRIS_COLS) {
        if (tetrisGrid[r][c]) {
          let letters = '';
          let positions = [];
          let startC = c;
          while (c < TETRIS_COLS && tetrisGrid[r][c]) {
            letters += tetrisGrid[r][c];
            positions.push({ r, c });
            c++;
          }
          if (letters.length >= 3) {
            const found = findBestWord(letters, positions);
            if (found) {
              for (const pos of found.positions) tetrisGrid[pos.r][pos.c] = null;
              tetrisScore += Math.pow(2, found.word.length);
              tetrisLastWord = found.word;
              cleared = true;
            }
          }
        } else c++;
      }
    }

    // Check vertical sequences
    for (let c = 0; c < TETRIS_COLS; c++) {
      let r = 0;
      while (r < TETRIS_ROWS) {
        if (tetrisGrid[r][c]) {
          let letters = '';
          let positions = [];
          while (r < TETRIS_ROWS && tetrisGrid[r][c]) {
            letters += tetrisGrid[r][c];
            positions.push({ r, c });
            r++;
          }
          if (letters.length >= 3) {
            const found = findBestWord(letters, positions);
            if (found) {
              for (const pos of found.positions) tetrisGrid[pos.r][pos.c] = null;
              tetrisScore += Math.pow(2, found.word.length);
              tetrisLastWord = found.word;
              cleared = true;
            }
          }
        } else r++;
      }
    }

    if (cleared) applyTetrisGravity();
  }

  document.getElementById('tetris-score').textContent = tetrisScore.toLocaleString();
  tetrisSpeed = Math.floor(tetrisScore / 100) + 1;
  document.getElementById('tetris-speed').textContent = tetrisSpeed;

  // Show last word definition
  if (tetrisLastWord) {
    const def = getDefinition(tetrisLastWord);
    document.getElementById('tetris-last-word').innerHTML =
      `<strong>${tetrisLastWord}</strong>: ${def || 'valid word'} (+${Math.pow(2, tetrisLastWord.length)})`;
  }

  // Check win
  if (tetrisScore >= TETRIS_WIN_SCORE) {
    tetrisActive = false;
    tetrisWin();
  }
}

function applyTetrisGravity() {
  for (let c = 0; c < TETRIS_COLS; c++) {
    let writeRow = TETRIS_ROWS - 1;
    for (let r = TETRIS_ROWS - 1; r >= 0; r--) {
      if (tetrisGrid[r][c]) {
        tetrisGrid[writeRow][c] = tetrisGrid[r][c];
        if (writeRow !== r) tetrisGrid[r][c] = null;
        writeRow--;
      }
    }
    for (let r = writeRow; r >= 0; r--) tetrisGrid[r][c] = null;
  }
}

function renderTetris() {
  const canvas = document.getElementById('tetris-canvas');
  const ctx = canvas.getContext('2d');
  const S = TETRIS_CELL;
  const W = TETRIS_COLS * S, H = TETRIS_ROWS * S;

  ctx.clearRect(0, 0, W, H);

  // Draw grid
  for (let r = 0; r < TETRIS_ROWS; r++) {
    for (let c = 0; c < TETRIS_COLS; c++) {
      const x = c * S, y = r * S;
      roundRect(ctx, x + 1, y + 1, S - 2, S - 2, 4);
      ctx.fillStyle = '#14141e';
      ctx.fill();
      ctx.strokeStyle = '#1c1c2e';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      if (tetrisGrid[r][c]) {
        drawTetrisTile(ctx, x, y, S, tetrisGrid[r][c]);
      }
    }
  }

  // Draw falling piece
  if (tetrisFalling) {
    const x = tetrisFalling.col * S, y = tetrisFalling.row * S;
    drawTetrisTile(ctx, x, y, S, tetrisFalling.letter);

    // Ghost (where it will land)
    let ghostRow = tetrisFalling.row;
    while (ghostRow + 1 < TETRIS_ROWS && !tetrisGrid[ghostRow + 1]?.[tetrisFalling.col]) ghostRow++;
    if (ghostRow !== tetrisFalling.row) {
      ctx.globalAlpha = 0.2;
      drawTetrisTile(ctx, tetrisFalling.col * S, ghostRow * S, S, tetrisFalling.letter);
      ctx.globalAlpha = 1;
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawTetrisTile(ctx, x, y, s, letter) {
  const m = 2, r = 5;
  // Tile body
  roundRect(ctx, x + m, y + m, s - m * 2, s - m * 2, r);
  ctx.fillStyle = '#f7e8c8';
  ctx.fill();
  ctx.strokeStyle = '#d4b070';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Top highlight
  ctx.save();
  roundRect(ctx, x + m, y + m, s - m * 2, s - m * 2, r);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(x + m, y + m, s - m * 2, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(x + m, y + s - m - 4, s - m * 2, 4);
  ctx.restore();
  // Letter
  ctx.fillStyle = '#2c1810';
  ctx.font = `bold ${s * 0.48}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, x + s / 2, y + s / 2 + 1);
}

function renderTetrisHoldNext() {
  const holdEl = document.getElementById('tetris-hold');
  holdEl.textContent = tetrisHold || '';
  if (!tetrisHold) holdEl.textContent = '';

  const nextContainer = document.getElementById('tetris-next');
  nextContainer.innerHTML = '';
  tetrisNext.forEach(letter => {
    const tile = document.createElement('div');
    tile.className = 'tetris-next-tile';
    tile.textContent = letter;
    nextContainer.appendChild(tile);
  });
}

// Tetris keyboard controls
document.addEventListener('keydown', (e) => {
  if (!tetrisActive || !tetrisFalling) return;
  const tetrisEl = document.getElementById('word-tetris');
  if (tetrisEl.classList.contains('hidden')) return;

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (tetrisFalling.col > 0 && !tetrisGrid[tetrisFalling.row]?.[tetrisFalling.col - 1])
      tetrisFalling.col--;
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (tetrisFalling.col < TETRIS_COLS - 1 && !tetrisGrid[tetrisFalling.row]?.[tetrisFalling.col + 1])
      tetrisFalling.col++;
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    // Hard drop
    while (tetrisFalling.row + 1 < TETRIS_ROWS && !tetrisGrid[tetrisFalling.row + 1]?.[tetrisFalling.col])
      tetrisFalling.row++;
    tetrisGrid[tetrisFalling.row][tetrisFalling.col] = tetrisFalling.letter;
    tetrisFalling = null;
    checkTetrisWords();
    if (tetrisActive) spawnTetrisPiece();
    tetrisLastDrop = Date.now();
  } else if (e.key === 'Shift') {
    e.preventDefault();
    // Hold/swap
    if (tetrisHold === null) {
      tetrisHold = tetrisFalling.letter;
      tetrisFalling = null;
      renderTetrisHoldNext();
      spawnTetrisPiece();
    } else {
      const temp = tetrisHold;
      tetrisHold = tetrisFalling.letter;
      tetrisFalling.letter = temp;
      tetrisFalling.row = 0;
      tetrisFalling.col = Math.floor(TETRIS_COLS / 2);
      renderTetrisHoldNext();
    }
  }
});

function tetrisWin() {
  cancelAnimationFrame(tetrisAnimFrame);
  document.getElementById('word-tetris').classList.add('hidden');
  document.getElementById('tetris-victory').classList.remove('hidden');
  fireConfetti(12000);
}

function tetrisGameOver() {
  cancelAnimationFrame(tetrisAnimFrame);
  renderTetris(); // show final state
  setTimeout(() => {
    document.getElementById('word-tetris').classList.add('hidden');
}
*** DEAD TETRIS CODE END ***/

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
    if (canMakeWord(word, available)) results.push({ word, definition: dictionary[word], length: word.length });
  }
  results.sort((a, b) => b.length - a.length || a.word.localeCompare(b.word));
  renderWordSuggestions(results);
}

function canMakeWord(word, available) {
  const needed = {};
  for (const ch of word) { needed[ch] = (needed[ch] || 0) + 1; if (needed[ch] > (available[ch] || 0)) return false; }
  return true;
}

function renderWordSuggestions(results) {
  const container = document.getElementById('word-list');
  document.getElementById('word-count-label').textContent = `${results.length.toLocaleString()} possible words from rack`;
  const groups = {};
  for (const r of results) { if (!groups[r.length]) groups[r.length] = []; groups[r.length].push(r); }

  let html = '';
  for (const len of Object.keys(groups).sort((a, b) => b - a)) {
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

function advanceCursor() {
  if (typingDir === 'right') {
    if (cursorCol < BOARD_SIZE - 1) cursorCol++;
  } else {
    if (cursorRow < BOARD_SIZE - 1) cursorRow++;
  }
}

function retreatCursor() {
  if (typingDir === 'right') {
    if (cursorCol > 0) cursorCol--;
  } else {
    if (cursorRow > 0) cursorRow--;
  }
}

document.addEventListener('keydown', (e) => {
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  // Block if any overlay is open
  const overlays = ['boss-battle', 'victory-screen', 'boss-reveal', 'boss-victory',
                    'boss-defeat', 'final-victory', 'final-continue', 'sentence-game'];
  for (const id of overlays) {
    if (!document.getElementById(id).classList.contains('hidden')) {
      // Boss reveal: any key continues
      if (id === 'boss-reveal') handleBossRevealContinue();
      // Final continue: any key continues
      if (id === 'final-continue') {
        document.getElementById('final-continue').classList.add('hidden');
        startSentenceGame();
      }
      return;
    }
  }

  const key = e.key;

  // Tab — toggle typing direction
  if (key === 'Tab' && boardFocused) {
    e.preventDefault();
    typingDir = typingDir === 'right' ? 'down' : 'right';
    renderBoard();
    return;
  }

  if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
    e.preventDefault(); boardFocused = true;
    if (key === 'ArrowUp') cursorRow = Math.max(0, cursorRow - 1);
    if (key === 'ArrowDown') cursorRow = Math.min(BOARD_SIZE - 1, cursorRow + 1);
    if (key === 'ArrowLeft') cursorCol = Math.max(0, cursorCol - 1);
    if (key === 'ArrowRight') cursorCol = Math.min(BOARD_SIZE - 1, cursorCol + 1);
    renderBoard();
    const cells = document.querySelectorAll('.cell');
    cells[cursorRow * BOARD_SIZE + cursorCol]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return;
  }

  if (/^[a-zA-Z]$/.test(key) && boardFocused) {
    e.preventDefault();
    const letter = key.toUpperCase();
    const rackIdx = rack.indexOf(letter);
    if (rackIdx === -1) return;

    if (board[cursorRow][cursorCol] === null) {
      board[cursorRow][cursorCol] = letter; rack.splice(rackIdx, 1);
      advanceCursor();
      selectedTile = null; renderBoard(); renderRack(); scheduleWordSuggestions();
    } else if (board[cursorRow][cursorCol] !== letter) {
      const existing = board[cursorRow][cursorCol];
      board[cursorRow][cursorCol] = letter; rack.splice(rackIdx, 1); rack.push(existing);
      advanceCursor();
      selectedTile = null; renderBoard(); renderRack(); scheduleWordSuggestions();
    }
    return;
  }

  if ((key === 'Backspace' || key === 'Delete') && boardFocused) {
    e.preventDefault();
    if (board[cursorRow][cursorCol]) {
      rack.push(board[cursorRow][cursorCol]); board[cursorRow][cursorCol] = null;
      if (key === 'Backspace') retreatCursor();
      selectedTile = null; renderBoard(); renderRack(); scheduleWordSuggestions();
    } else if (key === 'Backspace') {
      retreatCursor();
      if (board[cursorRow][cursorCol]) {
        rack.push(board[cursorRow][cursorCol]); board[cursorRow][cursorCol] = null;
        selectedTile = null; renderBoard(); renderRack(); scheduleWordSuggestions();
      } else renderBoard();
    }
    return;
  }

  if (key === 'Escape') { boardFocused = false; selectedTile = null; renderBoard(); }
});

// ============================================================
// DEV buttons (remove before push)
// ============================================================
document.getElementById('dev-skip-btn').addEventListener('click', () => showVictoryScreen());
document.getElementById('dev-skip-final').addEventListener('click', () => {
  bossLevel = 5;
  showFinalVictory();
});

// ============================================================
// Start
// ============================================================

init();
