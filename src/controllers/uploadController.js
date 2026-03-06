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
    // Save the file with the original filename (basename)
    cb(null, path.basename(file.originalname));
  },
});

// Initialize multer without any file size limit
const upload = multer({ storage: storage }).array("files", 1000);

/**
 * Handle file upload with hostname
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function handleFileUpload(req, res) {
  // Extract hostname from headers
  const hostname = req.headers["x-hostname"] || "unknown-host";
  console.log("Received hostname:", hostname);

  // Process the file upload
  upload(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        status: "error",
        message: "Error uploading files",
        error: err.message,
      });
    }

    // req.body.savePaths is expected to be an array of target paths
    let savePaths = req.body.savePaths;

    if (!savePaths) {
      return res.status(400).json({
        status: "error",
        message: "No savePaths provided",
      });
    }

    // If sent as JSON string, parse it
    if (typeof savePaths === "string") {
      try {
        savePaths = JSON.parse(savePaths);
      } catch (parseErr) {
        return res.status(400).json({
          message: "Invalid savePaths JSON",
        });
      }
    }

    const results = [];

    req.files.forEach((file, idx) => {
      try {
        console.log(`Processing file ${idx + 1}/${req.files.length}:`, file.originalname);

        // Get target path for this file
        let targetPath = savePaths[idx];
        if (!targetPath) {
          targetPath = file.originalname; // fallback to original name
        }

        console.log("Original targetPath:", targetPath);
        
        // Normalize path for cross-platform compatibility
        // Remove Windows drive letters (C:, D:, etc.) - only remove if it's a drive letter pattern
        if (process.platform === 'win32') {
          targetPath = targetPath.replace(/^[A-Za-z]:/, ''); // Remove drive letter
        }
        
        // Remove leading slashes/backslashes to make path relative
        // This prevents absolute paths from being used (security)
        targetPath = targetPath.replace(/^[/\\]+/, '');
        
        // Replace backslashes with forward slashes for cross-platform compatibility
        targetPath = targetPath.replace(/\\/g, '/');
        
        // Remove any path traversal attempts (../, ..\, etc.)
        targetPath = targetPath.replace(/\.\./g, '');
        
        // Remove any remaining colons (Windows drive letter remnants)
        targetPath = targetPath.replace(/:/g, '');
        
        // Sanitize filename - remove any invalid characters
        targetPath = targetPath.replace(/[<>"|?*\x00-\x1f]/g, '_');
        
        // Join with uploads directory (always relative)
        const uploadsRoot = path.join(__dirname, "../../uploads", hostname);
        targetPath = path.join(uploadsRoot, targetPath);
        
        // Normalize the final path (resolve .. and . segments)
        targetPath = path.normalize(targetPath);
        
        // Security check: ensure the final path is still within uploads root
        const resolvedUploadsRoot = path.resolve(uploadsRoot);
        const resolvedTargetPath = path.resolve(targetPath);
        if (!resolvedTargetPath.startsWith(resolvedUploadsRoot)) {
          throw new Error(`Path traversal detected: ${targetPath}`);
        }

        console.log("Final targetPath:", targetPath);
        
        // Ensure directory exists
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });

        // Move file from temp -> final destination
        fs.renameSync(file.path, targetPath);

        results.push({
          original: file.originalname,
          savedTo: targetPath,
        });
      } catch (moveErr) {
        console.error("Error moving file:", moveErr);
        results.push({
          original: file.originalname,
          error: moveErr.message,
        });
      }
    });

    res.json({
      message: "Files uploaded and moved successfully",
      files: results,
      receivedHostname: hostname,
      totalFiles: req.files.length,
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

