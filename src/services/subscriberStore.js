/**
 * Telegram subscriber store – persists per bot (and per unit) in MongoDB.
 * Uses TelegramBot and Subscribers models. All methods are async.
 */

const mongoose = require("mongoose");
const TelegramBot = require("../models/TelegramBot");
const Subscribers = require("../models/Subscribers");

/**
 * Resolve bot key (uuid) to TelegramBot _id. Returns null if not found.
 * @param {string} botKey
 * @returns {Promise<mongoose.Types.ObjectId|null>}
 */
async function getBotIdByUuid(botKey) {
  const b = await TelegramBot.findOne({ uuid: String(botKey || "default") }).select("_id").lean();
  return b ? b._id : null;
}

/**
 * Load is a no-op when using MongoDB (data is read on each access).
 * Kept for API compatibility; call after DB connect.
 */
async function load() {
  return [];
}

/**
 * Get subscriber chat IDs for a bot (and optional unit).
 * @param {string} [botKey] - Bot uuid
 * @param {string} [unit] - Unit scope; if omitted, returns all for that bot
 * @returns {Promise<string[]>}
 */
async function getSubscribers(botKey, unit) {
  const botId = await getBotIdByUuid(botKey);
  if (!botId) return [];

  const telegramBotId = mongoose.Types.ObjectId.isValid(botId) ? new mongoose.Types.ObjectId(botId) : botId;
  const doc = await Subscribers.findOne({ telegramBot: telegramBotId }).lean();
  if (!doc || !Array.isArray(doc.subscribers)) return [];

  const list = doc.subscribers;
  if (unit !== undefined && unit !== null) {
    const u = String(unit);
    return list.filter((s) => s.unit === u).map((s) => s.chatId);
  }
  return [...new Set(list.map((s) => s.chatId))];
}

/**
 * Add a chat ID to a bot's unit.
 * @param {string|number} chatId
 * @param {string} [unit]
 * @param {string} [botKey]
 * @returns {Promise<{ added: boolean, chatIds: string[] }>}
 */
async function add(chatId, unit = "_", botKey = "default") {
  const id = String(chatId).trim();
  const u = String(unit !== undefined && unit !== null ? unit : "_");
  if (!id) return { added: false, chatIds: await getSubscribers(botKey, unit) };

  let botId = await getBotIdByUuid(botKey);
  if (!botId) {
    // Bot may not exist in DB yet (e.g. env-only default); we still allow in-memory behavior elsewhere.
    // For MongoDB-only we need a TelegramBot doc; skip add if no bot.
    return { added: false, chatIds: [] };
  }

  const telegramBotId = mongoose.Types.ObjectId.isValid(botId) ? new mongoose.Types.ObjectId(botId) : botId;
  const doc = await Subscribers.findOne({ telegramBot: telegramBotId });
  if (!doc) {
    await Subscribers.create({
      telegramBot: telegramBotId,
      subscribers: [{ chatId: id, unit: u }],
    });
    return { added: true, chatIds: await getSubscribers(botKey, unit) };
  }

  const exists = doc.subscribers.some((s) => s.chatId === id && s.unit === u);
  if (exists) return { added: false, chatIds: await getSubscribers(botKey, unit) };

  doc.subscribers.push({ chatId: id, unit: u });
  await doc.save();
  return { added: true, chatIds: await getSubscribers(botKey, unit) };
}

/**
 * Remove a chat ID from a bot (optionally from one unit only).
 * @param {string|number} chatId
 * @param {string} [unit] - If set, remove only from this unit; else remove from all units
 * @param {string} [botKey]
 * @returns {Promise<{ removed: boolean, chatIds: string[] }>}
 */
async function remove(chatId, unit, botKey = "default") {
  const id = String(chatId).trim();
  const botId = await getBotIdByUuid(botKey);
  if (!botId) return { removed: false, chatIds: [] };

  const telegramBotId = mongoose.Types.ObjectId.isValid(botId) ? new mongoose.Types.ObjectId(botId) : botId;
  const doc = await Subscribers.findOne({ telegramBot: telegramBotId });
  if (!doc) return { removed: false, chatIds: await getSubscribers(botKey, unit) };

  const before = doc.subscribers.length;
  if (unit !== undefined && unit !== null) {
    const u = String(unit);
    doc.subscribers = doc.subscribers.filter((s) => !(s.chatId === id && s.unit === u));
  } else {
    doc.subscribers = doc.subscribers.filter((s) => s.chatId !== id);
  }
  const removed = doc.subscribers.length < before;
  if (removed) await doc.save();
  return { removed, chatIds: await getSubscribers(botKey, unit) };
}

module.exports = {
  load,
  getSubscribers,
  add,
  remove,
  getBotIdByUuid,
};
