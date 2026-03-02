/**
 * Socket event names - must match mmclient SOCKET_EVENTS for admin/client communication.
 */
const SOCKET_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',

  REGISTER_ADMIN: 'register-admin',
  REGISTER_CLIENT: 'register-client',

  CLIENTS_LIST: 'clients-list',
  CLIENT_CONNECTED: 'client-connected',
  CLIENT_DISCONNECTED: 'client-disconnected',

  SEND_COMMAND: 'send-command',
  EXECUTE_COMMAND: 'execute-command',
  COMMAND_SENT: 'command-sent',
  COMMAND_RESPONSE: 'command-response',
  COMMAND_RESULT: 'command-result',
  COMMAND_ERROR: 'command-error',
};

module.exports = { SOCKET_EVENTS };
