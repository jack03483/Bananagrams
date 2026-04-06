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
const BOSS_LEVELS = [
  [50, 50, 2],   // Level 1
  [60, 40, 3],   // Level 2
  [70, 30, 4],   // Level 3
  [80, 20, 5],   // Level 4
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
let bossLevel = 0; // 0 = not started, 1-5 = levels

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

      if (boardFocused && r === cursorRow && c === cursorCol) cell.classList.add('cursor');

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

  // Check win: >= TILES_TO_WIN on board, all valid, connected, no floaters
  if (tilesOnBoard.length >= TILES_TO_WIN && rackEmpty && connected && allValid && hasWords && noFloating && !peelCooldown) {
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
    bossLevel === 0 ? `You placed ${TILES_TO_WIN}+ tiles!` : `Level ${bossLevel} complete!`;
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
  const [bHp, pHp, minLen] = BOSS_LEVELS[bossLevel - 1];
  bossMaxHp = bHp; playerMaxHp = pHp; bossMinWordLen = minLen;
  bossHp = bHp; playerBossHp = pHp;

  // Build letters
  const allLetters = [];
  for (const [letter, count] of Object.entries(LETTER_DIST)) {
    for (let i = 0; i < count; i++) allLetters.push(letter);
  }
  shuffle(allLetters);
  bossLetters = allLetters.slice(0, 50);
  bossPool = allLetters.slice(50);

  bossUsedWords = [];
  bossTimeLeft = 300;
  swapLetterIndex = null;

  // Update UI
  document.getElementById('boss-level-display').textContent = `Level ${bossLevel}`;
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
}

function bossSubmitWord() {
  const input = document.getElementById('boss-word-input');
  const word = input.value.trim().toUpperCase();
  input.value = ''; input.focus();
  if (!word) return;

  if (bossUsedWords.some(w => w.word === word)) { showBossFeedback('Already used!', false); return; }

  const valid = isValidWord(word);
  const canMake = canMakeFromBossLetters(word);

  if (valid && canMake && word.length >= bossMinWordLen) {
    removeBossLetters(word);
    bossHp = Math.max(0, bossHp - word.length);
    bossUsedWords.push({ word, valid: true });
    showBossFeedback(`${word} — ${word.length} damage!`, true);
  } else if (valid && canMake && word.length < bossMinWordLen) {
    showBossFeedback(`Too short! Need ${bossMinWordLen}+ letters at this level.`, false);
    return;
  } else if (!valid) {
    playerBossHp = Math.max(0, playerBossHp - word.length);
    bossUsedWords.push({ word, valid: false });
    showBossFeedback(`${word} — not a word! You take ${word.length} damage!`, false);
  } else {
    showBossFeedback(`You don't have the letters for ${word}`, false);
    return;
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
  document.getElementById('boss-victory-msg').textContent = `Level ${bossLevel} cleared.`;
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

// Click/key on final continue → Word Rain endgame
document.getElementById('final-continue').addEventListener('click', () => {
  document.getElementById('final-continue').classList.add('hidden');
  startWordRain();
});

// ============================================================
// ENDGAME: Word Rain — survival mode
// ============================================================
// Words fall from the top. Type them before they reach the bottom.
// Each word shows its definition. Speed increases. 3 lives.
// Score = words caught. High score tracked.

let rainActive = false;
let rainWords = [];
let rainScore = 0;
let rainLives = 3;
let rainSpeed = 1;
let rainSpawnInterval = null;
let rainAnimFrame = null;
let rainLastFrame = 0;

function startWordRain() {
  if (!dictionary) return;

  rainActive = true;
  rainWords = [];
  rainScore = 0;
  rainLives = 3;
  rainSpeed = 1;

  const el = document.getElementById('word-rain');
  el.classList.remove('hidden');
  document.getElementById('rain-score').textContent = '0';
  document.getElementById('rain-lives').textContent = '❤️❤️❤️';
  document.getElementById('rain-input').value = '';
  document.getElementById('rain-input').focus();

  const canvas = document.getElementById('rain-canvas');
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight - 80;

  // Spawn words periodically
  rainSpawnInterval = setInterval(() => {
    if (!rainActive) return;
    spawnRainWord(canvas);
  }, Math.max(800, 2500 - rainScore * 30));

  spawnRainWord(canvas);

  rainLastFrame = Date.now();
  rainAnimFrame = requestAnimationFrame(() => rainLoop(canvas));
}

function getRandomDictWord() {
  const keys = Object.keys(dictionary);
  // Prefer shorter words (3-8 letters)
  let word;
  for (let tries = 0; tries < 20; tries++) {
    word = keys[Math.floor(Math.random() * keys.length)];
    if (word.length >= 3 && word.length <= 8) break;
  }
  return word;
}

function spawnRainWord(canvas) {
  const word = getRandomDictWord();
  const def = dictionary[word] || '';
  const shortDef = def.length > 40 ? def.substring(0, 37) + '...' : def;
  rainWords.push({
    word,
    def: shortDef,
    x: 40 + Math.random() * (canvas.width - 200),
    y: -20,
    speed: (0.3 + Math.random() * 0.3) * rainSpeed
  });
}

function rainLoop(canvas) {
  if (!rainActive) return;

  const ctx = canvas.getContext('2d');
  const now = Date.now();
  const dt = now - rainLastFrame;
  rainLastFrame = now;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Update & draw words
  for (let i = rainWords.length - 1; i >= 0; i--) {
    const w = rainWords[i];
    w.y += w.speed * dt * 0.06;

    // Draw word
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText(w.word, w.x, w.y);

    // Draw definition below
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#666';
    ctx.fillText(w.def, w.x, w.y + 16);

    // Hit bottom
    if (w.y > canvas.height) {
      rainWords.splice(i, 1);
      rainLives--;
      updateRainLives();
      if (rainLives <= 0) { endWordRain(); return; }
    }
  }

  // Speed up over time
  rainSpeed = 1 + rainScore * 0.05;

  // Adjust spawn rate
  clearInterval(rainSpawnInterval);
  rainSpawnInterval = setInterval(() => {
    if (rainActive) spawnRainWord(canvas);
  }, Math.max(600, 2500 - rainScore * 40));

  rainAnimFrame = requestAnimationFrame(() => rainLoop(canvas));
}

function updateRainLives() {
  document.getElementById('rain-lives').textContent = '❤️'.repeat(Math.max(0, rainLives));
}

// Type to catch words
document.getElementById('rain-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    const input = document.getElementById('rain-input');
    const typed = input.value.trim().toUpperCase();
    input.value = '';

    if (!typed) return;

    // Find matching word
    const idx = rainWords.findIndex(w => w.word === typed);
    if (idx !== -1) {
      rainWords.splice(idx, 1);
      rainScore++;
      document.getElementById('rain-score').textContent = rainScore;
    }
  }
});

function endWordRain() {
  rainActive = false;
  clearInterval(rainSpawnInterval);
  cancelAnimationFrame(rainAnimFrame);

  const canvas = document.getElementById('rain-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Show final score
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 48px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${rainScore} words`, canvas.width / 2, canvas.height / 2 - 20);
  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#888';
  ctx.fillText('Press Enter to play again', canvas.width / 2, canvas.height / 2 + 30);

  document.getElementById('rain-input').addEventListener('keydown', function retry(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('rain-input').removeEventListener('keydown', retry);
      document.getElementById('word-rain').classList.add('hidden');
      startWordRain();
    }
  });
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
    if (canMakeWord(word, available)) results.push({ word, definition: dictionary[word], length: word.length });
  }
  results.sort((a, b) => a.length - b.length || a.word.localeCompare(b.word));
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
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  // Block if any overlay is open
  const overlays = ['boss-battle', 'victory-screen', 'boss-reveal', 'boss-victory',
                    'boss-defeat', 'final-victory', 'final-continue', 'word-rain'];
  for (const id of overlays) {
    if (!document.getElementById(id).classList.contains('hidden')) {
      // Boss reveal: any key continues
      if (id === 'boss-reveal') handleBossRevealContinue();
      // Final continue: any key continues
      if (id === 'final-continue') {
        document.getElementById('final-continue').classList.add('hidden');
        startWordRain();
      }
      return;
    }
  }

  const key = e.key;

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
      if (cursorCol < BOARD_SIZE - 1) cursorCol++;
      selectedTile = null; renderBoard(); renderRack(); scheduleWordSuggestions();
    } else if (board[cursorRow][cursorCol] !== letter) {
      const existing = board[cursorRow][cursorCol];
      board[cursorRow][cursorCol] = letter; rack.splice(rackIdx, 1); rack.push(existing);
      if (cursorCol < BOARD_SIZE - 1) cursorCol++;
      selectedTile = null; renderBoard(); renderRack(); scheduleWordSuggestions();
    }
    return;
  }

  if ((key === 'Backspace' || key === 'Delete') && boardFocused) {
    e.preventDefault();
    if (board[cursorRow][cursorCol]) {
      rack.push(board[cursorRow][cursorCol]); board[cursorRow][cursorCol] = null;
      if (key === 'Backspace' && cursorCol > 0) cursorCol--;
      selectedTile = null; renderBoard(); renderRack(); scheduleWordSuggestions();
    } else if (key === 'Backspace' && cursorCol > 0) {
      cursorCol--;
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
// Start
// ============================================================

init();
