import { json, readJson, requireR2, safeSegment } from "../_shared.js";

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

export async function onRequestPost({ request, env }) {
  try {
    const payload = await readJson(request, 1024 * 1024);
    const bucket = requireR2(env);
    const gameIds = Array.isArray(payload.gameIds) ? payload.gameIds : [];
    const deleted = [];

    for (const gameId of gameIds) {
      const safeGameId = safeSegment(gameId, "");
      if (!safeGameId) continue;
      deleted.push(...(await deletePrefix(bucket, `${safeGameId}/`)));
    }

    return json({ ok: true, deleted });
  } catch (error) {
    return json({ error: error.message || "归档图片文件删除失败" }, 500);
  }
}
