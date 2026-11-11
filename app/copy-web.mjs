// Copies the website (repo root) into app/www so the app ships the same page offline-first.
import { cpSync, rmSync, mkdirSync } from "node:fs";
const root = new URL("../", import.meta.url).pathname, out = new URL("./www/", import.meta.url).pathname;
rmSync(out, { recursive: true, force: true }); mkdirSync(out);
for (const f of ["index.html", "manifest.json", "icon.svg", "icon-maskable.svg", "icon-192.png", "icon-512.png",
  "apple-touch-icon.png", "privacy.html", "terms.html", "support.html", "art"]) {
  cpSync(root + f, out + f, { recursive: true, filter: (p) => !p.includes("/source") });
}
console.log("copied site into app/www");
