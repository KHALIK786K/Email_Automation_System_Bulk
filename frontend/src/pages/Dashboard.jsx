import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import StatusBadge from "../components/StatusBadge.jsx";
import {
  IconSend, IconClock, IconCheck, IconMail,
  IconBuilding, IconCalendar, IconUsers, IconBell, IconChart,
} from "../components/Icons.jsx";

function StatCard({ label, value, icon: Icon, tone }) {
  const tones = {
    green: "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    red: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    blue: "bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400",
  };
  return (
    <div className="card flex items-center gap-4 p-5">
      <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon />
      </span>
      <div>
        <div className="text-2xl font-extrabold">{value}</div>
        <div className="text-sm text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);

  const load = async () => {
    const [a, h] = await Promise.all([
      api.get("/analytics"),
      api.get("/history"),
    ]);
    setStats(a.data);
    setRecent(h.data.slice(0, 8));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Dashboard</h1>
          <p className="text-sm text-slate-500">Placement outreach, follow-ups, and email activity at a glance</p>
        </div>
        <Link to="/compose" className="btn btn-primary">
          <IconSend /> New Campaign
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Companies Contacted Today" value={stats?.crm?.companiesContactedToday ?? "-"} icon={IconBuilding} tone="blue" />
        <StatCard label="Emails Sent Today" value={stats?.today.sent ?? "-"} icon={IconCheck} tone="green" />
        <StatCard label="Follow-ups Due" value={stats?.crm?.followupsDue ?? "-"} icon={IconBell} tone="amber" />
        <StatCard label="Meetings Scheduled" value={stats?.crm?.meetingsScheduled ?? "-"} icon={IconCalendar} tone="blue" />
        <StatCard label="Companies Interested" value={stats?.crm?.companiesInterested ?? "-"} icon={IconUsers} tone="green" />
        <StatCard label="Companies Replied" value={stats?.crm?.companiesReplied ?? "-"} icon={IconMail} tone="blue" />
        <StatCard label="Response Rate" value={`${stats?.crm?.responseRate ?? 0}%`} icon={IconChart} tone="green" />
        <StatCard label="Pending Follow-ups" value={stats?.crm?.pendingFollowups ?? "-"} icon={IconClock} tone="amber" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
            <h2 className="font-bold">Recent Emails</h2>
            <Link to="/history" className="text-sm font-medium text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No emails yet. Head to <Link to="/compose" className="text-brand-600 underline">Compose & Send</Link> to start.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recent.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-4 p-4 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.student_name || r.email}</div>
                    <div className="truncate text-slate-500">{r.email} · {r.company || "—"}</div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="border-b border-slate-200 p-4 dark:border-slate-800">
            <h2 className="font-bold">Today</h2>
          </div>
          <div className="space-y-3 p-4 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              <span>Follow-ups due</span>
              <span className="font-bold">{stats?.crm?.followupsDue ?? 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300">
              <span>Meetings scheduled</span>
              <span className="font-bold">{stats?.crm?.meetingsScheduled ?? 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-red-800 dark:bg-red-900/20 dark:text-red-300">
              <span>Failed emails today</span>
              <span className="font-bold">{stats?.today.failed ?? 0}</span>
            </div>
            <Link to="/companies" className="btn btn-primary w-full">
              <IconBuilding /> Open CRM
            </Link>
            <Link to="/calendar" className="btn btn-ghost w-full">
              <IconCalendar /> View Calendar
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
