/**
 * Mirrors client `Leads.jsx` part normalization so part-wise keys match between
 * MongoDB-claimed stats and Gmail-received stats.
 */

const CANONICAL_PART_REQUIRED_LABELS = [
  "AC Compressor",
  "AC Control Unit",
  "Alternator",
  "Air Bag Control Module",
  "Anti Lock Braking",
  "Axle Shaft",
  "Body Control Module",
  "Brake Callipers",
  "Chassis Control Computer",
  "Cylinder Head",
  "Differential Assembly",
  "Drive Shaft",
  "Engine",
  "Engine Control Module",
  "Exhaust Manifold",
  "Fuel Pump",
  "Headlight",
  "Instrumental Cluster (Speedometer)",
  "Intake Manifold",
  "Mirrors",
  "Powertrain Control Module",
  "Rack & Pinion",
  "Rear Axle Assembly",
  "Radio",
  "Spindle",
  "Strut",
  "Steering Column",
  "Temperature Control Unit",
  "Transfer Case",
  "Transmission",
  "Transmission Control Module",
  "Throttle Body",
  "Wheel",
  "Window Regulator",
];

export function normalizePartRequiredLabel(partRequired = "") {
  const normalized = String(partRequired).trim().replace(/\s+/g, " ");
  if (!normalized) return "";

  const lower = normalized.toLowerCase();
  const compact = lower.replace(/[^a-z0-9]/g, "");

  const matches = (patterns) => patterns.some((pattern) => pattern.test(lower));

  if (
    matches([
      /\btransmission\b/,
      /\bused transmission\b/,
      /\bmanual transmission\b/,
      /\bautomatic transmission\b/,
      /\breman/i,
      /\brebuild/i,
    ]) &&
    !lower.includes("control module")
  ) {
    return "Transmission";
  }
  if (matches([/\btransmission control module\b/, /\btcm\b/])) return "Transmission Control Module";
  if (matches([/\banti lock braking\b/, /\babs\b/])) return "Anti Lock Braking";
  if (matches([/\bac compressor\b/])) return "AC Compressor";
  if (matches([/\bac control unit\b/, /\bclimate control\b/])) return "AC Control Unit";
  if (matches([/\balternator\b/])) return "Alternator";
  if (matches([/\bair bag control module\b/, /\bsrs module\b/])) return "Air Bag Control Module";
  if (matches([/\baxle shaft\b/])) return "Axle Shaft";
  if (matches([/\bbody control module\b/, /\bbcm\b/])) return "Body Control Module";
  if (matches([/\bbrake cali?pers?\b/])) return "Brake Callipers";
  if (matches([/\bchassis control computer\b/])) return "Chassis Control Computer";
  if (matches([/\bcylinder head\b/])) return "Cylinder Head";
  if (matches([/\bdifferential assembly\b/, /\bdifferential\b/])) return "Differential Assembly";
  if (matches([/\bdrive shaft\b/, /\bdriveshaft\b/])) return "Drive Shaft";
  if (matches([/\bengine control module\b/, /\becm\b/])) return "Engine Control Module";
  if (matches([/\bengine\b/])) return "Engine";
  if (matches([/\bexhaust manifold\b/])) return "Exhaust Manifold";
  if (matches([/\bfuel pump\b/])) return "Fuel Pump";
  if (matches([/\bheadlight\b/])) return "Headlight";
  if (matches([/\binstrumental cluster\b/, /\binstrument cluster\b/, /\bspeedometer\b/]))
    return "Instrumental Cluster (Speedometer)";
  if (matches([/\bintake manifold\b/])) return "Intake Manifold";
  if (matches([/\bmirror\b/])) return "Mirrors";
  if (matches([/\bpowertrain control module\b/, /\bpcm\b/])) return "Powertrain Control Module";
  if (matches([/\brack\s*&\s*pinion\b/, /\brack and pinion\b/])) return "Rack & Pinion";
  if (matches([/\brear axle assembly\b/, /\brear axle\b/])) return "Rear Axle Assembly";
  if (matches([/\bradio\b/])) return "Radio";
  if (matches([/\bspindle\b/])) return "Spindle";
  if (matches([/\bstrut\b/])) return "Strut";
  if (matches([/\bsteering column\b/])) return "Steering Column";
  if (matches([/\btemperature control unit\b/])) return "Temperature Control Unit";
  if (matches([/\btransfer case\b/])) return "Transfer Case";
  if (matches([/\bthrottle body\b/])) return "Throttle Body";
  if (matches([/\bwheel\b/])) return "Wheel";
  if (matches([/\bwindow regulator\b/])) return "Window Regulator";

  const exactCanonical = CANONICAL_PART_REQUIRED_LABELS.find(
    (label) => label.toLowerCase().replace(/[^a-z0-9]/g, "") === compact
  );
  if (exactCanonical) return exactCanonical;

  return "Others";
}
