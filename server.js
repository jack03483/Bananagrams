const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(path.join(__dirname, 'data')));

// Serve the dictionary
const dictPath = path.join(__dirname, 'data', 'dictionary.json');
let dictionary = {};
if (fs.existsSync(dictPath)) {
  dictionary = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
}

app.get('/api/dictionary', (req, res) => {
  res.json({ wordCount: Object.keys(dictionary).length });
});

// Validate a word
app.get('/api/validate/:word', (req, res) => {
  const word = req.params.word.toUpperCase();
  const valid = word in dictionary;
  res.json({ word, valid, definition: valid ? dictionary[word] : null });
});

// Find words from given letters
app.post('/api/find-words', (req, res) => {
  const { letters } = req.body;
  if (!letters || !Array.isArray(letters)) {
    return res.status(400).json({ error: 'letters array required' });
  }

  const available = {};
  letters.forEach(l => {
    const u = l.toUpperCase();
    available[u] = (available[u] || 0) + 1;
  });

  const results = [];
  for (const word of Object.keys(dictionary)) {
    if (word.length < 2 || word.length > letters.length) continue;
    if (canMakeWord(word, available)) {
      results.push({ word, definition: dictionary[word], length: word.length });
    }
  }

  // Sort: shorter words first, then alphabetically
  results.sort((a, b) => a.length - b.length || a.word.localeCompare(b.word));

  res.json({ words: results, total: results.length });
});

function canMakeWord(word, available) {
  const needed = {};
  for (const ch of word) {
    needed[ch] = (needed[ch] || 0) + 1;
    if (needed[ch] > (available[ch] || 0)) return false;
  }
  return true;
}

app.listen(PORT, () => {
  console.log(`Bananagrams running at http://localhost:${PORT}`);
});
