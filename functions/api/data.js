import { json, readDataStore, readJson, writeDataStore } from "./_shared.js";

export async function onRequestGet({ env }) {
  try {
    return json({
      ok: true,
      ...(await readDataStore(env)),
      storage: "cloudflare-kv",
    });
  } catch (error) {
    return json({ error: error.message || "共享数据读取失败" }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const payload = await readJson(request, 80 * 1024 * 1024);
    const snapshot = await writeDataStore(env, payload);
    return json({
      ok: true,
      ...snapshot,
      storage: "cloudflare-kv",
    });
  } catch (error) {
    return json({ error: error.message || "共享数据保存失败" }, 500);
  }
}
