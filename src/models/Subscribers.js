const mongoose = require("mongoose");

const subscriberEntrySchema = new mongoose.Schema(
  {
    chatId: { type: String, required: true, trim: true },
    unit: { type: String, default: "_", trim: true },
  },
  { _id: false }
);

const subscribersSchema = new mongoose.Schema(
  {
    telegramBot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TelegramBot",
      required: true,
      unique: true,
    },
    subscribers: {
      type: [subscriberEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const Subscribers = mongoose.model("Subscribers", subscribersSchema);

module.exports = Subscribers;
