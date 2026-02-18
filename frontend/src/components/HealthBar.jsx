/**
 * HealthBar.jsx — horizontal progress bar for health score
 */
import React from "react";

function color(score) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

export default function HealthBar({ score }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-gray-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${
        score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-red-400"
      }`}>
        {score}%
      </span>
    </div>
  );
}
