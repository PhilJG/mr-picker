/**
 * Thin wrapper over the Express API. All paths are relative, resolved by the
 * Vite dev proxy — no base URL, no CORS.
 */
const qs = (params = {}) => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, value);
    }
  }

  const string = search.toString();
  return string ? `?${string}` : "";
};

const request = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
};

export const api = {
  sections: () => request("/api/sections"),

  /** Fetches a NYT section and scores anything new — the slow, paid call. */
  scoreSection: (section, params) =>
    request(`/api/articles/${section}${qs(params)}`),

  headlines: (params) => request(`/api/headlines${qs(params)}`),

  prompts: () => request("/api/prompts"),

  savePrompt: (body) =>
    request("/api/prompts", { method: "POST", body: JSON.stringify(body) }),

  analyze: (body) =>
    request("/api/analyze", { method: "POST", body: JSON.stringify(body) }),

  analyses: (params) => request(`/api/analyses${qs(params)}`),
};
