const { Server } = require('socket.io');
const { SOCKET_EVENTS } = require('../config/socketEvents');

/** When an admin registers with this `uuid`, they see every client and may command any tenant. */
const ADMIN_UUID_ALL_CLIENTS = '*';

const clients = new Map();
const admins = new Map();
const pendingCommands = new Map();

function generateCommandId() {
  return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Emit to admins.
 * - If `clientUuid` is null/undefined/empty, emit to every admin (e.g. health-check).
 * - Otherwise emit to admins with the same tenant uuid and to super-admins (`ADMIN_UUID_ALL_CLIENTS`).
 */
function broadcastToAdmins(io, clientUuid, event, data) {
  const toEveryone = clientUuid == null || clientUuid === '';
  admins.forEach((entry) => {
    const s = typeof entry === 'object' && entry?.socket ? entry.socket : entry;
    const entryUuid = typeof entry === 'object' && entry?.uuid != null ? entry.uuid : undefined;
    if (toEveryone) {
      s.emit(event, data);
      return;
    }
    if (entryUuid === ADMIN_UUID_ALL_CLIENTS || entryUuid === clientUuid) {
      s.emit(event, data);
    }
  });
}

/**
 * @param {*} uuid From the admin socket. Use tenant uuid to list only that tenant’s workers, or
 *   `ADMIN_UUID_ALL_CLIENTS` (`'*'`) to list every connected client.
 */
function getAllClientsInfo(uuid) {
  const clientsInfo = [];

  if (uuid == null || uuid === '') {
    return [];
  }

  if (uuid === ADMIN_UUID_ALL_CLIENTS) {
    clients.forEach((client, socketId) => {
      clientsInfo.push({
        socketId,
        info: client.info,
      });
    });
    return clientsInfo;
  }

  clients.forEach((client, socketId) => {
    if (client.uuid === uuid) {
      clientsInfo.push({
        socketId,
        info: client.info,
      });
    }
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

      const uuid = info.uuid;
      clients.set(socket.id, { socket, info, ip, uuid });
      broadcastToAdmins(io, uuid, SOCKET_EVENTS.CLIENT_CONNECTED, {
        socketId: socket.id,
        info,
      });
    };

    const registerAdmin = (payload) => {
      const uuid = payload && (payload.uuid != null ? payload.uuid : (payload.adminId ?? payload.adminID));

      console.log('registerAdmin', uuid);
      console.log('registerAdmin', payload);
      admins.set(socket.id, { socket, uuid });
      socket.emit(SOCKET_EVENTS.CLIENTS_LIST, getAllClientsInfo(uuid));
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
        const adminEntry = admins.get(socket.id);
        const adminUuid = adminEntry && typeof adminEntry === 'object' && adminEntry.uuid != null ? adminEntry.uuid : undefined;
        const isSuperAdmin = adminUuid === ADMIN_UUID_ALL_CLIENTS;
        if (!isSuperAdmin && adminUuid != null && client.uuid != null && client.uuid !== adminUuid) {
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
      const adminEntry = admins.get(pending.admin);
      const adminSocket = adminEntry && typeof adminEntry === 'object' && adminEntry.socket ? adminEntry.socket : adminEntry;
      if (adminSocket) {
        adminSocket.emit(SOCKET_EVENTS.COMMAND_RESULT, data);
      }
    };

    const handleDisconnect = () => {
      if (clients.has(socket.id)) {
        const rec = clients.get(socket.id);
        const clientInfo = rec.info;
        const clientUuid = rec.uuid;
        clients.delete(socket.id);
        broadcastToAdmins(io, clientUuid, SOCKET_EVENTS.CLIENT_DISCONNECTED, {
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
  ADMIN_UUID_ALL_CLIENTS,
  clients,
  admins,
  pendingCommands,
};
