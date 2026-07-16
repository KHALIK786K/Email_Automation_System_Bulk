import db from "./db/database.js";
import { sendOne } from "./mailer.js";

function parseAttachments(json) {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Background scheduler: every 30 seconds, finds emails whose scheduled_at
 * is due and still pending, then sends them WITH their saved attachments.
 */
export function startScheduler() {
  setInterval(async () => {
    const due = db
      .prepare(
        `SELECT * FROM history
         WHERE status = 'pending'
           AND scheduled_at IS NOT NULL
           AND datetime(scheduled_at) <= datetime('now','localtime')
         LIMIT 20`
      )
      .all();

    for (const item of due) {
      db.prepare("UPDATE history SET status = 'sending' WHERE id = ?").run(item.id);
      try {
        await sendOne({
          to: item.email,
          subject: item.subject,
          body: item.body,
          attachments: parseAttachments(item.attachments),
        });
        db.prepare(`
          UPDATE companies
          SET last_contact_date = date('now','localtime'),
              status = CASE WHEN status = 'New' THEN 'Contacted' ELSE status END,
              updated_at = datetime('now','localtime')
          WHERE hr_email = ?
        `).run(item.email);
        db.prepare(
          "UPDATE history SET status = 'sent', sent_at = datetime('now','localtime'), error = NULL WHERE id = ?"
        ).run(item.id);
      } catch (err) {
        db.prepare("UPDATE history SET status = 'failed', error = ? WHERE id = ?").run(
          err.message,
          item.id
        );
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }, 30000);

  console.log("  Scheduler started (checks every 30s for due emails)");
}