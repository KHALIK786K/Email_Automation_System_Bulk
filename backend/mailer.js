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

/** Send a single email. attachments = [{ filename, path }]. */
export async function sendOne({ to, subject, body, attachments = [] }) {
  const s = getSettings();
  const transporter = buildTransporter();
  const fromName = s.sender_name || "Placement Cell";
  await transporter.sendMail({
    from: `"${fromName}" <${s.gmail_user}>`,
    to,
    subject,
    text: body,
    html: body.replace(/\n/g, "<br>"),
    attachments,
  });
  return true;
}
