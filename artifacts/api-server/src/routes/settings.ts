import { Router, type IRouter } from "express";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { getSettingsMap, parseSettings, setSetting } from "../lib/settings-helper";

const router: IRouter = Router();

router.get("/settings", async (_req, res): Promise<void> => {
  const map = await getSettingsMap();
  res.json(parseSettings(map));
});

router.patch("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const tasks: Promise<void>[] = [];
  if (d.scanMode !== undefined) tasks.push(setSetting("scanMode", d.scanMode));
  if (d.minBarcodeLength !== undefined) tasks.push(setSetting("minBarcodeLength", String(d.minBarcodeLength)));
  if (d.duplicateScanDebounceMs !== undefined) tasks.push(setSetting("duplicateScanDebounceMs", String(d.duplicateScanDebounceMs)));
  if (d.soundEnabled !== undefined) tasks.push(setSetting("soundEnabled", d.soundEnabled ? "true" : "false"));
  if (d.darkMode !== undefined) tasks.push(setSetting("darkMode", d.darkMode ? "true" : "false"));
  if (d.autoStopMinutes !== undefined) tasks.push(setSetting("autoStopMinutes", d.autoStopMinutes !== null ? String(d.autoStopMinutes) : ""));
  if (d.warningMinutes !== undefined) tasks.push(setSetting("warningMinutes", d.warningMinutes !== null ? String(d.warningMinutes) : ""));
  if (d.defaultNormTimeSeconds !== undefined) tasks.push(setSetting("defaultNormTimeSeconds", d.defaultNormTimeSeconds !== null ? String(d.defaultNormTimeSeconds) : ""));
  if (d.exportPath !== undefined) tasks.push(setSetting("exportPath", d.exportPath ?? ""));
  if (d.backupEnabled !== undefined) tasks.push(setSetting("backupEnabled", d.backupEnabled ? "true" : "false"));
  if (d.startWithWindows !== undefined) tasks.push(setSetting("startWithWindows", d.startWithWindows ? "true" : "false"));
  await Promise.all(tasks);
  const map = await getSettingsMap();
  res.json(parseSettings(map));
});

export default router;
