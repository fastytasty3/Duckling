import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

export function useClock() {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return {
    now,
    formattedDate: format(now, "d MMMM yyyy", { locale: ru }),
    formattedTime: format(now, "HH:mm:ss"),
  };
}
