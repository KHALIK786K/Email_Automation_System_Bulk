import { Router } from "express";
import db from "../db/database.js";

const router = Router();

// List all templates
router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM templates ORDER BY updated_at DESC")
    .all();
  res.json(rows);
});

// Get one
router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM templates WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Template not found" });
  res.json(row);
});

// Create
router.post("/", (req, res) => {
  const { name, subject, body } = req.body;
  if (!name || !subject || !body)
    return res.status(400).json({ error: "name, subject and body are required" });
  const info = db
    .prepare("INSERT INTO templates (name, subject, body) VALUES (?, ?, ?)")
    .run(name, subject, body);
  const row = db.prepare("SELECT * FROM templates WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(row);
});

// Update
router.put("/:id", (req, res) => {
  const { name, subject, body } = req.body;
  const existing = db.prepare("SELECT * FROM templates WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Template not found" });
  db.prepare(
    "UPDATE templates SET name = ?, subject = ?, body = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(name ?? existing.name, subject ?? existing.subject, body ?? existing.body, req.params.id);
  res.json(db.prepare("SELECT * FROM templates WHERE id = ?").get(req.params.id));
});

// Duplicate
router.post("/:id/duplicate", (req, res) => {
  const t = db.prepare("SELECT * FROM templates WHERE id = ?").get(req.params.id);
  if (!t) return res.status(404).json({ error: "Template not found" });
  const info = db
    .prepare("INSERT INTO templates (name, subject, body) VALUES (?, ?, ?)")
    .run(`${t.name} (Copy)`, t.subject, t.body);
  res.status(201).json(db.prepare("SELECT * FROM templates WHERE id = ?").get(info.lastInsertRowid));
});

// Delete
router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM templates WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
