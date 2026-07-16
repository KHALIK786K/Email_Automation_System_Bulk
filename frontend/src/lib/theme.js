// Theme toggle helper — persists to localStorage, toggles `dark` class.
export function initTheme() {
  const saved = localStorage.getItem("theme");
  const dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
  return dark;
}

export function setTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("theme", dark ? "dark" : "light");
}
