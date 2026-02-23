/**
 * Telegram notification service (AthenaBot) using node-telegram-bot-api.
 * Uses polling to receive /start and messages; subscribers stored in JSON file.
 * @see https://github.com/yagop/node-telegram-bot-api
 */

const TelegramBot = require('node-telegram-bot-api');
const subscriberStore = require('./subscriberStore');

/** Default message sent when a user subscribes via /start */
const DEFAULT_WELCOME_MESSAGE =
  '✅ You are now subscribed to AthenaBot notifications.\n\n' +
  'You will receive health check alerts and other updates from the server.';

const token = process.env.TELEGRAM_BOT_TOKEN || process.env.ATHENABOT_TOKEN;
let bot = null;

if (token) {
  bot = new TelegramBot(token, { polling: true });

  // Any message → register chat as subscriber
  bot.on('message', (msg) => {
    const chatId = String(msg.chat.id);
    subscriberStore.add(chatId);
  });

  // /start → send welcome (already added in 'message')
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, DEFAULT_WELCOME_MESSAGE).catch((err) => {
      console.error('AthenaBot welcome error:', err.message);
    });
  });

  // Bot removed from chat → remove from subscribers
  bot.on('my_chat_member', (update) => {
    const status = update.new_chat_member?.status;
    if (status === 'left' || status === 'kicked') {
      subscriberStore.remove(String(update.chat.id));
    }
  });

  bot.on('polling_error', (err) => {
    console.error('AthenaBot polling_error:', err.message);
  });
}

/**
 * Get current subscriber chat IDs from store.
 */
function getSubscribers() {
  return subscriberStore.getSubscribers();
}

function isConfigured() {
  return Boolean(bot && getSubscribers().length > 0);
}

/**
 * Send a message to one chat (uses bot.sendMessage).
 */
async function sendMessage(chatId, text, options = {}) {
  if (!bot) return null;
  return bot.sendMessage(chatId, text, {
    disable_notification: options.disableNotification,
    parse_mode: options.parseMode,
  });
}

/**
 * Notify all subscribers. No-op if bot not configured.
 */
async function notify(message, options = {}) {
  if (!bot) {
    console.warn('AthenaBot: Skipping notification (bot not configured)');
    return null;
  }
  const chatIds = options.chatId != null ? [String(options.chatId)] : getSubscribers();
  if (chatIds.length === 0) {
    console.warn('AthenaBot: No subscribers to notify');
    return null;
  }
  const results = [];
  for (const chatId of chatIds) {
    try {
      const sent = await sendMessage(chatId, message, options);
      results.push(sent);
    } catch (err) {
      console.error(`AthenaBot: Failed to notify ${chatId}:`, err.message);
      results.push(null);
    }
  }
  return results;
}

/**
 * Send welcome message to a chat (e.g. when they subscribe).
 */
async function sendWelcomeTo(chatId) {
  if (!bot) return null;
  try {
    return await sendMessage(chatId, DEFAULT_WELCOME_MESSAGE);
  } catch (err) {
    console.error('AthenaBot sendWelcomeTo error:', err.message);
    return null;
  }
}

const athenaBot = {
  get bot() {
    return bot;
  },
  getSubscribers,
  isConfigured,
  sendMessage,
  notify,
  sendWelcomeTo,
};

module.exports = {
  athenaBot,
  subscriberStore,
};
