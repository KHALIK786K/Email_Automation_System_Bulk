import { Router } from "express";
import { getSettings, updateSettings } from "../db/settings.js";
import { verifyTransporter } from "../mailer.js";

const router = Router();

// Get settings (mask the password)
router.get("/", (req, res) => {
  const s = getSettings();
  res.json({
    ...s,
    gmail_app_password: s.gmail_app_password ? "********" : "",
    has_password: !!s.gmail_app_password,
  });
});

// Update settings
router.put("/", (req, res) => {
  const updates = { ...req.body };
  // Don't overwrite password with the mask value
  if (updates.gmail_app_password === "********") delete updates.gmail_app_password;
  const s = updateSettings(updates);
  res.json({ ...s, gmail_app_password: s.gmail_app_password ? "********" : "" });
});

// Test SMTP connection
router.post("/test", async (req, res) => {
  try {
    await verifyTransporter();
    res.json({ ok: true, message: "Gmail connection successful." });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

export default router;
