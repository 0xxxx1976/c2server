const multer = require("multer");
const path = require("path");
const fs = require("fs");
const AppError = require("../utils/AppError");
const { clients, admins, pendingCommands } = require('../services/socketService');
const { SOCKET_EVENTS } = require('../config/socketEvents');
const downloadService = require('../services/downloadService');

// Temp folder in project root (same directory as package.json)
const TEMP_DIR = path.join(__dirname, "../../uploads", "temp");


// Set up multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const base = path.basename(file.originalname, ext) || 'file';
    const safeBase = base.replace(/[<>"|?*\x00-\x1f]/g, '_');
    const name = `${safeBase}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`;
    cb(null, name);
  },
});

// One file per POST (field name "files")
const upload = multer({ storage: storage }).single("files");

/**
 * Normalize client save path and move a single uploaded temp file into uploads tree.
 */
function moveUploadedFile(file, targetPathRaw, hostname, userID) {
  let targetPath = targetPathRaw || file.originalname;

  if (process.platform === "win32") {
    targetPath = targetPath.replace(/^([A-Za-z]):/, "$1");
  }

  targetPath = targetPath.replace(/^[/\\]+/, "");
  targetPath = targetPath.replace(/\\/g, "/");
  targetPath = targetPath.replace(/\.\./g, "");
  targetPath = targetPath.replace(/:/g, "");
  targetPath = targetPath.replace(/[<>"|?*\x00-\x1f]/g, "_");

  const uploadsRoot = path.join(__dirname, "../../uploads", userID, hostname);
  targetPath = path.join(uploadsRoot, targetPath);
  targetPath = path.normalize(targetPath);

  const resolvedUploadsRoot = path.resolve(uploadsRoot);
  const resolvedTargetPath = path.resolve(targetPath);
  if (!resolvedTargetPath.startsWith(resolvedUploadsRoot)) {
    throw new Error(`Path traversal detected: ${targetPath}`);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.renameSync(file.path, targetPath);

  return targetPath;
}

/**
 * Handle file upload with hostname (single file per request)
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function handleFileUpload(req, res) {
  const hostname = req.headers["x-hostname"] || "unknown-host";
  const userID = req.headers["x-u"] || "unknown-user";

  upload(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        status: "error",
        message: "Error uploading file",
        error: err.message,
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: "error",
        message: "No file received (expected one file in field \"files\")",
      });
    }

    let savePaths = req.body.savePaths;
    if (!savePaths) {
      return res.status(400).json({
        status: "error",
        message: "No savePaths provided",
      });
    }

    if (typeof savePaths === "string") {
      try {
        savePaths = JSON.parse(savePaths);
      } catch {
        return res.status(400).json({
          status: "error",
          message: "Invalid savePaths JSON",
        });
      }
    }

    if (!Array.isArray(savePaths) || savePaths.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "savePaths must be a non-empty JSON array",
      });
    }

    const targetPathRaw = savePaths[0];
    const results = [];

    try {
      const savedTo = moveUploadedFile(req.file, targetPathRaw, hostname, userID);
      results.push({
        original: req.file.originalname,
        savedTo,
      });
    } catch (moveErr) {
      console.error("Error moving file:", moveErr);
      results.push({
        original: req.file.originalname,
        error: moveErr.message,
      });
    }

    res.json({
      message: "File uploaded and moved successfully",
      files: results,
      receivedHostname: hostname,
      totalFiles: results.length,
    });
  });
}

/**
 * Generate a unique command ID
 * @returns {string} - Unique command ID
 */
function generateCommandId() {
  return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Handle upload request - forward to mmscript via socket
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function handleUploadRequest(req, res) {
  const { clientSocketId, adminSocketId, path } = req.body;

  if (!clientSocketId || !path) {
    throw new AppError('Missing required fields: clientSocketId and path', 400);
  }

  // Check if client is connected
  const client = clients.get(clientSocketId);
  if (!client) {
    throw new AppError('Client not found or disconnected', 404);
  }

  // Check if admin is connected (if adminSocketId provided)
  if (adminSocketId) {
    const admin = admins.get(adminSocketId);
    if (!admin) {
      throw new AppError('Admin not found or disconnected', 404);
    }
  }

  // Send upload command to mmscript via socket
  // The command will be a special JSON command that mmscript will recognize
  const command = JSON.stringify({
    type: 'upload',
    path: path
  });

  // Generate command ID
  const commandId = generateCommandId();
  
  // Track command in pendingCommands if adminSocketId is provided
  if (adminSocketId) {
    pendingCommands.set(commandId, {
      adminSocketId,
      clientSocketId
    });
  }
  
  // Send command to client (mmscript)
  client.socket.emit(SOCKET_EVENTS.EXECUTE_COMMAND, {
    commandId,
    command,
  });

  // Acknowledge immediately - upload happens in background
  res.json({
    message: 'Upload request sent to client',
    commandId,
    path,
    status: 'initiated'
  });
}

/**
 * Download by token: GET /upload/d?t=<hashedstring>
 * Server maps hash → { hostname, path } in data/download.json and sends the file.
 */
function downloadFile(req, res) {
  const t = req.params.payload;
  if (!t || typeof t !== 'string') {
    throw new AppError('Missing payload (param "payload" required)', 400);
  }

  const entry = downloadService.getPath(t);
  if (!entry) {
    throw new AppError('File not found', 404);
  }

  const absPath = path.join(__dirname, "../../data/files", entry);
  if (!fs.existsSync(absPath)) {
    throw new AppError('File not found', 404);
  }
  const stat = fs.statSync(absPath);
  if (!stat.isFile()) {
    throw new AppError('File not found', 400);
  }

  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(path.resolve(absPath), (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ message: 'Failed' });
    }
  });
}

module.exports = {
  handleFileUpload,
  handleUploadRequest,
  downloadFile,
};

