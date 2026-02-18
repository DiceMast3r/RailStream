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
  const stationIndex = randInt(0, stations.length - 1);
  const status = weightedPick(STATUS_WEIGHTS);

  // Spread trains across phases at startup so they don't all leave stations at once
  const PHASES = ["DWELL", "ACCEL", "CRUISE", "BRAKE"];
  const phase  = status === "IN_SERVICE" ? PHASES[randInt(0, 3)] : "DWELL";

  trainStates[trainId] = {
    status,
    speed: phase === "CRUISE" ? randInt(60, 80)
         : phase === "ACCEL"  ? randInt(10, 50)
         : phase === "BRAKE"  ? randInt(5, 40)
         : 0,
    currentStation: stations[stationIndex],
    stationIndex,
    direction: Math.random() > 0.5 ? 1 : -1,
    odometer: randInt(50000, 500000), // km
    lastMaintenanceKm: randInt(0, 49999),

    // ── Speed state-machine: DWELL → ACCEL → CRUISE → BRAKE → (repeat) ──
    phase,
    dwellTimer:  phase === "DWELL" ? randInt(8, 20) : 0,
    // segProgress: fraction of inter-station segment completed (0–1)
    segProgress: phase === "DWELL" ? 0 : rand(0.05, phase === "BRAKE" ? 0.95 : 0.6),

    components: {
      doors:      { state: "NORMAL", faultCars: [] },
      brakes:     { state: "NORMAL", pressure: 100 },
      hvac:       { state: "NORMAL", cabinTemp: 24 },
      powerRail: { state: "NORMAL" },
      traction:   { state: "NORMAL", motorTemp: 50 },
      battery:    { state: "NORMAL", voltage: 77.5 },
      cctv:       { state: "NORMAL", activeCams: 24 },
    },
    alerts: [],
    line,
    stations,
  };
}

// ─── Speed State-Machine ─────────────────────────────────────────────────────
//
// Tick rate   : ~3 s  (PUBLISH_INTERVAL default)
// segProgress : fraction of the ~1 km inter-station segment completed.
//               distance per tick = speed(km/h) / 3600 * 3 s = speed / 1200
// Acceleration: rand(6, 9)  km/h per tick  ≈ 0.6–0.8 m/s²
// Deceleration: rand(9, 13) km/h per tick  ≈ 0.8–1.1 m/s²
// Max speed   : 80 km/h
// Dwell time  : 8–20 ticks ≈ 24–60 s at stations
// Braking cue : triggered at segProgress ≥ 0.68 (same threshold as simulate.js)

function updateTrainSpeed(s) {
  const ACCEL_RATE = rand(6, 9);    // km/h per 3 s tick
  const BRAKE_RATE = rand(9, 13);   // km/h per 3 s tick
  const MAX_SPEED  = 80;

  if (s.phase === "DWELL") {
    s.speed = 0;
    s.dwellTimer--;
    if (s.dwellTimer <= 0) { s.phase = "ACCEL"; s.segProgress = 0; }

  } else if (s.phase === "ACCEL") {
    s.speed = clamp(s.speed + ACCEL_RATE, 0, MAX_SPEED);
    s.segProgress += s.speed / 1200;
    // Switch to cruise near top speed, or brake early on short segments
    if (s.speed >= MAX_SPEED * 0.92)  s.phase = "CRUISE";
    if (s.segProgress >= 0.68)        s.phase = "BRAKE";

  } else if (s.phase === "CRUISE") {
    s.speed = clamp(s.speed + rand(-2, 2), MAX_SPEED * 0.88, MAX_SPEED);
    s.segProgress += s.speed / 1200;
    if (s.segProgress >= 0.68) s.phase = "BRAKE";

  } else if (s.phase === "BRAKE") {
    s.speed = clamp(s.speed - BRAKE_RATE, 0, MAX_SPEED);
    s.segProgress += Math.max(s.speed, 0) / 1200;
    if (s.speed <= 0) {
      // Arrived — advance to next station
      s.stationIndex += s.direction;
      if (s.stationIndex >= s.stations.length) {
        s.stationIndex = s.stations.length - 2;
        s.direction    = -1;
      } else if (s.stationIndex < 0) {
        s.stationIndex = 1;
        s.direction    = 1;
      }
      s.currentStation = s.stations[s.stationIndex];
      s.phase = "DWELL"; s.dwellTimer = randInt(8, 20); s.segProgress = 0;
    }
  }

  s.speed = Math.round(s.speed * 10) / 10;
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
  if (Math.random() < 0.03) {
    const prev = s.status;
    s.status = weightedPick(STATUS_WEIGHTS);
    // When transitioning into service, start fresh at a station
    if (s.status === "IN_SERVICE" && prev !== "IN_SERVICE") {
      s.phase = "DWELL"; s.dwellTimer = randInt(8, 20); s.segProgress = 0; s.speed = 0;
    }
    if (s.status !== "IN_SERVICE") { s.speed = 0; s.phase = "DWELL"; }
  }

  // --- Speed & station progression ---
  if (s.status === "IN_SERVICE") {
    updateTrainSpeed(s);
  } else if (s.status === "STANDBY") {
    s.speed = clamp(s.speed + rand(-3, 0), 0, 15);
    s.speed = Math.round(s.speed * 10) / 10;
    // Reset so train starts cleanly when it re-enters service
    s.phase = "DWELL"; s.dwellTimer = randInt(8, 20); s.segProgress = 0;
  } else {
    s.speed = 0;
    s.phase = "DWELL"; s.dwellTimer = randInt(8, 20); s.segProgress = 0;
  }

  // --- Odometer (speed km/h / 3600 * 3 s tick = km travelled) ---
  if (s.speed > 0) {
    s.odometer += Math.round(s.speed / 1200 * 100) / 100;
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

  // Power Rail (Third Rail)
  c.powerRail.state = evolveComponentState(c.powerRail.state);
  if (c.powerRail.state === "FAULT") {
    alerts.push({ code: "POWER_FAULT", severity: "CRITICAL", message: "Third rail power loss detected" });
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
    phase: s.phase,
    currentStation: s.currentStation,
    nextStation: s.phase !== "DWELL"
      ? s.stations[Math.max(0, Math.min(s.stations.length - 1, s.stationIndex + s.direction))]
      : null,
    odometer: Math.round(s.odometer),
    healthScore,
    components: {
      doors:      { ...s.components.doors },
      brakes:     { ...s.components.brakes },
      hvac:       { ...s.components.hvac },
      powerRail: { ...s.components.powerRail },
      traction:   { ...s.components.traction },
      battery:    { ...s.components.battery },
      cctv:       { ...s.components.cctv },
    },
    alerts: [...s.alerts],
  };
}

// ─── Point Machine Simulator (wayside, per-depot) ────────────────────────────
// Point machines are fixed trackside equipment. Each depot has a named set.
// Their telemetry is published independently of any train.

const PM_STATE = { NORMAL: 0.90, WARNING: 0.07, FAULT: 0.03 };
const pmStates = {};

const DEPOT_POINT_MACHINES = {
  MOC: ["A1","A2","A3","B1","B2","C1","C2","D1"],
  KHU: ["A1","A2","B1","B2","C1"],
  KHA: ["A1","A2","B1","B2","C1","C2"],
};

function initPMState(pmId) {
  pmStates[pmId] = {
    state:        "NORMAL",
    motorCurrent: rand(2.0, 2.8),
    voltage:      randInt(109, 113),
    strokeTime:   randInt(3100, 3400),
    position:     Math.random() > 0.5 ? "NORMAL" : "REVERSE",
    opCount:      randInt(0, 200),
  };
}

function getPointMachineTelemetry(depotId) {
  const ids = DEPOT_POINT_MACHINES[depotId] || [];
  return ids.map((localId) => {
    const pmId = `${depotId}-PM-${localId}`;
    if (!pmStates[pmId]) initPMState(pmId);
    const p = pmStates[pmId];

    // Evolve state
    if (Math.random() >= 0.95) p.state = weightedPick(PM_STATE);
    p.opCount += randInt(0, 2);

    let alertCode = null;
    if (p.state === "FAULT") {
      p.motorCurrent = clamp(p.motorCurrent + rand(0.5, 2.0), 6.0, 12.0);
      p.voltage      = clamp(p.voltage      + rand(-8, -2),   85, 110);
      p.strokeTime   = clamp(p.strokeTime   + rand(500, 2000), 3000, 12000);
      p.position     = "INTERMEDIATE";
      alertCode      = "POINT_FAULT";
    } else if (p.state === "WARNING") {
      p.motorCurrent = clamp(p.motorCurrent + rand(0.1, 0.5), 2.0, 6.0);
      p.voltage      = clamp(p.voltage      + rand(-3, 1),    100, 115);
      p.strokeTime   = clamp(p.strokeTime   + rand(200, 800), 3000, 6500);
      p.position     = Math.random() > 0.5 ? "NORMAL" : "REVERSE";
      alertCode      = "POINT_SLOW";
    } else {
      p.motorCurrent = clamp(p.motorCurrent + rand(-0.2, 0.2), 1.8, 3.0);
      p.voltage      = clamp(p.voltage      + rand(-1, 1),     108, 115);
      p.strokeTime   = clamp(p.strokeTime   + rand(-100, 100), 3000, 3500);
      p.position     = Math.random() > 0.5 ? "NORMAL" : "REVERSE";
    }
    p.motorCurrent = Math.round(p.motorCurrent * 10) / 10;
    p.voltage      = Math.round(p.voltage);
    p.strokeTime   = Math.round(p.strokeTime);

    const alert = alertCode ? {
      code:     alertCode,
      severity: alertCode === "POINT_FAULT" ? "CRITICAL" : "HIGH",
      message:  alertCode === "POINT_FAULT"
        ? `PM ${localId}: stuck throw (${p.strokeTime} ms, ${p.motorCurrent} A)`
        : `PM ${localId}: slow operation (${p.strokeTime} ms)`,
    } : null;

    return {
      pmId,
      localId,
      depotId,
      state:        p.state,
      motorCurrent: p.motorCurrent,
      voltage:      p.voltage,
      strokeTime:   p.strokeTime,
      position:     p.position,
      opCount:      p.opCount,
      alert,
      timestamp:    new Date().toISOString(),
    };
  });
}

module.exports = { getTelemetry, getPointMachineTelemetry };
