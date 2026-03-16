const express = require("express");
const router = express.Router();
const authRoutes = require("./auth");
const uploadRoutes = require("./upload");
const healthRoutes = require("./health");
const telegramRoutes = require("./telegram");

// Mount route modules
router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/upload", uploadRoutes);
router.use("/telegram", telegramRoutes);

module.exports = router;

