/**
 * store.js
 * In-memory data store for the latest train states and depot registry.
 * Acts as a lightweight state cache — no database required for this demo.
 */

/** @type { Map<string, object> }  trainId → latest telemetry payload */
const trains = new Map();

/** @type { Map<string, object> }  depotId → depot registration */
const depots = new Map();

/** @type { Array<{ timestamp, trainId, depotId, alerts }> } rolling alert log */
const alertLog = [];
const MAX_ALERT_LOG = 200;

// ─── Train ops ────────────────────────────────────────────────────────────────

function upsertTrain(payload) {
  trains.set(payload.trainId, payload);

  // Log new active alerts
  if (payload.alerts && payload.alerts.length > 0) {
    for (const alert of payload.alerts) {
      alertLog.unshift({
        timestamp: payload.timestamp,
        trainId:   payload.trainId,
        depotId:   payload.depotId,
        depotName: payload.depotName,
        ...alert,
      });
    }
    // Keep rolling window
    if (alertLog.length > MAX_ALERT_LOG) {
      alertLog.splice(MAX_ALERT_LOG);
    }
  }
}

function getAllTrains() {
  return Array.from(trains.values());
}

function getTrainsByDepot(depotId) {
  return getAllTrains().filter((t) => t.depotId === depotId);
}

function getTrain(trainId) {
  return trains.get(trainId) || null;
}

// ─── Depot ops ────────────────────────────────────────────────────────────────

function upsertDepot(payload) {
  depots.set(payload.depotId, { ...payload, lastSeen: new Date().toISOString() });
}

function getAllDepots() {
  return Array.from(depots.values());
}

// ─── Alert ops ────────────────────────────────────────────────────────────────

function getAlertLog(limit = 50) {
  return alertLog.slice(0, limit);
}

// ─── Fleet summary ────────────────────────────────────────────────────────────

function getFleetSummary() {
  const all = getAllTrains();
  const statusCounts = {};
  let totalHealth = 0;
  let criticalAlerts = 0;

  for (const t of all) {
    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    totalHealth += t.healthScore || 0;
    criticalAlerts += (t.alerts || []).filter(
      (a) => a.severity === "CRITICAL"
    ).length;
  }

  return {
    totalTrains:   all.length,
    activeTrains:  statusCounts["IN_SERVICE"] || 0,
    depotCount:    depots.size,
    avgHealthScore: all.length ? Math.round(totalHealth / all.length) : 0,
    criticalAlerts,
    statusBreakdown: statusCounts,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  upsertTrain,
  getAllTrains,
  getTrainsByDepot,
  getTrain,
  upsertDepot,
  getAllDepots,
  getAlertLog,
  getFleetSummary,
};
