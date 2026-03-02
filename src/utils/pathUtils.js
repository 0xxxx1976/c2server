/**
 * Path utilities for directory listing (server-side)
 */
function joinWindowsPath(basePath, name) {
  const normalizedBase =
    basePath.endsWith("\\") && basePath.length > 3
      ? basePath.slice(0, -1)
      : basePath;
  if (normalizedBase.endsWith("\\")) {
    return `${normalizedBase}${name}`;
  }
  return `${normalizedBase}\\${name}`;
}

function normalizePathForCommand(path) {
  let normalizedPath = path.replace(/\\+/g, "\\").replace(/\\$/, "");
  if (
    !normalizedPath.endsWith("\\") &&
    normalizedPath.length > 0 &&
    normalizedPath.includes(":")
  ) {
    if (normalizedPath.match(/^[A-Z]:$/i)) {
      normalizedPath += "\\";
    }
  }
  return normalizedPath;
}

function escapePathForCommand(path, platform) {
  if (platform === "win32") {
    return path.replace(/"/g, '""');
  }
  return path.replace(/"/g, '\\"');
}

function getWindowsParentPath(currentPath) {
  const normalizedPath =
    currentPath.endsWith("\\") && currentPath.length > 3
      ? currentPath.slice(0, -1)
      : currentPath;
  const parts = normalizedPath.split("\\").filter(Boolean);
  if (parts.length <= 1) return null;
  parts.pop();
  if (parts.length === 1) return parts[0] + "\\";
  return parts.join("\\");
}

function getUnixParentPath(currentPath, homeDir) {
  if (currentPath === "/" || currentPath === homeDir) return null;
  const parts = currentPath.split("/").filter(Boolean);
  parts.pop();
  return "/" + parts.join("/");
}

module.exports = {
  joinWindowsPath,
  normalizePathForCommand,
  escapePathForCommand,
  getWindowsParentPath,
  getUnixParentPath,
};
