import { requireR2 } from "../api/_shared.js";

function imagePath(params) {
  const path = params.path;
  return Array.isArray(path) ? path.join("/") : String(path || "");
}

export async function onRequestGet({ env, params }) {
  try {
    const key = imagePath(params);
    if (!key) return new Response("Not found", { status: 404 });

    const object = await requireR2(env).get(key);
    if (!object) return new Response("Not found", { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "no-store");
    headers.set("ETag", object.httpEtag);
    return new Response(object.body, { headers });
  } catch (error) {
    return new Response(error.message || "Image fetch failed", { status: 500 });
  }
}
