require("dotenv").config();
const http = require("http");
const connectDB = require("./src/config/database");
const createApp = require("./src/server");
const { initializeSocketIO } = require("./src/services/socketService");
const { subscriberStore } = require("./src/services/telegramService");

const port = process.env.PORT || 3000;

/**
 * Start the server
 */
async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Load Telegram subscribers from data/telegram-subscribers.json
    subscriberStore.load();

    // Create Express app
    const app = createApp();

    // Create HTTP server
    const httpServer = http.createServer(app);

    // Initialize Socket.IO
    const io = initializeSocketIO(httpServer);

    // Start HTTP server
    httpServer.listen(port, () => {
      console.log("=".repeat(50));
      console.log(`🚀 HTTP Server running on http://localhost:${port}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`🔗 Auth endpoints: http://localhost:${port}/auth`);
      console.log(`📤 Upload endpoint: http://localhost:${port}/upload`);
      console.log(`❤️  Health check: http://localhost:${port}/health`);
      console.log(`🔌 Socket.IO server running on http://localhost:${port}`);
      console.log("=".repeat(50));
    });

    // Store io instance for potential use elsewhere
    app.set('io', io);
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Promise Rejection:", err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

// Start the server
startServer();
