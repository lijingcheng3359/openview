export interface FsChangedPayload {
  root: string;
  paths: string[];
  rescan: boolean;
}

export function normalizeFsPath(path: string): string {
  if (path === "/") return path;
  return path.replace(/\/+$/, "");
}

export function parentFsPath(path: string): string {
  const normalized = normalizeFsPath(path);
  const separator = normalized.lastIndexOf("/");
  if (separator <= 0) return "/";
  return normalized.slice(0, separator);
}

export function payloadBelongsToRoot(
  payload: FsChangedPayload,
  root: string | null,
): boolean {
  return root !== null && normalizeFsPath(payload.root) === normalizeFsPath(root);
}

export function isDirectoryListingAffected(
  directory: string,
  payload: FsChangedPayload,
): boolean {
  if (payload.rescan) return true;
  const normalizedDirectory = normalizeFsPath(directory);
  return payload.paths.some((path) => {
    const normalizedPath = normalizeFsPath(path);
    return normalizedPath === normalizedDirectory || parentFsPath(normalizedPath) === normalizedDirectory;
  });
}

export function isActiveFileAffected(
  activePath: string,
  payload: FsChangedPayload,
): boolean {
  return payload.rescan || payload.paths.includes(activePath);
}

export function isPathWithinRoot(path: string, root: string): boolean {
  const normalizedPath = normalizeFsPath(path);
  const normalizedRoot = normalizeFsPath(root);
  if (normalizedRoot === "/") return normalizedPath.startsWith("/");
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

export function pathWithinRoot(root: string, relativePath: string): string {
  const normalizedRoot = normalizeFsPath(root);
  return normalizedRoot === "/" ? `/${relativePath}` : `${normalizedRoot}/${relativePath}`;
}

export function isGitHistoryMetadataPath(path: string, root: string): boolean {
  const normalizedPath = normalizeFsPath(path);
  const gitDirectory = pathWithinRoot(root, ".git");
  const refsDirectory = `${gitDirectory}/refs`;
  return normalizedPath === `${gitDirectory}/HEAD`
    || normalizedPath === `${gitDirectory}/packed-refs`
    || normalizedPath === refsDirectory
    || normalizedPath.startsWith(`${refsDirectory}/`);
}

export function hasGitHistoryMetadataChange(
  payload: FsChangedPayload,
  root: string,
): boolean {
  return payload.rescan
    || payload.paths.some((path) => isGitHistoryMetadataPath(path, root));
}

export function hasWorkingTreeChange(
  payload: FsChangedPayload,
  root: string,
): boolean {
  if (payload.rescan || hasGitHistoryMetadataChange(payload, root)) return true;
  const gitDirectory = pathWithinRoot(root, ".git");
  return payload.paths.some((path) => {
    const normalizedPath = normalizeFsPath(path);
    if (!isPathWithinRoot(normalizedPath, root)) return false;
    if (!isPathWithinRoot(normalizedPath, gitDirectory)) return true;
    return normalizedPath === `${gitDirectory}/index`
      || normalizedPath === `${gitDirectory}/index.lock`
      || normalizedPath === `${gitDirectory}/HEAD.lock`;
  });
}
