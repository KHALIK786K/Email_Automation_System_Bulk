import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { initTheme, setTheme } from "../lib/theme.js";
import {
  IconDashboard, IconTemplate, IconSend, IconHistory,
  IconChart, IconSettings, IconSun, IconMoon, IconMail,
  IconBuilding, IconCalendar,
} from "./Icons.jsx";

const nav = [
  { to: "/", label: "Dashboard", icon: IconDashboard, end: true },
  { to: "/companies", label: "Companies CRM", icon: IconBuilding },
  { to: "/compose", label: "Compose & Send", icon: IconSend },
  { to: "/templates", label: "Templates", icon: IconTemplate },
  { to: "/history", label: "History", icon: IconHistory },
  { to: "/calendar", label: "Calendar", icon: IconCalendar },
  { to: "/analytics", label: "Analytics", icon: IconChart },
  { to: "/settings", label: "Settings", icon: IconSettings },
];

export default function Layout({ children, onLogout }) {
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => setDark(initTheme()), []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    setTheme(next);
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5 dark:border-slate-800">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <IconMail />
          </span>
          <span className="text-lg font-extrabold tracking-tight">MailFlow</span>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`
              }
            >
              <n.icon />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Backdrop for mobile */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
          <button
            className="btn btn-ghost lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            ☰
          </button>
          <div className="hidden text-sm text-slate-500 lg:block">
            Placement CRM & Email Automation
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost" onClick={toggleTheme} aria-label="Toggle theme">
              {dark ? <IconSun /> : <IconMoon />}
            </button>
            {onLogout && (
              <button className="btn btn-ghost" onClick={() => { onLogout(); navigate("/"); }}>
                Logout
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
