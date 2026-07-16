import { createContext, useContext, useState, useCallback } from "react";

const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = "info") => {
    const id = ++idCounter;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const toast = {
    success: (m) => push(m, "success"),
    error: (m) => push(m, "error"),
    info: (m) => push(m, "info"),
  };

  const colors = {
    success: "bg-green-600",
    error: "bg-red-600",
    info: "bg-slate-800 dark:bg-slate-700",
  };

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${colors[t.type]} animate-[fadeIn_.2s] rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
