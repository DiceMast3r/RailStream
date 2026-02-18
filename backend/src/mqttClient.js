/**
 * mqttClient.js
 * Subscribes to all depot telemetry topics, updates the in-memory store,
 * and emits Socket.io events to connected dashboard clients.
 */

const mqtt = require("mqtt");
const store = require("./store");

const BROKER_URL = process.env.MQTT_BROKER || "mqtt://localhost:1883";

// Topic patterns
const TRAIN_TOPIC  = "railstream/depot/+/train/+";        // all train telemetry
const DEPOT_TOPIC  = "railstream/depot/+/status";          // depot registrations
const PM_TOPIC     = "railstream/depot/+/pointmachine/+"; // point machine telemetry

let io; // Socket.io server instance (injected)

function start(socketIoServer) {
  io = socketIoServer;

  const client = mqtt.connect(BROKER_URL, {
    clientId: `railstream-backend-${Date.now()}`,
    clean: true,
    reconnectPeriod: 5000,
  });

  client.on("connect", () => {
    console.log("[MQTT] ✅ Connected to broker:", BROKER_URL);
    client.subscribe([TRAIN_TOPIC, DEPOT_TOPIC, PM_TOPIC], { qos: 1 }, (err) => {
      if (err) console.error("[MQTT] Subscribe error:", err);
      else console.log("[MQTT] Subscribed to depot topics");
    });
  });

  client.on("message", (topic, messageBuffer) => {
    let payload;
    try {
      payload = JSON.parse(messageBuffer.toString());
    } catch {
      return; // ignore malformed messages
    }

    if (topic.endsWith("/status")) {
      // Depot registration
      store.upsertDepot(payload);
      io.emit("depot:update", payload);
      console.log(`[MQTT] Depot registered: ${payload.depotId} (${payload.depotName})`);
    } else if (topic.includes("/pointmachine/")) {
      // Point machine telemetry
      store.upsertPointMachine(payload);
      io.emit("pm:update", payload);
    } else {
      // Train telemetry
      store.upsertTrain(payload);
      io.emit("train:update", payload);

      // Broadcast critical alerts immediately
      const criticals = (payload.alerts || []).filter(
        (a) => a.severity === "CRITICAL"
      );
      if (criticals.length > 0) {
        io.emit("alert:critical", {
          trainId:  payload.trainId,
          depotId:  payload.depotId,
          depotName: payload.depotName,
          alerts:   criticals,
          timestamp: payload.timestamp,
        });
      }
    }
  });

  client.on("reconnect", () => console.log("[MQTT] 🔄 Reconnecting…"));
  client.on("error",     (e) => console.error("[MQTT] ❌ Error:", e.message));
  client.on("offline",   ()  => console.warn("[MQTT] ⚠️  Offline"));

  return client;
}

module.exports = { start };
