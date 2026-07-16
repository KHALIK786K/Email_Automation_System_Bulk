import { Router } from "express";
import db from "../db/database.js";

const router = Router();

// List history with filters: status, company, student, email, date, batchId, q
router.get("/", (req, res) => {
  const { status, company, student, email, date, batchId, q } = req.query;
  const where = [];
  const params = [];

  if (status && status !== "all") { where.push("status = ?"); params.push(status); }
  if (company) { where.push("company LIKE ?"); params.push(`%${company}%`); }
  if (student) { where.push("student_name LIKE ?"); params.push(`%${student}%`); }
  if (email) { where.push("email LIKE ?"); params.push(`%${email}%`); }
  if (batchId) { where.push("batch_id = ?"); params.push(batchId); }
  if (date) { where.push("date(created_at) = date(?)"); params.push(date); }
  if (q) {
    where.push("(student_name LIKE ? OR email LIKE ? OR company LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const sql =
    "SELECT * FROM history" +
    (where.length ? " WHERE " + where.join(" AND ") : "") +
    " ORDER BY created_at DESC, id DESC LIMIT 1000";
  res.json(db.prepare(sql).all(...params));
});

// Export as CSV
router.get("/export", (req, res) => {
  const rows = db.prepare("SELECT * FROM history ORDER BY created_at DESC").all();
  const headers = ["id", "student_name", "email", "company", "role", "subject", "status", "error", "sent_at", "created_at"];
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=email_history.csv");
  res.send(csv);
});

// Clear history
router.delete("/", (req, res) => {
  db.prepare("DELETE FROM history").run();
  res.json({ ok: true });
});

export default router;
