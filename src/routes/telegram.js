const express = require("express");
const router = express.Router();
const telegramController = require("../controllers/telegramController");
const asyncHandler = require("../utils/asyncHandler");

/**
 * POST /telegram/bots
 * Register a Telegram bot (username, uuid, token). Bot is saved to MongoDB and started immediately.
 */
router.post("/bots/register", asyncHandler(telegramController.registerBot));

module.exports = router;
