import { useState, useEffect } from "react";

/**
 * "Waiting for reply" timer. Only meaningful while the customer's
 * last message is unanswered (lastMessageDirection === "INBOUND") — it used to
 * anchor on the ticket's original creation date regardless of direction, so any
 * conversation older than a few minutes showed a permanently red, ever-growing
 * number even right after an agent replied. Anchoring on lastMessageAt + hiding
 * the badge once we've answered makes the number (and its color) actually mean
 * "time waiting for a response" again.
 */
export const useSlaTimer = (
  lastMessageAt: Date | undefined,
  lastMessageDirection: "INBOUND" | "OUTBOUND" | null | undefined,
  responseTimeSLA: number,
) => {
  const isAwaitingReply = lastMessageDirection === "INBOUND" && !!lastMessageAt;
  const [slaStatus, setSlaStatus] = useState<"ok" | "warning" | "critical">("ok");
  const [timeElapsed, setTimeElapsed] = useState(0);

  useEffect(() => {
    if (!isAwaitingReply || !lastMessageAt) {
      setTimeElapsed(0);
      setSlaStatus("ok");
      return;
    }

    const tick = () => {
      const elapsed = Math.floor((Date.now() - new Date(lastMessageAt).getTime()) / 60000);
      setTimeElapsed(elapsed);

      if (elapsed >= responseTimeSLA) {
        setSlaStatus("critical");
      } else if (elapsed >= responseTimeSLA * 0.75) {
        setSlaStatus("warning");
      } else {
        setSlaStatus("ok");
      }
    };

    tick(); // Compute immediately instead of waiting up to 10s for the first tick
    const interval = setInterval(tick, 10000);

    return () => clearInterval(interval);
  }, [isAwaitingReply, lastMessageAt, responseTimeSLA]);

  const getSLAColor = () => {
    switch (slaStatus) {
      case "ok":
        return "bg-green-500 border-green-400";
      case "warning":
        return "bg-yellow-500 border-yellow-400 animate-pulse";
      case "critical":
        return "bg-red-500 border-red-400 animate-pulse";
    }
  };

  // Enterprise-friendly formatting: "45m" while under an hour, "3h 12m" beyond
  // that — a raw four-digit minute count (e.g. "1049m") reads as broken/noise.
  const formatElapsed = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) return `${hours}h ${mins}m`;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h`;
  };

  return { isAwaitingReply, timeElapsed, getSLAColor, formatElapsed };
};
