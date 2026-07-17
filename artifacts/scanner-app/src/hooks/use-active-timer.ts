import { useState, useEffect, useRef } from "react";

export function useActiveTimer(
  startTimeStr?: string, 
  serverNetDuration?: number | null, 
  status?: string, 
  pauses?: any[]
) {
  const [netSeconds, setNetSeconds] = useState(0);

  useEffect(() => {
    if (!startTimeStr || status === "completed" || status === "stopped") {
      setNetSeconds(serverNetDuration || 0);
      return;
    }

    if (status === "paused") {
      setNetSeconds(serverNetDuration || 0);
      return;
    }

    // Status is active. We calculate based on Date.now()
    const startTime = new Date(startTimeStr).getTime();
    
    // Calculate total pause duration
    let totalPauseMs = 0;
    if (pauses && pauses.length > 0) {
      for (const p of pauses) {
        if (p.endTime) {
          totalPauseMs += new Date(p.endTime).getTime() - new Date(p.startTime).getTime();
        }
      }
    }

    const updateTimer = () => {
      const nowMs = Date.now();
      const elapsedMs = nowMs - startTime - totalPauseMs;
      setNetSeconds(Math.max(0, Math.floor(elapsedMs / 1000)));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [startTimeStr, serverNetDuration, status, pauses]);

  return netSeconds;
}
