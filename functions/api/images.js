import { dataUrlBytes, json, readJson, requireR2, safeSegment } from "./_shared.js";

export async function onRequestPost({ request, env }) {
  try {
    const payload = await readJson(request);
    const image = dataUrlBytes(payload.dataUrl);
    if (!image) {
      return json({ error: "图片数据格式不正确" }, 400);
    }

    const bucket = requireR2(env);
    const gameId = safeSegment(payload.gameId, "game");
    const kind = safeSegment(payload.kind, "image");
    const imageId = safeSegment(payload.imageId, String(Date.now()));
    const filename = `${Date.now()}-${kind}-${imageId}.${image.extension}`;
    const key = `${gameId}/${filename}`;

    await bucket.put(key, image.bytes, {
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
      },
      201,
    );
  } catch (error) {
    return json({ error: error.message || "图片保存失败" }, 500);
  }
}
