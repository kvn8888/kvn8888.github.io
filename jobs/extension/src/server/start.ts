import { createClient } from "@libsql/client";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { Store } from "./store";
import { server } from "./http";
const url = process.env.TURSO_DB_URL,
  authToken = process.env.TURSO_DB_TOKEN;
if (!url || !authToken)
  throw Error("Set TURSO_DB_URL and TURSO_DB_TOKEN in .env");
await mkdir(".local", { recursive: true, mode: 0o700 });
let keys: { write: string; read: string };
try {
  keys = JSON.parse(await readFile(".local/keys.json", "utf8"));
} catch {
  keys = {
    write: randomBytes(32).toString("hex"),
    read: randomBytes(32).toString("hex"),
  };
  await writeFile(".local/keys.json", JSON.stringify(keys), { mode: 0o600 });
}
const port = Number(process.env.PORT || 43127);
for (const [name, key] of [
  ["connection", keys.write],
  ["reader-connection", keys.read],
]) {
  await writeFile(
    `.local/${name}.json`,
    JSON.stringify(
      { baseUrl: `http://127.0.0.1:${port}`, apiKey: key },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  await chmod(`.local/${name}.json`, 0o600);
}
const db = createClient({ url, authToken });
const store = new Store(db);
await store.verify();
const app = server(store, keys.write, keys.read);
app.listen(port, "127.0.0.1", () =>
  console.log(
    `Jobs Utility is ready at http://127.0.0.1:${port}\nImport .local/connection.json in the extension Settings.\nRead-only agent connection: .local/reader-connection.json\nKeep this terminal running. No job data has been written during startup.`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    app.close(() => {
      db.close();
      process.exit(0);
    }),
  );
