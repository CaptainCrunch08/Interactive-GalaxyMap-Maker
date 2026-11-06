import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(
  root,
  ".wrangler",
  "state",
  "v3",
  "d1",
  "miniflare-D1DatabaseObject",
);
const sql = fs.readFileSync(path.join(root, "migrations", "0001_maps.sql"), "utf8");

if (!fs.existsSync(dir)) {
  console.error("No local D1 state at", dir);
  process.exit(1);
}

for (const name of fs.readdirSync(dir)) {
  if (name.startsWith("metadata") || name.includes("-shm") || name.includes("-wal")) {
    continue;
  }
  const full = path.join(dir, name);
  if (!fs.statSync(full).isFile()) continue;
  try {
    const db = new DatabaseSync(full);
    db.exec(sql);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all();
    console.log("ok", name, tables);
    db.close();
  } catch (err) {
    console.log("skip", name, err instanceof Error ? err.message : err);
  }
}
