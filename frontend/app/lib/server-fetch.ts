const BFF_URL = process.env.BFF_URL || "http://127.0.0.1:3401";

export function serverFetch(path: string, cookie: string, init?: RequestInit) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (init?.body && !(init.body instanceof FormData)) {
    headers["content-type"] = "application/json";
  }

  return fetch(`${BFF_URL}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> || {}) },
    credentials: "include",
  });
}
