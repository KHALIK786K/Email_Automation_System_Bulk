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

/**
 * Build a plain-text + HTML footer with sender identity and an unsubscribe line.
 * The unsubscribe uses a mailto: link (no web server needed) — the recipient's
 * request lands in the sender's inbox with subject "unsubscribe".
 */
function buildFooter(s) {
  const orgName = s.college_name || s.sender_name || "Placement Cell";
  const location = s.college_location || "";
  const unsubMailto = `mailto:${s.gmail_user}?subject=unsubscribe`;

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

  return { text, html, unsubMailto };
}

/** Send a single email. attachments = [{ filename, path }]. */
export async function sendOne({ to, subject, body, attachments = [] }) {
  const s = getSettings();
  const transporter = buildTransporter();
  const fromName = s.sender_name || "Placement Cell";
  const footer = buildFooter(s);

  await transporter.sendMail({
    from: `"${fromName}" <${s.gmail_user}>`,
    to,
    subject,
    text: body + footer.text,
    html: body.replace(/\n/g, "<br>") + footer.html,
    attachments,
    // Lets Gmail/Outlook show a native "Unsubscribe" button — a strong
    // deliverability signal that helps keep bulk mail out of spam.
    headers: {
      "List-Unsubscribe": `<${footer.unsubMailto}>`,
    },
  });
  return true;
}
