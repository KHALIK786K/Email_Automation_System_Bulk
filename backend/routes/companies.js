import { Router } from "express";
import db from "../db/database.js";

const router = Router();

const COMPANY_FIELDS = [
  "company_name",
  "hr_name",
  "designation",
  "hr_email",
  "phone",
  "website",
  "linkedin",
  "industry",
  "city",
  "state",
  "country",
  "status",
  "last_contact_date",
  "last_reply_date",
  "follow_up_date",
  "meeting_date",
  "meeting_link",
  "student_count",
  "job_role",
  "brochure_link",
  "notes",
];

const STATUS_VALUES = new Set([
  "New",
  "Contacted",
  "Follow-up Pending",
  "Interested",
  "Meeting Scheduled",
  "Internship Partner",
  "Placement Partner",
  "Not Interested",
  "Closed",
]);

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function normalizeCompany(input = {}) {
  const company = {};
  for (const field of COMPANY_FIELDS) company[field] = clean(input[field]);

  company.company_name = company.company_name || clean(input.company) || clean(input.organisation);
  company.hr_email =
    company.hr_email ||
    clean(input.company_email) ||
    clean(input.email) ||
    clean(input.mail);
  company.hr_name = company.hr_name || clean(input.contact_name) || clean(input.recruiter_name);
  company.phone = company.phone || clean(input.contact_number);
  company.website = company.website || clean(input.company_website);
  company.status = STATUS_VALUES.has(company.status) ? company.status : "New";

  return company;
}

function validateCompany(company) {
  if (!company.company_name) return "Company name is required";
  if (!company.hr_email) return "HR email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company.hr_email)) return "Valid HR email is required";
  return null;
}

const selectSql = "SELECT * FROM companies WHERE id = ?";

router.get("/", (req, res) => {
  const { q, status, industry, city, followUpDate } = req.query;
  const where = [];
  const params = [];

  if (q) {
    where.push("(company_name LIKE ? OR hr_name LIKE ? OR hr_email LIKE ? OR industry LIKE ? OR city LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status && status !== "all") {
    where.push("status = ?");
    params.push(status);
  }
  if (industry) {
    where.push("industry LIKE ?");
    params.push(`%${industry}%`);
  }
  if (city) {
    where.push("city LIKE ?");
    params.push(`%${city}%`);
  }
  if (followUpDate) {
    where.push("date(follow_up_date) = date(?)");
    params.push(followUpDate);
  }

  const sql =
    "SELECT * FROM companies" +
    (where.length ? " WHERE " + where.join(" AND ") : "") +
    " ORDER BY COALESCE(follow_up_date, '9999-12-31') ASC, updated_at DESC LIMIT 1000";
  res.json(db.prepare(sql).all(...params));
});

router.get("/summary", (req, res) => {
  const today = db.prepare(`
    SELECT
      COUNT(*) AS totalCompanies,
      SUM(CASE WHEN date(last_contact_date) = date('now') THEN 1 ELSE 0 END) AS contactedToday,
      SUM(CASE WHEN follow_up_date IS NOT NULL AND date(follow_up_date) <= date('now') AND status NOT IN ('Closed','Not Interested') THEN 1 ELSE 0 END) AS followupsDue,
      SUM(CASE WHEN meeting_date IS NOT NULL AND date(meeting_date) >= date('now') THEN 1 ELSE 0 END) AS meetingsScheduled,
      SUM(CASE WHEN status IN ('Interested','Meeting Scheduled','Internship Partner','Placement Partner') THEN 1 ELSE 0 END) AS interested,
      SUM(CASE WHEN last_reply_date IS NOT NULL THEN 1 ELSE 0 END) AS replied,
      SUM(CASE WHEN follow_up_date IS NOT NULL AND status NOT IN ('Closed','Not Interested') THEN 1 ELSE 0 END) AS pendingFollowups
    FROM companies
  `).get();

  const responseRate = today.totalCompanies
    ? Math.round(((today.replied || 0) / today.totalCompanies) * 100)
    : 0;

  res.json({
    totalCompanies: today.totalCompanies || 0,
    contactedToday: today.contactedToday || 0,
    followupsDue: today.followupsDue || 0,
    meetingsScheduled: today.meetingsScheduled || 0,
    interested: today.interested || 0,
    replied: today.replied || 0,
    pendingFollowups: today.pendingFollowups || 0,
    responseRate,
  });
});

router.get("/calendar", (req, res) => {
  const rows = db.prepare(`
    SELECT id, company_name, hr_name, hr_email, status, follow_up_date, meeting_date, meeting_link, notes
    FROM companies
    WHERE follow_up_date IS NOT NULL OR meeting_date IS NOT NULL
    ORDER BY COALESCE(follow_up_date, meeting_date) ASC
    LIMIT 500
  `).all();

  const events = [];
  for (const row of rows) {
    if (row.follow_up_date) {
      events.push({
        id: `followup-${row.id}`,
        type: "Follow-up",
        date: row.follow_up_date,
        title: `Follow up with ${row.company_name}`,
        companyId: row.id,
        company_name: row.company_name,
        hr_name: row.hr_name,
        email: row.hr_email,
        status: row.status,
        notes: row.notes,
      });
    }
    if (row.meeting_date) {
      events.push({
        id: `meeting-${row.id}`,
        type: "Meeting",
        date: row.meeting_date,
        title: `Meeting with ${row.company_name}`,
        companyId: row.id,
        company_name: row.company_name,
        hr_name: row.hr_name,
        email: row.hr_email,
        status: row.status,
        meeting_link: row.meeting_link,
        notes: row.notes,
      });
    }
  }

  events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  res.json(events);
});

router.get("/:id", (req, res) => {
  const row = db.prepare(selectSql).get(req.params.id);
  if (!row) return res.status(404).json({ error: "Company not found" });
  res.json(row);
});

router.post("/", (req, res) => {
  const company = normalizeCompany(req.body);
  const error = validateCompany(company);
  if (error) return res.status(400).json({ error });

  const info = db.prepare(`
    INSERT INTO companies (${COMPANY_FIELDS.join(", ")})
    VALUES (${COMPANY_FIELDS.map(() => "?").join(", ")})
  `).run(...COMPANY_FIELDS.map((field) => company[field]));

  res.status(201).json(db.prepare(selectSql).get(info.lastInsertRowid));
});

router.post("/bulk", (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  let created = 0;
  let updated = 0;
  const skipped = [];

  const insert = db.prepare(`
    INSERT INTO companies (${COMPANY_FIELDS.join(", ")})
    VALUES (${COMPANY_FIELDS.map(() => "?").join(", ")})
  `);
  const update = db.prepare(`
    UPDATE companies SET
      company_name = ?,
      hr_name = ?,
      designation = ?,
      phone = ?,
      website = ?,
      linkedin = ?,
      industry = ?,
      city = ?,
      state = ?,
      country = ?,
      status = ?,
      last_contact_date = ?,
      last_reply_date = ?,
      follow_up_date = ?,
      meeting_date = ?,
      meeting_link = ?,
      student_count = ?,
      job_role = ?,
      brochure_link = ?,
      notes = ?,
      updated_at = datetime('now')
    WHERE hr_email = ?
  `);

  const tx = db.transaction(() => {
    for (const raw of rows) {
      const company = normalizeCompany(raw);
      const error = validateCompany(company);
      if (error) {
        skipped.push({ company_name: company.company_name, hr_email: company.hr_email, reason: error });
        continue;
      }

      const existing = db.prepare("SELECT id FROM companies WHERE hr_email = ?").get(company.hr_email);
      if (existing) {
        update.run(
          company.company_name,
          company.hr_name,
          company.designation,
          company.phone,
          company.website,
          company.linkedin,
          company.industry,
          company.city,
          company.state,
          company.country,
          company.status,
          company.last_contact_date,
          company.last_reply_date,
          company.follow_up_date,
          company.meeting_date,
          company.meeting_link,
          company.student_count,
          company.job_role,
          company.brochure_link,
          company.notes,
          company.hr_email
        );
        updated++;
      } else {
        insert.run(...COMPANY_FIELDS.map((field) => company[field]));
        created++;
      }
    }
  });
  tx();

  res.json({ created, updated, skipped, total: rows.length });
});

router.put("/:id", (req, res) => {
  const existing = db.prepare(selectSql).get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Company not found" });

  const company = { ...existing, ...normalizeCompany({ ...existing, ...req.body }) };
  const error = validateCompany(company);
  if (error) return res.status(400).json({ error });

  db.prepare(`
    UPDATE companies SET
      company_name = ?,
      hr_name = ?,
      designation = ?,
      hr_email = ?,
      phone = ?,
      website = ?,
      linkedin = ?,
      industry = ?,
      city = ?,
      state = ?,
      country = ?,
      status = ?,
      last_contact_date = ?,
      last_reply_date = ?,
      follow_up_date = ?,
      meeting_date = ?,
      meeting_link = ?,
      student_count = ?,
      job_role = ?,
      brochure_link = ?,
      notes = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(...COMPANY_FIELDS.map((field) => company[field]), req.params.id);

  res.json(db.prepare(selectSql).get(req.params.id));
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM companies WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
