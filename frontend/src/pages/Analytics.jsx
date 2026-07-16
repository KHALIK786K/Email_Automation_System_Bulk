import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

function Metric({ label, value, tone }) {
  return (
    <div className="card p-5">
      <div className={`text-3xl font-extrabold ${tone}`}>{value}</div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/analytics").then(({ data }) => setData(data)); }, []);

  if (!data) return <div className="text-slate-500">Loading analytics…</div>;

  const pie = [
    { name: "Sent", value: data.sent, color: "#16a34a" },
    { name: "Failed", value: data.failed, color: "#dc2626" },
    { name: "Pending", value: data.pending, color: "#f59e0b" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Analytics</h1>
        <p className="text-sm text-slate-500">Delivery performance overview</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total Emails" value={data.total} tone="text-slate-800 dark:text-slate-100" />
        <Metric label="Sent" value={data.sent} tone="text-green-600" />
        <Metric label="Failed" value={data.failed} tone="text-red-600" />
        <Metric label="Success Rate" value={`${data.successRate}%`} tone="text-brand-600" />
        <Metric label="Companies" value={data.crm?.totalCompanies ?? 0} tone="text-slate-800 dark:text-slate-100" />
        <Metric label="Interested" value={data.crm?.companiesInterested ?? 0} tone="text-green-600" />
        <Metric label="Follow-ups Due" value={data.crm?.followupsDue ?? 0} tone="text-amber-600" />
        <Metric label="Response Rate" value={`${data.crm?.responseRate ?? 0}%`} tone="text-brand-600" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 font-bold">Last 7 days</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.daily}>
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="sent" fill="#2563eb" radius={[4, 4, 0, 0]} name="Sent" />
              <Bar dataKey="failed" fill="#dc2626" radius={[4, 4, 0, 0]} name="Failed" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 font-bold">Status breakdown</h2>
          {data.total === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-slate-500">
              No data yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={3}>
                  {pie.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-4 font-bold">Company pipeline</h2>
          {data.crm?.byStatus?.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.crm.byStatus}>
                <XAxis dataKey="status" tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={70} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} name="Companies" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[280px] items-center justify-center text-sm text-slate-500">
              No company data yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
