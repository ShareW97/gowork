import { json } from "./_shared.js";

export function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  return json({
    ok: true,
    app: "弈棋无限",
    status: "running",
    runtime: "cloudflare-pages",
    time: new Date().toISOString(),
    localUrl: url.origin,
    networkUrls: [url.origin],
    imageFolder: "Cloudflare R2: GO_WORK_IMAGES",
    dataFile: "Cloudflare KV: GO_WORK_DATA",
    bindings: {
      data: Boolean(env.GO_WORK_DATA),
      images: Boolean(env.GO_WORK_IMAGES),
    },
  });
}
