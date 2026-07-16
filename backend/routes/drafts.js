import { Router } from "express";
import db from "../db/database.js";

const router = Router();

router.get("/", (req, res) => {
  const row = db.prepare("SELECT data FROM drafts WHERE id = 1").get();
  res.json(row ? JSON.parse(row.data) : {});
});

router.put("/", (req, res) => {
  const data = JSON.stringify(req.body || {});
  db.prepare(
    "INSERT INTO drafts (id, data, updated_at) VALUES (1, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')"
  ).run(data);
  res.json({ ok: true });
});

export default router;
