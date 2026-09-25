import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { mkdir, copyFile, writeFile, rm } from "node:fs/promises";
const release=JSON.parse(await readFile("../generated/release-config.json","utf8"));
await rm("dist", { recursive: true, force: true });
await mkdir("dist/extension", { recursive: true });
await build({
  entryPoints: ["src/extension/worker.ts", "src/extension/panel.ts", "src/extension/diagnostics.ts"],
  bundle: true,
  format: "esm",
  outdir: "dist/extension",
  target: "chrome120",
  define: {__JOBS_BUILD_HASH__: JSON.stringify("__WORKFLOW_BUILD_HASH__")},
});
await build({
  entryPoints: ["src/extension/content.ts"],
  bundle: true,
  format: "iife",
  outfile: "dist/extension/content.js",
  target: "chrome120",
  define: {__JOBS_BUILD_HASH__: JSON.stringify("__WORKFLOW_BUILD_HASH__")},
});
for (const file of ["panel.html", "panel.css", "diagnostics.html"])
  await copyFile(`src/extension/${file}`, `dist/extension/${file}`);
await writeFile(
  "dist/extension/manifest.json",
  JSON.stringify(
    {
      manifest_version: 3,
      name: "JobsUtilityExtension",
      version: release.version,
      description:
        "Collect jobs and preserve your application answers as you browse.",
      minimum_chrome_version: "120",
      permissions: [
        "storage",
        "unlimitedStorage",
        "activeTab",
        "scripting",
        "sidePanel",
        "alarms",
      ],
      host_permissions: [
        "http://127.0.0.1/*",
        "http://localhost/*",
        "https://www.kevinc.dev/*",
      ],
      optional_host_permissions: ["https://*/*", "http://*/*"],
      background: { service_worker: "worker.js", type: "module" },
      action: { default_title: "Open Jobs Utility" },
      side_panel: { default_path: "panel.html" },
      options_page: "panel.html",
      content_security_policy: {
        extension_pages:
          "script-src 'self'; object-src 'none'; connect-src http://127.0.0.1:* http://localhost:* https:;",
      },
    },
    null,
    2,
  ),
);
console.log(
  "Built dist/extension (load unpacked) for the hosted tracker API. No environment values are bundled.",
);

const hash=createHash('sha256');
for(const name of (await readdir('dist/extension')).sort()){hash.update(name);hash.update(await readFile(path.join('dist/extension',name)))}
const buildHash=hash.digest('hex');
const worker=await readFile('dist/extension/worker.js','utf8');
await writeFile('dist/extension/worker.js',worker.replaceAll('__WORKFLOW_BUILD_HASH__',buildHash));
await writeFile('dist/extension/build-info.json',JSON.stringify({version:release.version,build_hash:buildHash,storage_schema:1}));
