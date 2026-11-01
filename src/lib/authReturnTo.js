// Shared by the auth pages (Login, Register). Keep the redirect
// validation in one place — it is security-sensitive and easy to drift.

// Resolve ?returnTo= to a safe same-origin path, else "/".
//
// The same-origin check alone is not enough: a value like /.//evil.com or
// /\evil.com parses same-origin but normalizes to a protocol-relative
// //evil.com when assigned to location.href — an open redirect. So require the
// resolved path to be exactly one leading slash (no "//" prefix, no backslash).
export function safeReturnTo() {
  const raw = new URLSearchParams(window.location.search).get("returnTo");
  if (!raw) return "/";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    let path = url.pathname + url.search;
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
    const basePath = import.meta.env.BASE_URL || "/";
    const basePrefix = basePath.endsWith("/") ? basePath : `${basePath}/`;
    if (basePath !== "/" && (path === basePath || path.startsWith(basePrefix))) {
      path = `/${path.slice(basePath.length)}`;
      if (path === "") path = "/";
    }
    return path;
  } catch {
    return "/";
  }
}

// Turn an app route into an absolute URL while respecting Vite's GitHub Pages
// basename (for example, /Poverty-Analysis-Reduction/).
export function appAbsoluteUrl(path = "/") {
  const basePath = import.meta.env.BASE_URL || "/";
  const basePrefix = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const requestedPath = String(path || "/");
  const normalizedPath = requestedPath.startsWith(basePrefix)
    ? requestedPath.slice(basePath.length)
    : requestedPath.replace(/^\/+/, "");
  return new URL(`${basePrefix}${normalizedPath}`, window.location.origin).toString();
}
