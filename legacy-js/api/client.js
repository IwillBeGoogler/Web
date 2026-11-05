const TOKEN_KEY = "token";

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable: session lasts until reload
  }
};

// ApiError is a failed request: the server answers with RFC 9457 problem
// details ({title, status, detail, code, numeric_code, request_id}).
export class ApiError extends Error {
  constructor(status, problem = {}) {
    super(problem.detail || problem.title || `HTTP ${status}`);
    this.status = status;
    this.code = problem.code;
    this.numericCode = problem.numeric_code;
    this.requestId = problem.request_id;
    this.problem = problem;
  }
}

const readBody = async (r) => {
  if (r.status === 204) return null;
  const text = await r.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { title: text };
  }
};

// request returns the whole envelope: {data} or {data, meta} for pages.
export const request = async (path, method = "GET", data) => {
  const headers = { Accept: "application/json", "Accept-Language": navigator.language || "en" };
  if (data) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const r = await fetch("/api" + path, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });
  const body = await readBody(r);
  if (!r.ok) throw new ApiError(r.status, body ?? {});
  return body;
};

// api returns just the data; apiPage returns {items, meta} for lists.
export const api = async (path, method, data) => (await request(path, method, data))?.data ?? null;

export const apiPage = async (path) => {
  const body = await request(path);
  return { items: body?.data ?? [], meta: body?.meta ?? {} };
};
