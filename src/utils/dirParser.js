/**
 * Parse directory listing output (server-side)
 */
const { joinWindowsPath } = require("./pathUtils");

function parseDirectoryOutput(output, platform, currentPath) {
  if (!output) return { directories: [], files: [] };

  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const directories = [];
  const files = [];

  if (platform === "win32") {
    parseWindowsOutput(lines, currentPath || "", directories, files);
  } else {
    parseUnixOutput(lines, currentPath || "", directories, files);
  }

  return { directories, files };
}

function parseWindowsOutput(lines, currentPath, directories, files) {
  if (currentPath === "") {
    lines.forEach((line) => {
      const match = line.match(/^([A-Z]:)/);
      if (match) {
        directories.push({
          name: match[1],
          path: match[1] + "\\",
          isDirectory: true,
          isDrive: true,
        });
      }
    });
  } else {
    lines.forEach((line) => {
      const dirMatch = line.match(
        /^[\d\.\-\/]+\s+[\d:]+\s*(?:[AP]M)?\s+<DIR>\s+(.+)$/i
      );
      if (dirMatch && dirMatch[1] !== "." && dirMatch[1] !== "..") {
        directories.push({
          name: dirMatch[1].trim(),
          path: joinWindowsPath(currentPath, dirMatch[1].trim()),
          isDirectory: true,
        });
        return;
      }
      const fileMatch = line.match(
        /^[\d\.\-\/]+\s+[\d:]+\s*(?:[AP]M)?\s+([\d,\.]+)\s+(.+)$/i
      );
      if (fileMatch) {
        files.push({
          name: fileMatch[2].trim(),
          path: joinWindowsPath(currentPath, fileMatch[2].trim()),
          size: fileMatch[1].replace(/[,\.]/g, ""),
          isDirectory: false,
        });
      }
    });
  }
}

function parseUnixOutput(lines, currentPath, directories, files) {
  lines.forEach((line) => {
    if (line.startsWith("total")) return;
    const parts = line.split(/\s+/);
    if (parts.length >= 9) {
      const permissions = parts[0];
      const size = parts[4];
      const name = parts.slice(8).join(" ");
      if (name === "." || name === "..") return;
      const isDirectory = permissions.startsWith("d");
      const entry = {
        name,
        path: currentPath === "/" ? `/${name}` : `${currentPath}/${name}`,
        size: isDirectory ? "-" : size,
        isDirectory,
        permissions,
      };
      if (isDirectory) {
        directories.push(entry);
      } else {
        files.push(entry);
      }
    }
  });
}

module.exports = {
  parseDirectoryOutput,
};
