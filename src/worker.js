const DEFAULT_ADMIN_ID = "teacher-admin-001";
const DEFAULT_ADMIN_ACCOUNT = {
  id: DEFAULT_ADMIN_ID,
  account: "教师管理001",
  password: "001001",
  role: "管理员",
  createdAt: "2026-06-11T00:00:00.000Z",
};
const DATA_KEY = "app-data";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function readJson(request, limit = 15 * 1024 * 1024) {
  const text = await request.text();
  if (text.length > limit) throw new Error("请求体过大");
  return JSON.parse(text || "{}");
}

function safeSegment(value, fallback = "item") {
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

function normalizeDataSnapshot(snapshot = {}) {
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

async function readDataStore(env) {
  if (!env.GO_WORK_DATA) {
    return normalizeDataSnapshot();
  }
  const stored = await env.GO_WORK_DATA.get(DATA_KEY, "json");
  return normalizeDataSnapshot(stored || {});
}

async function writeDataStore(env, snapshot) {
  const normalized = normalizeDataSnapshot({
    ...snapshot,
    updatedAt: new Date().toISOString(),
  });
  if (env.GO_WORK_DATA) {
    await env.GO_WORK_DATA.put(DATA_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

function dataUrlBytes(dataUrl) {
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

async function handleHealth(request, env) {
  const url = new URL(request.url);
  return json({
    ok: true,
    app: "弈棋无限",
    status: "running",
    runtime: "cloudflare-workers",
    time: new Date().toISOString(),
    localUrl: url.origin,
    networkUrls: [url.origin],
    imageFolder: env.GO_WORK_IMAGES ? "Cloudflare R2: GO_WORK_IMAGES" : "未绑定 R2，图片仅保存在浏览器数据中",
    dataFile: env.GO_WORK_DATA ? "Cloudflare KV: GO_WORK_DATA" : "未绑定 KV，归档仅保存在浏览器本机缓存中",
    bindings: {
      assets: Boolean(env.ASSETS),
      data: Boolean(env.GO_WORK_DATA),
      images: Boolean(env.GO_WORK_IMAGES),
    },
  });
}

async function handleData(request, env) {
  if (request.method === "GET") {
    return json({
      ok: true,
      ...(await readDataStore(env)),
      storage: env.GO_WORK_DATA ? "cloudflare-kv" : "browser-fallback",
    });
  }
  if (request.method === "PUT") {
    const payload = await readJson(request, 80 * 1024 * 1024);
    const snapshot = await writeDataStore(env, payload);
    return json({
      ok: true,
      ...snapshot,
      storage: env.GO_WORK_DATA ? "cloudflare-kv" : "browser-fallback",
    });
  }
  return json({ error: "Method not allowed" }, 405);
}

async function handleImages(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const payload = await readJson(request);
  const image = dataUrlBytes(payload.dataUrl);
  if (!image) return json({ error: "图片数据格式不正确" }, 400);

  if (!env.GO_WORK_IMAGES) {
    return json(
      {
        url: payload.dataUrl,
        path: "",
        relativePath: "",
        storage: "browser-fallback",
      },
      201,
    );
  }

  const gameId = safeSegment(payload.gameId, "game");
  const kind = safeSegment(payload.kind, "image");
  const imageId = safeSegment(payload.imageId, String(Date.now()));
  const filename = `${Date.now()}-${kind}-${imageId}.${image.extension}`;
  const key = `${gameId}/${filename}`;

  await env.GO_WORK_IMAGES.put(key, image.bytes, {
    httpMetadata: {
      contentType: image.contentType,
      cacheControl: "no-store",
    },
  });

  const relativePath = `review-images/${key}`;
  return json(
    {
      url: `/${relativePath}`,
      path: `r2://GO_WORK_IMAGES/${key}`,
      relativePath,
      storage: "cloudflare-r2",
    },
    201,
  );
}

async function deletePrefix(bucket, prefix) {
  const deleted = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor });
    const keys = page.objects.map((object) => object.key);
    if (keys.length) {
      await bucket.delete(keys);
      deleted.push(...keys);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}

async function handleArchiveImageDelete(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.GO_WORK_IMAGES) return json({ ok: true, deleted: [], storage: "browser-fallback" });

  const payload = await readJson(request, 1024 * 1024);
  const gameIds = Array.isArray(payload.gameIds) ? payload.gameIds : [];
  const deleted = [];

  for (const gameId of gameIds) {
    const safeGameId = safeSegment(gameId, "");
    if (!safeGameId) continue;
    deleted.push(...(await deletePrefix(env.GO_WORK_IMAGES, `${safeGameId}/`)));
  }

  return json({ ok: true, deleted });
}

async function handleReviewImage(pathname, env) {
  if (!env.GO_WORK_IMAGES) return new Response("Not found", { status: 404 });
  const key = decodeURIComponent(pathname.replace(/^\/review-images\/?/, ""));
  if (!key) return new Response("Not found", { status: 404 });

  const object = await env.GO_WORK_IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "no-store");
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    try {
      if (pathname === "/api/health") return handleHealth(request, env);
      if (pathname === "/api/data") return handleData(request, env);
      if (pathname === "/api/images") return handleImages(request, env);
      if (pathname === "/api/archive-images/delete") return handleArchiveImageDelete(request, env);
      if (pathname.startsWith("/review-images/")) return handleReviewImage(pathname, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ error: error.message || "Cloudflare Worker 处理失败" }, 500);
    }
  },
};
