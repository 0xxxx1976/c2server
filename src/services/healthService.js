/**
 * Get geolocation information from IP address
 * @param {string} ip - IP address
 * @returns {Promise<object|null>} - Geolocation data or null on error
 */
async function getLocationFromIP(ip) {
  // Skip if IP is localhost, unknown, or invalid
  if (!ip || ip === 'unknown' || ip === '::1' || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return null;
  }

  try {
    // Use http:// as it works well according to user
    const url = `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Add timeout (10 seconds)
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.error(`IP API responded with status: ${response.status}`);
      return null;
    }

    const result = await response.json();
    
    if (result.status === 'success') {
      return {
        country: result.country,
        countryCode: result.countryCode,
        region: result.regionName,
        city: result.city,
        zip: result.zip,
        latitude: result.lat,
        longitude: result.lon,
        timezone: result.timezone,
        isp: result.isp,
        org: result.org
      };
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error fetching geolocation from IP:", error.message);
    return null;
  }
}

/**
 * Get remote IP address from request
 * @param {object} req - Express request object
 * @returns {string} - Clean IP address
 */
function getRemoteIP(req) {
  const remoteIp = req.ip || 
                   req.connection.remoteAddress || 
                   req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                   req.socket.remoteAddress ||
                   'unknown';
  
  // Clean IP address (remove IPv6 prefix if present)
  return remoteIp.replace(/^::ffff:/, '');
}

/**
 * Process health check data
 * @param {object} systemInfo - System information from client
 * @param {string} ipAddress - Remote IP address
 * @param {object} io - Socket.IO instance (optional, for notifications)
 * @returns {Promise<object>} - Health check data
 */
async function processHealthCheck(systemInfo, ipAddress, io = null) {
  // Get geolocation from IP address
  let remotePosition = null;
  try {
    remotePosition = await getLocationFromIP(ipAddress);
  } catch (geoError) {
    console.error("Error fetching geolocation:", geoError.message);
  }
  
  const healthData = {
    status: "ok",
    message: "Server is running",
    timestamp: new Date().toISOString(),
    hostname: systemInfo.hostname || 'unknown',
    username: systemInfo.username || 'unknown',
    osType: systemInfo.osType || 'unknown',
    osRelease: systemInfo.osRelease || 'unknown',
    ipAddress: ipAddress,
    remotePosition: remotePosition || 'Unknown'
  };

  // Save to MongoDB
  try {
    const Health = require("../models/Health");
    await Health.create({
      hostname: healthData.hostname,
      username: healthData.username,
      osType: healthData.osType,
      osRelease: healthData.osRelease,
      ipAddress: healthData.ipAddress,
      remotePosition: healthData.remotePosition,
      status: healthData.status,
      message: healthData.message,
    });

    // Emit socket notification to all admins
    if (io) {
      const { broadcastToAdmins } = require('./socketService');
      broadcastToAdmins(io, 'health-check', {
        ...healthData,
        createdAt: new Date().toISOString(),
      });
    }

    // Notify Telegram subscribers (AthenaBot)
    try {
      const { athenaBot } = require('./telegramService');
      const location = remotePosition && typeof remotePosition === 'object'
        ? [remotePosition.city, remotePosition.country].filter(Boolean).join(', ') || remotePosition.countryCode || '—'
        : '—';
      await athenaBot.notify([
        '🏥 Health check',
        `Host: ${healthData.hostname} (${healthData.username})`,
        `OS: ${healthData.osType} ${healthData.osRelease}`,
        `IP: ${ipAddress}`,
        `Location: ${location}`,
        `Time: ${healthData.timestamp}`,
      ].join('\n'));

    } catch (tgErr) {
      console.error('Health check Telegram notify:', tgErr.message);
    }
  } catch (dbError) {
    console.error("Error saving health data to database:", dbError.message);
    // Don't fail the health check if DB save fails
  }

  return healthData;
}

module.exports = {
  getLocationFromIP,
  getRemoteIP,
  processHealthCheck,
};

