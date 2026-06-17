const DEFAULT_ADMIN_ID = "teacher-admin-001";
const DEFAULT_ADMIN_ACCOUNT = {
  id: DEFAULT_ADMIN_ID,
  account: "教师管理001",
  password: "001001",
  role: "管理员",
  createdAt: "2026-06-11T00:00:00.000Z",
};
const DATA_KEY = "app-data";

export function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function readJson(request, limit = 15 * 1024 * 1024) {
  const text = await request.text();
  if (text.length > limit) throw new Error("请求体过大");
  return JSON.parse(text || "{}");
}

export function safeSegment(value, fallback = "item") {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function normalizeAccountRole(role) {
  return role === "管理员" ? "管理员" : "教师";
}

function normalizeAccount(account) {
  const fallbackId = `account-${String(account?.account || Date.now()).replace(/\s+/g, "-")}`;
  return {
    id: String(account?.id || fallbackId),
    account: String(account?.account || "").trim(),
    password: String(account?.password || ""),
    role: normalizeAccountRole(account?.role),
    createdAt: account?.createdAt || new Date().toISOString(),
  };
}

export function normalizeDataSnapshot(snapshot = {}) {
  const loadedAccounts = Array.isArray(snapshot.accounts)
    ? snapshot.accounts.map(normalizeAccount).filter((account) => account.account)
    : [];
  const hasDefaultAdmin = loadedAccounts.some((account) => account.id === DEFAULT_ADMIN_ID);
  const accounts = hasDefaultAdmin ? loadedAccounts : [DEFAULT_ADMIN_ACCOUNT, ...loadedAccounts];
  const accountIds = new Set(accounts.map((account) => account.id));
  const sourceGames = snapshot.gamesByAccount && typeof snapshot.gamesByAccount === "object" ? snapshot.gamesByAccount : {};
  const gamesByAccount = {};

  for (const account of accounts) {
    gamesByAccount[account.id] = Array.isArray(sourceGames[account.id]) ? sourceGames[account.id] : [];
  }

  return {
    version: 1,
    updatedAt: snapshot.updatedAt || new Date().toISOString(),
    accounts,
    gamesByAccount: Object.fromEntries(
      Object.entries(gamesByAccount).filter(([accountId]) => accountIds.has(accountId)),
    ),
  };
}

export function requireKv(env) {
  if (!env.GO_WORK_DATA) {
    throw new Error("Cloudflare KV binding GO_WORK_DATA 未配置");
  }
  return env.GO_WORK_DATA;
}

export function requireR2(env) {
  if (!env.GO_WORK_IMAGES) {
    throw new Error("Cloudflare R2 binding GO_WORK_IMAGES 未配置");
  }
  return env.GO_WORK_IMAGES;
}

export async function readDataStore(env) {
  const kv = requireKv(env);
  const stored = await kv.get(DATA_KEY, "json");
  return normalizeDataSnapshot(stored || {});
}

export async function writeDataStore(env, snapshot) {
  const kv = requireKv(env);
  const normalized = normalizeDataSnapshot({
    ...snapshot,
    updatedAt: new Date().toISOString(),
  });
  await kv.put(DATA_KEY, JSON.stringify(normalized));
  return normalized;
}

export function dataUrlBytes(dataUrl) {
  const match = String(dataUrl || "").match(/^data:image\/(png|jpeg|jpg);base64,([a-zA-Z0-9+/=]+)$/i);
  if (!match) return null;
  const contentType = match[1].toLowerCase() === "png" ? "image/png" : "image/jpeg";
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return {
    bytes,
    extension: contentType === "image/png" ? "png" : "jpg",
    contentType,
  };
}
