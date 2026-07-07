import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useToast } from "../lib/toast.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { IconSearch, IconDownload, IconTrash } from "../components/Icons.jsx";

export default function History() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [company, setCompany] = useState("");
  const [date, setDate] = useState("");

  const load = async () => {
    const params = {};
    if (q) params.q = q;
    if (status !== "all") params.status = status;
    if (company) params.company = company;
    if (date) params.date = date;
    const { data } = await api.get("/history", { params });
    setRows(data);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const exportCsv = () => {
    window.open("/api/history/export", "_blank");
  };

  const clearAll = async () => {
    if (!confirm("Clear all email history? This cannot be undone.")) return;
    await api.delete("/history");
    toast.info("History cleared");
    load();
  };

  const retryFailed = async () => {
    await api.post("/send/retry", {});
    toast.success("Failed emails marked for retry. Re-send them from Compose.");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Email History</h1>
          <p className="text-sm text-slate-500">Every email you've sent, searchable</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={retryFailed}>Retry Failed</button>
          <button className="btn btn-ghost" onClick={exportCsv}><IconDownload /> Export CSV</button>
          <button className="btn btn-ghost text-red-600" onClick={clearAll}><IconTrash /> Clear</button>
        </div>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Search (name, email, company)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IconSearch /></span>
            <input className="input pl-10" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Search…" />
          </div>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
            <option value="sending">Sending</option>
          </select>
        </div>
        <div>
          <label className="label">Company</label>
          <input className="input" value={company} onChange={(e) => setCompany(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Company" />
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={load}>Filter</button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No records found.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium">{r.student_name || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{r.email}</td>
                  <td className="px-4 py-3">{r.company || "—"}</td>
                  <td className="px-4 py-3">{r.role || "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                    {r.error && <div className="mt-1 text-xs text-red-500" title={r.error}>{r.error.slice(0, 40)}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{r.sent_at || r.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
