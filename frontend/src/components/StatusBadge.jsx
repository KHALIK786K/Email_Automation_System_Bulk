export default function StatusBadge({ status }) {
  const map = {
    sent: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    sending: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    cancelled: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  };
  return (
    <span className={`badge ${map[status] || map.pending}`}>
      {status?.charAt(0).toUpperCase() + status?.slice(1)}
    </span>
  );
}