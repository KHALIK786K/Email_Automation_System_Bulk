import axios from "axios";

// Uses Vite proxy in dev; same-origin in production single-server mode.
export const api = axios.create({ baseURL: "/api" });

export const endpoints = {
  templates: "/templates",
  settings: "/settings",
  import: "/import",
  send: "/send",
  history: "/history",
  analytics: "/analytics",
  drafts: "/drafts",
  companies: "/companies",
};
