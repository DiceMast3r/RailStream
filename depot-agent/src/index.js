/**
 * index.js  —  RailStream Depot Agent
 *
 * Connects to the MQTT broker and publishes train telemetry for every
 * train in this depot on a fixed interval.
 *
 * Environment variables (set via docker-compose):
 *   DEPOT_ID          "MOC" | "KHU" | "KHA"
 *   MQTT_BROKER       e.g. "mqtt://mqtt-broker:1883"
 *   PUBLISH_INTERVAL  milliseconds between publishes (default 3000)
 */

const mqtt = require("mqtt");
const { buildFleetForDepot, DEPOT_INFO } = require("./trainData");
const { getTelemetry, getPointMachineTelemetry } = require("./trainSimulator");

// ─── Config ───────────────────────────────────────────────────────────────────

const DEPOT_ID         = process.env.DEPOT_ID    || "MOC";
const BROKER_URL       = process.env.MQTT_BROKER || "mqtt://localhost:1883";
const PUBLISH_INTERVAL = parseInt(process.env.PUBLISH_INTERVAL || "3000", 10);

const info   = DEPOT_INFO[DEPOT_ID] || { depotName: DEPOT_ID, line: "Sukhumvit" };
const DEPOT_NAME = info.depotName;
const DEPOT_LINE = info.line;

// Fleet is determined entirely by depotId — no TRAIN_COUNT env needed
const fleetEntries = buildFleetForDepot(DEPOT_ID); // [{trainId, series, manufacturer, line}]
const trainIds     = fleetEntries.map((t) => t.trainId);
const fleetMeta    = Object.fromEntries(fleetEntries.map((t) => [t.trainId, t]));

// MQTT topic pattern: railstream/depot/{depotId}/train/{trainId}
const topicFor   = (trainId) => `railstream/depot/${DEPOT_ID}/train/${trainId}`;
const pmTopicFor = (pmId)    => `railstream/depot/${DEPOT_ID}/pointmachine/${pmId}`;
const depotStatusTopic = `railstream/depot/${DEPOT_ID}/status`;

// ─── Connect ──────────────────────────────────────────────────────────────────

console.log(`[${DEPOT_ID}] 🚇 RailStream Depot Agent starting…`);
console.log(`[${DEPOT_ID}] Depot   : ${DEPOT_NAME} (${DEPOT_LINE} Line)`);
console.log(`[${DEPOT_ID}] Fleet   : ${trainIds.length} trains`);
console.log(`[${DEPOT_ID}] Broker  : ${BROKER_URL}`);
console.log(`[${DEPOT_ID}] Interval: ${PUBLISH_INTERVAL} ms`);

// Log series breakdown
const seriesGroups = {};
for (const t of fleetEntries) seriesGroups[t.series] = (seriesGroups[t.series] || 0) + 1;
for (const [series, count] of Object.entries(seriesGroups)) {
  const mfg = fleetEntries.find((t) => t.series === series)?.manufacturer || "";
  console.log(`[${DEPOT_ID}]   ${series} (${mfg}) — ${count} units`);
}

const client = mqtt.connect(BROKER_URL, {
  clientId: `depot-agent-${DEPOT_ID}-${Date.now()}`,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 30000,
});

// ─── MQTT Events ─────────────────────────────────────────────────────────────

client.on("connect", () => {
  console.log(`[${DEPOT_ID}] ✅ Connected to MQTT broker`);

  // Publish depot registration (retained — dashboard picks it up on connect)
  client.publish(
    depotStatusTopic,
    JSON.stringify({
      depotId:    DEPOT_ID,
      depotName:  DEPOT_NAME,
      line:       DEPOT_LINE,
      trainCount: trainIds.length,
      trains:     trainIds,
      fleet:      fleetEntries,
      agentVersion: "1.0.0",
      connectedAt: new Date().toISOString(),
    }),
    { retain: true }
  );

  // Start telemetry loop
  startPublishing();
});

client.on("reconnect", () => {
  console.log(`[${DEPOT_ID}] 🔄 Reconnecting to broker…`);
});

client.on("error", (err) => {
  console.error(`[${DEPOT_ID}] ❌ MQTT error:`, err.message);
});

client.on("offline", () => {
  console.warn(`[${DEPOT_ID}] ⚠️  Broker offline – buffering`);
});

// ─── Publishing Loop ──────────────────────────────────────────────────────────

let trainIndex = 0; // publish one train per tick to spread network load
let tickCount  = 0;

function startPublishing() {
  setInterval(() => {
    tickCount++;
    const meta    = fleetEntries[trainIndex % fleetEntries.length];
    trainIndex++;

    const payload = getTelemetry(meta.trainId, DEPOT_ID, DEPOT_NAME, meta.line, meta.series, meta.manufacturer);
    const topic   = topicFor(meta.trainId);

    client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) {
        console.error(`[${DEPOT_ID}] Publish error for ${meta.trainId}:`, err.message);
      } else {
        const alertCount = payload.alerts.length;
        const alertTag   = alertCount > 0 ? ` ⚠ ${alertCount} alert(s)` : "";
        console.log(
          `[${DEPOT_ID}] ▶ ${meta.trainId} | ${payload.status.padEnd(11)} | ` +
          `${String(payload.speed).padStart(4)} km/h | ` +
          `Health: ${payload.healthScore}% | ` +
          `${payload.currentStation}${alertTag}`
        );
      }
    });

    // Publish all point machines every 3rd tick (~9 s at default interval)
    if (tickCount % 3 === 0) {
      const pms = getPointMachineTelemetry(DEPOT_ID);
      for (const pm of pms) {
        client.publish(pmTopicFor(pm.pmId), JSON.stringify(pm), { qos: 1 });
      }
    }
  }, PUBLISH_INTERVAL);
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

process.on("SIGTERM", () => {
  console.log(`[${DEPOT_ID}] Shutting down…`);
  client.end(true, () => process.exit(0));
});
