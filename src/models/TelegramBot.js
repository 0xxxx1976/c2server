const mongoose = require("mongoose");

const telegramBotSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
    },
    uuid: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    token: {
      type: String,
      required: true,
      select: false, // Exclude from JSON/queries by default (sensitive)
    },
  },
  {
    timestamps: true,
  }
);

telegramBotSchema.index({ uuid: 1 });

// Ensure token is not leaked when converting to JSON
telegramBotSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.token;
  return obj;
};

const TelegramBot = mongoose.model("TelegramBot", telegramBotSchema);

module.exports = TelegramBot;
