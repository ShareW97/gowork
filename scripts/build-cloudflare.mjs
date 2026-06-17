import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const entries = ["index.html", "styles.css", "js", "assets", "sample"];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const entry of entries) {
  cpSync(join(root, entry), join(dist, entry), { recursive: true });
}

writeFileSync(
  join(dist, "_headers"),
  [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "",
    "/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    "/js/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
  ].join("\n"),
);

console.log("Cloudflare Pages build ready: dist/");
