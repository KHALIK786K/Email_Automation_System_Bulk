import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useToast } from "../lib/toast.jsx";
import {
  IconBuilding, IconEdit, IconTrash, IconUpload, IconSearch, IconSend,
} from "../components/Icons.jsx";

const STATUSES = [
  "New",
  "Contacted",
  "Follow-up Pending",
  "Interested",
  "Meeting Scheduled",
  "Internship Partner",
  "Placement Partner",
  "Not Interested",
  "Closed",
];

const EMPTY = {
  company_name: "",
  hr_name: "",
  designation: "",
  hr_email: "",
  phone: "",
  website: "",
  linkedin: "",
  industry: "",
  city: "",
  state: "",
  country: "India",
  status: "New",
  last_contact_date: "",
  last_reply_date: "",
  follow_up_date: "",
  meeting_date: "",
  meeting_link: "",
  student_count: "",
  job_role: "",
  brochure_link: "",
  notes: "",
};

function StatusPill({ status }) {
  const tone = {
    New: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    Contacted: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    "Follow-up Pending": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    Interested: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    "Meeting Scheduled": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    "Internship Partner": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    "Placement Partner": "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    "Not Interested": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    Closed: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  };
  return <span className={`badge ${tone[status] || tone.New}`}>{status}</span>;
}

export default function Companies() {
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [industry, setIndustry] = useState("");
  const [city, setCity] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  const params = useMemo(() => {
    const p = {};
    if (q) p.q = q;
    if (status !== "all") p.status = status;
    if (industry) p.industry = industry;
    if (city) p.city = city;
    if (followUpDate) p.followUpDate = followUpDate;
    return p;
  }, [q, status, industry, city, followUpDate]);

  const load = async () => {
    const [companies, stats] = await Promise.all([
      api.get("/companies", { params }),
      api.get("/companies/summary"),
    ]);
    setRows(companies.data);
    setSummary(stats.data);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/companies/${editingId}`, form);
        toast.success("Company updated");
      } else {
        await api.post("/companies", form);
        toast.success("Company added");
      }
      setForm(EMPTY);
      setEditingId(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to save company");
    }
  };

  const edit = (row) => {
    setForm({ ...EMPTY, ...row });
    setEditingId(row.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (id) => {
    if (!confirm("Delete this company from CRM?")) return;
    await api.delete(`/companies/${id}`);
    toast.info("Company deleted");
    load();
  };

  const importCompanies = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const imported = await api.post("/import", fd);
      const saved = await api.post("/companies/bulk", { rows: imported.data.rows });
      toast.success(`Imported ${saved.data.created} new, updated ${saved.data.updated}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || "Company import failed");
    }
  };

  const followUp = async (row) => {
    await api.put("/drafts", {
      rows: [{
        company_name: row.company_name,
        hr_name: row.hr_name,
        designation: row.designation,
        email: row.hr_email,
        hr_email: row.hr_email,
        phone: row.phone,
        website: row.website,
        linkedin: row.linkedin,
        industry: row.industry,
        city: row.city,
        state: row.state,
        country: row.country,
        job_role: row.job_role,
        meeting_date: row.meeting_date,
        meeting_link: row.meeting_link,
        brochure_link: row.brochure_link,
        student_count: row.student_count,
        notes: row.notes,
      }],
      source: "company-follow-up",
    });
    navigate("/compose");
  };

  const statCards = [
    ["Total Companies", summary?.totalCompanies ?? "-"],
    ["Follow-ups Due", summary?.followupsDue ?? "-"],
    ["Meetings", summary?.meetingsScheduled ?? "-"],
    ["Response Rate", `${summary?.responseRate ?? 0}%`],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Companies CRM</h1>
          <p className="text-sm text-slate-500">Track HR contacts, outreach status, meetings, and follow-ups</p>
        </div>
        <label className="btn btn-primary cursor-pointer">
          <IconUpload /> Import Excel / CSV
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => importCompanies(e.target.files[0])} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(([label, value]) => (
          <div key={label} className="card p-4">
            <div className="text-2xl font-extrabold">{value}</div>
            <div className="text-sm text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      <form onSubmit={save} className="card space-y-4 p-5">
        <div className="flex items-center gap-2 font-bold">
          <IconBuilding /> {editingId ? "Edit Company" : "Add Company"}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <input className="input" placeholder="Company Name" value={form.company_name}
            onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
          <input className="input" placeholder="HR Name" value={form.hr_name}
            onChange={(e) => setForm({ ...form, hr_name: e.target.value })} />
          <input className="input" placeholder="Designation" value={form.designation}
            onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          <input className="input" placeholder="HR Email" value={form.hr_email}
            onChange={(e) => setForm({ ...form, hr_email: e.target.value })} />
          <input className="input" placeholder="Phone Number" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="input" placeholder="Website" value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })} />
          <input className="input" placeholder="LinkedIn" value={form.linkedin}
            onChange={(e) => setForm({ ...form, linkedin: e.target.value })} />
          <input className="input" placeholder="Industry" value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          <input className="input" placeholder="City" value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <input className="input" placeholder="State" value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })} />
          <input className="input" placeholder="Country" value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })} />
          <select className="input" value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div>
            <label className="label">Last Contact Date</label>
            <input type="date" className="input" value={form.last_contact_date || ""}
              onChange={(e) => setForm({ ...form, last_contact_date: e.target.value })} />
          </div>
          <div>
            <label className="label">Follow-up Date</label>
            <input type="date" className="input" value={form.follow_up_date || ""}
              onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} />
          </div>
          <div>
            <label className="label">Meeting Date</label>
            <input type="datetime-local" className="input" value={form.meeting_date || ""}
              onChange={(e) => setForm({ ...form, meeting_date: e.target.value })} />
          </div>
          <input className="input" placeholder="Meeting Link" value={form.meeting_link || ""}
            onChange={(e) => setForm({ ...form, meeting_link: e.target.value })} />
          <input className="input" placeholder="Student Count" value={form.student_count || ""}
            onChange={(e) => setForm({ ...form, student_count: e.target.value })} />
          <input className="input" placeholder="Target Role" value={form.job_role || ""}
            onChange={(e) => setForm({ ...form, job_role: e.target.value })} />
          <input className="input md:col-span-2" placeholder="Brochure Link" value={form.brochure_link || ""}
            onChange={(e) => setForm({ ...form, brochure_link: e.target.value })} />
          <textarea className="input md:col-span-3" rows={3} placeholder="Notes"
            value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary">{editingId ? "Update Company" : "Add Company"}</button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={() => { setEditingId(null); setForm(EMPTY); }}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[220px] flex-1">
          <label className="label">Search</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IconSearch /></span>
            <input className="input pl-10" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Company, HR, email, industry, city" />
          </div>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Industry</label>
          <input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} />
        </div>
        <div>
          <label className="label">City</label>
          <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div>
          <label className="label">Follow-up Date</label>
          <input type="date" className="input" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={load} type="button">Filter</button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">HR Contact</th>
                <th className="px-4 py-3">Industry</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Follow-up</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No companies found.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{r.company_name}</div>
                    <div className="text-xs text-slate-500">{r.website || r.linkedin || "-"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{r.hr_name || "-"}</div>
                    <div className="text-xs text-slate-500">{r.hr_email}</div>
                  </td>
                  <td className="px-4 py-3">{r.industry || "-"}</td>
                  <td className="px-4 py-3">{[r.city, r.state].filter(Boolean).join(", ") || "-"}</td>
                  <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.follow_up_date || "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button className="btn btn-ghost px-2 py-1" onClick={() => followUp(r)} title="Compose follow-up">
                        <IconSend />
                      </button>
                      <button className="btn btn-ghost px-2 py-1" onClick={() => edit(r)} title="Edit">
                        <IconEdit />
                      </button>
                      <button className="btn btn-ghost px-2 py-1 text-red-600" onClick={() => remove(r.id)} title="Delete">
                        <IconTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
