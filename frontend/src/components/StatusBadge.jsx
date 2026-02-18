/**
 * StatusBadge.jsx — colour-coded pill for train/component status
 */
import React from "react";

const STATUS_STYLES = {
  // Train operational status
  IN_SERVICE:  "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
  STANDBY:     "bg-sky-500/20    text-sky-300    border border-sky-500/40",
  IN_DEPOT:    "bg-gray-500/20   text-gray-300   border border-gray-500/40",
  MAINTENANCE: "bg-amber-500/20  text-amber-300  border border-amber-500/40",
  FAULT:       "bg-red-500/20    text-red-300    border border-red-500/40",

  // Component health
  NORMAL:  "bg-emerald-500/10 text-emerald-400",
  WARNING: "bg-amber-500/10  text-amber-400",
  // FAULT already defined above

  // Alert severity
  CRITICAL: "bg-red-600    text-white",
  HIGH:     "bg-orange-500 text-white",
  MEDIUM:   "bg-amber-500  text-white",
  LOW:      "bg-sky-500    text-white",
};

export default function StatusBadge({ status, small = false }) {
  const cls = STATUS_STYLES[status] || "bg-gray-600 text-gray-200";
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold tracking-wide
        ${small ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"} ${cls}`}
    >
      {status?.replace(/_/g, " ")}
    </span>
  );
}
