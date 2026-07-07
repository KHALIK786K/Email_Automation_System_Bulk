import { Router } from "express";
import db from "../db/database.js";

const router = Router();

router.get("/", (req, res) => {
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status IN ('pending','sending') THEN 1 ELSE 0 END) AS pending
    FROM history
  `).get();

  const today = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sentToday,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failedToday,
      SUM(CASE WHEN status IN ('pending','sending') THEN 1 ELSE 0 END) AS pendingToday
    FROM history WHERE date(created_at) = date('now')
  `).get();

  // Last 7 days sent counts for a simple chart
  const daily = db.prepare(`
    SELECT date(created_at) AS day,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
    FROM history
    WHERE created_at >= datetime('now', '-6 days')
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all();

  const total = totals.total || 0;
  const sent = totals.sent || 0;
  const successRate = total ? Math.round((sent / total) * 100) : 0;

  const crm = db.prepare(`
    SELECT
      COUNT(*) AS totalCompanies,
      SUM(CASE WHEN date(last_contact_date) = date('now') THEN 1 ELSE 0 END) AS companiesContactedToday,
      SUM(CASE WHEN follow_up_date IS NOT NULL AND date(follow_up_date) <= date('now') AND status NOT IN ('Closed','Not Interested') THEN 1 ELSE 0 END) AS followupsDue,
      SUM(CASE WHEN meeting_date IS NOT NULL AND date(meeting_date) >= date('now') THEN 1 ELSE 0 END) AS meetingsScheduled,
      SUM(CASE WHEN status IN ('Interested','Meeting Scheduled','Internship Partner','Placement Partner') THEN 1 ELSE 0 END) AS companiesInterested,
      SUM(CASE WHEN last_reply_date IS NOT NULL THEN 1 ELSE 0 END) AS companiesReplied,
      SUM(CASE WHEN follow_up_date IS NOT NULL AND status NOT IN ('Closed','Not Interested') THEN 1 ELSE 0 END) AS pendingFollowups
    FROM companies
  `).get();

  const responseRate = crm.totalCompanies
    ? Math.round(((crm.companiesReplied || 0) / crm.totalCompanies) * 100)
    : 0;

  const byStatus = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM companies
    GROUP BY status
    ORDER BY count DESC
  `).all();

  res.json({
    total,
    sent,
    failed: totals.failed || 0,
    pending: totals.pending || 0,
    successRate,
    today: {
      sent: today.sentToday || 0,
      failed: today.failedToday || 0,
      pending: today.pendingToday || 0,
    },
    daily,
    crm: {
      totalCompanies: crm.totalCompanies || 0,
      companiesContactedToday: crm.companiesContactedToday || 0,
      followupsDue: crm.followupsDue || 0,
      meetingsScheduled: crm.meetingsScheduled || 0,
      companiesInterested: crm.companiesInterested || 0,
      companiesReplied: crm.companiesReplied || 0,
      pendingFollowups: crm.pendingFollowups || 0,
      responseRate,
      byStatus,
    },
  });
});

export default router;
