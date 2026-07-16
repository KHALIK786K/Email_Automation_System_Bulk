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
  const [batchId, setBatchId] = useState(null);
  const [dupInfo, setDupInfo] = useState(null); // { alreadyCount, freshCount, unique, alreadyContacted[] }
  const [checking, setChecking] = useState(false);
  const evtRef = useRef(null);
  const cancelledRef = useRef(false);

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

  // Step 1 of sending: ask the backend who was already contacted before.
  // If any, open the confirm modal; otherwise send straight away.
  const startSend = async () => {
    if (!templateId || !rows.length) {
      toast.error("Select a template and import recipients first");
      return;
    }
    setChecking(true);
    try {
      const { data } = await api.post("/send/check-duplicates", { rows });
      if (data.alreadyCount > 0) {
        setDupInfo(data);      // open modal, wait for user's choice
        setChecking(false);
        return;
      }
    } catch {
      // if the check fails for any reason, fall through and send normally
    }
    setChecking(false);
    queueAndSend(false);
  };

  // Step 2: actually queue + start the batch.
  // resendContacted = true  -> send even to already-contacted HRs
  // resendContacted = false -> skip already-contacted HRs
  const queueAndSend = async (resendContacted) => {
    setDupInfo(null);
    setSending(true);
    cancelledRef.current = false;
    try {
      const formattedSchedule = schedule ? schedule.replace("T", " ") + ":00" : null;

      const { data } = await api.post("/send/queue", {
        templateId,
        rows,
        attachments,
        scheduledAt: formattedSchedule,
        resendContacted,
      });
      setBatchId(data.batchId);

      if (data.skippedSent > 0) {
        toast.info(`Skipped ${data.skippedSent} already-contacted HR(s)`);
      }
      if (data.dupInBatch > 0) {
        toast.info(`Removed ${data.dupInBatch} duplicate row(s) from the list`);
      }

      if (schedule) {
        toast.success(`Scheduled ${data.queued} emails for ${new Date(schedule).toLocaleString()}`);
        setSending(false);
        return;
      }

      runBatch(data.batchId, data.queued);
    } catch (e) {
      toast.error(e.response?.data?.error || "Failed to queue");
      setSending(false);
    }
  };

  const runBatch = (id, total) => {
    setProgress({ done: 0, total, sent: 0, failed: 0, skipped: 0, current: "" });
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
        skipped: d.status === "skipped" ? p.skipped + 1 : p.skipped,
      }));
    });
    es.addEventListener("done", (ev) => {
      const d = JSON.parse(ev.data);
      const extra = d.skipped ? `, ${d.skipped} skipped` : "";
      toast.success(`Done — ${d.sent} sent, ${d.failed} failed${extra}`);
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
              <button className="btn btn-primary" onClick={startSend} disabled={sending || checking}>
                {checking ? "Checking…" : schedule ? <><IconClock /> Schedule</> : <><IconSend /> Send All</>}
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
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="badge bg-green-100 text-green-700"><IconCheck /> {progress.sent} sent</span>
                <span className="badge bg-red-100 text-red-700"><IconX /> {progress.failed} failed</span>
                {progress.skipped > 0 && (
                  <span className="badge bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">{progress.skipped} skipped</span>
                )}
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
                    <pre className="mt-1 whitespace-pre-wrap text-slate-500">{p.body}</pre>
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

      {/* Duplicate / already-contacted confirm modal */}
      {dupInfo && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
             onClick={() => setDupInfo(null)}>
          <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Some HRs were already contacted</h2>
            <p className="mt-1 text-sm text-slate-500">
              <b>{dupInfo.alreadyCount}</b> of <b>{dupInfo.unique}</b> recipients were emailed before.
              Do you want to send to them again?
            </p>

            <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-500 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2">Last sent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {dupInfo.alreadyContacted.slice(0, 100).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 truncate">{r.email}</td>
                      <td className="px-3 py-1.5 truncate">{r.company || "—"}</td>
                      <td className="px-3 py-1.5 text-slate-400">{r.sent_at ? r.sent_at.slice(0, 10) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {dupInfo.alreadyContacted.length > 100 && (
                <div className="px-3 py-2 text-center text-xs text-slate-400">
                  …and {dupInfo.alreadyContacted.length - 100} more
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setDupInfo(null)}>Cancel</button>
              <button
                className="btn btn-ghost"
                onClick={() => queueAndSend(false)}
                disabled={dupInfo.freshCount === 0}
                title={dupInfo.freshCount === 0 ? "No new recipients to send to" : ""}
              >
                Skip them — send {dupInfo.freshCount} new
              </button>
              <button className="btn btn-primary" onClick={() => queueAndSend(true)}>
                Send to all {dupInfo.unique}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}