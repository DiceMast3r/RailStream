/**
 * AlertFeed.jsx
 * Scrollable side panel with the rolling alert log.
 * CRITICAL and HIGH alerts are clickable — calls onSelect(alert) to open detail modal.
 */
import React from "react";
import { AlertTriangle, Bell, ExternalLink } from "lucide-react";
import StatusBadge from "./StatusBadge";

const CLICKABLE = new Set(["CRITICAL", "HIGH"]);

export default function AlertFeed({ alerts, onSelect }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-gray-600 gap-2">
        <Bell size={24} />
        <p className="text-xs">No alerts</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-14rem)]">
      {alerts.map((a, i) => {
        const clickable = CLICKABLE.has(a.severity);
        return (
          <div
            key={i}
            onClick={() => clickable && onSelect?.(a)}
            className={`rounded-lg px-3 py-2 border text-xs space-y-0.5 transition-all
              ${
                a.severity === "CRITICAL"
                  ? "border-red-500/40 bg-red-950/30"
                  : a.severity === "HIGH"
                  ? "border-orange-500/40 bg-orange-950/20"
                  : "border-gray-700/50 bg-gray-800/30"
              }
              ${
                clickable
                  ? "cursor-pointer hover:brightness-125 hover:scale-[1.01] active:scale-100"
                  : ""
              }`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle
                size={11}
                className={
                  a.severity === "CRITICAL" ? "text-red-400"
                  : a.severity === "HIGH"   ? "text-orange-400"
                  : "text-amber-400"
                }
              />
              <span className="font-bold text-gray-200">{a.trainId}</span>
              <StatusBadge status={a.severity} small />
              {clickable && (
                <ExternalLink size={10} className="ml-auto text-gray-500" />
              )}
            </div>
            <p className="text-gray-300 pl-[19px]">{a.message}</p>
            <p className="text-gray-500 pl-[19px]">
              {a.depotName} &nbsp;·&nbsp;{" "}
              {a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : ""}
            </p>
            {clickable && (
              <p className="pl-[19px] text-[10px] text-gray-600 italic">Click to view detail</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
