import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";

const DEFAULTS: Record<string, string> = {
  scanMode: "increment_quantity",
  minBarcodeLength: "4",
  duplicateScanDebounceMs: "500",
  soundEnabled: "true",
  darkMode: "true",
  autoStopMinutes: "",
  warningMinutes: "",
  defaultNormTimeSeconds: "",
  exportPath: "",
  backupEnabled: "true",
  startWithWindows: "false",
};

export async function getSettingsMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = { ...DEFAULTS };
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

export function parseSettings(map: Record<string, string>) {
  return {
    scanMode: (map.scanMode as "new_operation" | "increment_quantity") || "increment_quantity",
    minBarcodeLength: parseInt(map.minBarcodeLength || "4", 10),
    duplicateScanDebounceMs: parseInt(map.duplicateScanDebounceMs || "500", 10),
    soundEnabled: map.soundEnabled === "true",
    darkMode: map.darkMode !== "false",
    autoStopMinutes: map.autoStopMinutes ? parseInt(map.autoStopMinutes, 10) : null,
    warningMinutes: map.warningMinutes ? parseInt(map.warningMinutes, 10) : null,
    defaultNormTimeSeconds: map.defaultNormTimeSeconds ? parseInt(map.defaultNormTimeSeconds, 10) : null,
    exportPath: map.exportPath || null,
    backupEnabled: map.backupEnabled === "true",
    startWithWindows: map.startWithWindows === "true",
  };
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}
