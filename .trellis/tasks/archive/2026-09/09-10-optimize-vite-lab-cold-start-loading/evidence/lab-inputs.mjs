import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const evidence = dirname(fileURLToPath(import.meta.url));
const root = resolve(evidence, "../../../..");
const files = new Set();
const edges = [];
const unresolved = [];
const queue = [resolve(root, "src/lab/lab-main.tsx")];
const options = { moduleResolution: ts.ModuleResolutionKind.Bundler, resolveJsonModule: true, allowJs: true };
while (queue.length) {
  const file = queue.pop();
  if (files.has(file)) continue;
  files.add(file);
  assert.ok(files.size < 1000, "Unexpected import graph expansion");
  if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
  for (const imported of ts.preProcessFile(fs.readFileSync(file, "utf8"), true).importedFiles) {
    const name = imported.fileName;
    if (!name.startsWith(".")) continue;
    const target = ts.resolveModuleName(name, file, options, ts.sys).resolvedModule?.resolvedFileName
      ?? (fs.existsSync(resolve(dirname(file), name)) ? resolve(dirname(file), name) : null);
    if (!target) { unresolved.push({ file, name }); continue; }
    const absolute = resolve(target);
    edges.push({ from: relative(root, file), import: name, to: relative(root, absolute) });
    queue.push(absolute);
  }
}
assert.deepEqual(unresolved, []);
const hashes = {};
for (const path of [...files, resolve(root, "vite.lab.config.ts"), resolve(root, "postcss.config.js"), resolve(root, "lab.html")]) {
  hashes[relative(root, path)] = createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}
const output = resolve(evidence, "lab-inputs-before.json");
fs.writeFileSync(output, JSON.stringify({ files: [...files], edges, hashes, unresolved }, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output, files: files.size, roots: [...new Set([...files].map(file => relative(root, file).split(/[\\/]/)[0]))] }));
