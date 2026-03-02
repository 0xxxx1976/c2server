/**
 * Build shell commands for directory listing (server-side)
 */
const { normalizePathForCommand, escapePathForCommand } = require("./pathUtils");

function buildRootDirectoryCommand(platform) {
  if (platform === "win32") {
    return "wmic logicaldisk get name";
  }
  return "ls -la ~";
}

function buildListDirectoryCommand(path, platform) {
  if (platform === "win32") {
    if (!path || path === "") {
      return "wmic logicaldisk get name";
    }
    const normalizedPath = normalizePathForCommand(path);
    const escapedPath = escapePathForCommand(normalizedPath, platform);
    return `cd /d "${escapedPath}" && dir /a`;
  }
  const escapedPath = escapePathForCommand(path, platform);
  return `ls -la "${escapedPath}"`;
}

module.exports = {
  buildRootDirectoryCommand,
  buildListDirectoryCommand,
};
