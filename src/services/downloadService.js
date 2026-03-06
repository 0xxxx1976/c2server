const fs = require('fs');
const path = require('path');

const DEFAULT_PATH = path.join(process.cwd(), 'data', 'download.json');

let filePath = DEFAULT_PATH;
let cache = {};

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    cache = data || {};
  } catch (err) {
    console.error('downloadService load error:', err.message);
    cache = {};
  }
}

function getPath(hash) {
  return cache[hash];
}

module.exports = { getPath, load };