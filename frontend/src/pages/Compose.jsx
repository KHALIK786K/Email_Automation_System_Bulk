import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useToast } from "../lib/toast.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { IconUpload, IconSend, IconClock, IconX, IconCheck } from "../components/Icons.jsx";

export default function Compose() {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [rows, setRows] = useState([]);
  const [invalidRows, setInvalidRows] = useState([]);
  const [importInfo, setImportInfo] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [preview, setPreview] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [schedule, setSchedule] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total, sent, failed }
  const [dupCheck, setDupCheck] = useState(null); // { duplicates, days } | null
  const [scheduled, setScheduled] = useState([]);
  const [editingTime, setEditingTime] = useState({}); // batchId -> datetime string
  const [batchId, setBatchId] = useState(null);
  const evtRef = useRef(null);
  const cancelledRef = useRef(false);

  const loadScheduled = () =>
    api.get("/send/scheduled").then(({ data }) => setScheduled(data)).catch(() => {});

  useEffect(() => { loadScheduled(); }, []);

  useEffect(() => {
    api.get("/templates").then(({ data }) => {
      setTemplates(data);
      if (data[0]) setTemplateId(String(data[0].id));
    });
    // Auto-restore draft (schedule + selected template)
    api.get("/drafts").then(({ data }) => {
      if (data.templateId) setTemplateId(String(data.templateId));
      if (data.schedule) setSchedule(data.schedule);
      if (Array.isArray(data.rows) && data.rows.length) {
        setRows(data.rows);
        setImportInfo({
          total: data.rows.length,
          validCount: data.rows.length,
          invalidCount: 0,
          duplicates: 0,
        });
        setPreview([]);
        toast.info("Loaded recipients from CRM");
      }
    }).catch(() => {});
  }, []);

  // Auto-save draft (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      api.put("/drafts", { templateId, schedule, rows }).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [templateId, schedule, rows]);

  const handleFile = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/import", fd);
      setRows(data.rows);
      setInvalidRows(data.invalidRows || []);
      setImportInfo(data);
      setPreview([]);
      toast.success(`Imported ${data.validCount} valid recipients`);
    } catch (e) {
      toast.error(e.response?.data?.error || "Import failed");
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const uploadAttachments = async (files) => {
    if (!files.length) return;
    const fd = new FormData();
    [...files].forEach((f) => fd.append("files", f));
    const { data } = await api.post("/send/attachments", fd);
    setAttachments((a) => [...a, ...data.files]);
    toast.success(`${data.files.length} attachment(s) added`);
  };

  const doPreview = async () => {
    if (!templateId || !rows.length) {
      toast.error("Select a template and import recipients first");
      return;
    }
    const { data } = await api.post("/send/preview", { templateId, rows });
    setPreview(data.preview);
  };

  /**
   * Ask the backend whether any of these contacts were mailed recently.
   * If so, let the coordinator choose before anything is queued.
   */
  const startSend = async () => {
    if (!templateId || !rows.length) {
      toast.error("Select a template and import recipients first");
      return;
    }
    try {
      const { data } = await api.post("/send/check-duplicates", { rows, days: 30 });
      if (data.duplicates?.length) {
        setDupCheck(data);
        return; // wait for the user's decision
      }
    } catch {
      /* if the check fails, don't block sending */
    }
    queueAndSend(rows);
  };

  const queueAndSend = async (rowsToSend) => {
    setDupCheck(null);
    if (!rowsToSend.length) {
      toast.info("Nothing left to send after skipping");
      return;
    }
    setSending(true);
    cancelledRef.current = false;
    try {
      const { data } = await api.post("/send/queue", {
        templateId,
        rows: rowsToSend,
        attachments,
        scheduledAt: schedule || null,
      });
      setBatchId(data.batchId);

      if (schedule) {
        toast.success(`Scheduled ${data.queued} emails for ${new Date(schedule).toLocaleString()}`);
        setSending(false);
        loadScheduled();
        return;
      }

      runBatch(data.batchId, rowsToSend.length);
    } catch (e) {
      toast.error(e.response?.data?.error || "Failed to queue");
      setSending(false);
    }
  };

  const runBatch = (id, total) => {
    setProgress({ done: 0, total, sent: 0, failed: 0, current: "" });
    const es = new EventSource(`/api/send/process/${id}`);
    evtRef.current = es;

    es.addEventListener("progress", (ev) => {
      const d = JSON.parse(ev.data);
      setProgress((p) => ({
        ...p,
        done: d.index,
        current: d.email,
        sent: d.status === "sent" ? p.sent + 1 : p.sent,
        failed: d.status === "failed" ? p.failed + 1 : p.failed,
      }));
    });
    es.addEventListener("done", (ev) => {
      const d = JSON.parse(ev.data);
      toast.success(`Done — ${d.sent} sent, ${d.failed} failed`);
      es.close();
      setSending(false);
    });
    es.addEventListener("cancelled", () => {
      toast.info("Sending cancelled");
      es.close();
      setSending(false);
    });
    es.onerror = () => { es.close(); setSending(false); };
  };

  const cancelScheduled = async (batchId, count) => {
    if (!window.confirm(`Cancel ${count} scheduled email(s)? They will not be sent.`)) return;
    const { data } = await api.post(`/send/scheduled/${batchId}/cancel`);
    toast.success(`Cancelled ${data.cancelled} email(s)`);
    loadScheduled();
  };

  const rescheduleBatch = async (batchId) => {
    const when = editingTime[batchId];
    if (!when) return toast.error("Pick a new time first");
    await api.post(`/send/scheduled/${batchId}/reschedule`, { scheduledAt: when.replace("T", " ") + ":00" });
    toast.success("Rescheduled");
    setEditingTime((s) => ({ ...s, [batchId]: "" }));
    loadScheduled();
  };

  const cancelSend = async () => {
    if (!batchId) return;
    await api.post(`/send/cancel/${batchId}`);
    cancelledRef.current = true;
  };

  const resumeSend = async () => {
    if (!batchId) return;
    await api.post(`/send/resume/${batchId}`);
    setSending(true);
    runBatch(batchId, progress?.total || rows.length);
  };

  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Compose & Send</h1>
        <p className="text-sm text-slate-500">Template + companies or students to personalized bulk emails</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: setup */}
        <div className="space-y-6 lg:col-span-2">
          {/* Step 1: Template */}
          <div className="card p-5">
            <h2 className="mb-3 font-bold">1. Choose a template</h2>
            <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">— Select template —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Step 2: Upload */}
          <div className="card p-5">
            <h2 className="mb-3 font-bold">2. Import recipients (Excel / CSV)</h2>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                dragOver ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20" : "border-slate-300 dark:border-slate-700"
              }`}
            >
              <IconUpload />
              <p className="text-sm text-slate-500">Drag & drop your .xlsx or .csv here</p>
              <label className="btn btn-ghost cursor-pointer">
                Browse file
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={(e) => handleFile(e.target.files[0])} />
              </label>
            </div>
            {importInfo && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="badge bg-green-100 text-green-700">{importInfo.validCount} valid</span>
                <span className="badge bg-red-100 text-red-700">{importInfo.invalidCount} invalid</span>
                <span className="badge bg-amber-100 text-amber-700">{importInfo.duplicates} duplicates removed</span>
              </div>
            )}
          </div>

          {/* Step 3: Attachments */}
          <div className="card p-5">
            <h2 className="mb-3 font-bold">3. Attachments (optional)</h2>
            <label className="btn btn-ghost cursor-pointer">
              Add files (PDF, DOCX, images, ZIP)
              <input type="file" multiple className="hidden"
                onChange={(e) => uploadAttachments(e.target.files)} />
            </label>
            {attachments.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {attachments.map((a, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 dark:bg-slate-800">
                    <span className="truncate">{a.filename}</span>
                    <button className="text-red-600" onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}>
                      <IconX />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-400">These files attach to every recipient in this batch.</p>
          </div>

          {/* Step 4: Schedule + actions */}
          <div className="card p-5">
            <h2 className="mb-3 font-bold">4. Send</h2>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label">Schedule for later (optional)</label>
                <input type="datetime-local" className="input" value={schedule}
                  onChange={(e) => setSchedule(e.target.value)} />
              </div>
              <button className="btn btn-ghost" onClick={doPreview}>Preview</button>
              <button className="btn btn-primary" onClick={startSend} disabled={sending}>
                {schedule ? <><IconClock /> Schedule</> : <><IconSend /> Send All</>}
              </button>
            </div>
          </div>
        </div>

        {/* Right: progress + preview */}
        <div className="space-y-6">
          {progress && (
            <div className="card p-5">
              <h2 className="mb-3 font-bold">Sending progress</h2>
              <div className="mb-2 flex justify-between text-sm">
                <span>{progress.done} / {progress.total}</span>
                <span>{pct}%</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-3 flex gap-2 text-xs">
                <span className="badge bg-green-100 text-green-700"><IconCheck /> {progress.sent} sent</span>
                <span className="badge bg-red-100 text-red-700"><IconX /> {progress.failed} failed</span>
              </div>
              {progress.current && <p className="mt-2 truncate text-xs text-slate-500">→ {progress.current}</p>}
              <div className="mt-3 flex gap-2">
                {sending
                  ? <button className="btn btn-danger flex-1" onClick={cancelSend}>Cancel</button>
                  : <button className="btn btn-ghost flex-1" onClick={resumeSend}>Resume</button>}
              </div>
            </div>
          )}

          <div className="card p-5">
            <h2 className="mb-3 font-bold">Preview {preview.length > 0 && `(${preview.length})`}</h2>
            {preview.length === 0 ? (
              <p className="text-sm text-slate-500">Click "Preview" to see personalized emails.</p>
            ) : (
              <div className="max-h-[420px] space-y-3 overflow-y-auto">
                {preview.slice(0, 20).map((p, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-700">
                    <div className="font-semibold text-slate-700 dark:text-slate-200">To: {p.email}</div>
                    <div className="mt-1 font-medium">{p.subject}</div>
                    <div
                      className="mt-1 text-slate-500 [&_a]:text-brand-600 [&_a]:underline"
                      dangerouslySetInnerHTML={{ __html: p.bodyHtml || p.body }}
                    />
                  </div>
                ))}
                {preview.length > 20 && <p className="text-center text-xs text-slate-400">…and {preview.length - 20} more</p>}
              </div>
            )}
          </div>

          {invalidRows.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-2 font-bold text-red-600">Skipped rows</h2>
              <div className="max-h-40 space-y-1 overflow-y-auto text-xs">
                {invalidRows.map((r, i) => (
                  <div key={i} className="flex justify-between rounded bg-red-50 px-2 py-1 dark:bg-red-900/20">
                    <span className="truncate">{r.email || "(no email)"}</span>
                    <span className="text-red-500">{r._reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scheduled batches */}
      {scheduled.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-1 flex items-center gap-2 font-bold">
            <IconClock /> Scheduled sends ({scheduled.length})
          </h2>
          <p className="mb-3 text-sm text-slate-500">
            Waiting to go out. Cancel or move them any time before they send.
          </p>

          <div className="space-y-2">
            {scheduled.map((b) => (
              <div
                key={b.batch_id}
                className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {b.pending} email{b.pending === 1 ? "" : "s"}
                      {b.template_name && (
                        <span className="ml-2 text-sm font-normal text-slate-500">
                          {b.template_name}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-500">
                      {new Date(b.scheduled_at.replace(" ", "T")).toLocaleString()}
                    </div>
                    {b.companies && (
                      <div className="mt-0.5 truncate text-xs text-slate-400">
                        {b.companies.split(",").slice(0, 4).join(", ")}
                        {b.companies.split(",").length > 4 && " …"}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="datetime-local"
                      className="input w-auto py-1 text-sm"
                      value={editingTime[b.batch_id] || ""}
                      onChange={(e) =>
                        setEditingTime((s) => ({ ...s, [b.batch_id]: e.target.value }))
                      }
                    />
                    <button
                      className="btn btn-ghost px-2 py-1 text-xs"
                      onClick={() => rescheduleBatch(b.batch_id)}
                    >
                      Move
                    </button>
                    <button
                      className="btn btn-danger px-2 py-1 text-xs"
                      onClick={() => cancelScheduled(b.batch_id, b.pending)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Duplicate-contact confirmation */}
      {dupCheck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-lg p-6">
            <h2 className="text-lg font-extrabold">Already contacted recently</h2>
            <p className="mt-1 text-sm text-slate-500">
              {dupCheck.duplicates.length} of {dupCheck.checked} recipients were emailed in
              the last {dupCheck.days} days — possibly by another coordinator.
            </p>

            <div className="my-4 max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <tbody>
                  {dupCheck.duplicates.map((d) => (
                    <tr key={d.email} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="p-2">
                        <div className="font-medium">{d.company || "—"}</div>
                        <div className="text-xs text-slate-400">{d.email}</div>
                      </td>
                      <td className="p-2 text-right whitespace-nowrap text-xs text-slate-500">
                        {d.days_ago}d ago
                        {d.times > 1 && ` · ${d.times}x`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setDupCheck(null)}>
                Cancel
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => queueAndSend(rows)}
                title="Send to everyone, including those contacted recently"
              >
                Send to all ({rows.length})
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const skip = new Set(dupCheck.duplicates.map((d) => d.email.toLowerCase()));
                  const unique = rows.filter((r) => {
                    const e = String(r.email || r.hr_email || "").trim().toLowerCase();
                    return e && !skip.has(e);
                  });
                  queueAndSend(unique);
                }}
              >
                Skip duplicates ({rows.length - dupCheck.duplicates.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}