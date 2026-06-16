import { createReadStream, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const imageRoot = join(root, "review-images");
const dataRoot = join(root, "data");
const dataFile = join(dataRoot, "app-data.json");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const defaultAdminId = "teacher-admin-001";
const defaultAdminAccount = {
  id: defaultAdminId,
  account: "教师管理001",
  password: "001001",
  role: "管理员",
  createdAt: "2026-06-11T00:00:00.000Z",
};
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".sgf": "application/x-go-sgf; charset=utf-8",
  ".svg": "image/svg+xml",
};

mkdirSync(imageRoot, { recursive: true });
mkdirSync(dataRoot, { recursive: true });

function lanUrls() {
  if (!["0.0.0.0", "::"].includes(host)) return [];
  return Object.values(networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${port}`);
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function safeSegment(value, fallback = "item") {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function readBody(request, limit = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error("请求体过大"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
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
  const hasDefaultAdmin = loadedAccounts.some((account) => account.id === defaultAdminId);
  const accounts = hasDefaultAdmin ? loadedAccounts : [defaultAdminAccount, ...loadedAccounts];
  const accountIds = new Set(accounts.map((account) => account.id));
  const gamesByAccount = {};
  const sourceGames = snapshot.gamesByAccount && typeof snapshot.gamesByAccount === "object" ? snapshot.gamesByAccount : {};

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

function readDataStore() {
  try {
    return normalizeDataSnapshot(JSON.parse(readFileSync(dataFile, "utf8")));
  } catch {
    const snapshot = normalizeDataSnapshot();
    writeFileSync(dataFile, JSON.stringify(snapshot, null, 2));
    return snapshot;
  }
}

function writeDataStore(snapshot) {
  const normalized = normalizeDataSnapshot({
    ...snapshot,
    updatedAt: new Date().toISOString(),
  });
  writeFileSync(dataFile, JSON.stringify(normalized, null, 2));
  return normalized;
}

async function saveImage(request, response) {
  try {
    const payload = JSON.parse(await readBody(request));
    const match = String(payload.dataUrl || "").match(
      /^data:image\/(png|jpeg|jpg);base64,([a-zA-Z0-9+/=]+)$/i,
    );
    if (!match) {
      sendJson(response, 400, { error: "图片数据格式不正确" });
      return;
    }

    const extension = match[1].toLowerCase() === "png" ? "png" : "jpg";
    const gameId = safeSegment(payload.gameId, "game");
    const kind = safeSegment(payload.kind, "image");
    const imageId = safeSegment(payload.imageId, String(Date.now()));
    const folder = join(imageRoot, gameId);
    mkdirSync(folder, { recursive: true });

    const filename = `${Date.now()}-${kind}-${imageId}.${extension}`;
    const filePath = join(folder, filename);
    writeFileSync(filePath, Buffer.from(match[2], "base64"));

    const relativePath = `review-images/${gameId}/${filename}`;
    sendJson(response, 201, {
      url: `/${relativePath}`,
      path: filePath,
      relativePath,
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "图片保存失败" });
  }
}

async function saveData(request, response) {
  try {
    const payload = JSON.parse(await readBody(request, 80 * 1024 * 1024));
    const snapshot = writeDataStore(payload);
    sendJson(response, 200, {
      ok: true,
      ...snapshot,
      dataFile,
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "共享数据保存失败" });
  }
}

async function deleteArchiveImages(request, response) {
  try {
    const payload = JSON.parse(await readBody(request, 1024 * 1024));
    const gameIds = Array.isArray(payload.gameIds) ? payload.gameIds : [];
    const deleted = [];
    for (const gameId of gameIds) {
      const safeGameId = safeSegment(gameId, "");
      if (!safeGameId) continue;
      rmSync(join(imageRoot, safeGameId), { recursive: true, force: true });
      deleted.push(safeGameId);
    }
    sendJson(response, 200, { ok: true, deleted });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "归档图片文件删除失败" });
  }
}

const server = createServer((request, response) => {
  const pathname = request.url?.split("?")[0] || "/";

  if (request.method === "GET" && pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      app: "弈棋无限",
      status: "running",
      time: new Date().toISOString(),
      host,
      port,
      localUrl: `http://127.0.0.1:${port}`,
      networkUrls: lanUrls(),
      imageFolder: imageRoot,
      dataFile,
    });
    return;
  }

  if (request.method === "GET" && pathname === "/api/data") {
    sendJson(response, 200, {
      ok: true,
      ...readDataStore(),
      dataFile,
    });
    return;
  }

  if (request.method === "PUT" && pathname === "/api/data") {
    saveData(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/images") {
    saveImage(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/archive-images/delete") {
    deleteArchiveImages(request, response);
    return;
  }

  const requestedPath = decodeURIComponent(pathname);
  const safePath = normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = join(root, safePath === "/" ? "index.html" : safePath);

  try {
    if (statSync(filePath).isDirectory()) filePath = join(filePath, "index.html");
    response.writeHead(200, {
      "Content-Type": types[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${port} 已被占用。请关闭旧的启动窗口，或使用 PORT=其他端口 启动。`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(port, host, () => {
  const urls = lanUrls();
  console.log("");
  console.log("弈棋无限教学工作台已启动");
  console.log(`本机访问：http://127.0.0.1:${port}`);
  if (urls.length) {
    console.log("同一 Wi-Fi / 局域网的其他电脑访问：");
    for (const url of urls) console.log(`  ${url}`);
  } else {
    console.log(`当前监听地址：${host}:${port}`);
  }
  console.log("请保持此窗口打开；关闭窗口后网页会断开连接。");
  console.log("");
});
