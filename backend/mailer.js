import nodemailer from "nodemailer";
import { getSettings } from "./db/settings.js";

/**
 * Build a nodemailer transporter from the stored Gmail SMTP settings.
 * Uses a Gmail App Password (not the account password).
 */
export function buildTransporter() {
  const s = getSettings();
  if (!s.gmail_user || !s.gmail_app_password) {
    throw new Error(
      "Gmail credentials are not configured. Add them in Settings."
    );
  }
  const port = Number(s.smtp_port) || 465;
  return nodemailer.createTransport({
    host: s.smtp_host || "smtp.gmail.com",
    port,
    secure: port === 465, // true for 465, false for 587
    auth: {
      user: s.gmail_user,
      pass: s.gmail_app_password,
    },
  });
}

/** Verify SMTP credentials without sending. */
export async function verifyTransporter() {
  const transporter = buildTransporter();
  await transporter.verify();
  return true;
}

/**
 * Replace {{placeholders}} in a string using a row object.
 * Supports snake_case keys and a few friendly aliases.
 */
export function renderTemplate(text, row, extra = {}) {
  if (!text) return "";
  const data = { ...extra, ...row };
  return text.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, key) => {
    const val = data[key];
    return val !== undefined && val !== null ? String(val) : "";
  });
}

/** Escape HTML so a stray < or & in a company name can't break rendering. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Minimal Markdown for email bodies: **bold**, *italic*, [text](url).
 *
 * Escaping happens first, so template content is never injected raw. Use bold
 * sparingly — a couple of emphasised words read as human, whole bold paragraphs
 * read as a newsletter and push Gmail to file the mail under Promotions.
 */
export function markdownToHtml(body) {
  return escapeHtml(body)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
      '<a href="$1_URL_" style="color:#1a56db">$1</a>'.replace("$1_URL_", "$2"))
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\n/g, "<br>");
}

/** Same body as readable plain text: markers stripped, links spelled out. */
export function markdownToText(body) {
  return String(body)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2");
}

/**
 * Footer.
 *
 * Two modes, controlled by the `bulk_footer` setting:
 *
 *  "off" (default) — just the org name. Reads like a person wrote it, which is
 *    what keeps placement outreach in Gmail's Primary tab.
 *
 *  "on" — adds the "you received this because..." disclaimer and an unsubscribe
 *    link. Correct for genuine mass campaigns: it lowers spam risk, but the
 *    bulk-mail signals also push Gmail to file the message under Promotions.
 *
 * The List-Unsubscribe header follows the same switch (see sendOne).
 */
function buildFooter(s) {
  const orgName = s.college_name || s.sender_name || "Placement Cell";
  const location = s.college_location || "";
  const unsubMailto = `mailto:${s.gmail_user}?subject=unsubscribe`;
  const bulk = String(s.bulk_footer || "off").toLowerCase() === "on";

  if (!bulk) {
    return { text: "", html: "", unsubMailto, bulk };
  }

  const text =
    `\n\n---\n${orgName}` +
    (location ? `\n${location}` : "") +
    `\n\nYou received this email because your address is on our placement contact list.` +
    `\nTo stop receiving these emails, reply with "unsubscribe" or email ${s.gmail_user}.`;

  const html =
    `<hr style="margin-top:24px;border:none;border-top:1px solid #ddd">` +
    `<div style="font-size:12px;color:#888;margin-top:8px;line-height:1.5">` +
    `<strong>${orgName}</strong>` +
    (location ? `<br>${location}` : "") +
    `<br><br>You received this email because your address is on our placement contact list.` +
    `<br>To stop receiving these emails, ` +
    `<a href="${unsubMailto}" style="color:#888">unsubscribe here</a>.` +
    `</div>`;

  return { text, html, unsubMailto, bulk };
}

/**
 * Send a single email. attachments = [{ filename, path }].
 * Returns { ok, messageId } — messageId MUST be persisted for reply tracking.
 */
export async function sendOne({ to, subject, body, attachments = [], inReplyTo = null }) {
  const s = getSettings();
  const transporter = buildTransporter();
  const fromName = s.sender_name || "Placement Cell";
  const footer = buildFooter(s);

  const headers = {};

  // Only advertise this as bulk mail when it actually is. The header helps a
  // mass campaign avoid the spam folder, but on 1:1 outreach it just tells
  // Gmail to treat the message as marketing.
  if (footer.bulk) {
    headers["List-Unsubscribe"] = `<${footer.unsubMailto}>`;
  }

  // When following up, thread the new mail under the original so it lands in
  // the same Gmail conversation instead of looking like a fresh cold email.
  if (inReplyTo) {
    headers["In-Reply-To"] = inReplyTo;
    headers["References"] = inReplyTo;
  }

  const info = await transporter.sendMail({
    from: `"${fromName}" <${s.gmail_user}>`,
    to,
    subject,
    text: markdownToText(body) + footer.text,
    html: markdownToHtml(body) + footer.html,
    attachments,
    headers,
  });

  // info.messageId looks like "<abc123@gmail.com>". Store it: an incoming reply
  // carries it back in its In-Reply-To / References headers, which is how
  // replyPoller.js attributes replies to the exact email that triggered them.
  return { ok: true, messageId: info.messageId || null };
}