import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import db from "./db/database.js";
import { getSettings, updateSettings } from "./db/settings.js";

/**
 * Reply detection.
 *
 * Polls the sending mailbox over IMAP and marks history rows as replied.
 *
 * Matching strategy, strongest first:
 *   1. In-Reply-To / References header  -> exact match on history.message_id
 *   2. Sender address                   -> oldest un-replied sent mail to that address
 *
 * (1) is exact: the reply literally carries back the Message-ID we generated
 * when sending, so attribution is unambiguous even on a shared mailbox where
 * several coordinators mailed the same HR contact.
 *
 * (2) is a fallback for clients that strip threading headers. It is a guess,
 * so rows matched this way are flagged with match_type = 'sender'.
 */

const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
let polling = false;
let timer = null;

// ---------- helpers ----------

/** "<abc@mail.gmail.com>" -> "abc@mail.gmail.com" */
function normalizeId(id) {
  return String(id || "").trim().replace(/^</, "").replace(/>$/, "").toLowerCase();
}

/** Pull all Message-IDs out of raw In-Reply-To / References header text. */
function extractReferencedIds(headerText) {
  const ids = String(headerText || "").match(/<[^<>\s]+>/g) || [];
  return ids.map(normalizeId).filter(Boolean);
}

/** Parse the small raw header block IMAP returns into a lowercase key map. */
function parseHeaders(buffer) {
  const text = buffer ? buffer.toString("utf8") : "";
  const out = {};
  // unfold continuation lines (RFC 5322 folding)
  const unfolded = text.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    out[key] = out[key] ? out[key] + " " + value : value;
  }
  return out;
}

function senderAddress(envelope) {
  const from = envelope?.from?.[0];
  if (!from) return "";
  return `${from.address || ""}`.trim().toLowerCase();
}

// ---------- matching ----------

const findByMessageId = db.prepare(`
  SELECT id, email FROM history
  WHERE message_id IS NOT NULL
    AND lower(replace(replace(message_id, '<', ''), '>', '')) = ?
  LIMIT 1
`);

const findBySender = db.prepare(`
  SELECT id, email FROM history
  WHERE lower(email) = ?
    AND status = 'sent'
    AND replied_at IS NULL
  ORDER BY sent_at ASC
  LIMIT 1
`);

const markReplied = db.prepare(`
  UPDATE history
  SET replied_at = ?, reply_from = ?, reply_snippet = ?, reply_body = ?
  WHERE id = ? AND replied_at IS NULL
`);

const touchCompanyReply = db.prepare(`
  UPDATE companies
  SET last_reply_date = date('now'),
      status = CASE WHEN status IN ('New', 'Contacted') THEN 'Replied' ELSE status END,
      updated_at = datetime('now')
  WHERE hr_email = ?
`);

/**
 * Given one inbound message, find the history row it answers and mark it.
 * Returns 'header' | 'sender' | null depending on how it matched.
 */
function attributeReply({ envelope, headers, body }) {
  const referenced = [
    ...extractReferencedIds(headers["in-reply-to"]),
    ...extractReferencedIds(headers["references"]),
  ];

  const receivedAt = envelope?.date
    ? new Date(envelope.date).toISOString().replace("T", " ").slice(0, 19)
    : new Date().toISOString().replace("T", " ").slice(0, 19);
  const from = senderAddress(envelope);
  const snippet = String(envelope?.subject || "").slice(0, 200);

  // 1. exact header match
  for (const refId of referenced) {
    const row = findByMessageId.get(refId);
    if (row) {
      const res = markReplied.run(receivedAt, from, snippet, body, row.id);
      if (res.changes) touchCompanyReply.run(row.email);
      return res.changes ? "header" : null;
    }
  }

  // 2. sender fallback
  if (from) {
    const row = findBySender.get(from);
    if (row) {
      const res = markReplied.run(receivedAt, from, snippet, body, row.id);
      if (res.changes) touchCompanyReply.run(row.email);
      return res.changes ? "sender" : null;
    }
  }

  return null;
}

// ---------- IMAP ----------

function imapConfig() {
  const s = getSettings();
  if (!s.gmail_user || !s.gmail_app_password) {
    throw new Error("Gmail credentials are not configured. Add them in Settings.");
  }
  return {
    host: s.imap_host || "imap.gmail.com",
    port: Number(s.imap_port) || 993,
    secure: true,
    auth: { user: s.gmail_user, pass: s.gmail_app_password },
    logger: false,
  };
}

/**
 * Fetch new mail since the last poll and attribute it.
 * Uses UID-based paging so nothing is re-processed and nothing is skipped.
 */
export async function pollReplies() {
  if (polling) return { skipped: true, reason: "already running" };
  polling = true;

  let client;
  const stats = { scanned: 0, matchedByHeader: 0, matchedBySender: 0, unmatched: 0 };

  try {
    client = new ImapFlow(imapConfig());
    await client.connect();

    const lock = await client.getMailboxLock("INBOX");
    try {
      const s = getSettings();
      const storedValidity = String(s.imap_uid_validity || "");
      const currentValidity = String(client.mailbox.uidValidity || "");
      let lastUid = Number(s.imap_last_uid) || 0;

      // If the mailbox was recreated, UIDs are no longer comparable — restart.
      if (storedValidity && storedValidity !== currentValidity) {
        lastUid = 0;
      }

      // First ever run: don't crawl the entire inbox, start from now.
      if (!lastUid) {
        updateSettings({
          imap_last_uid: String(client.mailbox.uidNext - 1),
          imap_uid_validity: currentValidity,
          imap_last_poll: new Date().toISOString(),
        });
        return { ...stats, initialized: true };
      }

      let highestUid = lastUid;

      // PHASE 1 — collect envelopes only.
      // ImapFlow allows one command at a time, so nothing else may talk to the
      // server while this iterator is open. Downloading bodies inside this loop
      // deadlocks the connection; collect first, fetch bodies afterwards.
      const messages = [];
      for await (const msg of client.fetch(
        { uid: `${lastUid + 1}:*` },
        { uid: true, envelope: true, headers: ["in-reply-to", "references"] }
      )) {
        // The `n:*` range always returns at least one message even when nothing
        // is new — skip anything we've already accounted for.
        if (msg.uid <= lastUid) continue;
        highestUid = Math.max(highestUid, msg.uid);
        messages.push({
          uid: msg.uid,
          envelope: msg.envelope,
          headers: parseHeaders(msg.headers),
        });
      }

      // PHASE 2 — the iterator is closed, so bodies can be downloaded now.
      for (const msg of messages) {
        stats.scanned++;

        let body = null;
        try {
          const { content } = await client.download(String(msg.uid), undefined, { uid: true });
          const chunks = [];
          for await (const chunk of content) chunks.push(chunk);
          const parsed = await simpleParser(Buffer.concat(chunks));
          body = (parsed.text || parsed.html || "").slice(0, 20000);
        } catch {
          /* body is a nice-to-have; attribution still works without it */
        }

        const how = attributeReply({
          envelope: msg.envelope,
          headers: msg.headers,
          body,
        });

        if (how === "header") stats.matchedByHeader++;
        else if (how === "sender") stats.matchedBySender++;
        else stats.unmatched++;
      }

      updateSettings({
        imap_last_uid: String(highestUid),
        imap_uid_validity: currentValidity,
        imap_last_poll: new Date().toISOString(),
      });
    } finally {
      lock.release();
    }

    return stats;
  } finally {
    polling = false;
    if (client) {
      try {
        await client.logout();
      } catch {
        /* connection already gone */
      }
    }
  }
}

/** Verify IMAP credentials without processing anything. */
export async function verifyImap() {
  const client = new ImapFlow(imapConfig());
  await client.connect();
  await client.logout();
  return true;
}

export function startReplyPoller() {
  if (timer) return;
  const run = () =>
    pollReplies().catch((err) =>
      console.error("  [replyPoller]", err.message)
    );

  timer = setInterval(run, POLL_INTERVAL_MS);
  setTimeout(run, 10_000); // first pass shortly after boot
  console.log("  Reply poller started (IMAP check every 3 min)");
}

export function stopReplyPoller() {
  if (timer) clearInterval(timer);
  timer = null;
}