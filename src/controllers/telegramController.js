const AppError = require("../utils/AppError");
const TelegramBot = require("../models/TelegramBot");
const { createBot } = require("../services/telegramService");

/**
 * Register a Telegram bot. Saves to MongoDB and starts the bot immediately.
 * POST body: { username, uuid, token }
 *
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function registerBot(req, res) {
  const { username, uuid, token } = req.body;

  const uuidStr = uuid != null ? String(uuid).trim() : "";
  const tokenStr = token != null ? String(token).trim() : "";
  const usernameStr = username != null ? String(username).trim() : uuidStr || "bot";

  if (!uuidStr) {
    throw new AppError("uuid is required", 400);
  }
  if (!tokenStr) {
    throw new AppError("token is required", 400);
  }

  const existing = await TelegramBot.findOne({ uuid: uuidStr }).select("_id").lean();
  const isUpdate = Boolean(existing);

  await TelegramBot.findOneAndUpdate(
    { uuid: uuidStr },
    { $set: { username: usernameStr, uuid: uuidStr, token: tokenStr } },
    { upsert: true, new: true, runValidators: true }
  );

  await createBot(uuidStr, tokenStr, usernameStr);

  res.status(isUpdate ? 200 : 201).json({
    message: isUpdate ? "Telegram bot updated and restarted" : "Telegram bot registered",
    bot: {
      username: usernameStr,
      uuid: uuidStr,
    },
  });
}

module.exports = {
  registerBot,
};
