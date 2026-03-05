/**
 * Socket event names - must match mmclient and mmscript.
 */
const SOCKET_EVENTS = {
  DISCONNECT: 'disconnect',
  ADMIN: 'admin',
  CLIENT: 'client',
  CLIENTS_LIST: 'clients-list',
  CLIENT_CONNECTED: 'client-connected',
  CLIENT_DISCONNECTED: 'client-disconnected',
  COMMAND: 'command',
  COMMAND_SENT: 'command-sent',
  COMMAND_RESULT: 'command-result',
  COMMAND_ERROR: 'command-error',
  SEND_COMMAND: 'send-command',
};

module.exports = { SOCKET_EVENTS };
