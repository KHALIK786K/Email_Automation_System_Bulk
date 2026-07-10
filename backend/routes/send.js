import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import db from "../db/database.js";
import { renderTemplate, sendOne } from "../mailer.js";
import { getSettings } from "../db/settings.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

// Attachments are stored in /attachments
const storage = multer.diskStorage({
  destination: path.join(__dirname, "..", "attachments"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// In-memory control flags per batch (cancel / running state)
const batchControl = new Map(); // batchId -> { cancelled: bool }

function recipientEmail(row = {}) {
  return String(row.email || row.hr_email || row.company_email || "").trim().toLowerCase();
}

function templateExtra(settings) {
  return {
    ...settings,
    signature: settings.signature || "",
    college_name: settings.college_name || settings.college || "",
    college_location: settings.college_location || "",
    placement_officer: settings.placement_officer || settings.sender_name || "",
    contact_number: settings.contact_number || "",
    brochure_link: settings.brochure_link || "",
  };
}

function upsertCompanyFromRow(row = {}) {
  const email = recipientEmail(row);
  const companyName = row.company_name || row.company || "";
  if (!email || !companyName) return;

  db.prepare(`
    INSERT INTO companies (
      company_name, hr_name, designation, hr_email, phone, website, linkedin,
      industry, city, state, country, status, follow_up_date, meeting_date,
      meeting_link, student_count, job_role, brochure_link, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(hr_email) DO UPDATE SET
      company_name = excluded.company_name,
      hr_name = COALESCE(NULLIF(excluded.hr_name, ''), companies.hr_name),
      designation = COALESCE(NULLIF(excluded.designation, ''), companies.designation),
      phone = COALESCE(NULLIF(excluded.phone, ''), companies.phone),
      website = COALESCE(NULLIF(excluded.website, ''), companies.website),
      linkedin = COALESCE(NULLIF(excluded.linkedin, ''), companies.linkedin),
      industry = COALESCE(NULLIF(excluded.industry, ''), companies.industry),
      city = COALESCE(NULLIF(excluded.city, ''), companies.city),
      state = COALESCE(NULLIF(excluded.state, ''), companies.state),
      country = COALESCE(NULLIF(excluded.country, ''), companies.country),
      follow_up_date = COALESCE(NULLIF(excluded.follow_up_date, ''), companies.follow_up_date),
      meeting_date = COALESCE(NULLIF(excluded.meeting_date, ''), companies.meeting_date),
      meeting_link = COALESCE(NULLIF(excluded.meeting_link, ''), companies.meeting_link),
      student_count = COALESCE(NULLIF(excluded.student_count, ''), companies.student_count),
      job_role = COALESCE(NULLIF(excluded.job_role, ''), companies.job_role),
      brochure_link = COALESCE(NULLIF(excluded.brochure_link, ''), companies.brochure_link),
      notes = COALESCE(NULLIF(excluded.notes, ''), companies.notes),
      updated_at = datetime('now')
  `).run(
    companyName,
    row.hr_name || row.contact_name || "",
    row.designation || "",
    email,
    row.phone || row.contact_number || "",
    row.website || row.company_website || "",
    row.linkedin || "",
    row.industry || "",
    row.city || "",
    row.state || "",
    row.country || "",
    row.follow_up_date || "",
    row.meeting_date || "",
    row.meeting_link || "",
    row.student_count || "",
    row.job_role || row.role || "",
    row.brochure_link || "",
    row.notes || ""
  );
}

function markCompanyContacted(email) {
  db.prepare(`
    UPDATE companies
    SET last_contact_date = date('now'),
        status = CASE WHEN status = 'New' THEN 'Contacted' ELSE status END,
        updated_at = datetime('now')
    WHERE hr_email = ?
  `).run(email);
}

// ---- Upload attachments (returns stored paths) ----
router.post("/attachments", upload.array("files", 20), (req, res) => {
  const files = (req.files || []).map((f) => ({
    filename: f.originalname,
    path: f.path,
    storedName: f.filename,
  }));
  res.json({ files });
});

/**
 * Preview: render subject+body for each row without sending.
 * body: { templateId, rows }
 */
router.post("/preview", (req, res) => {
  const { templateId, rows = [] } = req.body;
  const tpl = db.prepare("SELECT * FROM templates WHERE id = ?").get(templateId);
  if (!tpl) return res.status(404).json({ error: "Template not found" });
  const s = getSettings();

  const preview = rows.slice(0, 200).map((row) => ({
    email: recipientEmail(row),
    student_name: row.student_name || row.hr_name || "",
    subject: renderTemplate(tpl.subject, row, templateExtra(s)),
    body: renderTemplate(tpl.body, row, templateExtra(s)),
  }));
  res.json({ preview, count: rows.length });
});

/**
 * Queue a batch. body: { templateId, rows, attachments, scheduledAt }
 * Creates history entries with status 'pending' and returns batchId.
 */
router.post("/queue", (req, res) => {
  const { templateId, rows = [], attachments = [], scheduledAt = null } = req.body;
  const tpl = db.prepare("SELECT * FROM templates WHERE id = ?").get(templateId);
  if (!tpl) return res.status(404).json({ error: "Template not found" });
  if (!rows.length) return res.status(400).json({ error: "No recipients" });

  const s = getSettings();
  const batchId = randomUUID();
  const insert = db.prepare(`
    INSERT INTO history (student_name, email, company, role, subject, body, status, template_id, batch_id, scheduled_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const row of rows) {
      const body = renderTemplate(tpl.body, row, templateExtra(s));
      const subject = renderTemplate(tpl.subject, row, templateExtra(s));
      const email = recipientEmail(row);
      upsertCompanyFromRow(row);
      insert.run(
        row.student_name || row.hr_name || "",
        email,
        row.company_name || row.company || "",
        row.job_role || row.role || "",
        subject,
        body,
        templateId,
        batchId,
        scheduledAt
      );
    }
  });
  tx();

  // Store attachments association on the batch (in-memory + we pass at send time)
  batchControl.set(batchId, { cancelled: false, attachments });

  res.status(201).json({ batchId, queued: rows.length, scheduledAt });
});

/**
 * Process a batch now (streams progress via SSE).
 * GET /send/process/:batchId
 */
router.get("/process/:batchId", async (req, res) => {
  const { batchId } = req.params;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const control = batchControl.get(batchId) || { cancelled: false, attachments: [] };
  batchControl.set(batchId, control);
  const attachments = control.attachments || [];

  const pending = db
    .prepare("SELECT * FROM history WHERE batch_id = ? AND status IN ('pending','failed')")
    .all(batchId);

  const send = (event, data) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  send("start", { total: pending.length });

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    if (batchControl.get(batchId)?.cancelled) {
      send("cancelled", { sent, failed, remaining: pending.length - i });
      res.end();
      return;
    }

    const item = pending[i];
    db.prepare("UPDATE history SET status = 'sending' WHERE id = ?").run(item.id);
    send("progress", { index: i + 1, total: pending.length, email: item.email, status: "sending" });

    try {
      await sendOne({
        to: item.email,
        subject: item.subject,
        body: item.body,
        attachments,
      });
      markCompanyContacted(item.email);
      db.prepare(
        "UPDATE history SET status = 'sent', sent_at = datetime('now'), error = NULL WHERE id = ?"
      ).run(item.id);
      sent++;
      send("progress", { index: i + 1, total: pending.length, email: item.email, status: "sent" });
    } catch (err) {
      db.prepare("UPDATE history SET status = 'failed', error = ? WHERE id = ?").run(
        err.message,
        item.id
      );
      failed++;
      send("progress", {
        index: i + 1,
        total: pending.length,
        email: item.email,
        status: "failed",
        error: err.message,
      });
    }

    // Delay between emails to be gentle on Gmail rate limits / reduce spam flags
    await new Promise((r) => setTimeout(r, 2000));
  }

  send("done", { sent, failed, total: pending.length });
  res.end();
});

// Cancel a running batch
router.post("/cancel/:batchId", (req, res) => {
  const c = batchControl.get(req.params.batchId);
  if (c) c.cancelled = true;
  res.json({ ok: true });
});

// Resume: clear cancel flag (re-run process endpoint to continue pending)
router.post("/resume/:batchId", (req, res) => {
  const c = batchControl.get(req.params.batchId) || { attachments: [] };
  c.cancelled = false;
  batchControl.set(req.params.batchId, c);
  res.json({ ok: true });
});

// Retry all failed (optionally in a batch)
router.post("/retry", (req, res) => {
  const { batchId } = req.body;
  if (batchId) {
    db.prepare("UPDATE history SET status = 'pending' WHERE batch_id = ? AND status = 'failed'").run(batchId);
  } else {
    db.prepare("UPDATE history SET status = 'pending' WHERE status = 'failed'").run();
  }
  res.json({ ok: true });
});

export default router;
