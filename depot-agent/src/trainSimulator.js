/**
 * trainSimulator.js
 * Generates realistic train telemetry payloads with gradual state drift,
 * random fault injection, and recovery — mimicking real depot operations.
 */

const { getStationsForLine } = require("./trainData");

// Probability weights for train operational status
const STATUS_WEIGHTS = {
  IN_SERVICE:  0.55,
  STANDBY:     0.20,
  IN_DEPOT:    0.15,
  MAINTENANCE: 0.07,
  FAULT:       0.03,
};

// Component health states with transition probabilities
const COMPONENT_STATE = {
  NORMAL:  0.88,
  WARNING: 0.09,
  FAULT:   0.03,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function weightedPick(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [key, weight] of Object.entries(weights)) {
    r -= weight;
    if (r <= 0) return key;
  }
  return Object.keys(weights)[0];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// ─── Train State Store (in-memory, per-agent) ─────────────────────────────────

const trainStates = {};

function initTrainState(trainId, line) {
  const stations = getStationsForLine(line);
  trainStates[trainId] = {
    status: weightedPick(STATUS_WEIGHTS),
    speed: 0,
    currentStation: stations[randInt(0, stations.length - 1)],
    stationIndex: randInt(0, stations.length - 1),
    direction: Math.random() > 0.5 ? 1 : -1,
    odometer: randInt(50000, 500000), // km
    lastMaintenanceKm: randInt(0, 49999),
    components: {
      doors:      { state: "NORMAL", faultCars: [] },
      brakes:     { state: "NORMAL", pressure: 100 },
      hvac:       { state: "NORMAL", cabinTemp: 24 },
      pantograph: { state: "NORMAL" },
      traction:   { state: "NORMAL", motorTemp: 50 },
      battery:    { state: "NORMAL", voltage: 77.5 },
      cctv:       { state: "NORMAL", activeCams: 24 },
      signalling: { state: "NORMAL" },
    },
    alerts: [],
    line,
    stations,
  };
}

// ─── State Mutation Logic ──────────────────────────────────────────────────────

function evolveComponentState(current) {
  // 95% chance: stay the same
  if (Math.random() < 0.95) return current;
  return weightedPick(COMPONENT_STATE);
}

function updateTrain(trainId) {
  const s = trainStates[trainId];
  const alerts = [];

  // --- Operational Status ---
  if (Math.random() < 0.05) {
    s.status = weightedPick(STATUS_WEIGHTS);
  }

  // --- Speed based on status ---
  switch (s.status) {
    case "IN_SERVICE":
      s.speed = clamp(s.speed + rand(-5, 8), 0, 90);
      break;
    case "STANDBY":
      s.speed = clamp(s.speed + rand(-3, 0), 0, 15);
      break;
    default:
      s.speed = 0;
  }
  s.speed = Math.round(s.speed * 10) / 10;

  // --- Station progression ---
  if (s.status === "IN_SERVICE" && Math.random() < 0.3) {
    s.stationIndex += s.direction;
    if (s.stationIndex >= s.stations.length) {
      s.stationIndex = s.stations.length - 2;
      s.direction = -1;
    } else if (s.stationIndex < 0) {
      s.stationIndex = 1;
      s.direction = 1;
    }
    s.currentStation = s.stations[s.stationIndex];
  }

  // --- Odometer ---
  if (s.status === "IN_SERVICE") {
    s.odometer += Math.round(rand(0.1, 0.5) * 100) / 100;
  }

  // --- Components ---
  const c = s.components;

  // Doors
  c.doors.state = evolveComponentState(c.doors.state);
  if (c.doors.state === "FAULT") {
    c.doors.faultCars = [randInt(1, 6)];
    alerts.push({
      code: "DOOR_FAULT",
      severity: "HIGH",
      message: `Door fault on Car ${c.doors.faultCars[0]}`,
    });
  } else {
    c.doors.faultCars = [];
  }

  // Brakes
  c.brakes.state = evolveComponentState(c.brakes.state);
  c.brakes.pressure = clamp(
    c.brakes.pressure + rand(-2, 2),
    c.brakes.state === "FAULT" ? 55 : 80,
    100
  );
  c.brakes.pressure = Math.round(c.brakes.pressure * 10) / 10;
  if (c.brakes.state === "FAULT") {
    alerts.push({ code: "BRAKE_FAULT", severity: "CRITICAL", message: "Brake pressure below threshold" });
  } else if (c.brakes.state === "WARNING") {
    alerts.push({ code: "BRAKE_WARN", severity: "MEDIUM", message: `Brake pressure at ${c.brakes.pressure}%` });
  }

  // HVAC
  c.hvac.state = evolveComponentState(c.hvac.state);
  c.hvac.cabinTemp = clamp(
    c.hvac.cabinTemp + rand(-0.5, 0.5),
    c.hvac.state === "FAULT" ? 30 : 20,
    c.hvac.state === "FAULT" ? 38 : 27
  );
  c.hvac.cabinTemp = Math.round(c.hvac.cabinTemp * 10) / 10;
  if (c.hvac.state === "FAULT") {
    alerts.push({ code: "HVAC_FAULT", severity: "MEDIUM", message: `Cabin temperature ${c.hvac.cabinTemp}°C` });
  }

  // Pantograph
  c.pantograph.state = evolveComponentState(c.pantograph.state);
  if (c.pantograph.state === "FAULT") {
    alerts.push({ code: "PANTO_FAULT", severity: "CRITICAL", message: "Pantograph contact loss detected" });
  }

  // Traction
  c.traction.state = evolveComponentState(c.traction.state);
  c.traction.motorTemp = clamp(
    c.traction.motorTemp + rand(-2, 3),
    40,
    c.traction.state === "FAULT" ? 140 : 110
  );
  c.traction.motorTemp = Math.round(c.traction.motorTemp);
  if (c.traction.motorTemp > 120) {
    alerts.push({ code: "TRACTION_OVERHEAT", severity: "HIGH", message: `Motor temp ${c.traction.motorTemp}°C` });
  }

  // Battery
  c.battery.state = evolveComponentState(c.battery.state);
  c.battery.voltage = clamp(
    c.battery.voltage + rand(-0.2, 0.2),
    c.battery.state === "FAULT" ? 65 : 72,
    80
  );
  c.battery.voltage = Math.round(c.battery.voltage * 10) / 10;
  if (c.battery.voltage < 72) {
    alerts.push({ code: "BATTERY_LOW", severity: "MEDIUM", message: `Battery ${c.battery.voltage}V` });
  }

  // CCTV
  c.cctv.state = evolveComponentState(c.cctv.state);
  c.cctv.activeCams = c.cctv.state === "FAULT" ? randInt(16, 22) : 24;
  if (c.cctv.state === "FAULT") {
    alerts.push({ code: "CCTV_PARTIAL", severity: "LOW", message: `${24 - c.cctv.activeCams} camera(s) offline` });
  }

  // Signalling
  c.signalling.state = evolveComponentState(c.signalling.state);
  if (c.signalling.state === "FAULT") {
    alerts.push({ code: "ATP_FAULT", severity: "CRITICAL", message: "ATP/ATO signalling fault" });
  }

  // --- Maintenance Alert ---
  const kmSinceMaint = s.odometer - s.lastMaintenanceKm;
  if (kmSinceMaint > 40000) {
    alerts.push({
      code: "SCHEDULED_MAINTENANCE",
      severity: "LOW",
      message: `Scheduled maintenance due (${Math.round(kmSinceMaint).toLocaleString()} km since last service)`,
    });
  }

  s.alerts = alerts;
  return s;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a telemetry payload for a train.
 * On first call, the train state is initialized.
 *
 * @param {string} trainId
 * @param {string} depotId
 * @param {string} depotName
 * @param {string} line
 * @param {string} series       - EMU series e.g. "EMU-A1"
 * @param {string} manufacturer - e.g. "Siemens Mobility"
 * @returns {object} MQTT payload
 */
function getTelemetry(trainId, depotId, depotName, line, series = "", manufacturer = "") {
  if (!trainStates[trainId]) {
    initTrainState(trainId, line);
  }
  const s = updateTrain(trainId);

  // Derive overall health score (0-100)
  const componentStates = Object.values(s.components);
  const faultCount = componentStates.filter((c) => c.state === "FAULT").length;
  const warnCount  = componentStates.filter((c) => c.state === "WARNING").length;
  const healthScore = Math.max(
    0,
    100 - faultCount * 20 - warnCount * 5
  );

  return {
    trainId,
    series,
    manufacturer,
    depotId,
    depotName,
    line,
    timestamp: new Date().toISOString(),
    status: s.status,
    speed: s.speed,
    currentStation: s.currentStation,
    odometer: Math.round(s.odometer),
    healthScore,
    components: {
      doors:      { ...s.components.doors },
      brakes:     { ...s.components.brakes },
      hvac:       { ...s.components.hvac },
      pantograph: { ...s.components.pantograph },
      traction:   { ...s.components.traction },
      battery:    { ...s.components.battery },
      cctv:       { ...s.components.cctv },
      signalling: { ...s.components.signalling },
    },
    alerts: [...s.alerts],
  };
}

module.exports = { getTelemetry };
