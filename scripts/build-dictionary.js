/**
 * Builds the dictionary.json for Bananagrams.
 *
 * If a Word Forge scrabble.db exists nearby, exports from that.
 * Otherwise, downloads a word list and validates against playscrabble.com API.
 *
 * Usage: node scripts/build-dictionary.js [path-to-scrabble.db]
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'data', 'dictionary.json');
const HMAC_KEY = 'F1BF664719899AF093A75D159430C9F4E32540A83CE36C94D2113B0A6D502A44DBAAEC6F8726F6A2';

// Try to find and use existing scrabble.db
const dbPaths = [
  process.argv[2],
  path.join(__dirname, '..', '..', 'test_claude', 'scrabble.db'),
  path.join(__dirname, '..', 'scrabble.db'),
].filter(Boolean);

async function main() {
  for (const dbPath of dbPaths) {
    if (fs.existsSync(dbPath)) {
      console.log('Found scrabble.db at:', dbPath);
      const Database = require('better-sqlite3');
      const db = new Database(dbPath, { readonly: true });
      const words = db.prepare("SELECT word, definition FROM words WHERE definition IS NOT NULL AND definition != ''").all();
      const dict = {};
      words.forEach(w => { dict[w.word.toUpperCase()] = w.definition; });
      fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
      fs.writeFileSync(OUTPUT, JSON.stringify(dict));
      console.log(`Exported ${Object.keys(dict).length} words to ${OUTPUT}`);
      db.close();
      return;
    }
  }

  console.log('No scrabble.db found. Run the Word Forge scraper first, then re-run this script.');
  console.log('Or provide a path: node scripts/build-dictionary.js /path/to/scrabble.db');
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
