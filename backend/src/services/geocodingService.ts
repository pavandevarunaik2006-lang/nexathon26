import { REGIONAL_DESTINATIONS } from '@roadalert/shared';
import { haversineDistanceKm } from './verificationEngine.js';
import { ApiError } from '../middleware/errorHandler.js';

export interface LocationSuggestion {
  id: string;
  label: string;
  secondaryLabel: string;
  category:
    | 'PRESET_CORRIDOR'
    | 'JUNCTION'
    | 'HIGHWAY_SEGMENT'
    | 'LANDMARK'
    | 'TOWN_CENTER'
    | 'TRANSIT_HUB'
    | 'COORDINATE'
    | 'GEOCODER';
  lat: number;
  lng: number;
  roadName: string;
  source: 'PRESET' | 'GAZETTEER' | 'COORDINATE' | 'NOMINATIM';
}

export interface GazetteerEntry {
  id: string;
  name: string;
  secondaryLabel: string;
  category: LocationSuggestion['category'];
  roadName: string;
  lat: number;
  lng: number;
  aliases: string[];
  isPreset?: boolean;
}

/**
 * Authoritative regional gazetteer covering all REGIONAL_DESTINATIONS plus
 * major junctions, highways, towns, campuses, hospitals, and transit hubs
 * across the Mangaluru – Surathkal – Mulki – Padubidri – Kaup – Udupi – Manipal
 * and Bantwal / Moodbidri / Karkala corridors.
 */
export const GAZETTEER_LOCATIONS: GazetteerEntry[] = [
  // All preset REGIONAL_DESTINATIONS first
  {
    id: 'preset-pumpwell',
    name: 'Pumpwell Circle, Mangaluru (NH-66)',
    secondaryLabel: 'NH-66 / NH-75 Junction, Mangaluru',
    category: 'PRESET_CORRIDOR',
    roadName: 'NH-66 Pumpwell Flyover',
    lat: 12.8669,
    lng: 74.8692,
    aliases: [
      'pumpwell',
      'pumpwell circle',
      'pumpwell flyover',
      'mahaveer circle',
      'indiana hospital pumpwell',
      'nh-66 pumpwell',
    ],
    isPreset: true,
  },
  {
    id: 'preset-nanthoor',
    name: 'Nanthoor Junction, Mangaluru (NH-66)',
    secondaryLabel: 'NH-66 / SH-101 Bikarnakatte Crossing, Mangaluru',
    category: 'PRESET_CORRIDOR',
    roadName: 'NH-66 Nanthoor Signal Junction',
    lat: 12.8825,
    lng: 74.8648,
    aliases: [
      'nanthoor',
      'nanthoor junction',
      'nanthoor circle',
      'nanthoor signal',
      'bikarnakatte nanthoor',
    ],
    isPreset: true,
  },
  {
    id: 'preset-kpt',
    name: 'KPT Junction, Mangaluru (NH-66)',
    secondaryLabel: 'Karnataka Polytechnic / Airport Rd Junction, Mangaluru',
    category: 'PRESET_CORRIDOR',
    roadName: 'NH-66 KPT Junction',
    lat: 12.8935,
    lng: 74.8594,
    aliases: [
      'kpt',
      'kpt junction',
      'kpt circle',
      'karnataka polytechnic',
      'kadri hills kpt',
    ],
    isPreset: true,
  },
  {
    id: 'preset-kuloor',
    name: 'Kuloor Bridge, Mangaluru (NH-66)',
    secondaryLabel: 'Phalguni River Crossing, NH-66 North Mangaluru',
    category: 'PRESET_CORRIDOR',
    roadName: 'NH-66 Kuloor Bridge',
    lat: 12.9261,
    lng: 74.8267,
    aliases: ['kuloor', 'kuloor bridge', 'kulur', 'kulur junction', 'kottara kuloor'],
    isPreset: true,
  },
  {
    id: 'preset-baikampady',
    name: 'Baikampady Industrial Area (NH-66)',
    secondaryLabel: 'KIADB Industrial Corridor & New Mangalore Port Access',
    category: 'PRESET_CORRIDOR',
    roadName: 'NH-66 Baikampady Industrial Corridor',
    lat: 12.9522,
    lng: 74.8105,
    aliases: [
      'baikampady',
      'baikampady industrial area',
      'nmpt',
      'new mangalore port',
      'panambur baikampady',
    ],
    isPreset: true,
  },
  {
    id: 'preset-surathkal',
    name: 'Surathkal NITK Corridor (NH-66)',
    secondaryLabel: 'NITK Campus & Surathkal Town Flyover, NH-66',
    category: 'PRESET_CORRIDOR',
    roadName: 'NH-66 Surathkal NITK',
    lat: 13.0108,
    lng: 74.7943,
    aliases: [
      'surathkal',
      'nitk',
      'nitk surathkal',
      'surathkal flyover',
      'surathkal junction',
      'srinivasnagar',
    ],
    isPreset: true,
  },
  {
    id: 'preset-mulki',
    name: 'Mulki Shambhavi Bridge (NH-66)',
    secondaryLabel: 'Mulki Town & Shambhavi River Corridor, NH-66',
    category: 'PRESET_CORRIDOR',
    roadName: 'NH-66 Mulki Corridor',
    lat: 13.0908,
    lng: 74.7864,
    aliases: ['mulki', 'mulki bridge', 'shambhavi bridge', 'bappanadu', 'kinnigoli road mulki'],
    isPreset: true,
  },
  {
    id: 'preset-padubidri',
    name: 'Padubidri Karkala Cross (NH-66 / SH-1)',
    secondaryLabel: 'NH-66 & SH-1 Karkala State Highway Intersection',
    category: 'PRESET_CORRIDOR',
    roadName: 'NH-66 / SH-1 Padubidri Cross',
    lat: 13.1422,
    lng: 74.7731,
    aliases: ['padubidri', 'padubidri junction', 'padubidri cross', 'hejamady', 'hejamady toll'],
    isPreset: true,
  },
  {
    id: 'preset-kaup',
    name: 'Kaup Junction (NH-66)',
    secondaryLabel: 'Kaup Lighthouse Rd & NH-66 Coastal Highway',
    category: 'PRESET_CORRIDOR',
    roadName: 'NH-66 Kaup Junction',
    lat: 13.2244,
    lng: 74.7484,
    aliases: ['kaup', 'kapu', 'kaup junction', 'kaup beach road', 'pangala', 'uchila'],
    isPreset: true,
  },
  {
    id: 'preset-udupi',
    name: 'Udupi Karavali Bypass (NH-66)',
    secondaryLabel: 'Karavali Junction, NH-66 / NH-169A Udupi',
    category: 'PRESET_CORRIDOR',
    roadName: 'NH-66 Udupi Karavali Bypass',
    lat: 13.3409,
    lng: 74.7351,
    aliases: [
      'udupi',
      'karavali bypass',
      'karavali junction',
      'udupi bypass',
      'ambalpady',
      'udupi town',
    ],
    isPreset: true,
  },
  {
    id: 'preset-manipal',
    name: 'Manipal Tiger Circle (NH-169A)',
    secondaryLabel: 'MAHE University Hub & KMC Hospital, Manipal',
    category: 'PRESET_CORRIDOR',
    roadName: 'NH-169A Manipal Tiger Circle',
    lat: 13.3525,
    lng: 74.7868,
    aliases: [
      'manipal',
      'tiger circle',
      'manipal tiger circle',
      'kmc manipal',
      'syndicate circle',
      'mit manipal',
    ],
    isPreset: true,
  },
  {
    id: 'preset-padil',
    name: 'Padil Junction, Mangaluru (NH-75)',
    secondaryLabel: 'Mangaluru Junction Railway Station & DC Office Road, NH-75',
    category: 'PRESET_CORRIDOR',
    roadName: 'NH-75 Padil Underpass',
    lat: 12.8698,
    lng: 74.8891,
    aliases: ['padil', 'padil junction', 'padil underpass', 'mangaluru junction station', 'adyar'],
    isPreset: true,
  },
  {
    id: 'preset-bc-road',
    name: 'Bantwal BC Road Flyover (NH-75)',
    secondaryLabel: 'Bantwal Cross Road Transit Hub, NH-75',
    category: 'PRESET_CORRIDOR',
    roadName: 'NH-75 BC Road Flyover',
    lat: 12.8881,
    lng: 75.0332,
    aliases: ['bc road', 'bantwal', 'bantwal bc road', 'bc road flyover', 'melkar', 'pane mangalore'],
    isPreset: true,
  },

  // Additional high-frequency locations, landmarks, junctions & road segments
  {
    id: 'loc-kottara-chowki',
    name: 'Kottara Chowki Flyover, Mangaluru',
    secondaryLabel: 'NH-66 / Derebail – Mannagudda Link, Mangaluru',
    category: 'JUNCTION',
    roadName: 'NH-66 Kottara Chowki',
    lat: 12.9082,
    lng: 74.8384,
    aliases: ['kottara', 'kottara chowki', 'kottara flyover', 'derebail', 'malemar'],
  },
  {
    id: 'loc-jyothi-circle',
    name: 'Jyothi Circle (Ambedkar Circle), Mangaluru',
    secondaryLabel: 'Balmatta Rd / Bunts Hostel Rd / KMC Hospital Central Hub',
    category: 'JUNCTION',
    roadName: 'Balmatta Road / Ambedkar Circle',
    lat: 12.8732,
    lng: 74.8482,
    aliases: ['jyothi', 'jyothi circle', 'ambedkar circle', 'balmatta', 'kmc jyothi', 'bunts hostel'],
  },
  {
    id: 'loc-hampankatta',
    name: 'Hampankatta Signal & Central Railway Station, Mangaluru',
    secondaryLabel: 'KS Rao Road / Falnir Road / Mangaluru Central',
    category: 'TRANSIT_HUB',
    roadName: 'KS Rao Road Hampankatta',
    lat: 12.8699,
    lng: 74.8431,
    aliases: [
      'hampankatta',
      'mangaluru central',
      'mangalore central',
      'state bank',
      'ks rao road',
      'falnir',
    ],
  },
  {
    id: 'loc-bejai-ksrtc',
    name: 'Bejai KSRTC Bus Stand & Lalbagh, Mangaluru',
    secondaryLabel: 'MG Road / Bejai Main Road, Mangaluru',
    category: 'TRANSIT_HUB',
    roadName: 'MG Road Lalbagh / Bejai',
    lat: 12.8878,
    lng: 74.8419,
    aliases: ['bejai', 'lalbagh', 'ksrtc mangaluru', 'mg road mangaluru', 'ballalbagh', 'bharath mall'],
  },
  {
    id: 'loc-kankanady',
    name: 'Kankanady Father Muller Corridor, Mangaluru',
    secondaryLabel: 'Kankanady Bypass & Bendoorwell Junction, Mangaluru',
    category: 'LANDMARK',
    roadName: 'Kankanady Bypass Road',
    lat: 12.8689,
    lng: 74.8586,
    aliases: ['kankanady', 'bendoorwell', 'father muller', 'valencia', 'falnir kankanady'],
  },
  {
    id: 'loc-kadri',
    name: 'Kadri Mallikatte & Park Corridor, Mangaluru',
    secondaryLabel: 'Kadri Temple Road / Mallikatte Market, Mangaluru',
    category: 'LANDMARK',
    roadName: 'Kadri Road',
    lat: 12.8812,
    lng: 74.8559,
    aliases: ['kadri', 'mallikatte', 'kadri park', 'kadri temple', 'shivabagh'],
  },
  {
    id: 'loc-kavoor-airport-rd',
    name: 'Kavoor Junction & Airport Road (SH-67)',
    secondaryLabel: 'Bondel – Kavoor – Maravoor Airport Corridor',
    category: 'HIGHWAY_SEGMENT',
    roadName: 'Airport Road (SH-67) Kavoor',
    lat: 12.9278,
    lng: 74.8553,
    aliases: ['kavoor', 'bondel', 'airport road', 'maravoor', 'maravoor bridge'],
  },
  {
    id: 'loc-bajpe-airport',
    name: 'Mangaluru International Airport (IXE), Bajpe',
    secondaryLabel: 'Kenjar / Bajpe Airport Terminal Rd',
    category: 'TRANSIT_HUB',
    roadName: 'Bajpe Airport Terminal Road',
    lat: 12.9613,
    lng: 74.8901,
    aliases: ['bajpe', 'mangaluru airport', 'mangalore airport', 'ixe', 'kenjar'],
  },
  {
    id: 'loc-panambur',
    name: 'Panambur Beach & Port Gate Junction (NH-66)',
    secondaryLabel: 'NMPT Gate & Panambur Coastal Highway, NH-66',
    category: 'LANDMARK',
    roadName: 'NH-66 Panambur Port Junction',
    lat: 12.9465,
    lng: 74.8072,
    aliases: ['panambur', 'panambur beach', 'port gate', 'tannirbhavi'],
  },
  {
    id: 'loc-mukka-haleyangadi',
    name: 'Mukka & Haleyangadi Highway Segment (NH-66)',
    secondaryLabel: 'Srinivas Hospital Mukka / Pavanje Bridge, NH-66',
    category: 'HIGHWAY_SEGMENT',
    roadName: 'NH-66 Mukka–Haleyangadi',
    lat: 13.0462,
    lng: 74.7905,
    aliases: ['mukka', 'haleyangadi', 'pavanje', 'srinivas hospital mukka'],
  },
  {
    id: 'loc-kinnigoli',
    name: 'Kinnigoli Town Junction (SH-67)',
    secondaryLabel: 'Bajpe – Kinnigoli – Kateel – Mulki Inland Corridor',
    category: 'TOWN_CENTER',
    roadName: 'SH-67 Kinnigoli–Kateel Road',
    lat: 13.0681,
    lng: 74.8614,
    aliases: ['kinnigoli', 'kateel', 'moorukaveri'],
  },
  {
    id: 'loc-moodbidri',
    name: 'Moodbidri Alvas Campus & NH-169 Corridor',
    secondaryLabel: 'Mangaluru – Moodbidri – Karkala Highway (NH-169)',
    category: 'TOWN_CENTER',
    roadName: 'NH-169 Moodbidri Bypass',
    lat: 13.0692,
    lng: 74.9951,
    aliases: ['moodbidri', 'mudbidri', 'alvas', 'vidyagiri', 'gurupura', 'kaikamba'],
  },
  {
    id: 'loc-karkala',
    name: 'Karkala Pulkeri Bypass (SH-1 / NH-169)',
    secondaryLabel: 'Padubidri – Karkala – Hebri State Highway Hub',
    category: 'TOWN_CENTER',
    roadName: 'SH-1 Karkala Pulkeri Bypass',
    lat: 13.2156,
    lng: 74.9963,
    aliases: ['karkala', 'pulkeri', 'nitte', 'nmamit nitte', 'bajakudlu'],
  },
  {
    id: 'loc-ullal-thokkottu',
    name: 'Thokkottu Flyover & Ullal Netravati Bridge (NH-66)',
    secondaryLabel: 'Netravati River Bridge & South NH-66 Corridor',
    category: 'JUNCTION',
    roadName: 'NH-66 Thokkottu / Netravati Bridge',
    lat: 12.8168,
    lng: 74.8615,
    aliases: ['thokkottu', 'ullal', 'netravati bridge', 'jeppinamogaru', 'ekkur', 'kotekar'],
  },
  {
    id: 'loc-derlakatte',
    name: 'Derlakatte Medical & University Corridor',
    secondaryLabel: 'Yenepoya / KS Hegde / Father Muller Deralakatte Hub',
    category: 'LANDMARK',
    roadName: 'Derlakatte–Konaje University Road',
    lat: 12.8109,
    lng: 74.8884,
    aliases: ['derlakatte', 'deralakatte', 'konaje', 'mangalore university', 'ks hegde', 'yenepoya'],
  },
  {
    id: 'loc-udupi-bus-stand',
    name: 'Udupi Service Bus Stand & Sri Krishna Matha Corridor',
    secondaryLabel: 'Udupi City Center / Bannanje / Kalsanka Junction',
    category: 'TOWN_CENTER',
    roadName: 'Udupi Kalsanka–Bannanje Road',
    lat: 13.3389,
    lng: 74.7492,
    aliases: ['kalsanka', 'bannanje', 'udupi city', 'udupi bus stand', 'krishna matha', 'udupi station'],
  },
  {
    id: 'loc-brahmavar',
    name: 'Brahmavar Highway Corridor (NH-66)',
    secondaryLabel: 'Udupi – Brahmavar – Kundapura Northern NH-66',
    category: 'HIGHWAY_SEGMENT',
    roadName: 'NH-66 Brahmavar',
    lat: 13.4316,
    lng: 74.7448,
    aliases: ['brahmavar', 'santhekatte', 'kalyanpura', 'kundapura road'],
  },
];

// Keep REGIONAL_DESTINATIONS synchronized if any new preset was added in shared
for (const preset of REGIONAL_DESTINATIONS) {
  const exists = GAZETTEER_LOCATIONS.some(
    (g) => g.name.toLowerCase() === preset.name.toLowerCase()
  );
  if (!exists) {
    GAZETTEER_LOCATIONS.push({
      id: `preset-${preset.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: preset.name,
      secondaryLabel: 'Regional Corridor Preset',
      category: 'PRESET_CORRIDOR',
      roadName: preset.name,
      lat: preset.lat,
      lng: preset.lng,
      aliases: [preset.name.toLowerCase()],
      isPreset: true,
    });
  }
}

export interface CoordinateParseResult {
  isCoordinateAttempt: boolean;
  valid: boolean;
  lat?: number;
  lng?: number;
  error?: string;
}

/**
 * Parses coordinate strings such as:
 * - "12.8669, 74.8692"
 * - "12.8669 74.8692"
 * - "[12.8669, 74.8692]"
 * - "lat: 12.8669, lng: 74.8692"
 */
export function parseCoordinateInput(raw: string): CoordinateParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { isCoordinateAttempt: false, valid: false };
  }

  // Strip optional brackets or lat/lng labels
  const cleaned = trimmed
    .replace(/^\[|\]$/g, '')
    .replace(/\b(lat|latitude)\s*[:=]?\s*/i, '')
    .replace(/\b(lng|lon|long|longitude)\s*[:=]?\s*/i, '')
    .trim();

  // Check if it looks like two numbers separated by comma or whitespace
  const strictCoordRegex = /^([+-]?\d+(?:\.\d+)?)\s*(?:,\s*|\s+)\s*([+-]?\d+(?:\.\d+)?)$/;
  const match = cleaned.match(strictCoordRegex);

  if (match) {
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return {
        isCoordinateAttempt: true,
        valid: false,
        error: 'Coordinate values must be valid finite numbers.',
      };
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return {
        isCoordinateAttempt: true,
        valid: false,
        error: `Coordinates (${lat}, ${lng}) are outside valid geographic bounds (latitude -90..90, longitude -180..180).`,
      };
    }
    return {
      isCoordinateAttempt: true,
      valid: true,
      lat: Math.round(lat * 100000) / 100000,
      lng: Math.round(lng * 100000) / 100000,
    };
  }

  // Detect malformed coordinate attempt like "12.8669," or "12.8669, abc" or "lat: 12.86"
  if (/^[+-]?\d+\.\d+\s*,/.test(cleaned) || /^lat\s*[:=]/i.test(trimmed)) {
    return {
      isCoordinateAttempt: true,
      valid: false,
      error:
        'Malformed coordinate format. Enter latitude and longitude as "12.8669, 74.8692".',
    };
  }

  return { isCoordinateAttempt: false, valid: false };
}

/**
 * Find the closest gazetteer location to a given [lat, lng]
 */
export function findNearestGazetteerEntry(lat: number, lng: number): {
  entry: GazetteerEntry;
  distanceKm: number;
} {
  let best = GAZETTEER_LOCATIONS[0];
  let bestDist = Infinity;

  for (const entry of GAZETTEER_LOCATIONS) {
    const d = haversineDistanceKm(lat, lng, entry.lat, entry.lng);
    if (d < bestDist) {
      bestDist = d;
      best = entry;
    }
  }
  return { entry: best, distanceKm: Math.round(bestDist * 100) / 100 };
}

/**
 * Score a gazetteer entry against a normalized user query
 */
function scoreGazetteerMatch(entry: GazetteerEntry, rawQuery: string): number {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return 0;

  const nameLower = entry.name.toLowerCase();
  const roadLower = entry.roadName.toLowerCase();
  const secondaryLower = entry.secondaryLabel.toLowerCase();

  // Exact match on full name or alias
  if (nameLower === q || roadLower === q || entry.aliases.some((a) => a.toLowerCase() === q)) {
    return 100;
  }

  // Multi-token specificity check (ignoring generic stop-words when scoring specificity)
  const genericTokens = new Set([
    'nh',
    'nh-66',
    'nh66',
    'nh-75',
    'nh75',
    'sh',
    'sh-1',
    'road',
    'rd',
    'circle',
    'junction',
    'cross',
    'bypass',
    'flyover',
    'bridge',
    'highway',
    'corridor',
    'mangaluru',
    'mangalore',
    'karnataka',
    'india',
  ]);

  const queryTokens = q
    .split(/[\s,()/.-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  if (queryTokens.length === 0) return 0;

  const specificTokens = queryTokens.filter((t) => !genericTokens.has(t));
  const searchableBlob = `${nameLower} ${roadLower} ${secondaryLower} ${entry.aliases.join(' ')}`;

  // If query consists solely of generic words (e.g. "Junction", "Circle", "NH-66", "Road"), cap score at 35 (ambiguous)
  if (specificTokens.length === 0) {
    const allGenericPresent = queryTokens.every((t) => searchableBlob.includes(t));
    return allGenericPresent ? 35 : 0;
  }

  // Starts with query on name or alias
  if (nameLower.startsWith(q) || entry.aliases.some((a) => a.toLowerCase().startsWith(q))) {
    return 90;
  }

  // Contains full query string in name or alias
  if (nameLower.includes(q) || entry.aliases.some((a) => a.toLowerCase().includes(q))) {
    return 82;
  }

  if (roadLower.includes(q) || secondaryLower.includes(q)) {
    return 72;
  }

  let matchedSpecific = 0;
  let matchedTotal = 0;

  for (const tok of queryTokens) {
    if (searchableBlob.includes(tok)) {
      matchedTotal++;
      if (!genericTokens.has(tok)) {
        matchedSpecific++;
      }
    }
  }

  if (specificTokens.length > 0 && matchedSpecific === specificTokens.length) {
    return 78 + Math.min(10, matchedTotal * 2);
  }

  if (matchedSpecific > 0) {
    return 55 + Math.round((matchedSpecific / specificTokens.length) * 20);
  }

  return 0;
}

/**
 * Search locations for autocomplete suggestions
 */
export async function searchLocations(
  query: string,
  limit = 8
): Promise<LocationSuggestion[]> {
  const trimmed = query.trim();

  // If empty query, return the preset corridor destinations
  if (!trimmed) {
    return GAZETTEER_LOCATIONS.filter((g) => g.isPreset)
      .slice(0, limit)
      .map((g) => ({
        id: g.id,
        label: g.name,
        secondaryLabel: g.secondaryLabel,
        category: g.category,
        lat: g.lat,
        lng: g.lng,
        roadName: g.roadName,
        source: 'PRESET',
      }));
  }

  const suggestions: LocationSuggestion[] = [];

  // 1. Check if input is a coordinate string
  const coordParsed = parseCoordinateInput(trimmed);
  if (coordParsed.isCoordinateAttempt && coordParsed.valid && coordParsed.lat != null && coordParsed.lng != null) {
    const nearest = findNearestGazetteerEntry(coordParsed.lat, coordParsed.lng);
    const contextDesc =
      nearest.distanceKm <= 15
        ? `Near ${nearest.entry.name} (${nearest.distanceKm} km)`
        : 'Custom Geographic Coordinates';
    suggestions.push({
      id: `coord-${coordParsed.lat}-${coordParsed.lng}`,
      label: `${coordParsed.lat.toFixed(4)}, ${coordParsed.lng.toFixed(4)}`,
      secondaryLabel: contextDesc,
      category: 'COORDINATE',
      lat: coordParsed.lat,
      lng: coordParsed.lng,
      roadName: nearest.distanceKm <= 8 ? nearest.entry.roadName : 'Custom Coordinate Point',
      source: 'COORDINATE',
    });
  }

  // 2. Score against local gazetteer
  const scored = GAZETTEER_LOCATIONS.map((entry) => ({
    entry,
    score: scoreGazetteerMatch(entry, trimmed),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (Boolean(b.entry.isPreset) !== Boolean(a.entry.isPreset)) {
        return b.entry.isPreset ? 1 : -1;
      }
      return a.entry.name.localeCompare(b.entry.name);
    });

  for (const { entry } of scored.slice(0, limit)) {
    suggestions.push({
      id: entry.id,
      label: entry.name,
      secondaryLabel: entry.secondaryLabel,
      category: entry.category,
      lat: entry.lat,
      lng: entry.lng,
      roadName: entry.roadName,
      source: entry.isPreset ? 'PRESET' : 'GAZETTEER',
    });
  }

  // 3. Optional live Nominatim fallback if few local matches and not running automated tests
  if (suggestions.length < 3 && trimmed.length >= 3 && process.env.NODE_ENV !== 'test') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1600);
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&countrycodes=in&viewbox=74.5,13.6,75.4,12.6&bounded=0&q=${encodeURIComponent(
        trimmed
      )}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'RoadAlert-Enterprise-Traffic-Intelligence/1.0',
          Accept: 'application/json',
        },
      });
      clearTimeout(timeout);
      if (res.ok) {
        const items = (await res.json()) as any[];
        if (Array.isArray(items)) {
          for (const item of items) {
            const lat = Number(item.lat);
            const lng = Number(item.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            const displayParts = String(item.display_name || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            const primary = displayParts.slice(0, 2).join(', ') || trimmed;
            const secondary = displayParts.slice(2, 5).join(', ') || 'OpenStreetMap Location';
            const duplicate = suggestions.some(
              (s) => haversineDistanceKm(s.lat, s.lng, lat, lng) < 0.35
            );
            if (!duplicate && suggestions.length < limit) {
              suggestions.push({
                id: `osm-${item.place_id || `${lat}-${lng}`}`,
                label: primary,
                secondaryLabel: secondary,
                category: 'GEOCODER',
                lat: Math.round(lat * 100000) / 100000,
                lng: Math.round(lng * 100000) / 100000,
                roadName: primary,
                source: 'NOMINATIM',
              });
            }
          }
        }
      }
    } catch {
      // Safe fallback to local gazetteer suggestions when offline or timed out
    }
  }

  return suggestions.slice(0, limit);
}

/**
 * Reverse geocode coordinates (from "Pick on Map") into a clean human-readable location label
 */
export async function reverseGeocodeLocation(
  lat: number,
  lng: number
): Promise<{
  label: string;
  secondaryLabel: string;
  lat: number;
  lng: number;
  roadName: string;
  source: 'GAZETTEER_EXACT' | 'GAZETTEER_NEARBY' | 'NOMINATIM' | 'COORDINATE_FALLBACK';
}> {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new ApiError(
      400,
      'INVALID_COORDINATES',
      'Latitude must be between -90 and 90 and longitude between -180 and 180.'
    );
  }

  const roundedLat = Math.round(lat * 100000) / 100000;
  const roundedLng = Math.round(lng * 100000) / 100000;
  const nearest = findNearestGazetteerEntry(roundedLat, roundedLng);

  // Within 450m of a known corridor landmark/junction -> use exact landmark
  if (nearest.distanceKm <= 0.45) {
    return {
      label: nearest.entry.name,
      secondaryLabel: `${nearest.entry.roadName} (${roundedLat.toFixed(4)}, ${roundedLng.toFixed(4)})`,
      lat: roundedLat,
      lng: roundedLng,
      roadName: nearest.entry.roadName,
      source: 'GAZETTEER_EXACT',
    };
  }

  // Try live Nominatim reverse geocoding when not in test environment
  if (process.env.NODE_ENV !== 'test') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1600);
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${roundedLat}&lon=${roundedLng}&zoom=16`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'RoadAlert-Enterprise-Traffic-Intelligence/1.0',
          Accept: 'application/json',
        },
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = (await res.json()) as any;
        if (data && data.address) {
          const addr = data.address;
          const placePart =
            addr.road ||
            addr.junction ||
            addr.neighbourhood ||
            addr.suburb ||
            addr.village ||
            addr.town ||
            addr.city_district ||
            data.name;
          const areaPart =
            addr.suburb || addr.town || addr.city || addr.county || addr.state_district || 'Coastal Karnataka';
          if (placePart) {
            const label =
              placePart !== areaPart ? `${placePart}, ${areaPart}` : `${placePart} (${roundedLat.toFixed(4)}, ${roundedLng.toFixed(4)})`;
            return {
              label,
              secondaryLabel: `Map Point (${roundedLat.toFixed(4)}, ${roundedLng.toFixed(4)})`,
              lat: roundedLat,
              lng: roundedLng,
              roadName: String(addr.road || placePart),
              source: 'NOMINATIM',
            };
          }
        }
      }
    } catch {
      // Fall back to local gazetteer proximity or coordinate string
    }
  }

  if (nearest.distanceKm <= 4.5) {
    const shortLandmark = nearest.entry.name.replace(/\s*\([^)]*\)\s*$/, '');
    return {
      label: `Near ${shortLandmark} (${roundedLat.toFixed(4)}, ${roundedLng.toFixed(4)})`,
      secondaryLabel: `${nearest.distanceKm} km from ${nearest.entry.roadName}`,
      lat: roundedLat,
      lng: roundedLng,
      roadName: nearest.entry.roadName,
      source: 'GAZETTEER_NEARBY',
    };
  }

  return {
    label: `Map Point (${roundedLat.toFixed(4)}, ${roundedLng.toFixed(4)})`,
    secondaryLabel: `Coordinates ${roundedLat.toFixed(4)}°N, ${roundedLng.toFixed(4)}°E`,
    lat: roundedLat,
    lng: roundedLng,
    roadName: `Corridor Point (${roundedLat.toFixed(4)}, ${roundedLng.toFixed(4)})`,
    source: 'COORDINATE_FALLBACK',
  };
}

export interface ResolvedRouteEndpoint {
  label: string;
  inputText: string;
  lat: number;
  lng: number;
  roadName: string;
  source: 'PRESET' | 'GAZETTEER' | 'COORDINATE' | 'MAP_PIN' | 'NOMINATIM';
}

/**
 * Resolves an Origin or Destination input (from dropdown, manual text, coordinate string, or map pick)
 * into verified coordinates. Rejects invalid, malformed, ambiguous, or unrecognized locations instead
 * of silently defaulting to Pumpwell or Udupi.
 */
export async function resolveRouteEndpoint(
  input: {
    text: string;
    lat?: number;
    lng?: number;
  },
  fieldRole: 'origin' | 'destination'
): Promise<ResolvedRouteEndpoint> {
  const roleLabel = fieldRole === 'origin' ? 'Origin' : 'Destination';
  const trimmedText = (input.text || '').trim();

  if (!trimmedText || trimmedText.length < 2) {
    throw new ApiError(
      400,
      'INVALID_LOCATION_INPUT',
      `${roleLabel} location cannot be empty. Please select a location, enter a valid place or coordinate, or pick a point on the map.`
    );
  }

  // Case 1: Explicit coordinates were passed alongside the text (e.g. from Pick on Map or selected suggestion)
  if (input.lat !== undefined && input.lng !== undefined) {
    const lat = Number(input.lat);
    const lng = Number(input.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new ApiError(
        400,
        'INVALID_COORDINATES',
        `${roleLabel} coordinates (${input.lat}, ${input.lng}) are out of valid geographic bounds.`
      );
    }

    // Check if the user also typed a coordinate string that is malformed
    const coordCheck = parseCoordinateInput(trimmedText);
    if (coordCheck.isCoordinateAttempt && !coordCheck.valid) {
      throw new ApiError(400, 'INVALID_COORDINATES', `${roleLabel}: ${coordCheck.error}`);
    }

    const nearest = findNearestGazetteerEntry(lat, lng);
    const matchedGazetteer = GAZETTEER_LOCATIONS.find(
      (g) =>
        g.name.toLowerCase() === trimmedText.toLowerCase() &&
        haversineDistanceKm(lat, lng, g.lat, g.lng) < 1.0
    );

    return {
      label: matchedGazetteer ? matchedGazetteer.name : trimmedText,
      inputText: trimmedText,
      lat: Math.round(lat * 100000) / 100000,
      lng: Math.round(lng * 100000) / 100000,
      roadName: matchedGazetteer
        ? matchedGazetteer.roadName
        : nearest.distanceKm <= 3
        ? nearest.entry.roadName
        : trimmedText,
      source: matchedGazetteer
        ? matchedGazetteer.isPreset
          ? 'PRESET'
          : 'GAZETTEER'
        : coordCheck.valid
        ? 'COORDINATE'
        : 'MAP_PIN',
    };
  }

  // Case 2: User entered a coordinate string directly in the text field
  const coordParsed = parseCoordinateInput(trimmedText);
  if (coordParsed.isCoordinateAttempt) {
    if (!coordParsed.valid || coordParsed.lat == null || coordParsed.lng == null) {
      throw new ApiError(
        400,
        'INVALID_COORDINATES',
        `${roleLabel}: ${coordParsed.error || 'Invalid coordinate format.'}`
      );
    }
    const nearest = findNearestGazetteerEntry(coordParsed.lat, coordParsed.lng);
    const label =
      nearest.distanceKm <= 0.45
        ? `${nearest.entry.name} (${coordParsed.lat.toFixed(4)}, ${coordParsed.lng.toFixed(4)})`
        : nearest.distanceKm <= 4.5
        ? `Near ${nearest.entry.name.replace(/\s*\([^)]*\)\s*$/, '')} (${coordParsed.lat.toFixed(4)}, ${coordParsed.lng.toFixed(4)})`
        : `Coordinates (${coordParsed.lat.toFixed(4)}, ${coordParsed.lng.toFixed(4)})`;

    return {
      label,
      inputText: trimmedText,
      lat: coordParsed.lat,
      lng: coordParsed.lng,
      roadName:
        nearest.distanceKm <= 4.5
          ? nearest.entry.roadName
          : `Coordinate (${coordParsed.lat.toFixed(4)}, ${coordParsed.lng.toFixed(4)})`,
      source: 'COORDINATE',
    };
  }

  // Case 3: Match against Gazetteer & Presets
  const scored = GAZETTEER_LOCATIONS.map((entry) => ({
    entry,
    score: scoreGazetteerMatch(entry, trimmedText),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    const top = scored[0];

    // If only generic tokens matched (score <= 40) and multiple distinct locations tie, flag as ambiguous
    if (top.score <= 40 && scored.length > 1) {
      const candidateNames = scored.slice(0, 4).map((s) => s.entry.name);
      throw new ApiError(
        400,
        'AMBIGUOUS_LOCATION',
        `${roleLabel} "${trimmedText}" matches multiple locations. Please be more specific (e.g., ${candidateNames
          .slice(0, 2)
          .join(' or ')}).`,
        { suggestions: candidateNames }
      );
    }

    return {
      label: top.entry.name,
      inputText: trimmedText,
      lat: top.entry.lat,
      lng: top.entry.lng,
      roadName: top.entry.roadName,
      source: top.entry.isPreset ? 'PRESET' : 'GAZETTEER',
    };
  }

  // Case 4: Optional live Nominatim resolution when online (non-test)
  if (process.env.NODE_ENV !== 'test') {
    const liveSuggestions = await searchLocations(trimmedText, 3);
    if (liveSuggestions.length > 0) {
      const best = liveSuggestions[0];
      return {
        label: best.label,
        inputText: trimmedText,
        lat: best.lat,
        lng: best.lng,
        roadName: best.roadName,
        source: best.source === 'NOMINATIM' ? 'NOMINATIM' : 'GAZETTEER',
      };
    }
  }

  // Unrecognized location — never silently route from a wrong default!
  throw new ApiError(
    400,
    'UNRECOGNIZED_LOCATION',
    `Could not recognize ${roleLabel.toLowerCase()} "${trimmedText}". Choose a suggested landmark, enter valid "lat, lng" coordinates, or click "Pick on Map".`
  );
}
