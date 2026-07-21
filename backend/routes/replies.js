import { Router } from "express";
import db from "../db/database.js";
import { getSettings } from "../db/settings.js";
import { pollReplies, verifyImap } from "../replyPoller.js";
import { sendOne } from "../mailer.js";

const router = Router();

/** Trigger a poll immediately instead of waiting for the 3-minute timer. */
router.post("/sync", async (req, res) => {
  try {
    const stats = await pollReplies();
    res.json({ ok: true, ...stats });
  } catch (err) {
    // Surface the real reason in the server log — the toast only has room for
    // the message, and IMAP failures are usually auth or connectivity.
    console.error("  [replies/sync]", err);
    res.status(400).json({ ok: false, message: err.message || "IMAP sync failed" });
  }
});

/** Test IMAP credentials (mirrors the existing SMTP test in Settings). */
router.post("/test", async (req, res) => {
  try {
    await verifyImap();
    res.json({ ok: true, message: "IMAP connection successful." });
  } catch (err) {
    console.error("  [replies/test]", err);
    res.status(400).json({ ok: false, message: err.message || "IMAP connection failed" });
  }
});

/** Everything that got a reply. */
router.get("/replied", (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT h.*, c.company_name AS company_full, c.hr_name
         FROM history h
         LEFT JOIN companies c ON c.hr_email = h.email
         WHERE h.replied_at IS NOT NULL
         ORDER BY h.replied_at DESC
         LIMIT 500`
      )
      .all()
  );
});

/**
 * Follow-up queue: sent, no reply, older than ?days (default 7).
 * This is the list worth acting on — everything else is either answered
 * or too recent to chase.
 */
router.get("/follow-up-due", (req, res) => {
  const days = Number(req.query.days) || 7;
  res.json(
    db
      .prepare(
        `SELECT h.*, c.company_name AS company_full, c.hr_name,
                CAST(julianday('now') - julianday(h.sent_at) AS INTEGER) AS days_since_sent
         FROM history h
         LEFT JOIN companies c ON c.hr_email = h.email
         WHERE h.status = 'sent'
           AND h.replied_at IS NULL
           AND h.sent_at IS NOT NULL
           AND julianday('now') - julianday(h.sent_at) >= ?
         ORDER BY h.sent_at ASC
         LIMIT 500`
      )
      .all(days)
  );
});

/** Counters for the dashboard tabs. */
router.get("/summary", (req, res) => {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'sent')                              AS sent,
         COUNT(*) FILTER (WHERE replied_at IS NOT NULL)                       AS replied,
         COUNT(*) FILTER (WHERE status = 'sent' AND replied_at IS NULL
                            AND julianday('now') - julianday(sent_at) <  7)   AS awaiting,
         COUNT(*) FILTER (WHERE status = 'sent' AND replied_at IS NULL
                            AND julianday('now') - julianday(sent_at) >= 7)   AS follow_up_due
       FROM history`
    )
    .get();

  const s = getSettings();
  const sent = row.sent || 0;
  res.json({
    ...row,
    reply_rate: sent ? Number(((row.replied / sent) * 100).toFixed(1)) : 0,
    last_poll: s.imap_last_poll || null,
  });
});

/** Full conversation for one row: what we sent, and what came back. */
router.get("/:id/thread", (req, res) => {
  const row = db
    .prepare(
      `SELECT h.*, c.company_name AS company_full, c.hr_name, c.phone
       FROM history h
       LEFT JOIN companies c ON c.hr_email = h.email
       WHERE h.id = ?`
    )
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });

  // Everything else ever sent to this address, so the full history is visible.
  const related = db
    .prepare(
      `SELECT id, subject, status, sent_at, replied_at, reply_snippet
       FROM history WHERE lower(email) = lower(?) AND id != ?
       ORDER BY sent_at DESC LIMIT 20`
    )
    .all(row.email, row.id);

  res.json({ ...row, related });
});

/**
 * Reply to (or follow up on) a conversation directly from the app.
 * Threads under the original via In-Reply-To and logs a new history row so the
 * next reply can be attributed to this message rather than the first one.
 */
router.post("/:id/reply", async (req, res) => {
  const { body, subject } = req.body || {};
  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: "Message body is empty" });
  }

  const orig = db.prepare("SELECT * FROM history WHERE id = ?").get(req.params.id);
  if (!orig) return res.status(404).json({ error: "Not found" });

  const subj =
    subject?.trim() ||
    (orig.subject?.startsWith("Re:") ? orig.subject : `Re: ${orig.subject || ""}`);

  const insert = db.prepare(`
    INSERT INTO history
      (student_name, email, company, role, subject, body, status, template_id, batch_id, in_reply_to)
    VALUES (?, ?, ?, ?, ?, ?, 'sending', NULL, ?, ?)
  `);
  const info = insert.run(
    orig.student_name || "",
    orig.email,
    orig.company || "",
    orig.role || "",
    subj,
    body,
    `reply-${orig.id}`,
    orig.message_id || null
  );
  const newId = info.lastInsertRowid;

  try {
    const result = await sendOne({
      to: orig.email,
      subject: subj,
      body,
      inReplyTo: orig.message_id || null,
    });
    db.prepare(
      `UPDATE history
       SET status = 'sent', sent_at = datetime('now'), message_id = ?
       WHERE id = ?`
    ).run(result?.messageId || null, newId);

    db.prepare(
      "UPDATE companies SET last_contact_date = date('now'), updated_at = datetime('now') WHERE hr_email = ?"
    ).run(orig.email);

    res.json({ ok: true, id: newId, threaded: Boolean(orig.message_id) });
  } catch (err) {
    db.prepare("UPDATE history SET status = 'failed', error = ? WHERE id = ?").run(
      err.message,
      newId
    );
    res.status(500).json({ ok: false, message: err.message });
  }
});

/** Manual override when a reply arrived somewhere the poller can't see it. */
router.post("/:id/mark-replied", (req, res) => {
  const result = db
    .prepare(
      `UPDATE history
       SET replied_at = datetime('now'),
           reply_from = COALESCE(reply_from, email),
           reply_snippet = COALESCE(reply_snippet, 'Marked manually')
       WHERE id = ?`
    )
    .run(req.params.id);
  res.json({ ok: result.changes > 0 });
});

/** Undo a wrong match (the sender fallback can occasionally misfire). */
router.post("/:id/unmark-replied", (req, res) => {
  const result = db
    .prepare(
      `UPDATE history
       SET replied_at = NULL, reply_from = NULL, reply_snippet = NULL
       WHERE id = ?`
    )
    .run(req.params.id);
  res.json({ ok: result.changes > 0 });
});

export default router;