import db from "./database.js";

export function getSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  return obj;
}

export function updateSettings(updates) {
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) upsert.run(k, String(v ?? ""));
  });
  tx(Object.entries(updates));
  return getSettings();
}
