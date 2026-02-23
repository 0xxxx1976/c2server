/**
 * Telegram subscriber store – persists chat IDs to a JSON file.
 * Load at startup; use API or direct calls to add/remove. Used by AthenaBot.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_PATH = path.join(process.cwd(), 'data', 'telegram-subscribers.json');

let filePath = DEFAULT_PATH;
let cache = { chatIds: [] };

/**
 * Set custom path for the subscribers file (e.g. for tests).
 * @param {string} p
 */
function setPath(p) {
  filePath = p;
}

/**
 * Load subscribers from JSON file. Creates file with empty list if missing.
 * @returns {string[]} - Array of chat IDs
 */
function load() {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      cache.chatIds = Array.isArray(data.chatIds) ? data.chatIds.map(String) : [];
    } else {
      cache.chatIds = [];
      save();
    }
  } catch (err) {
    console.error('subscriberStore load error:', err.message);
    cache.chatIds = [];
  }
  return [...cache.chatIds];
}

/**
 * Persist current subscribers to file.
 */
function save() {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify({ chatIds: cache.chatIds }, null, 2), 'utf8');
  } catch (err) {
    console.error('subscriberStore save error:', err.message);
    throw err;
  }
}

/**
 * Get current subscriber chat IDs (from cache; call load() first at startup).
 * @returns {string[]}
 */
function getSubscribers() {
  return [...cache.chatIds];
}

/**
 * Add a chat ID if not already present.
 * @param {string|number} chatId
 * @returns {{ added: boolean, chatIds: string[] }}
 */
function add(chatId) {
  const id = String(chatId).trim();
  if (!id) return { added: false, chatIds: getSubscribers() };
  if (cache.chatIds.includes(id)) return { added: false, chatIds: getSubscribers() };
  cache.chatIds.push(id);
  save();
  return { added: true, chatIds: getSubscribers() };
}

/**
 * Remove a chat ID.
 * @param {string|number} chatId
 * @returns {{ removed: boolean, chatIds: string[] }}
 */
function remove(chatId) {
  const id = String(chatId).trim();
  const before = cache.chatIds.length;
  cache.chatIds = cache.chatIds.filter((c) => c !== id);
  const removed = cache.chatIds.length < before;
  if (removed) save();
  return { removed, chatIds: getSubscribers() };
}

module.exports = {
  setPath,
  load,
  save,
  getSubscribers,
  add,
  remove,
};
