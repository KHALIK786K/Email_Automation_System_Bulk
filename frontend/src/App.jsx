import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Compose from "./pages/Compose.jsx";
import Companies from "./pages/Companies.jsx";
import Templates from "./pages/Templates.jsx";
import History from "./pages/History.jsx";
import Analytics from "./pages/Analytics.jsx";
import Settings from "./pages/Settings.jsx";
import Calendar from "./pages/Calendar.jsx";
import FollowUps from "./pages/FollowUps.jsx";

// Login is optional: set to false to skip it entirely.
const REQUIRE_LOGIN = true;

export default function App() {
  const [authed, setAuthed] = useState(!REQUIRE_LOGIN);

  useEffect(() => {
    if (!REQUIRE_LOGIN) return;
    if (localStorage.getItem("mf_token")) setAuthed(true);
  }, []);

  const logout = () => {
    localStorage.removeItem("mf_token");
    setAuthed(false);
  };

  if (REQUIRE_LOGIN && !authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  return (
    <Layout onLogout={REQUIRE_LOGIN ? logout : null}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/compose" element={<Compose />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/follow-ups" element={<FollowUps />} />
        <Route path="/history" element={<History />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
