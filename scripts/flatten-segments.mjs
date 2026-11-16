// The Next 16 client prefetches segment payloads as `/map/__next.map.__PAGE__.txt`,
// but `output: "export"` writes them nested as `map/__next.map/__PAGE__.txt`. Copy
// each to the flat name so prefetches hit a static file instead of the Worker.
import { promises as fs } from "node:fs";
import path from "node:path";

const OUT = path.resolve("out");
let copied = 0;

async function walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full);
    else if (e.name.endsWith(".txt")) await flatten(full);
  }
}

async function flatten(file) {
  const parts = path.relative(OUT, file).split(path.sep);
  const i = parts.findIndex((p, j) => p.startsWith("__next.") && j < parts.length - 1);
  if (i < 0) return;
  const flat = path.join(OUT, ...parts.slice(0, i), parts.slice(i).join("."));
  await fs.copyFile(file, flat);
  copied++;
}

await walk(OUT);
console.log(`flatten-segments: ${copied} files`);
