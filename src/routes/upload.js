const express = require("express");
const router = express.Router();
const uploadController = require("../controllers/uploadController");
const asyncHandler = require("../utils/asyncHandler");

/**
 * POST /upload
 * Upload files with hostname
 */
router.post("/", uploadController.handleFileUpload);

/**
 * GET /upload/d?t=<hashedstring>
 * Download by token; server maps hash → path in data/download-tokens.json
 */
router.get("/d/:payload", asyncHandler(uploadController.downloadFile));

/**
 * POST /upload/request
 * Request upload of file or directory from client
 */
router.post("/request", asyncHandler(uploadController.handleUploadRequest));

module.exports = router;

