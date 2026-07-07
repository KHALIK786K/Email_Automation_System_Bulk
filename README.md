# MailFlow — Email Automation for Placement Coordinators

Send 100–500 personalized emails a day with a few clicks. Upload an Excel/CSV of
students, pick a template with `{{placeholders}}`, preview, and send in bulk via
your Gmail account.

Built to be **simple, lightweight, and reliable** — React frontend, Node/Express
backend, SQLite storage, Nodemailer for sending.

---

## Features

- **Dashboard** — sent today, pending, failed, recent activity
- **Templates** — create / edit / delete / duplicate, with placeholder buttons
- **Excel/CSV import** — drag & drop, auto column mapping, email validation, dedup
- **Bulk send** — personalized emails, live progress bar, cancel & resume
- **Attachments** — PDF, DOCX, images, ZIP (attached to the whole batch)
- **Preview** — see each rendered email before sending
- **Scheduling** — send now or schedule for later (background scheduler)
- **History** — searchable + filterable (status, company, student, date), CSV export
- **Analytics** — totals, success rate, 7-day bar chart, status pie chart
- **Settings** — Gmail App Password / SMTP, sender name, signature, test connection
- **Extras** — dark/light mode, toast notifications, auto-saved drafts, retry failed, optional login

---

## Tech Stack

| Layer     | Tech |
|-----------|------|
| Frontend  | React 18, Vite, Tailwind CSS, React Router, Recharts, Axios |
| Backend   | Node.js, Express |
| Database  | SQLite (better-sqlite3) |
| Email     | Nodemailer (Gmail SMTP) |
| Parsing   | xlsx, papaparse |

---

## Folder Structure

```
email-automation/
├── backend/
│   ├── server.js            # Express app + static serving + scheduler
│   ├── mailer.js            # Nodemailer + placeholder rendering
│   ├── scheduler.js         # Sends scheduled emails when due
│   ├── db/
│   │   ├── database.js      # SQLite schema + seed data
│   │   └── settings.js      # settings helpers
│   ├── routes/              # templates, settings, import, send, history, analytics, drafts
│   ├── uploads/             # temporary import files
│   └── attachments/         # stored email attachments
├── frontend/
│   ├── src/
│   │   ├── pages/           # Dashboard, Compose, Templates, History, Analytics, Settings, Login
│   │   ├── components/      # Layout, Icons, StatusBadge
│   │   └── lib/             # api, toast, theme
│   └── ...
├── samples/
│   ├── sample_students.xlsx
│   ├── sample_students.csv
│   └── sample_templates.json
└── README.md
```

---

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # optional: change PORT / APP_PASSCODE
npm start                 # runs on http://localhost:5000
```

The SQLite database and 3 sample templates are created automatically on first run.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev               # runs on http://localhost:5173 (proxies /api to backend)
```

Open **http://localhost:5173**. Default login passcode is `admin`
(set `REQUIRE_LOGIN = false` in `src/App.jsx` to skip login entirely).

### 3. Production (single server)

Build the frontend and let the backend serve it:

```bash
cd frontend && npm run build
cd ../backend && npm start
```

Now everything is available at **http://localhost:5000**.

---

## Gmail Setup (important)

You must use a Gmail **App Password**, not your normal password:

1. Enable **2-Step Verification** on your Google account.
2. Go to **myaccount.google.com → Security → App passwords**.
3. Generate a 16-character password.
4. In MailFlow → **Settings**, enter your Gmail address + the App Password.
5. Click **Test Connection** to verify.

Default SMTP is `smtp.gmail.com` port `465` (SSL). Port `587` also works.

---

## How to send a campaign

1. **Settings** → add Gmail credentials, test connection.
2. **Templates** → pick or create a template with placeholders.
3. **Compose & Send**:
   - Select the template
   - Drag & drop `samples/sample_students.xlsx`
   - (Optional) add attachments
   - Click **Preview** to verify
   - **Send All** (or schedule for later)
4. Watch the live progress bar. Cancel/resume anytime.
5. Check **History** and **Analytics** for results.

---

## Supported placeholders

`{{student_name}}` · `{{company_name}}` · `{{job_role}}` · `{{deadline}}` ·
`{{meeting_link}}` · `{{college}}` · `{{email}}` · `{{phone}}` · `{{signature}}`

The Excel importer auto-maps common column names (e.g. "Name", "Company",
"Role", "Interview Date") to these fields.

---

## Notes

- Emails are sent with a small delay (~300ms) to respect Gmail rate limits.
- Gmail's daily sending limit is ~500 (free) / ~2000 (Workspace). Plan batches accordingly.
- Credentials are stored locally in the SQLite database on your machine — nothing leaves your server.
- `test connection`, scheduling, and retry all work against your own Gmail account.
