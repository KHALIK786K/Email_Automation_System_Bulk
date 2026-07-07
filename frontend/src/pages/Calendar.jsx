import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { IconCalendar, IconClock, IconBell, IconSend } from "../components/Icons.jsx";
import { useNavigate } from "react-router-dom";

function sameDay(a, b) {
  return String(a || "").slice(0, 10) === b;
}

function dateLabel(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function Calendar() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    api.get("/companies/calendar").then(({ data }) => setEvents(data));
  }, []);

  const todaysEvents = useMemo(
    () => events.filter((event) => sameDay(event.date, selectedDate)),
    [events, selectedDate]
  );

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return events.filter((event) => String(event.date).slice(0, 10) >= today).slice(0, 12);
  }, [events]);

  const counts = useMemo(() => ({
    followups: events.filter((e) => e.type === "Follow-up").length,
    meetings: events.filter((e) => e.type === "Meeting").length,
    today: events.filter((e) => sameDay(e.date, new Date().toISOString().slice(0, 10))).length,
  }), [events]);

  const composeFollowUp = async (event) => {
    await api.put("/drafts", {
      rows: [{
        company_name: event.company_name,
        hr_name: event.hr_name,
        email: event.email,
        hr_email: event.email,
        meeting_link: event.meeting_link,
      }],
      source: "calendar-follow-up",
    });
    navigate("/compose");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Calendar</h1>
        <p className="text-sm text-slate-500">Follow-up reminders, meetings, campus drives, and interview dates</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"><IconBell /></span>
          <div><div className="text-2xl font-extrabold">{counts.followups}</div><div className="text-sm text-slate-500">Follow-ups</div></div>
        </div>
        <div className="card flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"><IconCalendar /></span>
          <div><div className="text-2xl font-extrabold">{counts.meetings}</div><div className="text-sm text-slate-500">Meetings</div></div>
        </div>
        <div className="card flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"><IconClock /></span>
          <div><div className="text-2xl font-extrabold">{counts.today}</div><div className="text-sm text-slate-500">Due Today</div></div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="card space-y-4 p-5">
          <div>
            <label className="label">Select Date</label>
            <input type="date" className="input" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </div>
          <div className="space-y-3">
            <h2 className="font-bold">Events on {selectedDate}</h2>
            {todaysEvents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
                No CRM events on this date.
              </div>
            ) : todaysEvents.map((event) => (
              <div key={event.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <span className={`badge ${event.type === "Meeting" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700"}`}>
                    {event.type}
                  </span>
                  <span className="text-xs text-slate-400">{dateLabel(event.date)}</span>
                </div>
                <div className="mt-2 font-semibold">{event.title}</div>
                <div className="text-xs text-slate-500">{event.hr_name || event.email}</div>
                {event.meeting_link && (
                  <a className="mt-2 block truncate text-xs font-medium text-brand-600 hover:underline" href={event.meeting_link} target="_blank" rel="noreferrer">
                    {event.meeting_link}
                  </a>
                )}
                <button className="btn btn-ghost mt-3 w-full" onClick={() => composeFollowUp(event)}>
                  <IconSend /> Compose Follow-up
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 p-4 dark:border-slate-800">
            <h2 className="font-bold">Upcoming CRM Events</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {upcoming.length === 0 && (
              <div className="p-10 text-center text-sm text-slate-500">No upcoming follow-ups or meetings.</div>
            )}
            {upcoming.map((event) => (
              <div key={event.id} className="grid gap-3 p-4 text-sm md:grid-cols-[160px_1fr_160px] md:items-center">
                <div className="text-xs font-medium text-slate-500">{dateLabel(event.date)}</div>
                <div>
                  <div className="font-semibold">{event.title}</div>
                  <div className="text-xs text-slate-500">{event.hr_name || event.email} - {event.status}</div>
                </div>
                <div className="flex justify-start md:justify-end">
                  <span className={`badge ${event.type === "Meeting" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700"}`}>
                    {event.type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
