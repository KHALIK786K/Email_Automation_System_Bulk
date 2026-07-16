import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useToast } from "../lib/toast.jsx";
import { IconEdit, IconTrash, IconCopy, IconTemplate } from "../components/Icons.jsx";

const PLACEHOLDERS = [
  "student_name", "company_name", "job_role", "deadline",
  "meeting_link", "college", "email", "phone", "signature",
  "hr_name", "designation", "company_email", "hr_email", "college_name",
  "placement_officer", "college_location", "student_count", "website",
  "meeting_date", "contact_number", "brochure_link", "industry", "city",
];

const EMPTY = { name: "", subject: "", body: "" };

export default function Templates() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const toast = useToast();

  const load = async () => setList((await api.get("/templates")).data);
  useEffect(() => { load(); }, []);

  const insertPlaceholder = (field, ph) => {
    setForm((f) => ({ ...f, [field]: `${f[field]}{{${ph}}}` }));
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name || !form.subject || !form.body) {
      toast.error("Name, subject and body are required");
      return;
    }
    try {
      if (editingId) {
        await api.put(`/templates/${editingId}`, form);
        toast.success("Template updated");
      } else {
        await api.post("/templates", form);
        toast.success("Template created");
      }
      setForm(EMPTY);
      setEditingId(null);
      load();
    } catch {
      toast.error("Failed to save template");
    }
  };

  const edit = (t) => {
    setForm({ name: t.name, subject: t.subject, body: t.body });
    setEditingId(t.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const duplicate = async (id) => {
    await api.post(`/templates/${id}/duplicate`);
    toast.success("Template duplicated");
    load();
  };

  const remove = async (id) => {
    if (!confirm("Delete this template?")) return;
    await api.delete(`/templates/${id}`);
    toast.info("Template deleted");
    if (editingId === id) { setForm(EMPTY); setEditingId(null); }
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Email Templates</h1>
        <p className="text-sm text-slate-500">Create reusable templates with placeholders</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Editor */}
        <form onSubmit={save} className="card space-y-4 p-5">
          <h2 className="font-bold">{editingId ? "Edit Template" : "New Template"}</h2>
          <div>
            <label className="label">Template Name</label>
            <input className="input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Interview Shortlist" />
          </div>
          <div>
            <label className="label">Subject</label>
            <input className="input" value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Interview Opportunity at {{company_name}}" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PLACEHOLDERS.map((ph) => (
                <button type="button" key={ph}
                  onClick={() => insertPlaceholder("subject", ph)}
                  className="badge bg-slate-100 text-slate-600 hover:bg-brand-100 hover:text-brand-700 dark:bg-slate-800 dark:text-slate-300">
                  {`{{${ph}}}`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Body</label>
            <textarea rows={10} className="input font-mono text-xs" value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder={"Dear {{student_name}},\n\n..."} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PLACEHOLDERS.map((ph) => (
                <button type="button" key={ph}
                  onClick={() => insertPlaceholder("body", ph)}
                  className="badge bg-slate-100 text-slate-600 hover:bg-brand-100 hover:text-brand-700 dark:bg-slate-800 dark:text-slate-300">
                  {`{{${ph}}}`}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary">{editingId ? "Update" : "Create"} Template</button>
            {editingId && (
              <button type="button" className="btn btn-ghost"
                onClick={() => { setForm(EMPTY); setEditingId(null); }}>
                Cancel
              </button>
            )}
          </div>
        </form>

        {/* List */}
        <div className="space-y-3">
          {list.length === 0 && (
            <div className="card p-10 text-center text-sm text-slate-500">
              No templates yet. Create your first one.
            </div>
          )}
          {list.map((t) => (
            <div key={t.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-bold">
                    <IconTemplate /> {t.name}
                  </div>
                  <div className="mt-1 truncate text-sm text-slate-500">{t.subject}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className="btn btn-ghost px-2 py-1" onClick={() => edit(t)} title="Edit"><IconEdit /></button>
                  <button className="btn btn-ghost px-2 py-1" onClick={() => duplicate(t.id)} title="Duplicate"><IconCopy /></button>
                  <button className="btn btn-ghost px-2 py-1 text-red-600" onClick={() => remove(t.id)} title="Delete"><IconTrash /></button>
                </div>
              </div>
              <pre className="mt-3 max-h-24 overflow-hidden whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {t.body}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
