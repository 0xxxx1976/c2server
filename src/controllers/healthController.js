const healthService = require("../services/healthService");
const Health = require("../models/Health");

/**
 * Health check endpoint handler
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function healthCheck(req, res) {
  // Get system information from client (sent as query parameters for GET or in body for POST)
  const systemInfo = Object.keys(req.query).length > 0 ? req.query : (req.body || {});
  
  // Get remote IP address
  const ipAddress = healthService.getRemoteIP(req);
  // Unit / bot id for scoped Telegram (x-u: use bot telegramBots[unit], notify that unit's subscribers)
  const unit = req.headers['x-u'] || systemInfo.hostname || null;

  // Get Socket.IO instance from app
  const io = req.app.get('io');

  // Process health check data (with io for notifications, unit for Telegram)
  const healthData = await healthService.processHealthCheck(systemInfo, ipAddress, io, unit);
  
  res.json(healthData);
}

/**
 * Get all health check records
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function getHealthRecords(req, res) {
  try {
    const { limit = 50, skip = 0, hostname } = req.query;
    
    const query = {};
    if (hostname) {
      query.hostname = hostname;
    }
    
    const healthRecords = await Health.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();
    
    const total = await Health.countDocuments(query);
    
    res.json({
      data: healthRecords,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Get health record by ID
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function getHealthRecordById(req, res) {
  try {
    const { id } = req.params;
    const healthRecord = await Health.findById(id).lean();
    
    if (!healthRecord) {
      const AppError = require("../utils/AppError");
      throw new AppError("Health record not found", 404);
    }
    
    res.json(healthRecord);
  } catch (error) {
    throw error;
  }
}

module.exports = {
  healthCheck,
  getHealthRecords,
  getHealthRecordById,
};
