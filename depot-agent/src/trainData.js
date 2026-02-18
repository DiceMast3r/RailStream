/**
 * trainData.js
 * Real BTS Skytrain fleet roster and station lists.
 *
 * Fleet composition (98 trains total):
 *  MOC — Mo Chit Depot   : EMU-A1 (1-35) + EMU-B1 (36-47) + EMU-B2 (48-52)  = 52 trains
 *  KHU — Khukhot Depot   : EMU-A2 (53-74)                                    = 22 trains
 *  KHA — Kheha Depot     : EMU-B3 (75-98)                                    = 24 trains
 */

// ─── Station lists ────────────────────────────────────────────────────────────

/** BTS Sukhumvit Line — full extension including Green Line */
const SUKHUMVIT_STATIONS = [
  "Mo Chit", "Saphan Khwai", "Sena Nikhom", "Ari", "Sanam Pao",
  "Victory Monument", "Phaya Thai", "Ratchathewi", "Siam",
  "Chit Lom", "Phloen Chit", "Nana", "Asok", "Phrom Phong",
  "Thong Lo", "Ekkamai", "Phra Khanong", "On Nut", "Bang Chak",
  "Punnawithi", "Udom Suk", "Bang Na", "Bearing", "Samrong",
  "Pu Chao", "Chang Erawan", "Kheha",
];

/** BTS Silom Line */
const SILOM_STATIONS = [
  "National Stadium", "Siam", "Ratchadamri", "Sala Daeng",
  "Chong Nonsi", "Surasak", "Saphan Taksin", "Krung Thon Buri",
  "Wongwian Yai", "Pho Nimit", "Talat Phlu", "Wutthakat", "Bang Wa",
];

// ─── Real BTS fleet series ────────────────────────────────────────────────────

/**
 * EMU series metadata.
 * Each entry: { series, manufacturer, ids: [start, end (inclusive)], line }
 */
const EMU_SERIES = [
  { series: "EMU-A1", manufacturer: "Siemens Mobility",    start: 1,  end: 35, line: "Sukhumvit", depot: "MOC" },
  { series: "EMU-B1", manufacturer: "CNR",                 start: 36, end: 47, line: "Sukhumvit", depot: "MOC" },
  { series: "EMU-B2", manufacturer: "CNR",                 start: 48, end: 52, line: "Sukhumvit", depot: "MOC" },
  { series: "EMU-A2", manufacturer: "Siemens-Bozankaya",   start: 53, end: 74, line: "Sukhumvit", depot: "KHU" },
  { series: "EMU-B3", manufacturer: "CRRC",                start: 75, end: 98, line: "Sukhumvit", depot: "KHA" },
];

/**
 * Depot registry (source of truth for names and fleet assignment).
 */
const DEPOT_INFO = {
  MOC: { depotId: "MOC", depotName: "Mo Chit Depot",  line: "Sukhumvit" },
  KHU: { depotId: "KHU", depotName: "Khukhot Depot",  line: "Sukhumvit" },
  KHA: { depotId: "KHA", depotName: "Kheha Depot",    line: "Sukhumvit" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the full train fleet for a given depot.
 * Returns an array of objects: { trainId, series, manufacturer, line }
 *
 * Train ID format: "<series>-<zero-padded 3-digit number>"
 * e.g.  EMU-A1-001, EMU-B1-036, EMU-A2-053
 *
 * @param {string} depotId
 * @returns {{ trainId:string, series:string, manufacturer:string, line:string }[]}
 */
function buildFleetForDepot(depotId) {
  const seriesList = EMU_SERIES.filter((s) => s.depot === depotId);
  const trains = [];
  for (const s of seriesList) {
    for (let id = s.start; id <= s.end; id++) {
      trains.push({
        trainId:      `${s.series}-${String(id).padStart(3, "0")}`,
        series:       s.series,
        manufacturer: s.manufacturer,
        line:         s.line,
      });
    }
  }
  return trains;
}

/**
 * Returns station list for a given BTS line.
 * @param {string} line
 * @returns {string[]}
 */
function getStationsForLine(line) {
  if (line === "Silom") return SILOM_STATIONS;
  return SUKHUMVIT_STATIONS;
}

module.exports = { buildFleetForDepot, getStationsForLine, DEPOT_INFO, EMU_SERIES };
