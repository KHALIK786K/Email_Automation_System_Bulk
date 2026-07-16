import { useState } from "react";
import { api } from "../lib/api.js";
import { useToast } from "../lib/toast.jsx";
import { IconMail } from "../components/Icons.jsx";

export default function Login({ onSuccess }) {
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/login", { passcode });
      localStorage.setItem("mf_token", data.token);
      toast.success("Welcome back!");
      onSuccess();
    } catch {
      toast.error("Incorrect passcode");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-600 to-brand-900 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl dark:bg-slate-900">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <IconMail />
          </span>
          <div>
            <h1 className="text-xl font-extrabold">MailFlow</h1>
            <p className="text-sm text-slate-500">Email Automation for Placement Cells</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Passcode</label>
            <input
              type="password"
              className="input"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode (default: admin)"
              autoFocus
            />
          </div>
          <button className="btn btn-primary w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
          <p className="text-center text-xs text-slate-400">
            Default passcode is <code>admin</code>. Change it in the backend .env file.
          </p>
        </form>
      </div>
    </div>
  );
}
