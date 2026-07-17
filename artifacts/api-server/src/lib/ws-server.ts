import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { validateSession } from "./auth";

export interface WorkstationState {
  workplaceId: number;
  workplaceName: string;
  operatorId: number | null;
  operatorName: string | null;
  operatorTabNumber: string | null;
  shiftId: number | null;
  shiftName: string | null;
  status: "unauthorized" | "ready" | "working" | "paused" | "idle" | "overdue" | "connection_error" | "shift_ended";
  currentBarcode: string | null;
  currentSku: string | null;
  currentProductName: string | null;
  currentQuantity: number;
  operationStartTime: string | null;
  operationDurationSeconds: number;
  pauseDurationSeconds: number;
  lastScanTime: string | null;
  shiftUnitsTotal: number;
  shiftOperationsTotal: number;
  avgSecondsPerUnit: number;
  loginTime: string | null;
  lastHeartbeat: string;
}

const workstations = new Map<number, WorkstationState>();
const supervisorSockets = new Set<WebSocket>();
const workstationSockets = new Map<number, WebSocket>();

function broadcast(data: object): void {
  const msg = JSON.stringify(data);
  for (const ws of supervisorSockets) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

export function getWorkstations(): WorkstationState[] {
  return Array.from(workstations.values());
}

export function updateWorkstation(state: WorkstationState): void {
  workstations.set(state.workplaceId, state);
  broadcast({ type: "workstation_update", data: state });
}

export function initWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const clientType = url.searchParams.get("type"); // "supervisor" or "workstation"
    const token = url.searchParams.get("token");
    const workplaceIdStr = url.searchParams.get("workplaceId");

    if (clientType === "supervisor") {
      // Validate supervisor token
      if (!token) { ws.close(4001, "Auth required"); return; }
      const payload = await validateSession(token);
      if (!payload) { ws.close(4003, "Invalid session"); return; }

      supervisorSockets.add(ws);
      // Send current state immediately
      ws.send(JSON.stringify({ type: "workstations_snapshot", data: getWorkstations() }));

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
        } catch {}
      });

      ws.on("close", () => supervisorSockets.delete(ws));
      return;
    }

    if (clientType === "workstation" && workplaceIdStr) {
      const workplaceId = parseInt(workplaceIdStr, 10);
      if (isNaN(workplaceId)) { ws.close(4000, "Invalid workplaceId"); return; }

      workstationSockets.set(workplaceId, ws);

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "state_update" && msg.data) {
            const state: WorkstationState = { ...msg.data, workplaceId, lastHeartbeat: new Date().toISOString() };
            updateWorkstation(state);
          } else if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
            // Update heartbeat
            const existing = workstations.get(workplaceId);
            if (existing) {
              existing.lastHeartbeat = new Date().toISOString();
              broadcast({ type: "workstation_update", data: existing });
            }
          }
        } catch {}
      });

      ws.on("close", () => {
        workstationSockets.delete(workplaceId);
        const existing = workstations.get(workplaceId);
        if (existing) {
          existing.status = "connection_error";
          existing.lastHeartbeat = new Date().toISOString();
          broadcast({ type: "workstation_update", data: existing });
        }
      });

      return;
    }

    ws.close(4000, "Unknown client type");
  });

  return wss;
}
