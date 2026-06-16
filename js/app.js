import { boardDataUrl, drawBoard, pointFromCanvasEvent } from "./board.js";
import {
  commentVariations,
  countGameVariations,
  normalizeComment,
  normalizeCommentTextStyle,
  normalizeGame,
} from "./comments.js";
import { normalizeMarks, toggleBoardMark } from "./marks.js";
import { createGameReportFile, exportGameReport } from "./pdf.js";
import { buildPositions, cloneBoard, createInitialBoard, parseSgf, playMove } from "./sgf.js";

const LEGACY_STORAGE_KEY = "go-comment-games-v1";
const ACCOUNTS_STORAGE_KEY = "go-comment-accounts-v1";
const SESSION_STORAGE_KEY = "go-comment-current-account-v1";
const ACCOUNT_GAMES_PREFIX = "go-comment-games-account-v1:";
const SHARED_DATA_ENDPOINT = "/api/data";
const DEFAULT_ADMIN_ID = "teacher-admin-001";
const DEFAULT_ADMIN_ACCOUNT = {
  id: DEFAULT_ADMIN_ID,
  account: "教师管理001",
  password: "001001",
  role: "管理员",
  createdAt: "2026-06-11T00:00:00.000Z",
};
const app = document.querySelector("#app");
const statusRoot = document.querySelector("#status-root");
const coordinateLetters = "ABCDEFGHJKLMNOPQRSTUVWXYZ";
const HEALTH_CHECK_INTERVAL = 10000;
const HEALTH_CHECK_TIMEOUT = 3500;
const freeAnalysisTypeOptions = [
  ["calculation", "计算解析"],
  ["joseki", "定式变化"],
  ["global", "全局分析"],
];
const freeAnalysisTypeLabels = Object.fromEntries(freeAnalysisTypeOptions);
const commentTextSizeOptions = [
  ["small", "小"],
  ["medium", "标准"],
  ["large", "大"],
];
const archiveCategoryDefinitions = [
  {
    id: "game",
    label: "棋局分析",
    description: "SGF 棋谱导入后的主分支复盘与点评报告",
  },
  {
    id: "calculation",
    label: "计算分析",
    description: "自由分析中的计算解析、作业与题目训练档案",
  },
  {
    id: "joseki",
    label: "定式变化",
    description: "自由分析中的定式变化、关键点与教学变化图",
  },
  {
    id: "global",
    label: "全局分析",
    description: "自由分析中的全局判断、布局方向与中盘攻防",
  },
];
const freeAnalysisInfoDefaults = {
  calculation: {
    assignmentName: "",
    problemType: "",
    problemCount: "",
    difficulty: "",
  },
  joseki: {
    variationName: "",
    difficulty: "",
    keyPoints: "",
  },
  global: {
    analysisType: "",
    difficulty: "",
    keyPoints: "",
  },
};

function accountGamesStorageKey(accountId) {
  return `${ACCOUNT_GAMES_PREFIX}${accountId}`;
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

function ensureDefaultAdmin(accounts) {
  return accounts.some((account) => account.id === DEFAULT_ADMIN_ID) ? accounts : [DEFAULT_ADMIN_ACCOUNT, ...accounts];
}

function normalizeDataSnapshot(snapshot = {}) {
  const accounts = ensureDefaultAdmin(
    (Array.isArray(snapshot.accounts) ? snapshot.accounts : []).map(normalizeAccount).filter((account) => account.account),
  );
  const accountIds = new Set(accounts.map((account) => account.id));
  const gamesByAccount = {};
  const sourceGames = snapshot.gamesByAccount && typeof snapshot.gamesByAccount === "object" ? snapshot.gamesByAccount : {};

  for (const account of accounts) {
    gamesByAccount[account.id] = Array.isArray(sourceGames[account.id])
      ? sourceGames[account.id].map(normalizeGame)
      : [];
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

function loadAccounts() {
  try {
    const loaded = JSON.parse(localStorage.getItem(ACCOUNTS_STORAGE_KEY) || "[]")
      .map(normalizeAccount)
      .filter((account) => account.account);
    const accounts = ensureDefaultAdmin(loaded);
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    return accounts;
  } catch {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify([DEFAULT_ADMIN_ACCOUNT]));
    return [DEFAULT_ADMIN_ACCOUNT];
  }
}

function loadGames(accountId) {
  if (!accountId) return [];
  const storageKey = accountGamesStorageKey(accountId);
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing !== null) return JSON.parse(existing || "[]").map(normalizeGame);

    if (accountId === DEFAULT_ADMIN_ID) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy !== null) {
        localStorage.setItem(storageKey, legacy);
        return JSON.parse(legacy || "[]").map(normalizeGame);
      }
    }
    localStorage.setItem(storageKey, "[]");
    return [];
  } catch {
    return [];
  }
}

function localDataSnapshot() {
  const accounts = loadAccounts();
  const gamesByAccount = Object.fromEntries(accounts.map((account) => [account.id, loadGames(account.id)]));
  return normalizeDataSnapshot({ accounts, gamesByAccount });
}

function writeLocalDataSnapshot(snapshot) {
  const normalized = normalizeDataSnapshot(snapshot);
  try {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(normalized.accounts));
    const accountIds = new Set(normalized.accounts.map((account) => account.id));
    for (const account of normalized.accounts) {
      localStorage.setItem(accountGamesStorageKey(account.id), JSON.stringify(normalized.gamesByAccount[account.id] || []));
    }
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(ACCOUNT_GAMES_PREFIX)) {
        const accountId = key.slice(ACCOUNT_GAMES_PREFIX.length);
        if (!accountIds.has(accountId)) localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.warn("本地缓存写入失败，已继续使用服务器共享数据。", error);
  }
  return normalized;
}

function snapshotHasUserData(snapshot) {
  const normalized = normalizeDataSnapshot(snapshot);
  const hasCustomAccount = normalized.accounts.some((account) => account.id !== DEFAULT_ADMIN_ID);
  const hasGames = Object.values(normalized.gamesByAccount).some((games) => games.length);
  return hasCustomAccount || hasGames;
}

function isEmptySharedSnapshot(snapshot) {
  const normalized = normalizeDataSnapshot(snapshot);
  const onlyDefaultAccount = normalized.accounts.length === 1 && normalized.accounts[0].id === DEFAULT_ADMIN_ID;
  const noGames = Object.values(normalized.gamesByAccount).every((games) => !games.length);
  return onlyDefaultAccount && noGames;
}

function mergeGameLists(primaryGames = [], secondaryGames = []) {
  const gamesById = new Map();
  for (const game of [...primaryGames, ...secondaryGames].map(normalizeGame)) {
    if (!game?.id) continue;
    const existing = gamesById.get(game.id);
    if (!existing || savedTimestamp(game) >= savedTimestamp(existing)) gamesById.set(game.id, game);
  }
  return Array.from(gamesById.values()).sort((a, b) => savedTimestamp(b) - savedTimestamp(a));
}

function mergeDataSnapshots(primarySnapshot, secondarySnapshot) {
  const primary = normalizeDataSnapshot(primarySnapshot);
  const secondary = normalizeDataSnapshot(secondarySnapshot);
  const accountsById = new Map(primary.accounts.map((account) => [account.id, account]));
  for (const account of secondary.accounts) {
    if (!accountsById.has(account.id)) accountsById.set(account.id, account);
  }
  const accounts = ensureDefaultAdmin(Array.from(accountsById.values()));
  const gamesByAccount = {};
  for (const account of accounts) {
    gamesByAccount[account.id] = mergeGameLists(
      primary.gamesByAccount[account.id] || [],
      secondary.gamesByAccount[account.id] || [],
    );
  }
  return normalizeDataSnapshot({ accounts, gamesByAccount });
}

async function fetchSharedDataSnapshot() {
  const response = await fetch(`${SHARED_DATA_ENDPOINT}?t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`共享数据读取失败：${response.status}`);
  return normalizeDataSnapshot(await response.json());
}

async function saveSharedDataSnapshot(snapshot) {
  const response = await fetch(SHARED_DATA_ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalizeDataSnapshot(snapshot)),
  });
  if (!response.ok) throw new Error(`共享数据保存失败：${response.status}`);
  return normalizeDataSnapshot(await response.json());
}

function snapshotFromState(accounts = state.accounts) {
  const gamesByAccount = {};
  for (const account of accounts) {
    gamesByAccount[account.id] =
      account.id === state.currentAccountId ? state.games.map(normalizeGame) : loadGames(account.id);
  }
  return normalizeDataSnapshot({ accounts, gamesByAccount });
}

function syncSharedData(snapshot = snapshotFromState()) {
  saveSharedDataSnapshot(snapshot).catch((error) => {
    console.error(error);
    toast("共享数据同步失败，请确认启动窗口仍在运行。", "error");
  });
}

function cleanupArchiveImageFolders(gameIds) {
  const uniqueIds = [...new Set((gameIds || []).filter(Boolean))];
  if (!uniqueIds.length) return;
  fetch("/api/archive-images/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameIds: uniqueIds }),
  }).catch((error) => {
    console.error(error);
    toast("服务器图片文件清理失败，请稍后重试。", "error");
  });
}

async function refreshSharedData() {
  const snapshot = await fetchSharedDataSnapshot();
  writeLocalDataSnapshot(snapshot);
  state.accounts = snapshot.accounts;
  if (state.currentAccountId) {
    state.games = snapshot.gamesByAccount[state.currentAccountId] || [];
  }
  return snapshot;
}

async function loadInitialDataSnapshot() {
  const localSnapshot = localDataSnapshot();
  try {
    const sharedSnapshot = await fetchSharedDataSnapshot();
    const snapshot =
      isEmptySharedSnapshot(sharedSnapshot) && snapshotHasUserData(localSnapshot)
        ? mergeDataSnapshots(sharedSnapshot, localSnapshot)
        : sharedSnapshot;
    writeLocalDataSnapshot(snapshot);
    if (snapshot !== sharedSnapshot) {
      await saveSharedDataSnapshot(snapshot);
    }
    return snapshot;
  } catch (error) {
    console.warn(error);
    return localSnapshot;
  }
}

function persistAccounts(accounts = state.accounts) {
  try {
    const snapshot = snapshotFromState(accounts);
    writeLocalDataSnapshot(snapshot);
    syncSharedData(snapshot);
    return true;
  } catch {
    toast("账号信息保存失败，本地存储空间可能不足。", "error");
    return false;
  }
}

function loadSessionAccountId(accounts) {
  const sessionAccountId = localStorage.getItem(SESSION_STORAGE_KEY);
  return accounts.some((account) => account.id === sessionAccountId) ? sessionAccountId : null;
}

const initialDataSnapshot = await loadInitialDataSnapshot();
const initialAccounts = initialDataSnapshot.accounts;
const initialAccountId = loadSessionAccountId(initialAccounts);

const state = {
  screen: "landing",
  accounts: initialAccounts,
  currentAccountId: initialAccountId,
  games: initialAccountId ? initialDataSnapshot.gamesByAccount[initialAccountId] || [] : [],
  draft: null,
  positions: [],
  moveIndex: 0,
  mainMarks: [],
  mainMarkMenu: false,
  mainMarkTool: null,
  freeStoneMode: "alternate",
  modal: null,
  freeInfoDialog: null,
  confirmDialog: null,
  reportBusy: false,
  reportPreview: null,
  archiveExpanded: {},
  archiveDeleteCategory: null,
  archiveSelectedIds: [],
  accountMenuOpen: false,
  teacherMenuOpen: false,
  accountDialog: null,
  accountManageId: null,
  serverStatus: {
    status: "checking",
    message: "正在检查本地服务连接…",
    networkUrls: [],
    localUrl: "",
    checkedAt: "",
  },
};

let healthCheckTimer = null;
let healthCheckInFlight = false;

function currentAccount() {
  return state.accounts.find((account) => account.id === state.currentAccountId) || null;
}

function isLoggedIn() {
  return Boolean(currentAccount());
}

function isAdminAccount(account = currentAccount()) {
  return account?.role === "管理员";
}

function persistGames() {
  if (!state.currentAccountId) {
    toast("请先登录账号，再保存归档内容。", "error");
    return false;
  }
  try {
    localStorage.setItem(accountGamesStorageKey(state.currentAccountId), JSON.stringify(state.games.map(normalizeGame)));
  } catch {
    console.warn("本地缓存写入失败，已继续同步服务器共享数据。");
  }
  syncSharedData();
  return true;
}

function serverStatusLabel(status) {
  return {
    checking: "正在检查",
    online: "服务正常",
    offline: "连接断开",
    retrying: "正在重试",
  }[status] || "服务状态";
}

function setServerStatus(next) {
  const previous = JSON.stringify(state.serverStatus);
  state.serverStatus = {
    ...state.serverStatus,
    ...next,
  };
  if (JSON.stringify(state.serverStatus) !== previous) renderServerStatus();
}

function markServerOffline(message = "服务连接已断开。请确认一键启动窗口没有关闭，然后点击重试连接。") {
  setServerStatus({
    status: "offline",
    message,
    checkedAt: new Date().toISOString(),
  });
}

function serverStatusBar() {
  const status = state.serverStatus;
  const networkUrl = status.networkUrls?.[0] || "";
  const checkedText = status.checkedAt ? `上次检查 ${formatSavedTime(status.checkedAt)}` : "等待首次检查";
  const sharingHint =
    status.status === "online" && networkUrl
      ? `<span class="server-share">其他电脑访问：<code>${escapeHtml(networkUrl)}</code></span>`
      : "";
  const retryButton =
    status.status === "offline" || status.status === "retrying"
      ? `<button class="server-retry-button" data-status-action="retry-server" ${
          status.status === "retrying" ? "disabled" : ""
        }>重试连接</button>`
      : "";

  return `
    <div class="server-status-bar ${escapeHtml(status.status)}">
      <div class="server-status-main">
        <span class="server-status-dot" aria-hidden="true"></span>
        <strong>${escapeHtml(serverStatusLabel(status.status))}</strong>
        <span>${escapeHtml(status.message)}</span>
      </div>
      <div class="server-status-extra">
        ${sharingHint}
        <span>${escapeHtml(checkedText)}</span>
        ${retryButton}
      </div>
    </div>
  `;
}

function renderServerStatus() {
  if (!statusRoot) return;
  statusRoot.innerHTML = serverStatusBar();
  statusRoot
    .querySelector('[data-status-action="retry-server"]')
    ?.addEventListener("click", () => checkServerStatus({ manual: true }));
}

async function checkServerStatus({ manual = false } = {}) {
  if (healthCheckInFlight) return;
  healthCheckInFlight = true;
  const previousStatus = state.serverStatus.status;
  if (manual || previousStatus === "checking" || previousStatus === "offline") {
    setServerStatus({
      status: manual ? "retrying" : "checking",
      message: manual ? "正在重新连接本地服务…" : "正在检查本地服务连接…",
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
  try {
    const response = await fetch(`/api/health?t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "服务状态异常");
    setServerStatus({
      status: "online",
      message: "服务运行中，截图与变化图会保存到本地 review-images 文件夹。",
      networkUrls: Array.isArray(payload.networkUrls) ? payload.networkUrls : [],
      localUrl: payload.localUrl || "",
      checkedAt: payload.time || new Date().toISOString(),
    });
  } catch {
    markServerOffline("服务连接已断开。请确认一键启动窗口没有关闭，然后点击重试连接。");
  } finally {
    clearTimeout(timeoutId);
    healthCheckInFlight = false;
  }
}

function startServerMonitor() {
  renderServerStatus();
  checkServerStatus();
  if (healthCheckTimer) clearInterval(healthCheckTimer);
  healthCheckTimer = setInterval(() => checkServerStatus(), HEALTH_CHECK_INTERVAL);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isDataUrl(value) {
  return /^data:image\/(png|jpeg|jpg);base64,/i.test(String(value || ""));
}

async function saveImageFile(dataUrl, kind, imageId) {
  if (!isDataUrl(dataUrl)) return { url: dataUrl, path: "" };

  try {
    const response = await fetch("/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataUrl,
        gameId: state.draft?.id || "game",
        imageId,
        kind,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "图片保存失败");
    setServerStatus({
      status: "online",
      message: "服务运行中，点评图片会保存到本地 review-images 文件夹。",
      checkedAt: new Date().toISOString(),
    });
    return { url: payload.url, path: payload.path || "" };
  } catch (error) {
    markServerOffline("服务连接已断开，图片暂时保存在浏览器中。请确认启动窗口未关闭，或点击重试连接。");
    toast(`图片未能保存到本地文件夹，已保留在浏览器中：${error.message}`, "error");
    return { url: dataUrl, path: "" };
  }
}

function today() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function toInputDate(value) {
  const match = String(value || "").match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] || today();
}

function formatSavedTime(value) {
  if (!value) return "刚刚保存";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCoordinate(move, size) {
  if (!move || move.pass) return "停一手";
  return `${coordinateLetters[move.x] || move.x + 1}${size - move.y}`;
}

function playerName(name, rank) {
  return `${name || "未命名"}${rank ? ` ${rank}` : ""}`;
}

function isFreeAnalysis(game = state.draft) {
  return game?.type === "free";
}

function cloneFreeAnalysisInfo(info = {}) {
  return {
    calculation: {
      ...freeAnalysisInfoDefaults.calculation,
      ...(info.calculation || {}),
    },
    joseki: {
      ...freeAnalysisInfoDefaults.joseki,
      ...(info.joseki || {}),
    },
    global: {
      ...freeAnalysisInfoDefaults.global,
      ...(info.global || {}),
    },
  };
}

function ensureFreeAnalysisConfig(game = state.draft) {
  if (!isFreeAnalysis(game)) return;
  if (!freeAnalysisTypeLabels[game.freeAnalysisType]) game.freeAnalysisType = "global";
  game.freeAnalysisInfo = cloneFreeAnalysisInfo(game.freeAnalysisInfo);
}

function freeAnalysisType(game = state.draft) {
  ensureFreeAnalysisConfig(game);
  return game?.freeAnalysisType || "global";
}

function freeAnalysisLabel(game = state.draft) {
  return freeAnalysisTypeLabels[freeAnalysisType(game)];
}

function freePlacements(game = state.draft) {
  return Array.isArray(game?.freePlacements) ? game.freePlacements : [];
}

function countActiveFreePlacements(game = state.draft) {
  const active = new Map();
  for (const placement of freePlacements(game)) {
    const key = `${placement.x},${placement.y}`;
    if (placement.remove) active.delete(key);
    else if (["B", "W"].includes(placement.color)) active.set(key, placement.color);
  }
  return active.size;
}

function applyFreePlacements(board, game, moveNumber) {
  const next = cloneBoard(board);
  const size = game.parsed.size;
  for (const placement of freePlacements(game)) {
    if (placement.moveNumber !== moveNumber) continue;
    if (placement.x < 0 || placement.y < 0 || placement.x >= size || placement.y >= size) continue;
    if (placement.remove) {
      next[placement.y][placement.x] = null;
      continue;
    }
    if (!["B", "W"].includes(placement.color)) continue;
    if (!next[placement.y][placement.x]) next[placement.y][placement.x] = placement.color;
  }
  return next;
}

function buildReviewPositions(game) {
  if (!isFreeAnalysis(game)) return buildPositions(game.parsed);

  const positions = [];
  let board = createInitialBoard(game.parsed.size, game.parsed.setup);
  board = applyFreePlacements(board, game, 0);
  positions.push(board);

  for (let index = 0; index < game.parsed.moves.length; index += 1) {
    const result = playMove(positions.at(-1), game.parsed.moves[index]);
    board = applyFreePlacements(result.board, game, index + 1);
    positions.push(board);
  }

  return positions;
}

function accountArchiveStatItems(games = state.games) {
  const counts = archiveCounts(games);
  return archiveCategoryDefinitions
    .map(
      (category) => `
        <span>
          <strong>${counts[category.id] || 0}</strong>
          <em>${category.label}</em>
        </span>
      `,
    )
    .join("");
}

function accountPopover(account) {
  return `
    <div class="account-popover" role="menu">
      <div class="account-popover-row account-identity">
        <strong>${escapeHtml(account.account)}</strong>
        <span>${escapeHtml(account.role)}</span>
      </div>
      <div class="account-popover-row">
        <p>我的归档内容</p>
        <div class="account-archive-mini">${accountArchiveStatItems()}</div>
      </div>
      <div class="account-popover-actions">
        <button class="ghost-button" data-action="logout">退出登录</button>
      </div>
    </div>
  `;
}

function teacherMenu() {
  if (!isAdminAccount()) return "";
  return `
    <div class="teacher-menu-wrap ${state.teacherMenuOpen ? "open" : ""}">
      <button class="teacher-manage-button" data-action="toggle-teacher-menu">教师管理</button>
      <div class="teacher-menu" role="menu">
        <button data-action="open-add-account">添加账号</button>
        <button data-action="open-account-management">账号管理</button>
      </div>
    </div>
  `;
}

function header() {
  const account = currentAccount();
  return `
    <header class="topbar">
      <div class="topbar-left">
        <button class="brand" data-action="home" aria-label="返回首页">
          <img class="brand-logo" src="./assets/logo-yiqi-infinite-mark.png" alt="" />
          <span>
            <span class="brand-name">弈棋无限</span>
            <span class="brand-subtitle">YI·GO</span>
          </span>
        </button>
        ${teacherMenu()}
      </div>
      <div class="topbar-actions">
        ${
          account
            ? `
              <div class="account-menu-wrap ${state.accountMenuOpen ? "open" : ""}">
                <button class="account-button" data-action="toggle-account-menu">${escapeHtml(account.account)}</button>
                ${accountPopover(account)}
              </div>
            `
            : `<button class="primary-button" data-action="open-login">登录</button>`
        }
      </div>
    </header>
  `;
}

function shell(content) {
  return `
    <div class="app-shell">
      ${header()}
      ${content}
      <input id="sgf-input" type="file" accept=".sgf,application/x-go-sgf" hidden />
      ${state.reportBusy ? reportOverlay() : ""}
      ${state.modal ? commentModal() : ""}
      ${state.modal?.variationEnabled ? variationModal() : ""}
      ${state.freeInfoDialog ? freeInfoDialog() : ""}
      ${state.confirmDialog ? confirmDialog() : ""}
      ${state.accountDialog ? accountDialog() : ""}
      ${state.reportPreview ? reportPreviewModal() : ""}
    </div>
  `;
}

function landingPage() {
  return `
    <main class="page landing-page">
      <section class="landing-hero">
        <div>
          <img class="landing-logo" src="./assets/logo-yiqi-infinite-full-web.png" alt="弈棋无限 Logo" />
          <p class="eyebrow">Yiqi Infinite Studio</p>
          <h1>选择今天的<br /><span>分析方式</span></h1>
          <p class="hero-copy">
            “棋局分析”用于导入 SGF 并按主分支点评；“自由分析”用于课堂现场摆棋、
            自由推演，同样支持截图、文字点评、变化图、棋盘标记与 PDF 报告。
          </p>
        </div>
        <div class="mode-grid">
          <button class="mode-card primary-mode" data-action="open-analysis">
            <span class="mode-kicker">SGF Review</span>
            <strong>棋局分析</strong>
            <span>上传棋谱，填写对局信息，逐手定位关键局面并完成教学点评。</span>
          </button>
          <button class="mode-card" data-action="start-free-analysis">
            <span class="mode-kicker">Free Board</span>
            <strong>自由分析</strong>
            <span>选择 9 路、13 路或 19 路棋盘，自由落子并制作课堂分析材料。</span>
          </button>
          <button class="mode-card archive-mode" data-action="open-archive">
            <span class="mode-kicker">Archive</span>
            <strong>归档内容</strong>
            <span>按棋局分析、计算分析、定式变化和全局分析整理所有已保存文件。</span>
          </button>
        </div>
      </section>
    </main>
  `;
}

function homePage() {
  return `
    <main class="page analysis-page">
      <section class="analysis-hero">
        <div class="analysis-copy">
          <p class="eyebrow">SGF Review</p>
          <h1>让每一局棋<br /><span>变成清晰报告</span></h1>
          <p class="hero-copy">
            导入 SGF 棋谱，沿主分支定位关键局面。教师可以截图、点评、
            添加变化图与棋盘标记，最终生成排版清爽的 PDF 教学材料。
          </p>
          <div class="analysis-actions">
            <button class="primary-button hero-button" data-action="upload">上传 SGF</button>
          </div>
          <div class="feature-row analysis-feature-row">
            <span class="feature-chip">主分支复盘</span>
            <span class="feature-chip">关键局面截图</span>
            <span class="feature-chip">变化图点评</span>
            <span class="feature-chip">高清 PDF</span>
          </div>
        </div>
        <div class="analysis-showcase" aria-label="棋局分析视觉示例">
          <div class="showcase-glow"></div>
          <div class="showcase-card">
            <div class="showcase-topline">
              <span>AlphaGo Review</span>
              <span>Teaching Board</span>
            </div>
            <img src="./assets/go-board-showcase.png" alt="棋局分析示例棋盘" />
            <div class="showcase-caption">
              <strong>示例局面</strong>
              <span>高清棋盘展示，用于棋局分析入口预览。</span>
            </div>
          </div>
        </div>
      </section>

      <section class="analysis-upload-card">
        <div class="upload-panel">
          <div class="drop-zone compact-drop-zone" id="drop-zone" tabindex="0">
            <div class="upload-symbol">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div>
              <h2>拖入 SGF 文件即可开始</h2>
              <p>也可以点击按钮选择文件，系统会自动进入对局信息填写流程。</p>
            </div>
            <div class="drop-actions">
              <button class="primary-button gold" data-action="upload">选择 SGF 文件</button>
            </div>
          </div>
        </div>
      </section>
    </main>
  `;
}

function savedGameCard(game) {
  const black = playerName(game.parsed.info.blackName, game.parsed.info.blackRank);
  const white = playerName(game.parsed.info.whiteName, game.parsed.info.whiteRank);
  const typeLabel = isFreeAnalysis(game) ? `自由分析 · ${freeAnalysisLabel(game)}` : "棋局分析";
  const moveStatLabel = isFreeAnalysis(game) ? "行棋手数" : "主分支手数";
  const continueLabel = isFreeAnalysis(game) ? "继续分析" : "继续点评";
  return `
    <article class="saved-card">
      <div class="saved-card-top">
        <span class="date-badge">${escapeHtml(game.metadata.date || "日期未填")}</span>
        <span class="quiet-label">${escapeHtml(typeLabel)} · ${escapeHtml(formatSavedTime(game.updatedAt))}</span>
      </div>
      <h3>${escapeHtml(black)} · ${escapeHtml(white)}</h3>
      <p>${escapeHtml(game.metadata.platform || "平台未填")} · ${escapeHtml(game.metadata.result || "结果未填")}</p>
      <div class="saved-card-stats">
        <div class="saved-stat">
          <strong>${game.parsed.moves.length}</strong>
          <span>${moveStatLabel}</span>
        </div>
        <div class="saved-stat">
          <strong>${game.comments.length}</strong>
          <span>教师点评</span>
        </div>
        <div class="saved-stat">
          <strong>${isFreeAnalysis(game) ? countActiveFreePlacements(game) : countGameVariations(game)}</strong>
          <span>${isFreeAnalysis(game) ? "添加棋子" : "变化图"}</span>
        </div>
      </div>
      <div class="saved-card-actions">
        <button class="secondary-button" data-action="continue-game" data-id="${game.id}">${continueLabel}</button>
        <button class="primary-button" data-action="report-game" data-id="${game.id}">生成报告</button>
      </div>
    </article>
  `;
}

function savedTimestamp(game) {
  return (
    Date.parse(game.updatedAt || "") ||
    Date.parse(game.createdAt || "") ||
    Date.parse(game.metadata?.date || "") ||
    0
  );
}

function archiveCategoryId(game) {
  if (!isFreeAnalysis(game)) return "game";
  const type = freeAnalysisType(game);
  if (type === "calculation") return "calculation";
  if (type === "joseki") return "joseki";
  return "global";
}

function archiveCounts(games = state.games) {
  const counts = Object.fromEntries(archiveCategoryDefinitions.map((category) => [category.id, 0]));
  for (const game of games) {
    const category = archiveCategoryId(game);
    if (category in counts) counts[category] += 1;
  }
  return counts;
}

function archiveGroups(games = state.games) {
  const groups = Object.fromEntries(archiveCategoryDefinitions.map((category) => [category.id, []]));
  for (const game of games) {
    const category = archiveCategoryId(game);
    groups[category]?.push(game);
  }
  for (const category of archiveCategoryDefinitions) {
    groups[category.id].sort((a, b) => savedTimestamp(b) - savedTimestamp(a));
  }
  return groups;
}

function archiveGameTitle(game) {
  if (!isFreeAnalysis(game)) {
    return `${playerName(game.parsed.info.blackName, game.parsed.info.blackRank)} · ${playerName(
      game.parsed.info.whiteName,
      game.parsed.info.whiteRank,
    )}`;
  }
  ensureFreeAnalysisConfig(game);
  if (game.freeAnalysisType === "calculation") {
    return game.freeAnalysisInfo.calculation.assignmentName || `${game.parsed.size} 路计算分析`;
  }
  if (game.freeAnalysisType === "joseki") {
    return game.freeAnalysisInfo.joseki.variationName || `${game.parsed.size} 路定式变化`;
  }
  return game.freeAnalysisInfo.global.analysisType || `${game.parsed.size} 路全局分析`;
}

function archiveGameMeta(game) {
  if (!isFreeAnalysis(game)) {
    return `${game.metadata.platform || "平台未填"} · ${game.metadata.result || "结果未填"}`;
  }
  ensureFreeAnalysisConfig(game);
  if (game.freeAnalysisType === "calculation") {
    const info = game.freeAnalysisInfo.calculation;
    return `${info.problemType || "题型未填"} · ${info.problemCount || "数量未填"} · ${info.difficulty || "难度未填"}`;
  }
  if (game.freeAnalysisType === "joseki") {
    const info = game.freeAnalysisInfo.joseki;
    return `${info.difficulty || "难易程度未填"} · ${info.keyPoints ? "已填写关键点" : "关键点未填"}`;
  }
  const info = game.freeAnalysisInfo.global;
  return `${info.difficulty || "难易程度未填"} · ${info.keyPoints ? "已填写关键点" : "关键点未填"}`;
}

function archiveCategoryLabel(game) {
  const categoryId = archiveCategoryId(game);
  return archiveCategoryDefinitions.find((category) => category.id === categoryId)?.label || "归档";
}

function accountArchiveList(games) {
  if (!games.length) {
    return `<div class="account-file-empty">暂无归档内容</div>`;
  }

  return `
    <div class="account-file-list">
      ${[...games]
        .sort((a, b) => savedTimestamp(b) - savedTimestamp(a))
        .map(
          (game) => `
            <article class="account-file-item">
              <span>${escapeHtml(archiveCategoryLabel(game))}</span>
              <strong>${escapeHtml(archiveGameTitle(game))}</strong>
              <em>${escapeHtml(formatSavedTime(game.updatedAt || game.createdAt || game.metadata?.date))}</em>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function archiveSelectionCount(categoryId) {
  const selectedIds = new Set(state.archiveSelectedIds);
  return state.games.filter((game) => archiveCategoryId(game) === categoryId && selectedIds.has(game.id)).length;
}

function archiveGameCard(game, categoryId, manageMode = false) {
  const variationCount = countGameVariations(game);
  const placementCount = countActiveFreePlacements(game);
  const moveLabel = isFreeAnalysis(game) ? "行棋" : "主线";
  const selected = state.archiveSelectedIds.includes(game.id);
  return `
    <article class="archive-card ${manageMode ? "delete-mode" : ""} ${selected ? "is-selected" : ""}">
      ${
        manageMode
          ? `
            <label class="archive-select-control">
              <input
                type="checkbox"
                data-action="toggle-archive-selection"
                data-id="${game.id}"
                data-category="${categoryId}"
                ${selected ? "checked" : ""}
              />
              <span>选择</span>
            </label>
          `
          : ""
      }
      <div class="archive-card-main">
        <div class="archive-card-top">
          <span class="archive-type">${escapeHtml(
            archiveCategoryDefinitions.find((category) => category.id === categoryId)?.label || "归档",
          )}</span>
          <span class="quiet-label">${escapeHtml(formatSavedTime(game.updatedAt))}</span>
        </div>
        <h3>${escapeHtml(archiveGameTitle(game))}</h3>
        <p>${escapeHtml(archiveGameMeta(game))}</p>
        <div class="archive-card-facts">
          <span>${escapeHtml(game.metadata.date || "日期未填")}</span>
          <span>${game.parsed.size} 路</span>
          <span>${moveLabel} ${game.parsed.moves.length} 手</span>
          <span>${game.comments.length} 条点评</span>
          ${
            isFreeAnalysis(game)
              ? `<span>${placementCount} 枚添加棋子</span>`
              : `<span>${variationCount} 张变化图</span>`
          }
        </div>
      </div>
      <div class="archive-card-actions">
        ${
          manageMode
            ? ""
            : `
              <button class="secondary-button" data-action="continue-game" data-id="${game.id}">查看/修改</button>
              <button class="primary-button" data-action="report-game" data-id="${game.id}">生成报告</button>
            `
        }
      </div>
    </article>
  `;
}

function archivePage() {
  const groups = archiveGroups();
  const total = state.games.length;
  const summary = archiveCategoryDefinitions
    .map(
      (category) => `
        <button class="archive-summary-chip" data-action="archive-scroll" data-target="${category.id}">
          <strong>${groups[category.id].length}</strong>
          <span>${category.label}</span>
        </button>
      `,
    )
    .join("");

  return `
    <main class="page archive-page">
      <section class="archive-hero">
        <div>
          <p class="eyebrow">Archive Library</p>
          <h1>归档内容</h1>
          <p>所有已保存文件按类型归档，并按最近更新时间排序，方便教师继续修改或快速生成报告。</p>
        </div>
        <div class="archive-summary">
          <span class="archive-total">${total}</span>
          <span>份已归档文件</span>
        </div>
      </section>
      <div class="archive-summary-row">${summary}</div>
      <div class="archive-sections">
        ${archiveCategoryDefinitions
          .map((category) => {
            const items = groups[category.id];
            const expanded = Boolean(state.archiveExpanded[category.id]);
            const manageMode = state.archiveDeleteCategory === category.id;
            const selectedCount = archiveSelectionCount(category.id);
            return `
              <section class="archive-section ${expanded ? "is-expanded" : "is-collapsed"} ${
                manageMode ? "is-delete-mode" : ""
              }" id="archive-${category.id}">
                <div class="archive-section-header">
                  <div>
                    <h2>${category.label}</h2>
                    <p>${category.description}</p>
                  </div>
                  <div class="archive-section-controls">
                    <span>${items.length} 份</span>
                    <button class="secondary-button" data-action="toggle-archive-section" data-category="${category.id}">
                      ${expanded ? "收缩" : "显示"}
                    </button>
                    <button class="text-action danger" data-action="toggle-archive-manage" data-category="${category.id}">
                      ${manageMode ? "退出管理" : "管理"}
                    </button>
                  </div>
                </div>
                ${
                  expanded
                    ? `
	                <div class="archive-section-list">
	                  ${
	                    manageMode && items.length
	                      ? `
                          <div class="archive-manage-bar">
                            <span>已选择 ${selectedCount} 份文件</span>
                            <button
                              class="danger-button"
                              data-action="delete-selected-archives"
                              data-category="${category.id}"
                              ${selectedCount ? "" : "disabled"}
                            >
                              删除选中
                            </button>
                          </div>
                          <div class="archive-delete-hint">勾选需要删除的文件，点击“删除选中”后可在提示中撤销。</div>
                        `
	                      : ""
	                  }
	                  ${
	                    items.length
	                      ? items.map((game) => archiveGameCard(game, category.id, manageMode)).join("")
	                      : `<div class="archive-empty">暂无${category.label}归档。</div>`
	                  }
                </div>
                    `
                    : ""
                }
              </section>
            `;
          })
          .join("")}
      </div>
    </main>
  `;
}

function teacherManagementPage() {
  if (!isAdminAccount()) return landingPage();
  const accountCards = state.accounts
    .map((account) => {
      const games = loadGames(account.id);
      const total = games.length;
      const managing = state.accountManageId === account.id;
      const isSelf = account.id === state.currentAccountId;
      return `
        <article class="account-card ${managing ? "is-managing" : ""}">
          <div class="account-card-main">
            <div>
              <span class="archive-type">${escapeHtml(account.role)}</span>
              <h3>${escapeHtml(account.account)}</h3>
              <p>共 ${total} 份归档内容</p>
            </div>
            <div class="account-card-stats">${accountArchiveStatItems(games)}</div>
          </div>
          <div class="account-card-files">
            <div class="account-card-files-title">归档内容</div>
            ${accountArchiveList(games)}
          </div>
          <div class="account-card-actions">
            ${
              managing
                ? `
                  <button class="danger-button" data-action="request-delete-account" data-id="${account.id}" data-account-id="${account.id}" ${isSelf ? "disabled" : ""}>
                    ${isSelf ? "当前账号不可删除" : "删除账号"}
                  </button>
                  <button class="secondary-button" data-action="toggle-account-manage" data-id="${account.id}" data-account-id="${account.id}">取消</button>
                `
                : `<button class="secondary-button" data-action="toggle-account-manage" data-id="${account.id}" data-account-id="${account.id}">管理</button>`
            }
          </div>
        </article>
      `;
    })
    .join("");

  return `
    <main class="page teacher-page">
      <section class="archive-hero teacher-hero">
        <div>
          <p class="eyebrow">Teacher Admin</p>
          <h1>账号管理</h1>
          <p>管理员可以查看每个账号的归档数量，并删除不再需要的教师账号。每个账号的归档数据互相独立。</p>
        </div>
        <button class="primary-button" data-action="open-add-account">添加账号</button>
      </section>
      <div class="account-grid">${accountCards}</div>
    </main>
  `;
}

function progressSteps(active) {
  const steps = ["上传棋谱", "填写信息", "棋局点评"];
  return `
    <div class="progress-steps">
      ${steps
        .map(
          (label, index) => `
            ${index ? '<span class="step-line"></span>' : ""}
            <div class="progress-step ${index <= active ? "active" : ""}">
              <span class="step-number">${index + 1}</span>
              <span>${label}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function metadataPage() {
  const game = state.draft;
  const info = game.parsed.info;
  const metadata = game.metadata;
  return `
    <main class="page">
      ${progressSteps(1)}
      <div class="metadata-layout">
        <aside class="file-summary">
          <span class="file-summary-label">SGF 已成功导入</span>
          <h2 title="${escapeHtml(game.fileName)}">${escapeHtml(game.fileName)}</h2>
          <p>主分支已解析，可以开始建立教学档案。</p>
          <div class="versus-block">
            <div class="player">
              <strong>${escapeHtml(info.blackName)}</strong>
              <span>黑方 ${escapeHtml(info.blackRank || "段位未填")}</span>
            </div>
            <span class="versus">VS</span>
            <div class="player">
              <strong>${escapeHtml(info.whiteName)}</strong>
              <span>白方 ${escapeHtml(info.whiteRank || "段位未填")}</span>
            </div>
          </div>
          <div class="file-stats">
            <div class="file-stat"><strong>${game.parsed.size}</strong><span>棋盘路数</span></div>
            <div class="file-stat"><strong>${game.parsed.moves.length}</strong><span>主分支手数</span></div>
            <div class="file-stat"><strong>${escapeHtml(info.komi || "—")}</strong><span>贴目</span></div>
            <div class="file-stat"><strong>${escapeHtml(info.result || "—")}</strong><span>棋谱结果</span></div>
          </div>
        </aside>
        <section class="form-card">
          <div class="metadata-heading">
            <p class="eyebrow">Game Information</p>
            <h1>补充对局信息</h1>
            <p>这些内容会与所有教师点评一起归档，并出现在最终教学报告中。</p>
          </div>
          <form id="metadata-form">
            <label class="form-field">
              <span>对弈时间</span>
              <input name="date" type="date" value="${escapeHtml(metadata.date)}" required />
            </label>
            <label class="form-field">
              <span>对弈平台</span>
              <input name="platform" type="text" value="${escapeHtml(metadata.platform)}" placeholder="例如：弈城围棋、野狐围棋、线下课堂" required />
            </label>
            <label class="form-field">
              <span>对局结果</span>
              <input name="result" type="text" value="${escapeHtml(metadata.result)}" placeholder="例如：黑中盘胜、白胜 2.5 目" required />
            </label>
            <div class="form-actions">
              <button type="button" class="ghost-button" data-action="cancel-metadata">取消</button>
              <button type="submit" class="primary-button">进入棋局点评</button>
            </div>
          </form>
        </section>
      </div>
    </main>
  `;
}

function freeControls() {
  if (!isFreeAnalysis()) return "";
  const size = state.draft.parsed.size;
  const activeAnalysisType = freeAnalysisType();
  const modes = [
    ["alternate", "交替落子"],
    ["black", "添加黑子"],
    ["white", "添加白子"],
  ];
  return `
    <div class="free-controls" aria-label="自由分析设置">
      <div>
        <span>棋盘大小</span>
        <div class="segmented-controls">
          ${[9, 13, 19]
            .map(
              (boardSize) => `
                <button class="${size === boardSize ? "active" : ""}" data-action="free-board-size" data-size="${boardSize}">
                  ${boardSize} 路
                </button>
              `,
            )
            .join("")}
        </div>
      </div>
      <div>
        <span>落子选项</span>
        <div class="segmented-controls">
          ${modes
            .map(
              ([mode, label]) => `
                <button class="${state.freeStoneMode === mode ? "active" : ""}" data-action="free-stone-mode" data-mode="${mode}">
                  ${label}
                </button>
              `,
            )
            .join("")}
        </div>
      </div>
    </div>
    <div class="free-analysis-panel">
      <div class="free-analysis-heading">
        <div>
          <span>分析类型</span>
          <strong>${freeAnalysisLabel()}</strong>
        </div>
        <div class="segmented-controls">
          ${freeAnalysisTypeOptions
            .map(
              ([type, label]) => `
                <button class="${activeAnalysisType === type ? "active" : ""}" data-action="free-analysis-type" data-type="${type}">
                  ${label}
                </button>
              `,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function freeAnalysisInfoSummary(type) {
  ensureFreeAnalysisConfig();
  const info = state.draft.freeAnalysisInfo;
  if (type === "calculation") {
    return `
      <div class="free-info-summary">
        <div class="free-info-summary-grid">
          <div><span>作业名称</span><strong>${escapeHtml(info.calculation.assignmentName || "未填写")}</strong></div>
          <div><span>题目类型</span><strong>${escapeHtml(info.calculation.problemType || "未填写")}</strong></div>
          <div><span>题目数量</span><strong>${escapeHtml(info.calculation.problemCount || "未填写")}</strong></div>
          <div><span>题目难度</span><strong>${escapeHtml(info.calculation.difficulty || "未填写")}</strong></div>
        </div>
        <button class="secondary-button" data-action="open-free-info-dialog" data-type="calculation">编辑计算解析信息</button>
      </div>
    `;
  }

  if (type === "joseki") {
    return `
      <div class="free-info-summary">
        <div class="free-info-summary-grid joseki">
          <div><span>变化名称</span><strong>${escapeHtml(info.joseki.variationName || "未填写")}</strong></div>
          <div><span>难易程度</span><strong>${escapeHtml(info.joseki.difficulty || "未填写")}</strong></div>
          <div class="wide"><span>关键点</span><strong>${escapeHtml(info.joseki.keyPoints || "未填写")}</strong></div>
        </div>
        <button class="secondary-button" data-action="open-free-info-dialog" data-type="joseki">编辑定式变化信息</button>
      </div>
    `;
  }

  return `
    <div class="free-info-summary">
      <div class="free-info-summary-grid joseki">
        <div><span>分析类型</span><strong>${escapeHtml(info.global.analysisType || "未填写")}</strong></div>
        <div><span>难易程度</span><strong>${escapeHtml(info.global.difficulty || "未填写")}</strong></div>
        <div class="wide"><span>关键点</span><strong>${escapeHtml(info.global.keyPoints || "未填写")}</strong></div>
      </div>
      <button class="secondary-button" data-action="open-free-info-dialog" data-type="global">编辑全局分析信息</button>
    </div>
  `;
}

function freeInfoDialogFields(type) {
  ensureFreeAnalysisConfig();
  const info = state.draft.freeAnalysisInfo;
  if (type === "calculation") {
    return `
      <div class="free-info-grid">
        <label class="free-info-field">
          <span>作业名称</span>
          <input name="assignmentName" type="text" value="${escapeHtml(info.calculation.assignmentName)}" placeholder="例如：死活计算专项训练" />
        </label>
        <label class="free-info-field">
          <span>题目类型</span>
          <input name="problemType" type="text" value="${escapeHtml(info.calculation.problemType)}" placeholder="例如：死活、手筋、官子" />
        </label>
        <label class="free-info-field">
          <span>题目数量</span>
          <input name="problemCount" type="text" value="${escapeHtml(info.calculation.problemCount)}" placeholder="例如：12 题" />
        </label>
        <label class="free-info-field">
          <span>题目难度</span>
          <input name="difficulty" type="text" value="${escapeHtml(info.calculation.difficulty)}" placeholder="例如：中级 / 3 段" />
        </label>
      </div>
    `;
  }

  if (type === "joseki") {
    return `
      <div class="free-info-grid joseki">
        <label class="free-info-field">
          <span>变化名称</span>
          <input name="variationName" type="text" value="${escapeHtml(info.joseki.variationName)}" placeholder="例如：小目一间高夹变化" />
        </label>
        <label class="free-info-field">
          <span>难易程度</span>
          <input name="difficulty" type="text" value="${escapeHtml(info.joseki.difficulty)}" placeholder="例如：进阶 / 高段" />
        </label>
        <label class="free-info-field wide">
          <span>关键点</span>
          <textarea name="keyPoints" placeholder="记录该定式变化的关键次序、方向选择或常见误区。">${escapeHtml(info.joseki.keyPoints)}</textarea>
        </label>
      </div>
    `;
  }

  if (type === "global") {
    return `
      <div class="free-info-grid joseki">
        <label class="free-info-field">
          <span>分析类型</span>
          <input name="analysisType" type="text" value="${escapeHtml(info.global.analysisType)}" placeholder="例如：布局判断 / 中盘攻防 / 官子收束" />
        </label>
        <label class="free-info-field">
          <span>难易程度</span>
          <input name="difficulty" type="text" value="${escapeHtml(info.global.difficulty)}" placeholder="例如：入门 / 进阶 / 高段" />
        </label>
        <label class="free-info-field wide">
          <span>关键点</span>
          <textarea name="keyPoints" placeholder="记录全局判断、厚薄方向、攻防要点或常见误区。">${escapeHtml(info.global.keyPoints)}</textarea>
        </label>
      </div>
    `;
  }

  return "";
}

function reviewPage() {
  const game = state.draft;
  const freeMode = isFreeAnalysis(game);
  const move = state.moveIndex > 0 ? game.parsed.moves[state.moveIndex - 1] : null;
  const moveLabel = move
    ? `${move.color === "B" ? "黑" : "白"} · ${formatCoordinate(move, game.parsed.size)}`
    : "初始局面";
  const title = freeMode
    ? `${game.parsed.size} 路自由分析 · ${freeAnalysisLabel(game)}`
    : `${game.parsed.info.blackName} · ${game.parsed.info.whiteName}`;
  const subtitle = freeMode
    ? `${game.metadata.date} · ${game.metadata.platform} · 行棋手数 ${game.parsed.moves.length} · 添加棋子 ${countActiveFreePlacements(game)} 枚`
    : `${game.metadata.date} · ${game.metadata.platform} · ${game.metadata.result}`;
  const saveLabel = freeMode ? "完成分析并保存" : "完成点评并保存";
  const emptyText = freeMode
    ? "在棋盘上自由落子，定位关键局面后点击“截图并点评”。<br />每一条分析都会进入最终报告。"
    : "在棋盘上定位关键手，然后点击“截图并点评”。<br />每一条点评都会进入最终报告。";
  const comments = game.comments.length
    ? game.comments.map(commentCard).join("")
    : `<div class="comment-list-empty">${emptyText}</div>`;
  const mainMarkTools = markToolbar("main", state.mainMarks, state.mainMarkTool, state.mainMarkMenu);
  const playbackControls = `
    <div class="playback-controls">
      <div class="transport-buttons">
        <button class="icon-button" data-action="first-move" title="回到开局" ${state.moveIndex === 0 ? "disabled" : ""}>|‹</button>
        <button class="icon-button" data-action="previous-move" title="后退一步" ${state.moveIndex === 0 ? "disabled" : ""}>‹ 后退</button>
        <button class="icon-button" data-action="next-move" title="前进一步" ${state.moveIndex === game.parsed.moves.length ? "disabled" : ""}>前进 ›</button>
        <button class="icon-button" data-action="last-move" title="跳到终局" ${state.moveIndex === game.parsed.moves.length ? "disabled" : ""}>›|</button>
      </div>
      <label class="range-wrap">
        <input id="move-range" type="range" min="0" max="${game.parsed.moves.length}" value="${state.moveIndex}" aria-label="棋局进度" />
      </label>
      <span class="move-counter">第 ${state.moveIndex} / ${game.parsed.moves.length} 手</span>
    </div>
  `;

  return `
    <main class="page review-page ${freeMode ? "free-review-page" : ""}">
      <div class="review-header">
        <div class="review-title">
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <div class="review-header-actions">
          <button class="secondary-button" data-action="current-report">生成报告</button>
          <button class="primary-button" data-action="finish-review">${saveLabel}</button>
        </div>
      </div>
      <div class="review-layout">
        <section class="board-workspace ${freeMode ? "free-board-workspace" : ""}">
          <div class="board-column">
            <div class="main-board-wrap">
              <canvas id="main-board" class="${state.mainMarkTool || freeMode ? "marking-canvas" : ""}" aria-label="当前棋局局面"></canvas>
            </div>
            ${freeMode ? "" : `${mainMarkTools}${playbackControls}`}
          </div>
          <aside class="board-side-info ${freeMode ? "free-side-info" : ""}">
            <div>
              <span class="move-kicker">Current Position</span>
              <div class="move-number-large">${String(state.moveIndex).padStart(3, "0")}</div>
              <p class="move-description">${escapeHtml(moveLabel)}</p>
            </div>
            ${
              freeMode
                ? `<div class="free-board-actions">
                    <div class="free-mark-actions">
                      ${mainMarkTools}
                      <button class="ghost-button reset-board-button" data-action="reset-free-analysis">清空棋盘</button>
                    </div>
                    ${playbackControls}
                  </div>`
                : ""
            }
            ${freeControls()}
            <div class="player-panel">
              <div class="player-row">
                <span class="stone-dot black"></span>
                <span><strong>${escapeHtml(playerName(game.parsed.info.blackName, game.parsed.info.blackRank))}</strong><span>${freeMode ? "黑棋落子" : "执黑"}</span></span>
              </div>
              <div class="player-row">
                <span class="stone-dot white"></span>
                <span><strong>${escapeHtml(playerName(game.parsed.info.whiteName, game.parsed.info.whiteRank))}</strong><span>${freeMode ? "白棋落子" : "执白"}</span></span>
              </div>
            </div>
            <div class="snapshot-callout">
              <span class="move-kicker">Teacher Note</span>
              ${freeMode ? "" : "<p>截取当前局面并写下判断，也可以从这里继续摆出教学变化图。</p>"}
              <button class="primary-button gold" data-action="snapshot">截图并点评</button>
            </div>
          </aside>
        </section>
        <aside class="comment-sidebar">
          <div class="sidebar-report-actions">
            <button class="primary-button" data-action="preview-current-report">报告预览</button>
          </div>
          <div class="sidebar-header">
            <div><h2>点评归档</h2><p>按关键局面整理</p></div>
            <span class="comment-count">${game.comments.length}</span>
          </div>
          <div class="comment-list">${comments}</div>
        </aside>
      </div>
    </main>
  `;
}

function markToolbar(scope, marks, activeTool, menuOpen) {
  const toolNames = {
    number: "数字",
    letter: "字母",
    triangle: "△",
    circle: "圆圈",
  };
  return `
    <div class="board-mark-tools ${menuOpen ? "open" : ""}">
      <button class="secondary-button ${activeTool ? "active" : ""}" data-action="${scope}-mark-toggle">
        标记${marks.length ? ` · ${marks.length}` : ""}
      </button>
      ${
        menuOpen
          ? `
            <div class="mark-palette" aria-label="选择棋盘标记">
              ${Object.entries(toolNames)
                .map(
                  ([type, label]) => `
                    <button class="mark-option ${activeTool === type ? "active" : ""}" data-action="${scope}-mark-type" data-mark="${type}">
                      ${label}
                    </button>
                  `,
                )
                .join("")}
            </div>
            <button class="ghost-button" data-action="${scope}-mark-undo" ${marks.length ? "" : "disabled"}>撤销标记</button>
            <button class="ghost-button" data-action="${scope}-mark-clear" ${marks.length ? "" : "disabled"}>清空标记</button>
          `
          : ""
      }
    </div>
  `;
}

function commentTextStyleClass(style) {
  const safeStyle = normalizeCommentTextStyle(style);
  return `comment-text-${safeStyle.size}${safeStyle.bold ? " comment-text-bold" : ""}`;
}

function richTextHtmlFromPlainText(text = "", style = {}) {
  const safeStyle = normalizeCommentTextStyle(style);
  const classes = [safeStyle.size !== "medium" ? `rt-size-${safeStyle.size}` : "", safeStyle.bold ? "rt-bold" : ""]
    .filter(Boolean)
    .join(" ");
  const html = escapeHtml(text).replace(/\n/g, "<br>");
  return classes ? `<span class="${classes}">${html}</span>` : html;
}

function sanitizeRichTextHtml(html = "") {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  const output = document.createElement("div");
  const sizeClasses = new Set(["rt-size-small", "rt-size-medium", "rt-size-large"]);
  const weightClasses = new Set(["rt-bold", "rt-normal"]);

  const appendClean = (node, parent) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.append(document.createTextNode(node.textContent || ""));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();
    if (tag === "br") {
      parent.append(document.createElement("br"));
      return;
    }

    if (tag === "span") {
      const classes = [...node.classList].filter((className) => weightClasses.has(className) || sizeClasses.has(className));
      const target = classes.length ? document.createElement("span") : parent;
      if (classes.length) {
        target.className = classes.join(" ");
        parent.append(target);
      }
      [...node.childNodes].forEach((child) => appendClean(child, target));
      return;
    }

    [...node.childNodes].forEach((child) => appendClean(child, parent));
    if (["div", "p"].includes(tag)) parent.append(document.createElement("br"));
  };

  [...template.content.childNodes].forEach((node) => appendClean(node, output));
  while (output.lastChild?.nodeName === "BR") output.lastChild.remove();
  return output.innerHTML;
}

function plainTextFromRichHtml(html = "") {
  const template = document.createElement("template");
  template.innerHTML = sanitizeRichTextHtml(html);
  let text = "";
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName === "BR") {
      text += "\n";
      return;
    }
    [...node.childNodes].forEach(walk);
  };
  [...template.content.childNodes].forEach(walk);
  return text;
}

function commentRichTextHtml(comment) {
  if (comment?.richTextHtml) return sanitizeRichTextHtml(comment.richTextHtml);
  return richTextHtmlFromPlainText(comment?.text || "", comment?.textStyle);
}

function richTextStyleToolbar(scope) {
  return `
    <div class="text-style-toolbar" aria-label="文字样式工具">
      <div class="text-style-group">
        <span>字体大小</span>
        <div class="text-size-controls">
          ${commentTextSizeOptions
            .map(
              ([size, label]) => `
                <button data-action="rich-font-size" data-editor="${scope}" data-size="${size}">
                  ${label}
                </button>
              `,
            )
            .join("")}
        </div>
      </div>
      <button class="text-bold-toggle" data-action="rich-bold" data-editor="${scope}">
        B 加粗
      </button>
    </div>
  `;
}

function commentCard(comment) {
  const variations = commentVariations(comment);
  const richHtml = commentRichTextHtml(comment);
  return `
    <article class="comment-card">
      <img class="comment-image" src="${variations[0]?.image || comment.screenshot}" alt="第 ${comment.moveNumber} 手点评局面" />
      <div class="comment-body">
        <div class="comment-meta">
          <span class="move-badge">第 ${comment.moveNumber} 手</span>
          ${variations.length ? `<span class="variation-tag">${variations.length} 张变化图</span>` : "<span>局面点评</span>"}
        </div>
        <div class="comment-card-text rich-text-output">${richHtml}</div>
        <div class="comment-actions">
          <button class="text-action analyze" data-action="analyze-comment" data-id="${comment.id}">分析</button>
          <button class="text-action" data-action="goto-comment" data-move="${comment.moveNumber}">定位该手</button>
          <button class="text-action danger" data-action="delete-comment" data-id="${comment.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function savedVariationList() {
  if (!state.modal.variations.length) {
    return `<div class="variation-list-empty">尚未保存变化图，可以从当前局面添加多条教学变化。</div>`;
  }

  return `
    <div class="variation-list">
      ${state.modal.variations
        .map(
          (variation, index) => `
            <article class="saved-variation-card">
              <img src="${variation.image}" alt="变化图 ${index + 1}" />
              <div>
                <strong>变化图 ${String(index + 1).padStart(2, "0")}</strong>
                <span>起点第 ${variation.baseMoveNumber} 手 · ${variation.moves.length} 手变化 · ${variation.marks.length} 个标记</span>
                <div class="saved-variation-text rich-text-output">${
                  variation.richTextHtml
                    ? sanitizeRichTextHtml(variation.richTextHtml)
                    : escapeHtml(variation.text || "未填写变化图点评")
                }</div>
              </div>
              <div class="saved-variation-actions">
                <button class="text-action analyze" data-action="edit-variation" data-id="${variation.id}">修改</button>
                <button class="text-action danger" data-action="delete-variation" data-id="${variation.id}">删除</button>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function variationPanel() {
  const isEditingVariation = Boolean(state.modal.variationEnabled);
  return `
    <div class="variation-entry variation-summary-entry">
      <div class="variation-entry-heading">
        <div>
          <h3>教学变化图</h3>
          <p>${
            isEditingVariation
              ? "变化图编辑窗口已打开，保存或取消后会回到这里。"
              : "可为这一手棋添加多张变化图，并随时回来修改。"
          }</p>
        </div>
        <button class="secondary-button" data-action="enable-variation" ${isEditingVariation ? "disabled" : ""}>
          ${isEditingVariation ? "正在编辑" : "新增变化图"}
        </button>
      </div>
      ${savedVariationList()}
    </div>
  `;
}

function variationModal() {
  return `
    <div class="modal-backdrop variation-backdrop" role="presentation">
      <section class="modal variation-modal" role="dialog" aria-modal="true" aria-labelledby="variation-modal-title">
        <div class="modal-header variation-modal-header">
          <div>
            <h2 id="variation-modal-title">${state.modal.editingVariationId ? "修改变化图" : "新增变化图"}</h2>
            <p>点击棋盘摆放变化；可添加标记与文字点评，完成后保存回当前点评。</p>
          </div>
          <button class="modal-close" data-action="cancel-variation" aria-label="关闭变化图窗口">×</button>
        </div>
        <div class="variation-modal-body">
          <div class="variation-board-panel">
            <div class="variation-board-heading">
              <div>
                <span class="variation-total">已保存 ${state.modal.variations.length} 张</span>
                <h3>变化图棋盘</h3>
              </div>
              <span class="variation-origin">变化起点：第 ${state.modal.variationBaseMoveNumber} 手</span>
            </div>
            <div class="variation-toolbar">
              <div class="color-toggle">
                <button class="color-option ${state.modal.nextColor === "B" ? "active" : ""}" data-action="variation-color" data-color="B">
                  <span class="mini-stone black"></span>黑
                </button>
                <button class="color-option ${state.modal.nextColor === "W" ? "active" : ""}" data-action="variation-color" data-color="W">
                  <span class="mini-stone white"></span>白
                </button>
              </div>
              <button class="icon-button rewind-button" data-action="variation-rewind-base" ${state.modal.variationBaseMoveNumber > 0 ? "" : "disabled"}>倒退一手</button>
              <button class="icon-button" data-action="variation-undo" ${state.modal.variationMoves.length ? "" : "disabled"}>撤销变化手</button>
              <button class="icon-button" data-action="variation-clear" ${state.modal.variationMoves.length ? "" : "disabled"}>清空变化</button>
            </div>
            ${markToolbar("variation", state.modal.variationMarks, state.modal.variationMarkTool, state.modal.variationMarkMenu)}
            <div class="variation-board-wrap variation-board-window">
              <canvas id="variation-board" class="${state.modal.variationMarkTool ? "marking-canvas" : ""}" aria-label="教师变化图棋盘"></canvas>
            </div>
            <p class="variation-help">已摆放 ${state.modal.variationMoves.length} 手变化 · ${state.modal.variationMarks.length} 个标记</p>
          </div>
          <aside class="variation-editor-panel">
            <div class="variation-comment-field">
              <div class="comment-editor-heading compact">
                <span class="field-label">变化图点评</span>
                ${richTextStyleToolbar("variation")}
              </div>
              <div
                id="variation-editor"
                class="rich-text-editor compact variation-rich-editor"
                data-rich-editor="variation"
                contenteditable="true"
                role="textbox"
                aria-multiline="true"
                data-placeholder="说明该变化图的判断、目的或关键手段。"
              >${sanitizeRichTextHtml(state.modal.variationRichTextHtml)}</div>
            </div>
            <div class="variation-editor-footer">
              <p class="variation-help">保存后会回到原点评窗口，可继续新增其他变化图。</p>
              <div>
                <button class="ghost-button" data-action="cancel-variation">取消</button>
                <button class="secondary-button" data-action="save-variation">${state.modal.editingVariationId ? "保存变化图修改" : "保存该变化图"}</button>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  `;
}

function commentModal() {
  const isEditing = state.modal.mode === "edit";
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="comment-modal-title">
        <div class="modal-header">
          <div>
            <h2 id="comment-modal-title">第 ${state.modal.moveNumber} 手 · ${isEditing ? "分析并修改" : "局面点评"}</h2>
            <p>${isEditing ? "可修改点评文字，并继续新增、调整或删除变化图。" : "当前局面截图已生成，请补充教师判断与教学思路。"}</p>
          </div>
          <button class="modal-close" data-action="close-modal" aria-label="关闭">×</button>
        </div>
        <div class="comment-modal-body">
          <div>
            <div class="snapshot-preview">
              <img src="${state.modal.screenshot}" alt="当前局面截图" />
            </div>
            <p class="preview-label">原局面截图 · 第 ${state.modal.moveNumber} 手</p>
          </div>
          <div class="comment-form-column">
            <div class="comment-editor-heading">
              <label class="field-label" for="comment-editor">点评内容</label>
              ${richTextStyleToolbar("comment")}
            </div>
            <div
              id="comment-editor"
              class="rich-text-editor"
              data-rich-editor="comment"
              contenteditable="true"
              role="textbox"
              aria-multiline="true"
              data-placeholder="例如：此处黑棋应优先补强右下角，实战选择脱先后，白棋获得了严厉的靠断手段。"
            >${sanitizeRichTextHtml(state.modal.richTextHtml)}</div>
            ${variationPanel()}
            <div class="modal-actions">
              <button class="ghost-button" data-action="close-modal">取消</button>
              <button class="primary-button" data-action="submit-comment">${isEditing ? "保存点评修改" : "保存本条点评"}</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;
}

function freeInfoDialog() {
  const type = state.freeInfoDialog.type;
  const label = freeAnalysisTypeLabels[type];
  const descriptions = {
    calculation: "填写后会展示在“计算解析”PDF 首页，并自动保存到当前归档。",
    joseki: "填写后会展示在“定式变化”PDF 首页，并自动保存到当前归档。",
    global: "填写后会展示在“全局分析”PDF 首页，并自动保存到当前归档。",
  };
  const description = descriptions[type] || "填写后会展示在 PDF 首页，并自动保存到当前归档。";
  return `
    <div class="modal-backdrop free-info-backdrop" role="presentation">
      <section class="auth-modal free-info-modal" role="dialog" aria-modal="true" aria-labelledby="free-info-dialog-title">
        <button class="modal-close auth-close" data-action="close-free-info-dialog" aria-label="关闭">×</button>
        <p class="eyebrow">Free Analysis</p>
        <h2 id="free-info-dialog-title">${escapeHtml(label)}信息</h2>
        <p class="auth-copy">${description}</p>
        <form id="free-info-form" class="auth-form free-info-form" data-type="${escapeHtml(type)}">
          ${freeInfoDialogFields(type)}
          <div class="free-info-form-actions">
            <button class="ghost-button" type="button" data-action="close-free-info-dialog">取消</button>
            <button class="primary-button" type="submit">保存并自动归档</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function accountDialog() {
  if (state.accountDialog.type === "login") {
    return `
      <div class="modal-backdrop auth-backdrop" role="presentation">
        <section class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="login-dialog-title">
          <button class="modal-close auth-close" data-action="close-account-dialog" aria-label="关闭">×</button>
          <p class="eyebrow">Account Login</p>
          <h2 id="login-dialog-title">登录教学工作台</h2>
          <p class="auth-copy">请输入账号和密码后进入。初始管理员账号为“教师管理001”。</p>
          <form id="login-form" class="auth-form">
            <label class="form-field">
              <span>账号</span>
              <input name="account" type="text" autocomplete="username" required placeholder="请输入账号" />
            </label>
            <label class="form-field">
              <span>密码</span>
              <input name="password" type="password" autocomplete="current-password" required placeholder="请输入密码" />
            </label>
            <button class="primary-button" type="submit">登录</button>
          </form>
        </section>
      </div>
    `;
  }

  if (state.accountDialog.type === "add-account") {
    return `
      <div class="modal-backdrop auth-backdrop" role="presentation">
        <section class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="add-account-title">
          <button class="modal-close auth-close" data-action="close-account-dialog" aria-label="关闭">×</button>
          <p class="eyebrow">Teacher Account</p>
          <h2 id="add-account-title">添加账号</h2>
          <p class="auth-copy">添加后，该账号会拥有独立的归档内容空间。</p>
          <form id="add-account-form" class="auth-form">
            <label class="form-field">
              <span>账号</span>
              <input name="account" type="text" required placeholder="例如：张老师001" />
            </label>
            <label class="form-field">
              <span>密码</span>
              <input name="password" type="password" required placeholder="请输入初始密码" />
            </label>
            <label class="form-field">
              <span>账号属性</span>
              <select name="role" required>
                <option value="教师">教师</option>
                <option value="管理员">管理员</option>
              </select>
            </label>
            <button class="primary-button" type="submit">保存</button>
          </form>
        </section>
      </div>
    `;
  }

  return "";
}

function confirmDialog() {
  if (state.confirmDialog.type === "delete-account") {
    const account = state.accounts.find((item) => item.id === state.confirmDialog.id);
    return `
      <div class="modal-backdrop confirm-backdrop" role="presentation">
        <section class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
          <div class="confirm-icon">!</div>
          <h2 id="confirm-dialog-title">确认删除账号？</h2>
          <p>
            即将删除“${escapeHtml(account?.account || "该账号")}”。
            删除后该账号的独立归档内容也会从本机移除，请确认不再需要。
          </p>
          <div class="confirm-actions">
            <button class="danger-button" data-action="confirm-delete-account">确认删除</button>
            <button class="primary-button" data-action="close-confirm-dialog">取消</button>
          </div>
        </section>
      </div>
    `;
  }

  if (state.confirmDialog.type !== "reset-free-analysis") return "";
  const commentCount = state.draft?.comments?.length || 0;
  return `
    <div class="modal-backdrop confirm-backdrop" role="presentation">
      <section class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div class="confirm-icon">!</div>
        <h2 id="confirm-dialog-title">是否清除点评归档？</h2>
        <p>
          清空棋盘会移除当前自由分析棋盘上的行棋与添加棋子。
          右侧“点评归档”当前有 ${commentCount} 条内容，是否一并清空？
        </p>
        <div class="confirm-actions">
          <button class="danger-button" data-action="confirm-reset-clear-comments">是，清空归档</button>
          <button class="primary-button" data-action="confirm-reset-keep-comments">否，保留归档</button>
        </div>
        <button class="ghost-button confirm-cancel" data-action="close-confirm-dialog">取消操作</button>
      </section>
    </div>
  `;
}

function reportOverlay() {
  return `
    <div class="report-overlay">
      <div class="report-progress">
        <div class="report-progress-ring"></div>
        <p>正在整理点评与局面图片，生成 PDF 报告…</p>
      </div>
    </div>
  `;
}

function reportPreviewModal() {
  return `
    <div class="pdf-preview-backdrop" role="presentation">
      <section class="pdf-preview-modal" role="dialog" aria-modal="true" aria-labelledby="pdf-preview-title">
        <header class="pdf-preview-header">
          <div>
            <p class="eyebrow">PDF Preview</p>
            <h2 id="pdf-preview-title">报告预览</h2>
            <span>${escapeHtml(state.reportPreview.filename)}</span>
          </div>
          <div class="pdf-preview-actions">
            <a class="secondary-button" href="${escapeHtml(state.reportPreview.url)}" download="${escapeHtml(
              state.reportPreview.filename,
            )}">下载 PDF</a>
            <button class="modal-close" data-action="close-report-preview" aria-label="关闭">×</button>
          </div>
        </header>
        <iframe class="pdf-preview-frame" src="${escapeHtml(state.reportPreview.url)}" title="PDF 报告预览"></iframe>
      </section>
    </div>
  `;
}

function render() {
  const previousModalScroll = document.querySelector(".modal")?.scrollTop || 0;
  const previousModalBodyScroll = document.querySelector(".comment-modal-body")?.scrollTop || 0;
  const previousVariationBodyScroll = document.querySelector(".variation-modal-body")?.scrollTop || 0;
  const previousVariationPanelScroll = document.querySelector(".variation-editor-panel")?.scrollTop || 0;
  let page = landingPage();
  if (state.screen === "home") page = homePage();
  if (state.screen === "archive") page = archivePage();
  if (state.screen === "teacher-management") page = teacherManagementPage();
  if (state.screen === "metadata" && state.draft) page = metadataPage();
  if (state.screen === "review" && state.draft) page = reviewPage();
  app.innerHTML = shell(page);
  bindEvents();
  drawActiveBoards();
  if (state.modal && previousModalScroll) {
    document.querySelector(".modal").scrollTop = previousModalScroll;
  }
  if (state.modal && previousModalBodyScroll) {
    document.querySelector(".comment-modal-body").scrollTop = previousModalBodyScroll;
  }
  if (state.modal?.variationEnabled && previousVariationBodyScroll) {
    document.querySelector(".variation-modal-body").scrollTop = previousVariationBodyScroll;
  }
  if (state.modal?.variationEnabled && previousVariationPanelScroll) {
    document.querySelector(".variation-editor-panel").scrollTop = previousVariationPanelScroll;
  }
}

function drawActiveBoards() {
  if (state.screen === "review" && state.draft) {
    const canvas = document.querySelector("#main-board");
    if (canvas) {
      drawBoard(canvas, state.positions[state.moveIndex], {
        lastMove:
          state.moveIndex && (!isFreeAnalysis() || state.freeStoneMode === "alternate")
            ? state.draft.parsed.moves[state.moveIndex - 1]
            : null,
        marks: state.mainMarks,
      });
    }
  }

  const variationCanvas = document.querySelector("#variation-board");
  if (variationCanvas && state.modal?.variationEnabled) {
    drawBoard(variationCanvas, state.modal.variationBoard, {
      labels: state.modal.variationMoves.map((move, index) => ({ ...move, number: index + 1 })),
      marks: state.modal.variationMarks,
    });
  }
}

function bindEvents() {
  document.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", handleAction);
  });

  const fileInput = document.querySelector("#sgf-input");
  fileInput?.addEventListener("change", () => {
    if (fileInput.files?.[0]) acceptFile(fileInput.files[0]);
  });

  const dropZone = document.querySelector("#drop-zone");
  if (dropZone) {
    ["dragenter", "dragover"].forEach((type) =>
      dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        dropZone.classList.add("dragging");
      }),
    );
    ["dragleave", "drop"].forEach((type) =>
      dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        dropZone.classList.remove("dragging");
      }),
    );
    dropZone.addEventListener("drop", (event) => {
      if (event.dataTransfer?.files?.[0]) acceptFile(event.dataTransfer.files[0]);
    });
    dropZone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") fileInput?.click();
    });
  }

  document.querySelector("#metadata-form")?.addEventListener("submit", submitMetadata);
  document.querySelector("#login-form")?.addEventListener("submit", submitLogin);
  document.querySelector("#add-account-form")?.addEventListener("submit", submitAddAccount);
  document.querySelector("#free-info-form")?.addEventListener("submit", submitFreeInfoDialog);
  document.querySelector("#move-range")?.addEventListener("input", (event) => {
    setMove(Number(event.target.value));
  });
  const mainBoard = document.querySelector("#main-board");
  mainBoard?.addEventListener("click", handleMainBoardClick);
  mainBoard?.addEventListener("contextmenu", handleMainBoardContextMenu);
  document.querySelectorAll("[data-rich-editor]").forEach((element) => {
    element.addEventListener("input", () => syncRichEditorState(element.dataset.richEditor));
  });
  document.querySelectorAll(".text-style-toolbar button").forEach((element) => {
    element.addEventListener("mousedown", (event) => event.preventDefault());
  });
  document.querySelectorAll("[data-free-info]").forEach((element) => {
    element.addEventListener("input", updateFreeAnalysisInfo);
  });
  document.querySelector("#variation-board")?.addEventListener("click", placeVariationMove);
}

function handleAction(event) {
  const action = event.currentTarget.dataset.action;
  const actions = {
    home: goHome,
    "open-login": openLogin,
    "close-account-dialog": closeAccountDialog,
    "toggle-account-menu": toggleAccountMenu,
    logout: logout,
    "toggle-teacher-menu": toggleTeacherMenu,
    "open-add-account": openAddAccount,
    "open-account-management": openAccountManagement,
    "toggle-account-manage": () => toggleAccountManage(event.currentTarget.dataset.id),
    "request-delete-account": () => requestDeleteAccount(event.currentTarget.dataset.id),
    "confirm-delete-account": confirmDeleteAccount,
    "open-analysis": openAnalysis,
    "start-free-analysis": () => startFreeAnalysis(),
    "open-archive": openArchive,
    "archive-scroll": () => scrollArchiveSection(event.currentTarget.dataset.target),
    "toggle-archive-section": () => toggleArchiveSection(event.currentTarget.dataset.category),
    "toggle-archive-manage": () => toggleArchiveManage(event.currentTarget.dataset.category),
    "toggle-archive-selection": () => toggleArchiveSelection(event.currentTarget.dataset.id),
    "delete-selected-archives": () => deleteSelectedArchives(event.currentTarget.dataset.category),
    upload: openFilePicker,
    "load-demo": loadDemo,
    "cancel-metadata": openAnalysis,
    "free-board-size": () => changeFreeBoardSize(Number(event.currentTarget.dataset.size)),
    "free-stone-mode": () => setFreeStoneMode(event.currentTarget.dataset.mode),
    "free-analysis-type": () => setFreeAnalysisType(event.currentTarget.dataset.type),
    "open-free-info-dialog": () => openFreeInfoDialog(event.currentTarget.dataset.type),
    "close-free-info-dialog": closeFreeInfoDialog,
    "reset-free-analysis": resetFreeAnalysis,
    "confirm-reset-clear-comments": () => confirmResetFreeAnalysis(true),
    "confirm-reset-keep-comments": () => confirmResetFreeAnalysis(false),
    "close-confirm-dialog": closeConfirmDialog,
    "first-move": () => setMove(0),
    "previous-move": () => setMove(state.moveIndex - 1),
    "next-move": () => setMove(state.moveIndex + 1),
    "last-move": () => setMove(state.draft.parsed.moves.length),
    "main-mark-toggle": toggleMainMarkMenu,
    "main-mark-type": () => setMainMarkType(event.currentTarget.dataset.mark),
    "main-mark-undo": undoMainMark,
    "main-mark-clear": clearMainMarks,
    snapshot: openCommentModal,
    "analyze-comment": () => openEditComment(event.currentTarget.dataset.id),
    "rich-font-size": () =>
      applyRichTextStyle(event.currentTarget.dataset.editor, "size", event.currentTarget.dataset.size),
    "rich-bold": () => applyRichTextStyle(event.currentTarget.dataset.editor, "bold"),
    "close-modal": closeModal,
    "enable-variation": enableVariation,
    "edit-variation": () => editVariation(event.currentTarget.dataset.id),
    "delete-variation": () => deleteVariation(event.currentTarget.dataset.id),
    "variation-color": () => setVariationColor(event.currentTarget.dataset.color),
    "variation-rewind-base": rewindVariationBase,
    "variation-undo": undoVariation,
    "variation-clear": clearVariation,
    "variation-mark-toggle": toggleVariationMarkMenu,
    "variation-mark-type": () => setVariationMarkType(event.currentTarget.dataset.mark),
    "variation-mark-undo": undoVariationMark,
    "variation-mark-clear": clearVariationMarks,
    "cancel-variation": cancelVariation,
    "save-variation": saveVariation,
    "submit-comment": submitComment,
    "preview-current-report": previewCurrentReport,
    "close-report-preview": closeReportPreview,
    "finish-review": finishReview,
    "current-report": currentReport,
    "continue-game": () => continueGame(event.currentTarget.dataset.id),
    "report-game": () => reportSavedGame(event.currentTarget.dataset.id),
    "goto-comment": () => setMove(Number(event.currentTarget.dataset.move)),
    "delete-comment": () => deleteComment(event.currentTarget.dataset.id),
  };
  Promise.resolve(actions[action]?.()).catch((error) => {
    console.error(error);
    toast(error.message || "操作失败，请重试。", "error");
  });
}

function requireLogin() {
  if (isLoggedIn()) return true;
  state.accountDialog = { type: "login" };
  state.accountMenuOpen = false;
  state.teacherMenuOpen = false;
  render();
  toast("请先登录账号。", "error");
  return false;
}

function openLogin() {
  state.accountDialog = { type: "login" };
  state.accountMenuOpen = false;
  state.teacherMenuOpen = false;
  render();
  setTimeout(() => document.querySelector('#login-form input[name="account"]')?.focus());
}

function closeAccountDialog() {
  state.accountDialog = null;
  render();
}

function toggleAccountMenu() {
  if (!isLoggedIn()) return openLogin();
  state.accountMenuOpen = !state.accountMenuOpen;
  state.teacherMenuOpen = false;
  render();
}

function toggleTeacherMenu() {
  if (!isAdminAccount()) return;
  state.teacherMenuOpen = !state.teacherMenuOpen;
  state.accountMenuOpen = false;
  render();
}

function logout() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  state.currentAccountId = null;
  state.games = [];
  state.screen = "landing";
  state.draft = null;
  state.positions = [];
  state.moveIndex = 0;
  state.modal = null;
  state.freeInfoDialog = null;
  state.confirmDialog = null;
  state.accountDialog = null;
  state.accountMenuOpen = false;
  state.teacherMenuOpen = false;
  state.accountManageId = null;
  clearReportPreview();
  render();
  toast("已退出登录。");
}

function openAddAccount() {
  if (!isAdminAccount()) return;
  state.accountDialog = { type: "add-account" };
  state.teacherMenuOpen = false;
  render();
  setTimeout(() => document.querySelector('#add-account-form input[name="account"]')?.focus());
}

async function openAccountManagement() {
  if (!isAdminAccount()) return;
  await refreshSharedData().catch((error) => console.warn(error));
  if (!isAdminAccount()) return;
  clearReportPreview();
  state.screen = "teacher-management";
  state.draft = null;
  state.modal = null;
  state.freeInfoDialog = null;
  state.confirmDialog = null;
  state.accountDialog = null;
  state.accountMenuOpen = false;
  state.teacherMenuOpen = false;
  render();
}

function toggleAccountManage(id) {
  if (!isAdminAccount()) return;
  state.accountManageId = state.accountManageId === id ? null : id;
  render();
}

function requestDeleteAccount(id) {
  if (!isAdminAccount()) return;
  if (id === state.currentAccountId) {
    toast("当前登录账号不能删除。", "error");
    return;
  }
  if (!state.accounts.some((account) => account.id === id)) return;
  state.confirmDialog = { type: "delete-account", id };
  render();
}

async function submitLogin(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const accountName = String(formData.get("account") || "").trim();
  const password = String(formData.get("password") || "");
  const sharedSnapshot = await refreshSharedData().catch((error) => {
    console.warn(error);
    return null;
  });
  const account = state.accounts.find((item) => item.account === accountName && item.password === password);
  if (!account) {
    toast("账号或密码不正确。", "error");
    return;
  }

  state.currentAccountId = account.id;
  state.games = sharedSnapshot?.gamesByAccount?.[account.id] || loadGames(account.id);
  localStorage.setItem(SESSION_STORAGE_KEY, account.id);
  state.screen = "landing";
  state.draft = null;
  state.positions = [];
  state.moveIndex = 0;
  state.mainMarks = [];
  state.mainMarkMenu = false;
  state.mainMarkTool = null;
  state.modal = null;
  state.freeInfoDialog = null;
  state.confirmDialog = null;
  state.accountDialog = null;
  state.accountMenuOpen = false;
  state.teacherMenuOpen = false;
  state.accountManageId = null;
  clearReportPreview();
  render();
  toast(`登录成功：${account.account}`);
}

async function submitAddAccount(event) {
  event.preventDefault();
  if (!isAdminAccount()) return;
  const formData = new FormData(event.currentTarget);
  const accountName = String(formData.get("account") || "").trim();
  const password = String(formData.get("password") || "");
  const role = normalizeAccountRole(formData.get("role"));
  await refreshSharedData().catch((error) => console.warn(error));
  if (!isAdminAccount()) return;
  if (!accountName || !password) {
    toast("请填写账号和密码。", "error");
    return;
  }
  if (state.accounts.some((account) => account.account === accountName)) {
    toast("该账号已存在，请换一个账号名称。", "error");
    return;
  }

  const account = {
    id: makeId(),
    account: accountName,
    password,
    role,
    createdAt: new Date().toISOString(),
  };
  const previousAccounts = state.accounts;
  state.accounts = [...state.accounts, account];
  localStorage.setItem(accountGamesStorageKey(account.id), "[]");
  if (!persistAccounts()) {
    state.accounts = previousAccounts;
    localStorage.removeItem(accountGamesStorageKey(account.id));
    return;
  }
  state.accountDialog = null;
  state.screen = "teacher-management";
  render();
  toast("账号添加成功。");
}

function confirmDeleteAccount() {
  if (!isAdminAccount()) return;
  const id = state.confirmDialog?.id;
  const account = state.accounts.find((item) => item.id === id);
  if (!account) {
    state.confirmDialog = null;
    render();
    return;
  }
  if (id === state.currentAccountId) {
    state.confirmDialog = null;
    render();
    toast("当前登录账号不能删除。", "error");
    return;
  }
  const remainingAccounts = state.accounts.filter((item) => item.id !== id);
  const hasAdmin = remainingAccounts.some((item) => item.role === "管理员");
  if (!hasAdmin) {
    state.confirmDialog = null;
    render();
    toast("至少需要保留一个管理员账号。", "error");
    return;
  }

  const previousAccounts = state.accounts;
  const deletedAccountGames = loadGames(id);
  state.accounts = remainingAccounts;
  if (!persistAccounts()) {
    state.accounts = previousAccounts;
    state.confirmDialog = null;
    render();
    return;
  }
  localStorage.removeItem(accountGamesStorageKey(id));
  cleanupArchiveImageFolders(deletedAccountGames.map((game) => game.id));
  state.confirmDialog = null;
  state.accountManageId = null;
  render();
  toast(`账号“${account.account}”已删除。`);
}

function openAnalysis() {
  if (!requireLogin()) return;
  clearReportPreview();
  state.screen = "home";
  state.draft = null;
  state.modal = null;
  state.freeInfoDialog = null;
  state.confirmDialog = null;
  state.mainMarks = [];
  state.mainMarkMenu = false;
  state.mainMarkTool = null;
  render();
}

async function openArchive() {
  if (!requireLogin()) return;
  await refreshSharedData().catch((error) => console.warn(error));
  clearReportPreview();
  state.screen = "archive";
  state.draft = null;
  state.modal = null;
  state.freeInfoDialog = null;
  state.confirmDialog = null;
  state.mainMarks = [];
  state.mainMarkMenu = false;
  state.mainMarkTool = null;
  render();
}

function scrollArchiveSection(target) {
  if (!archiveCategoryDefinitions.some((category) => category.id === target)) return;
  state.archiveExpanded = {
    ...state.archiveExpanded,
    [target]: true,
  };
  render();
  document.querySelector(`#archive-${target}`)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function toggleArchiveSection(categoryId) {
  if (!archiveCategoryDefinitions.some((category) => category.id === categoryId)) return;
  state.archiveExpanded = {
    ...state.archiveExpanded,
    [categoryId]: !state.archiveExpanded[categoryId],
  };
  if (!state.archiveExpanded[categoryId] && state.archiveDeleteCategory === categoryId) {
    state.archiveDeleteCategory = null;
    state.archiveSelectedIds = [];
  }
  render();
}

function toggleArchiveManage(categoryId) {
  if (!archiveCategoryDefinitions.some((category) => category.id === categoryId)) return;
  const hasItems = state.games.some((game) => archiveCategoryId(game) === categoryId);
  if (!hasItems) {
    toast("这一栏暂无可管理文件。", "error");
    return;
  }
  const nextCategory = state.archiveDeleteCategory === categoryId ? null : categoryId;
  state.archiveDeleteCategory = nextCategory;
  state.archiveSelectedIds = [];
  state.archiveExpanded = {
    ...state.archiveExpanded,
    [categoryId]: true,
  };
  render();
}

function toggleArchiveSelection(id) {
  const game = state.games.find((item) => item.id === id);
  if (!game) return;
  const categoryId = archiveCategoryId(game);
  if (state.archiveDeleteCategory !== categoryId) return;
  state.archiveSelectedIds = state.archiveSelectedIds.includes(id)
    ? state.archiveSelectedIds.filter((item) => item !== id)
    : [...state.archiveSelectedIds, id];
  render();
}

function restoreDeletedArchives(deletedEntries, categoryId) {
  if (!deletedEntries.length) return;
  const existingIds = new Set(state.games.map((game) => game.id));
  const restoredGames = [...state.games];
  for (const { game, index } of [...deletedEntries].sort((a, b) => a.index - b.index)) {
    if (existingIds.has(game.id)) continue;
    restoredGames.splice(Math.min(index, restoredGames.length), 0, game);
    existingIds.add(game.id);
  }

  const previousGames = state.games;
  state.games = restoredGames;
  if (!persistGames()) {
    state.games = previousGames;
    return;
  }
  state.archiveDeleteCategory = categoryId;
  state.archiveSelectedIds = [];
  state.archiveExpanded = {
    ...state.archiveExpanded,
    [categoryId]: true,
  };
  render();
  toast(`已撤销删除，恢复 ${deletedEntries.length} 份归档文件。`);
}

function deleteSelectedArchives(categoryId) {
  if (state.archiveDeleteCategory !== categoryId) return;
  const selectedIds = new Set(state.archiveSelectedIds);
  const deletedEntries = state.games
    .map((game, index) => ({ game, index }))
    .filter(({ game }) => selectedIds.has(game.id) && archiveCategoryId(game) === categoryId);
  if (!deletedEntries.length) {
    toast("请先勾选需要删除的文件。", "error");
    return;
  }

  const previousGames = state.games;
  const deletedIds = new Set(deletedEntries.map(({ game }) => game.id));
  state.games = state.games.filter((game) => !deletedIds.has(game.id));
  state.archiveSelectedIds = [];
  if (!state.games.some((item) => archiveCategoryId(item) === categoryId)) {
    state.archiveDeleteCategory = null;
  }
  if (!persistGames()) {
    state.games = previousGames;
    state.archiveDeleteCategory = categoryId;
    return;
  }

  render();
  toast(`已删除 ${deletedEntries.length} 份归档文件。`, "success", {
    actionLabel: "撤销",
    action: () => restoreDeletedArchives(deletedEntries, categoryId),
    onExpire: () => cleanupArchiveImageFolders(deletedEntries.map(({ game }) => game.id)),
    duration: 8000,
  });
}

function createFreeDraft(size = 19, id = makeId()) {
  const now = new Date().toISOString();
  return {
    id,
    type: "free",
    fileName: `自由分析-${size}路棋盘`,
    sgfText: "",
    freeStoneMode: state.freeStoneMode,
    freePlacements: [],
    freeAnalysisType: "global",
    freeAnalysisInfo: cloneFreeAnalysisInfo(),
    parsed: {
      size,
      moves: [],
      setup: { black: [], white: [] },
      info: {
        blackName: "黑棋",
        blackRank: "",
        whiteName: "白棋",
        whiteRank: "",
        date: today(),
        result: "自由分析",
        event: "课堂自由分析",
        place: "自由分析",
        komi: "",
        rules: "",
      },
    },
    metadata: {
      date: today(),
      platform: "自由分析",
      result: "课堂推演",
    },
    comments: [],
    createdAt: now,
    updatedAt: now,
  };
}

function startFreeAnalysis(size = 19) {
  if (!requireLogin()) return;
  state.freeStoneMode = "alternate";
  state.draft = createFreeDraft(size);
  ensureFreeAnalysisConfig(state.draft);
  state.positions = buildReviewPositions(state.draft);
  state.moveIndex = 0;
  state.mainMarks = [];
  state.mainMarkMenu = false;
  state.mainMarkTool = null;
  state.modal = null;
  state.confirmDialog = null;
  state.screen = "review";
  render();
}

function openFilePicker() {
  if (!requireLogin()) return;
  document.querySelector("#sgf-input")?.click();
}

function goHome() {
  clearReportPreview();
  state.screen = "landing";
  state.draft = null;
  state.modal = null;
  state.freeInfoDialog = null;
  state.confirmDialog = null;
  render();
}

async function acceptFile(file) {
  if (!requireLogin()) return;
  if (!file.name.toLowerCase().endsWith(".sgf")) {
    toast("文件格式不正确，请上传 .sgf 棋谱文件。", "error");
    return;
  }

  try {
    const sgfText = await file.text();
    const parsed = parseSgf(sgfText);
    state.draft = {
      id: makeId(),
      type: "game",
      fileName: file.name,
      sgfText,
      parsed,
      metadata: {
        date: toInputDate(parsed.info.date),
        platform: parsed.info.place || parsed.info.event || "",
        result: parsed.info.result || "",
      },
      comments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.positions = buildReviewPositions(state.draft);
    state.moveIndex = 0;
    state.mainMarks = [];
    state.mainMarkMenu = false;
    state.mainMarkTool = null;
    state.freeInfoDialog = null;
    state.screen = "metadata";
    render();
    toast(`棋谱已导入：共 ${parsed.moves.length} 手主分支。`);
  } catch (error) {
    toast(`无法读取棋谱：${error.message}`, "error");
  }
}

async function loadDemo() {
  try {
    const response = await fetch("./sample/demo.sgf");
    if (!response.ok) throw new Error("示例棋谱读取失败");
    const text = await response.text();
    await acceptFile(new File([text], "教学示例棋局.sgf", { type: "application/x-go-sgf" }));
  } catch (error) {
    toast(error.message, "error");
  }
}

function submitMetadata(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.draft.metadata = {
    date: data.get("date")?.toString().trim(),
    platform: data.get("platform")?.toString().trim(),
    result: data.get("result")?.toString().trim(),
  };
  state.screen = "review";
  state.moveIndex = 0;
  render();
}

function setMove(index) {
  const max = state.draft?.parsed.moves.length || 0;
  state.moveIndex = Math.max(0, Math.min(max, Number(index) || 0));
  state.mainMarks = [];
  state.mainMarkMenu = false;
  state.mainMarkTool = null;
  render();
}

function toggleMainMarkMenu() {
  state.mainMarkMenu = !state.mainMarkMenu;
  if (!state.mainMarkMenu) state.mainMarkTool = null;
  render();
}

function setMainMarkType(type) {
  state.mainMarkTool = type;
  render();
}

function handleMainBoardClick(event) {
  if (state.mainMarkTool) {
    placeMainMark(event);
    return;
  }
  if (isFreeAnalysis()) placeFreeStone(event);
}

function handleMainBoardContextMenu(event) {
  if (!isFreeAnalysis() || state.mainMarkTool || state.freeStoneMode === "alternate") return;
  event.preventDefault();
  placeFreeStone(event, { useOppositeColor: true });
}

function placeMainMark(event) {
  if (!state.mainMarkTool) return;
  const point = pointFromCanvasEvent(event.currentTarget, event, state.draft.parsed.size);
  if (!point) return;
  state.mainMarks = toggleBoardMark(state.mainMarks, point, state.mainMarkTool);
  render();
}

function nextFreeStoneColor() {
  if (state.freeStoneMode === "black") return "B";
  if (state.freeStoneMode === "white") return "W";
  const lastMove = state.moveIndex > 0 ? state.draft.parsed.moves[state.moveIndex - 1] : null;
  return lastMove?.color === "B" ? "W" : "B";
}

function freePlacementColor(useOppositeColor = false) {
  if (state.freeStoneMode === "black") return useOppositeColor ? "W" : "B";
  if (state.freeStoneMode === "white") return useOppositeColor ? "B" : "W";
  return nextFreeStoneColor();
}

function placeFreeStone(event, options = {}) {
  const point = pointFromCanvasEvent(event.currentTarget, event, state.draft.parsed.size);
  if (!point) return;
  const board = state.positions[state.moveIndex];
  if (state.freeStoneMode !== "alternate") {
    if (!options.useOppositeColor && board[point.y]?.[point.x]) {
      removeFreeStone(point);
      return;
    }
    addFreeStone(point, board, freePlacementColor(Boolean(options.useOppositeColor)));
    return;
  }

  const move = { ...point, color: nextFreeStoneColor(), pass: false };
  const result = playMove(board, move, { rejectIllegal: true });
  if (!result.legal) {
    toast("该交叉点无法落子，请选择其他位置。", "error");
    return;
  }

  state.draft.parsed.moves = state.draft.parsed.moves.slice(0, state.moveIndex);
  state.draft.freePlacements = freePlacements().filter(
    (placement) => placement.moveNumber <= state.moveIndex,
  );
  state.draft.parsed.moves.push(move);
  state.positions = buildReviewPositions(state.draft);
  state.moveIndex = state.draft.parsed.moves.length;
  state.draft.comments = state.draft.comments.filter((comment) => comment.moveNumber <= state.moveIndex);
  state.draft.updatedAt = new Date().toISOString();
  state.mainMarks = [];
  state.mainMarkMenu = false;
  state.mainMarkTool = null;
  render();
}

function addFreeStone(point, board, color = freePlacementColor()) {
  if (board[point.y]?.[point.x]) {
    toast("该交叉点已有棋子，添加棋子不计手数，请选择空点。", "error");
    return;
  }

  state.draft.parsed.moves = state.draft.parsed.moves.slice(0, state.moveIndex);
  state.draft.freePlacements = freePlacements()
    .filter((placement) => placement.moveNumber <= state.moveIndex)
    .concat({
      id: makeId(),
      moveNumber: state.moveIndex,
      x: point.x,
      y: point.y,
      color,
    });
  state.positions = buildReviewPositions(state.draft);
  state.draft.comments = state.draft.comments.filter((comment) => comment.moveNumber <= state.moveIndex);
  state.draft.updatedAt = new Date().toISOString();
  state.mainMarkMenu = false;
  state.mainMarkTool = null;
  render();
}

function removeFreeStone(point) {
  state.draft.parsed.moves = state.draft.parsed.moves.slice(0, state.moveIndex);
  state.draft.freePlacements = freePlacements()
    .filter((placement) => placement.moveNumber <= state.moveIndex)
    .concat({
      id: makeId(),
      moveNumber: state.moveIndex,
      x: point.x,
      y: point.y,
      remove: true,
    });
  state.positions = buildReviewPositions(state.draft);
  state.draft.comments = state.draft.comments.filter((comment) => comment.moveNumber <= state.moveIndex);
  state.draft.updatedAt = new Date().toISOString();
  state.mainMarkMenu = false;
  state.mainMarkTool = null;
  render();
}

function changeFreeBoardSize(size) {
  if (!isFreeAnalysis() || ![9, 13, 19].includes(size)) return;
  if (state.draft.parsed.size === size) return;
  const previous = state.draft;
  state.draft = createFreeDraft(size, previous.id);
  state.draft.createdAt = previous.createdAt;
  state.draft.fileName = `自由分析-${size}路棋盘`;
  state.draft.metadata = { ...previous.metadata };
  state.draft.freeAnalysisType = freeAnalysisType(previous);
  state.draft.freeAnalysisInfo = cloneFreeAnalysisInfo(previous.freeAnalysisInfo);
  state.positions = buildReviewPositions(state.draft);
  state.moveIndex = 0;
  state.mainMarks = [];
  state.mainMarkMenu = false;
  state.mainMarkTool = null;
  render();
  toast(`已切换为 ${size} 路棋盘，当前自由分析内容已重置。`);
}

function setFreeStoneMode(mode) {
  if (!["alternate", "black", "white"].includes(mode)) return;
  state.freeStoneMode = mode;
  if (isFreeAnalysis()) state.draft.freeStoneMode = mode;
  render();
}

function setFreeAnalysisType(type) {
  if (!isFreeAnalysis() || !freeAnalysisTypeLabels[type]) return;
  ensureFreeAnalysisConfig();
  state.draft.freeAnalysisType = type;
  state.draft.updatedAt = new Date().toISOString();
  if (["calculation", "joseki", "global"].includes(type)) {
    state.freeInfoDialog = { type };
  } else {
    state.freeInfoDialog = null;
  }
  render();
  if (["calculation", "joseki", "global"].includes(type)) focusFreeInfoDialog();
}

function updateFreeAnalysisInfo(event) {
  if (!isFreeAnalysis()) return;
  ensureFreeAnalysisConfig();
  const section = event.currentTarget.dataset.freeSection;
  const key = event.currentTarget.dataset.freeInfo;
  if (!state.draft.freeAnalysisInfo[section] || !(key in state.draft.freeAnalysisInfo[section])) return;
  state.draft.freeAnalysisInfo[section][key] = event.currentTarget.value;
  state.draft.updatedAt = new Date().toISOString();
}

function openFreeInfoDialog(type = freeAnalysisType()) {
  if (!isFreeAnalysis() || !["calculation", "joseki", "global"].includes(type)) return;
  ensureFreeAnalysisConfig();
  state.draft.freeAnalysisType = type;
  state.draft.updatedAt = new Date().toISOString();
  state.freeInfoDialog = { type };
  render();
  focusFreeInfoDialog();
}

function focusFreeInfoDialog() {
  setTimeout(() => document.querySelector("#free-info-form input, #free-info-form textarea")?.focus());
}

function closeFreeInfoDialog() {
  state.freeInfoDialog = null;
  render();
}

function submitFreeInfoDialog(event) {
  event.preventDefault();
  if (!isFreeAnalysis()) return;
  ensureFreeAnalysisConfig();
  const type = event.currentTarget.dataset.type;
  const formData = new FormData(event.currentTarget);
  if (type === "calculation") {
    state.draft.freeAnalysisInfo.calculation = {
      assignmentName: String(formData.get("assignmentName") || "").trim(),
      problemType: String(formData.get("problemType") || "").trim(),
      problemCount: String(formData.get("problemCount") || "").trim(),
      difficulty: String(formData.get("difficulty") || "").trim(),
    };
  } else if (type === "joseki") {
    state.draft.freeAnalysisInfo.joseki = {
      variationName: String(formData.get("variationName") || "").trim(),
      difficulty: String(formData.get("difficulty") || "").trim(),
      keyPoints: String(formData.get("keyPoints") || "").trim(),
    };
  } else if (type === "global") {
    state.draft.freeAnalysisInfo.global = {
      analysisType: String(formData.get("analysisType") || "").trim(),
      difficulty: String(formData.get("difficulty") || "").trim(),
      keyPoints: String(formData.get("keyPoints") || "").trim(),
    };
  } else {
    return;
  }
  state.draft.freeAnalysisType = type;
  state.draft.updatedAt = new Date().toISOString();
  state.freeInfoDialog = null;
  saveDraft(false);
  render();
  toast(`${freeAnalysisTypeLabels[type]}信息已自动保存。`);
}

function resetFreeAnalysis() {
  if (!isFreeAnalysis()) return;
  state.confirmDialog = { type: "reset-free-analysis" };
  render();
}

function closeConfirmDialog() {
  state.confirmDialog = null;
  render();
}

function confirmResetFreeAnalysis(clearComments) {
  if (!isFreeAnalysis()) return;
  const previous = state.draft;
  const keptComments = clearComments ? [] : previous.comments;
  state.draft = createFreeDraft(previous.parsed.size, previous.id);
  state.draft.createdAt = previous.createdAt;
  state.draft.fileName = previous.fileName;
  state.draft.metadata = { ...previous.metadata };
  state.draft.comments = keptComments;
  state.draft.freeStoneMode = state.freeStoneMode;
  state.draft.freeAnalysisType = freeAnalysisType(previous);
  state.draft.freeAnalysisInfo = cloneFreeAnalysisInfo(previous.freeAnalysisInfo);
  state.positions = buildReviewPositions(state.draft);
  state.moveIndex = 0;
  state.mainMarks = [];
  state.mainMarkMenu = false;
  state.mainMarkTool = null;
  state.confirmDialog = null;
  render();
  toast(clearComments ? "自由分析棋盘与点评归档已清空。" : "自由分析棋盘已清空，点评归档已保留。");
}

function undoMainMark() {
  state.mainMarks.pop();
  render();
}

function clearMainMarks() {
  state.mainMarks = [];
  render();
}

function openCommentModal() {
  const canvas = document.querySelector("#main-board");
  if (!canvas) return;
  state.modal = {
    mode: "create",
    commentId: null,
    moveNumber: state.moveIndex,
    positionMoveNumber: state.moveIndex,
    screenshot: boardDataUrl(canvas, 0.96),
    text: "",
    textStyle: normalizeCommentTextStyle(),
    richTextHtml: "",
    variations: [],
    variationEnabled: false,
    editingVariationId: null,
    baseBoard: cloneBoard(state.positions[state.moveIndex]),
    variationBoard: cloneBoard(state.positions[state.moveIndex]),
    variationMoves: [],
    variationBaseMoveNumber: state.moveIndex,
    variationMarks: [],
    variationText: "",
    variationRichTextHtml: "",
    variationMarkMenu: false,
    variationMarkTool: null,
    nextColor: defaultVariationColor(state.moveIndex),
  };
  render();
  setTimeout(() => document.querySelector("#comment-editor")?.focus());
}

function openEditComment(id) {
  const existing = state.draft.comments.find((item) => item.id === id);
  if (!existing) return;
  const comment = normalizeComment(existing);
  const safeMoveNumber = Math.max(
    0,
    Math.min(comment.moveNumber, state.positions.length - 1, state.draft.parsed.moves.length),
  );

  state.moveIndex = safeMoveNumber;
  state.mainMarks = [];
  state.mainMarkMenu = false;
  state.mainMarkTool = null;
  state.modal = {
    mode: "edit",
    commentId: comment.id,
    moveNumber: comment.moveNumber,
    positionMoveNumber: safeMoveNumber,
    screenshot: comment.screenshot,
    text: comment.text,
    textStyle: normalizeCommentTextStyle(comment.textStyle),
    richTextHtml: commentRichTextHtml(comment),
    variations: commentVariations(comment),
    variationEnabled: false,
    editingVariationId: null,
    baseBoard: cloneBoard(state.positions[safeMoveNumber]),
    variationBoard: cloneBoard(state.positions[safeMoveNumber]),
    variationMoves: [],
    variationBaseMoveNumber: safeMoveNumber,
    variationMarks: [],
    variationText: "",
    variationRichTextHtml: "",
    variationMarkMenu: false,
    variationMarkTool: null,
    nextColor: defaultVariationColor(safeMoveNumber),
    createdAt: comment.createdAt,
    createdAtLabel: comment.createdAtLabel,
  };
  render();
  setTimeout(() => document.querySelector("#comment-editor")?.focus());
}

function closeModal() {
  state.modal = null;
  render();
}

function syncRichEditorState(scope) {
  if (!state.modal || !["comment", "variation"].includes(scope)) return;
  const editor = document.querySelector(`[data-rich-editor="${scope}"]`);
  if (!editor) return;
  const html = sanitizeRichTextHtml(editor.innerHTML);
  const text = plainTextFromRichHtml(html);
  if (scope === "comment") {
    state.modal.richTextHtml = html;
    state.modal.text = text;
  } else {
    state.modal.variationRichTextHtml = html;
    state.modal.variationText = text;
  }
}

function selectionInsideEditor(editor, range) {
  const container = range.commonAncestorContainer;
  return editor === container || editor.contains(container.nodeType === Node.TEXT_NODE ? container.parentNode : container);
}

function removeRichClasses(fragment, options) {
  const elements = [
    ...(fragment.nodeType === Node.ELEMENT_NODE ? [fragment] : []),
    ...(fragment.querySelectorAll ? [...fragment.querySelectorAll("span")] : []),
  ];
  for (const element of elements) {
    if (options.size) element.classList.remove("rt-size-small", "rt-size-medium", "rt-size-large");
    if (options.bold) element.classList.remove("rt-bold", "rt-normal");
    if (element.tagName === "SPAN" && !element.className.trim()) {
      element.replaceWith(...element.childNodes);
    }
  }
}

function elementForNode(node) {
  return node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
}

function selectedTextInNode(node, range) {
  const text = node.textContent || "";
  let start = 0;
  let end = text.length;
  if (node === range.startContainer) start = range.startOffset;
  if (node === range.endContainer) end = range.endOffset;
  return text.slice(start, Math.max(start, end));
}

function selectionTextNodes(editor, range) {
  const nodes = [];
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
      return selectedTextInNode(node, range).trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let node = walker.nextNode();
  while (node) {
    nodes.push(node);
    node = walker.nextNode();
  }
  return nodes;
}

function nodeHasBoldWeight(node, editor) {
  let element = elementForNode(node);
  while (element && element !== editor) {
    if (element.classList?.contains("rt-bold")) return true;
    if (element.classList?.contains("rt-normal")) return false;
    element = element.parentElement;
  }
  return false;
}

function selectionIsFullyBold(editor, range) {
  const nodes = selectionTextNodes(editor, range);
  return nodes.length > 0 && nodes.every((node) => nodeHasBoldWeight(node, editor));
}

function liftWholeNormalWrapper(wrapper) {
  const parent = wrapper.parentElement;
  if (!wrapper.classList.contains("rt-normal") || !parent?.classList?.contains("rt-bold")) return;
  if (parent.childNodes.length !== 1) return;
  for (const className of [...parent.classList].filter((name) => name !== "rt-bold")) {
    wrapper.classList.add(className);
  }
  parent.replaceWith(wrapper);
}

function applyRichTextStyle(scope, type, value = "") {
  if (!state.modal || !["comment", "variation"].includes(scope)) return;
  const editor = document.querySelector(`[data-rich-editor="${scope}"]`);
  const selection = window.getSelection();
  if (!editor || !selection?.rangeCount) return;

  const range = selection.getRangeAt(0);
  if (range.collapsed || !selectionInsideEditor(editor, range)) {
    toast("请先选中需要调整的文字。", "error");
    editor.focus();
    return;
  }

  const shouldRemoveBold = type === "bold" && selectionIsFullyBold(editor, range);
  const fragment = range.extractContents();
  removeRichClasses(fragment, { size: type === "size", bold: type === "bold" });
  const wrapper = document.createElement("span");
  wrapper.className = type === "size" ? `rt-size-${value}` : shouldRemoveBold ? "rt-normal" : "rt-bold";
  wrapper.append(fragment);
  range.insertNode(wrapper);
  liftWholeNormalWrapper(wrapper);

  const nextRange = document.createRange();
  nextRange.selectNodeContents(wrapper);
  selection.removeAllRanges();
  selection.addRange(nextRange);
  syncRichEditorState(scope);
}

function defaultVariationColor(moveNumber) {
  const lastMove = moveNumber ? state.draft.parsed.moves[moveNumber - 1] : null;
  return lastMove?.color === "B" ? "W" : "B";
}

function enableVariation() {
  const baseMoveNumber = state.modal.positionMoveNumber ?? state.modal.moveNumber;
  state.modal.editingVariationId = null;
  state.modal.variationMoves = [];
  state.modal.variationBaseMoveNumber = baseMoveNumber;
  state.modal.baseBoard = cloneBoard(state.positions[baseMoveNumber]);
  state.modal.variationBoard = cloneBoard(state.modal.baseBoard);
  state.modal.variationMarks = [];
  state.modal.variationText = "";
  state.modal.variationRichTextHtml = "";
  state.modal.variationMarkMenu = false;
  state.modal.variationMarkTool = null;
  state.modal.nextColor = defaultVariationColor(baseMoveNumber);
  state.modal.variationEnabled = true;
  render();
}

function editVariation(id) {
  const variation = state.modal.variations.find((item) => item.id === id);
  if (!variation) return;
  state.modal.editingVariationId = id;
  state.modal.variationMoves = variation.moves.map((move) => ({ ...move }));
  const maxBaseMove = state.modal.positionMoveNumber ?? state.draft.parsed.moves.length;
  state.modal.variationBaseMoveNumber = Math.max(
    0,
    Math.min(maxBaseMove, variation.baseMoveNumber ?? maxBaseMove),
  );
  state.modal.baseBoard = cloneBoard(state.positions[state.modal.variationBaseMoveNumber]);
  state.modal.variationMarks = normalizeMarks(variation.marks);
  state.modal.variationText = variation.text || "";
  state.modal.variationRichTextHtml = variation.richTextHtml || richTextHtmlFromPlainText(variation.text || "");
  state.modal.variationMarkMenu = false;
  state.modal.variationMarkTool = null;
  rebuildVariation();
  const lastMove = state.modal.variationMoves.at(-1);
  state.modal.nextColor = lastMove
    ? lastMove.color === "B"
      ? "W"
      : "B"
    : defaultVariationColor(state.modal.variationBaseMoveNumber);
  state.modal.variationEnabled = true;
  render();
}

function deleteVariation(id) {
  state.modal.variations = state.modal.variations.filter((variation) => variation.id !== id);
  if (state.modal.editingVariationId === id) cancelVariation();
  else render();
  toast("变化图已删除，保存点评后生效。");
}

function setVariationColor(color) {
  state.modal.nextColor = color;
  render();
}

function rebuildVariation() {
  let board = cloneBoard(state.modal.baseBoard);
  for (const move of state.modal.variationMoves) board = playMove(board, move).board;
  state.modal.variationBoard = board;
}

function undoVariation() {
  const removed = state.modal.variationMoves.pop();
  if (removed) state.modal.nextColor = removed.color;
  rebuildVariation();
  render();
}

function rewindVariationBase() {
  if (state.modal.variationBaseMoveNumber <= 0) return;
  const hadDraftContent =
    state.modal.variationMoves.length > 0 || state.modal.variationMarks.length > 0;
  state.modal.variationBaseMoveNumber -= 1;
  state.modal.baseBoard = cloneBoard(state.positions[state.modal.variationBaseMoveNumber]);
  state.modal.variationBoard = cloneBoard(state.modal.baseBoard);
  state.modal.variationMoves = [];
  state.modal.variationMarks = [];
  state.modal.variationMarkMenu = false;
  state.modal.variationMarkTool = null;
  state.modal.nextColor = defaultVariationColor(state.modal.variationBaseMoveNumber);
  render();
  toast(
    hadDraftContent
      ? `已倒退至第 ${state.modal.variationBaseMoveNumber} 手，未保存的变化手与标记已清空。`
      : `变化图起点已倒退至第 ${state.modal.variationBaseMoveNumber} 手。`,
  );
}

function clearVariation() {
  state.modal.variationMoves = [];
  state.modal.variationBoard = cloneBoard(state.modal.baseBoard);
  state.modal.nextColor = defaultVariationColor(state.modal.variationBaseMoveNumber);
  render();
}

function toggleVariationMarkMenu() {
  state.modal.variationMarkMenu = !state.modal.variationMarkMenu;
  if (!state.modal.variationMarkMenu) state.modal.variationMarkTool = null;
  render();
}

function setVariationMarkType(type) {
  state.modal.variationMarkTool = type;
  render();
}

function undoVariationMark() {
  state.modal.variationMarks.pop();
  render();
}

function clearVariationMarks() {
  state.modal.variationMarks = [];
  render();
}

function cancelVariation() {
  state.modal.variationEnabled = false;
  state.modal.editingVariationId = null;
  state.modal.variationMoves = [];
  state.modal.variationMarks = [];
  state.modal.variationText = "";
  state.modal.variationRichTextHtml = "";
  state.modal.variationMarkMenu = false;
  state.modal.variationMarkTool = null;
  state.modal.variationBoard = cloneBoard(state.modal.baseBoard);
  state.modal.nextColor = defaultVariationColor(
    state.modal.positionMoveNumber ?? state.modal.moveNumber,
  );
  render();
}

async function commitActiveVariation() {
  syncRichEditorState("variation");
  const variationCanvas = document.querySelector("#variation-board");
  if ((!state.modal.variationMoves.length && !state.modal.variationMarks.length) || !variationCanvas) {
    return false;
  }

  const id = state.modal.editingVariationId || makeId();
  const imageData = boardDataUrl(variationCanvas, 0.96);
  const savedImage = await saveImageFile(imageData, "variation", id);
  const variation = {
    id,
    image: savedImage.url,
    imagePath: savedImage.path,
    moves: state.modal.variationMoves.map((move) => ({ ...move })),
    marks: normalizeMarks(state.modal.variationMarks),
    text: state.modal.variationText.trim(),
    richTextHtml: sanitizeRichTextHtml(state.modal.variationRichTextHtml),
    baseMoveNumber: state.modal.variationBaseMoveNumber,
  };
  const index = state.modal.variations.findIndex((item) => item.id === variation.id);
  if (index >= 0) state.modal.variations[index] = variation;
  else state.modal.variations.push(variation);
  return true;
}

async function saveVariation() {
  if (!(await commitActiveVariation())) {
    toast("请先在变化图中摆放棋子或添加标记。", "error");
    return;
  }
  state.modal.variationEnabled = false;
  state.modal.editingVariationId = null;
  state.modal.variationMoves = [];
  state.modal.variationMarks = [];
  state.modal.variationText = "";
  state.modal.variationRichTextHtml = "";
  state.modal.variationMarkMenu = false;
  state.modal.variationMarkTool = null;
  state.modal.variationBoard = cloneBoard(state.modal.baseBoard);
  render();
  toast("变化图已保存，可继续新增。");
}

function placeVariationMove(event) {
  const point = pointFromCanvasEvent(event.currentTarget, event, state.draft.parsed.size);
  if (!point) return;
  if (state.modal.variationMarkTool) {
    state.modal.variationMarks = toggleBoardMark(
      state.modal.variationMarks,
      point,
      state.modal.variationMarkTool,
    );
    render();
    return;
  }
  const move = { ...point, color: state.modal.nextColor, pass: false };
  const result = playMove(state.modal.variationBoard, move, { rejectIllegal: true });
  if (!result.legal) {
    toast("该交叉点无法落子，请选择其他位置。", "error");
    return;
  }
  state.modal.variationMoves.push(move);
  state.modal.variationBoard = result.board;
  state.modal.nextColor = move.color === "B" ? "W" : "B";
  render();
}

async function submitComment() {
  syncRichEditorState("comment");
  const text = state.modal.text.trim();
  if (!text) {
    toast("请先填写点评内容。", "error");
    document.querySelector("#comment-editor")?.focus();
    return;
  }
  if (
    state.modal.variationEnabled &&
    (state.modal.variationMoves.length || state.modal.variationMarks.length)
  ) {
    await commitActiveVariation();
  }
  const now = new Date();
  const commentId = state.modal.commentId || makeId();
  const savedScreenshot = await saveImageFile(state.modal.screenshot, "position", commentId);
  const comment = {
    id: commentId,
    moveNumber: state.modal.moveNumber,
    text,
    textStyle: normalizeCommentTextStyle(state.modal.textStyle),
    richTextHtml: sanitizeRichTextHtml(state.modal.richTextHtml),
    screenshot: savedScreenshot.url,
    screenshotPath: savedScreenshot.path,
    variations: state.modal.variations,
    createdAt: state.modal.createdAt || now.toISOString(),
    createdAtLabel:
      state.modal.createdAtLabel ||
      new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(now),
    updatedAt: now.toISOString(),
  };
  const commentIndex = state.draft.comments.findIndex((item) => item.id === comment.id);
  if (commentIndex >= 0) state.draft.comments[commentIndex] = comment;
  else state.draft.comments.push(comment);
  state.modal = null;
  render();
  toast(commentIndex >= 0 ? "点评分析已更新。" : "本条点评已加入归档。");
}

function deleteComment(id) {
  state.draft.comments = state.draft.comments.filter((comment) => comment.id !== id);
  render();
  toast("点评已删除。");
}

function saveDraft(showToast = true) {
  if (isFreeAnalysis()) {
    ensureFreeAnalysisConfig();
    state.draft.freeStoneMode = state.freeStoneMode;
  }
  state.draft.updatedAt = new Date().toISOString();
  const index = state.games.findIndex((game) => game.id === state.draft.id);
  const serialized = JSON.parse(JSON.stringify(normalizeGame(state.draft)));
  if (index >= 0) state.games[index] = serialized;
  else state.games.unshift(serialized);
  if (persistGames() && showToast) toast("棋局与点评已保存。");
}

function finishReview() {
  const freeMode = isFreeAnalysis();
  saveDraft(false);
  clearReportPreview();
  state.screen = freeMode ? "landing" : "home";
  state.draft = null;
  state.modal = null;
  state.freeInfoDialog = null;
  state.mainMarks = [];
  state.mainMarkMenu = false;
  state.mainMarkTool = null;
  render();
  toast(freeMode ? "自由分析已保存并归档。" : "棋局点评已保存并归档。");
}

function continueGame(id) {
  const game = state.games.find((item) => item.id === id);
  if (!game) return;
  clearReportPreview();
  state.draft = JSON.parse(JSON.stringify(normalizeGame(game)));
  ensureFreeAnalysisConfig(state.draft);
  state.positions = buildReviewPositions(state.draft);
  state.freeStoneMode = state.draft.freeStoneMode || "alternate";
  state.moveIndex = 0;
  state.mainMarks = [];
  state.mainMarkMenu = false;
  state.mainMarkTool = null;
  state.freeInfoDialog = null;
  state.screen = "review";
  render();
}

async function runReport(game) {
  state.reportBusy = true;
  render();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    await exportGameReport(game);
    toast("PDF 教学报告已生成。");
  } catch (error) {
    console.error(error);
    toast("报告生成失败，请稍后重试。", "error");
  } finally {
    state.reportBusy = false;
    render();
  }
}

function clearReportPreview(renderAfter = false) {
  if (state.reportPreview?.url) URL.revokeObjectURL(state.reportPreview.url);
  state.reportPreview = null;
  if (renderAfter) render();
}

function closeReportPreview() {
  clearReportPreview(true);
}

function currentReport() {
  saveDraft(false);
  runReport(state.draft);
}

async function previewCurrentReport() {
  saveDraft(false);
  state.reportBusy = true;
  render();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    const { blob, filename } = await createGameReportFile(state.draft);
    clearReportPreview();
    state.reportPreview = {
      url: URL.createObjectURL(blob),
      filename,
    };
    toast("PDF 预览已生成。");
  } catch (error) {
    console.error(error);
    toast("报告预览生成失败，请稍后重试。", "error");
  } finally {
    state.reportBusy = false;
    render();
  }
}

function reportSavedGame(id) {
  const game = state.games.find((item) => item.id === id);
  if (game) runReport(game);
}

function toast(message, type = "success", options = {}) {
  const root = document.querySelector("#toast-root");
  const element = document.createElement("div");
  element.className = `toast ${type === "error" ? "error" : ""}`;
  let dismissedByAction = false;
  const duration = Number.isFinite(options.duration) ? options.duration : options.actionLabel ? 8000 : 3200;
  const messageElement = document.createElement("span");
  messageElement.textContent = message;
  element.append(messageElement);
  if (options.actionLabel && typeof options.action === "function") {
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "toast-action";
    actionButton.textContent = options.actionLabel;
    actionButton.addEventListener("click", () => {
      dismissedByAction = true;
      clearTimeout(timer);
      element.remove();
      options.action();
    });
    element.append(actionButton);
  }
  root.append(element);
  const timer = setTimeout(() => {
    element.remove();
    if (!dismissedByAction && typeof options.onExpire === "function") options.onExpire();
  }, duration);
}

window.addEventListener("keydown", (event) => {
  if (state.screen !== "review" || state.modal || /INPUT|TEXTAREA/.test(event.target.tagName)) return;
  if (event.key === "ArrowLeft") setMove(state.moveIndex - 1);
  if (event.key === "ArrowRight") setMove(state.moveIndex + 1);
});

window.addEventListener("online", () => checkServerStatus({ manual: true }));
window.addEventListener("offline", () => {
  markServerOffline("浏览器网络已离线。请恢复网络后点击重试连接。");
});

render();
startServerMonitor();
