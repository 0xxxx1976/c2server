/**
 * Telegram notification service using node-telegram-bot-api.
 * Bots are keyed by user id: telegramBots[userId].notify(...). Uses MongoDB (TelegramBot + Subscribers models).
 * @see https://github.com/yagop/node-telegram-bot-api
 */

const TelegramBotApi = require("node-telegram-bot-api");
const subscriberStore = require("./subscriberStore");
const TelegramBotModel = require("../models/TelegramBot");

const DEFAULT_WELCOME_MESSAGE =
  "✅ You are now subscribed to notifications.\n\n" +
  "You will receive health check alerts and other updates. Use /start <unit> to subscribe to a specific unit.";

/** Registry: userId -> bot API object */
const telegramBots = Object.create(null);

/**
 * Create a bot instance and register it under userId. Upserts TelegramBot in MongoDB so subscribers can be stored.
 * @param {string} userId - Bot id (uuid)
 * @param {string} token - Telegram bot token
 * @param {string} [username] - Display name (defaults to userId)
 * @returns {Promise<object>} Bot API
 */
async function createBot(userId, token, username) {
  if (!userId || !token) {
    throw new Error("createBot requires userId and token");
  }
  const botKey = String(userId);
  if (telegramBots[botKey]) {
    return telegramBots[botKey];
  }

  // Ensure bot exists in MongoDB so subscriberStore can resolve it
  await TelegramBotModel.findOneAndUpdate(
    { uuid: botKey },
    { $set: { username: username || botKey, uuid: botKey, token } },
    { upsert: true, new: true }
  );

  const bot = new TelegramBotApi(token, { polling: true });

  bot.on("message", (msg) => {
    const text = (msg.text || "").trim();
    if (text.startsWith("/start")) return;
    const chatId = String(msg.chat.id);
    subscriberStore.add(chatId, "_", botKey).catch((err) => {
      console.error(`TelegramBot[${botKey}] add subscriber:`, err.message);
    });
  });

  bot.onText(/\/start(?:\s+(.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const unit = (match && match[1]) ? match[1].trim() : "_";
    subscriberStore.add(String(chatId), unit, botKey).catch((err) => {
      console.error(`TelegramBot[${botKey}] add subscriber:`, err.message);
    });
    bot.sendMessage(chatId, DEFAULT_WELCOME_MESSAGE).catch((err) => {
      console.error(`TelegramBot[${botKey}] welcome error:`, err.message);
    });
  });

  bot.on("my_chat_member", (update) => {
    const status = update.new_chat_member?.status;
    if (status === "left" || status === "kicked") {
      subscriberStore.remove(String(update.chat.id), undefined, botKey).catch((err) => {
        console.error(`TelegramBot[${botKey}] remove subscriber:`, err.message);
      });
    }
  });

  bot.on("polling_error", (err) => {
    console.error(`TelegramBot[${botKey}] polling_error:`, err.message);
  });

  function getSubscribers(unit) {
    return subscriberStore.getSubscribers(botKey, unit);
  }

  async function isConfigured() {
    const subs = await getSubscribers();
    return Boolean(bot && subs.length > 0);
  }

  async function sendMessage(chatId, text, options = {}) {
    if (!bot) return null;
    return bot.sendMessage(chatId, text, {
      disable_notification: options.disableNotification,
      parse_mode: options.parseMode,
    });
  }

  async function notify(message, options = {}) {
    if (!bot) {
      console.warn(`TelegramBot[${botKey}]: Skipping (bot not configured)`);
      return null;
    }
    const chatIds =
      options.chatId != null ? [String(options.chatId)] : await getSubscribers(options.unit);
    if (chatIds.length === 0) {
      console.warn(
        `TelegramBot[${botKey}]: No subscribers to notify` +
          (options.unit != null ? ` for unit "${options.unit}"` : "")
      );
      return null;
    }
    const results = [];
    for (const chatId of chatIds) {
      try {
        const sent = await sendMessage(chatId, message, options);
        results.push(sent);
      } catch (err) {
        console.error(`TelegramBot[${botKey}]: Failed to notify ${chatId}:`, err.message);
        results.push(null);
      }
    }
    return results;
  }

  async function sendWelcomeTo(chatId) {
    if (!bot) return null;
    try {
      return await sendMessage(chatId, DEFAULT_WELCOME_MESSAGE);
    } catch (err) {
      console.error(`TelegramBot[${botKey}] sendWelcomeTo error:`, err.message);
      return null;
    }
  }

  const api = {
    get bot() {
      return bot;
    },
    getSubscribers,
    isConfigured,
    sendMessage,
    notify,
    sendWelcomeTo,
  };

  telegramBots[botKey] = api;
  return api;
}

function getBot(userId) {
  if (userId == null) return null;
  return telegramBots[String(userId)] || null;
}

/**
 * Load bots from MongoDB (TelegramBot collection). Use after DB connect.
 * @returns {Promise<{ created: string[], skipped: number }>}
 */
async function loadBotsFromDB() {
  const created = [];
  let skipped = 0;
  try {
    const docs = await TelegramBotModel.find().select("+token").lean();
    for (const doc of docs) {
      if (!doc.uuid || !doc.token) {
        skipped += 1;
        continue;
      }
      try {
        await createBot(doc.uuid, doc.token, doc.username);
        created.push(doc.username ? `${doc.username} (${doc.uuid})` : doc.uuid);
      } catch (err) {
        console.error(`Telegram: Failed to create bot ${doc.uuid}:`, err.message);
        skipped += 1;
      }
    }
  } catch (err) {
    console.error("Telegram loadBotsFromDB error:", err.message);
  }
  return { created, skipped };
}

module.exports = {
  telegramBots,
  getBot,
  createBot,
  loadBotsFromDB,
  subscriberStore,
};
