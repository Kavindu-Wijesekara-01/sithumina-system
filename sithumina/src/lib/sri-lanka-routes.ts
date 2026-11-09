/**
 * Sri Lanka Geographic Corridors & Road Route Utilities
 * Resolves city coordinates and computes clean road polylines for single-lorry route tracking.
 */

export interface CityCoord {
  name: string;
  lat: number;
  lng: number;
  aliases: string[];
}

export const SRI_LANKA_CITIES: Record<string, [number, number]> = {
  // Western Province
  colombo: [6.9271, 79.8612],
  kolomba: [6.9271, 79.8612],
  colomboport: [6.9450, 79.8490],
  port: [6.9450, 79.8490],
  fort: [6.9344, 79.8428],
  pettah: [6.9367, 79.8531],
  maradana: [6.9279, 79.8655],
  borella: [6.9147, 79.8778],
  narahenpita: [6.8920, 79.8820],
  dematagoda: [6.9333, 79.8817],
  grandpass: [6.9500, 79.8700],
  peliyagoda: [6.9680, 79.8885],
  kelaniya: [6.9538, 79.9189],
  wattala: [6.9899, 79.8927],
  jaela: [7.0761, 79.8916],
  kandana: [7.0468, 79.8950],
  ragama: [7.0270, 79.9240],
  kadawatha: [7.0016, 79.9525],
  kiribathgoda: [6.9806, 79.9292],
  gampaha: [7.0840, 79.9943],
  nittambuwa: [7.1439, 80.0964],
  veeyangoda: [7.1558, 80.0578],
  mirigama: [7.2439, 80.1294],
  katunayake: [7.1695, 79.8884],
  negombo: [7.2008, 79.8736],
  negambo: [7.2008, 79.8736],
  necombo: [7.2008, 79.8736],
  meegamuwa: [7.2008, 79.8736],
  kochchikade: [7.2667, 79.8667],
  divulapitiya: [7.2167, 80.0167],
  minuwangoda: [7.1667, 79.9500],
  kaduwela: [6.9344, 79.9839],
  malabe: [6.9042, 79.9547],
  battaramulla: [6.8994, 79.9222],
  srijayawardenepura: [6.8944, 79.9025],
  kotte: [6.8944, 79.9025],
  nugegoda: [6.8649, 79.8997],
  maharagama: [6.8480, 79.9265],
  kottawa: [6.8414, 79.9654],
  homagama: [6.8428, 80.0033],
  padukka: [6.8475, 80.1039],
  hanwella: [6.9000, 80.0833],
  avissawella: [6.9535, 80.2104],
  dehiwala: [6.8511, 79.8653],
  mountlavinia: [6.8383, 79.8644],
  ratmalana: [6.8206, 79.8864],
  moratuwa: [6.7730, 79.8816],
  panadura: [6.7130, 79.9074],
  wadduwa: [6.6667, 79.9333],
  bandaragama: [6.7140, 79.9890],
  gelanigama: [6.6850, 80.0200],
  kahathuduwa: [6.7860, 79.9920],
  kesbewa: [6.7900, 79.9400],
  piliyandala: [6.8018, 79.9227],
  dodangoda: [6.5667, 80.0833],
  kalutara: [6.5854, 79.9607],
  kaluthara: [6.5854, 79.9607],
  beruwala: [6.4788, 79.9828],
  aluthgama: [6.4294, 80.0031],
  bentota: [6.4261, 79.9967],
  mathugama: [6.5233, 80.1147],
  matugama: [6.5233, 80.1147],
  horana: [6.7167, 80.0667],
  ingiriya: [6.7500, 80.1667],

  // Southern Province
  kalugalahena: [6.3410, 80.5695],
  kalugala: [6.3410, 80.5695],
  deniyaya: [6.3409, 80.5595],
  akuressa: [6.0989, 80.4736],
  kamburupitiya: [6.0833, 80.5667],
  hakmana: [6.0833, 80.6500],
  urubokka: [6.3000, 80.6167],
  morawaka: [6.2667, 80.4833],
  kotapola: [6.2833, 80.5333],
  ambalangoda: [6.2359, 80.0541],
  balapitiya: [6.2667, 80.0333],
  elpitiya: [6.2667, 80.1833],
  baddegama: [6.1833, 80.1833],
  hikkaduwa: [6.1395, 80.1063],
  galle: [6.0535, 80.2210],
  gaalle: [6.0535, 80.2210],
  galla: [6.0535, 80.2210],
  karapitiya: [6.0667, 80.2333],
  unawatuna: [6.0100, 80.2500],
  habaraduwa: [5.9989, 80.3089],
  ahangarama: [5.9750, 80.3667],
  midigama: [5.9667, 80.4000],
  weligama: [5.9734, 80.4289],
  mirissa: [5.9483, 80.4583],
  matara: [5.9549, 80.5550],
  mathara: [5.9549, 80.5550],
  dikwella: [5.9667, 80.7000],
  dickwella: [5.9667, 80.7000],
  tangalle: [6.0243, 80.7941],
  beliatta: [6.0469, 80.7225],
  ambalantota: [6.1242, 81.0267],
  hambantota: [6.1429, 81.1212],
  tissamaharama: [6.2800, 81.2858],
  kataragama: [6.4137, 81.3325],
  kirinda: [6.2167, 81.3333],

  // Sabaragamuwa Province
  ratnapura: [6.6828, 80.4037],
  rathnapura: [6.6828, 80.4037],
  pelmadulla: [6.6231, 80.5486],
  kahawatta: [6.5778, 80.5750],
  kuruwita: [6.7667, 80.3667],
  ehaliyagoda: [6.8500, 80.2667],
  balangoda: [6.6500, 80.7000],
  godakawela: [6.5167, 80.6333],
  embilipitiya: [6.3429, 80.8494],
  kegalle: [7.2513, 80.3464],
  mawanella: [7.2526, 80.4468],
  warakapola: [7.2255, 80.1983],
  rambukkana: [7.3167, 80.4000],

  // Central Province
  kandy: [7.2906, 80.6337],
  nuwara: [7.2906, 80.6337],
  mahanuwara: [7.2906, 80.6337],
  peradeniya: [7.2608, 80.5976],
  katugastota: [7.3167, 80.6167],
  kadugannawa: [7.2562, 80.5218],
  gampola: [7.1644, 80.5694],
  nawalapitiya: [7.0489, 80.5333],
  hatton: [6.8917, 80.5967],
  talawakele: [6.9372, 80.6578],
  nuwaraeliya: [6.9497, 80.7891],
  matale: [7.4675, 80.6234],
  dambulla: [7.8742, 80.6511],
  galewela: [7.7500, 80.5667],
  sigiriya: [7.9570, 80.7603],

  // North Western & North Central & Other
  kurunegala: [7.4863, 80.3623],
  kurunagala: [7.4863, 80.3623],
  kuliyapitiya: [7.4689, 80.0400],
  narammala: [7.4333, 80.2167],
  alawwa: [7.3000, 80.2333],
  wariyapola: [7.6167, 80.2667],
  nikaweratiya: [7.7500, 80.1167],
  chilaw: [7.5758, 79.7953],
  puttalam: [8.0362, 79.8283],
  anuradhapura: [8.3114, 80.4037],
  anuradhapure: [8.3114, 80.4037],
  polonnaruwa: [7.9403, 81.0188],
  habarana: [8.0336, 80.7516],
  kekirawa: [8.0333, 80.5833],
  vavuniya: [8.7514, 80.4971],
  kilinochchi: [9.3803, 80.3770],
  mannar: [8.9814, 79.9042],
  mullaitivu: [9.2671, 80.8142],
  jaffna: [9.6615, 80.0255],
  badulla: [6.9934, 81.0550],
  bandarawela: [6.8259, 80.9982],
  ella: [6.8667, 81.0467],
  haputale: [6.7667, 80.9500],
  monaragala: [6.8722, 81.3506],
  wellawaya: [6.7333, 81.1000],
  trincomalee: [8.5874, 81.2152],
  trinco: [8.5874, 81.2152],
  batticaloa: [7.7310, 81.6747],
  ampara: [7.2833, 81.6667],
  kalmunai: [7.4167, 81.8167],
};

export const SINHALA_CITIES: Record<string, [number, number]> = {
  // Western Province
  "කොළඹ": [6.9271, 79.8612],
  "කොටුව": [6.9344, 79.8428],
  "පිටකොටුව": [6.9367, 79.8531],
  "මරදාන": [6.9279, 79.8655],
  "බොරැල්ල": [6.9147, 79.8778],
  "දෙමටගොඩ": [6.9333, 79.8817],
  "පෑලියගොඩ": [6.9680, 79.8885],
  "පැළියගොඩ": [6.9680, 79.8885],
  "කැලණිය": [6.9538, 79.9189],
  "වත්තල": [6.9899, 79.8927],
  "ජාඇල": [7.0761, 79.8916],
  "කඳාන": [7.0468, 79.8950],
  "රාගම": [7.0270, 79.9240],
  "කඩවත": [7.0016, 79.9525],
  "කිරිබත්ගොඩ": [6.9806, 79.9292],
  "ගම්පහ": [7.0840, 79.9943],
  "නිට්ටඹුව": [7.1439, 80.0964],
  "වේයන්ගොඩ": [7.1558, 80.0578],
  "මීරිගම": [7.2439, 80.1294],
  "කටුනායක": [7.1695, 79.8884],
  "මීගමුව": [7.2008, 79.8736],
  "කොච්චිකඩේ": [7.2667, 79.8667],
  "මිනුවන්ගොඩ": [7.1667, 79.9500],
  "දිවුලපිටිය": [7.2167, 80.0167],
  "කඩුවෙල": [6.9344, 79.9839],
  "මාලඹේ": [6.9042, 79.9547],
  "බත්තරමුල්ල": [6.8994, 79.9222],
  "නුගේගොඩ": [6.8649, 79.8997],
  "මහරගම": [6.8480, 79.9265],
  "කොට්ටාව": [6.8414, 79.9654],
  "හෝමාගම": [6.8428, 80.0033],
  "පාදුක්ක": [6.8475, 80.1039],
  "හංවැල්ල": [6.9000, 80.0833],
  "අවිස්සාවේල්ල": [6.9535, 80.2104],
  "දෙහිවල": [6.8511, 79.8653],
  "ගල්කිස්ස": [6.8383, 79.8644],
  "රත්මලාන": [6.8206, 79.8864],
  "මොරටුව": [6.7730, 79.8816],
  "පානදුර": [6.7130, 79.9074],
  "වාද්දුව": [6.6667, 79.9333],
  "බණ්ඩාරගම": [6.7140, 79.9890],
  "ගෙලනිගම": [6.6850, 80.0200],
  "කහතුඩුව": [6.7860, 79.9920],
  "කැස්බෑව": [6.7900, 79.9400],
  "පිළියන්දල": [6.8018, 79.9227],
  "දොඩංගොඩ": [6.5667, 80.0833],
  "කළුතර": [6.5854, 79.9607],
  "කලුතර": [6.5854, 79.9607],
  "බේරුවල": [6.4788, 79.9828],
  "අලුත්ගම": [6.4294, 80.0031],
  "බෙන්තොට": [6.4261, 79.9967],
  "මතුගම": [6.5233, 80.1147],
  "හොරණ": [6.7167, 80.0667],
  "ඉංගිරිය": [6.7500, 80.1667],

  // Southern Province
  "කළුගලහේන": [6.3410, 80.5695],
  "කලුගලහේන": [6.3410, 80.5695],
  "කළුගල": [6.3410, 80.5695],
  "කලුගල": [6.3410, 80.5695],
  "දෙණියාය": [6.3409, 80.5595],
  "දෙනියාය": [6.3409, 80.5595],
  "අකුරැස්ස": [6.0989, 80.4736],
  "කඹුරුපිටිය": [6.0833, 80.5667],
  "හක්මන": [6.0833, 80.6500],
  "ඌරුබොක්ක": [6.3000, 80.6167],
  "මොරවක": [6.2667, 80.4833],
  "කොටපොළ": [6.2833, 80.5333],
  "අම්බලන්ගොඩ": [6.2359, 80.0541],
  "බලපිටිය": [6.2667, 80.0333],
  "ඇල්පිටිය": [6.2667, 80.1833],
  "බද්දේගම": [6.1833, 80.1833],
  "හික්කඩුව": [6.1395, 80.1063],
  "ගාල්ල": [6.0535, 80.2210],
  "කරාපිටිය": [6.0667, 80.2333],
  "උණවටුන": [6.0100, 80.2500],
  "හබරාදුව": [5.9989, 80.3089],
  "අහංගම": [5.9750, 80.3667],
  "මිදිගම": [5.9667, 80.4000],
  "වැලිගම": [5.9734, 80.4289],
  "මිරිස්ස": [5.9483, 80.4583],
  "මාතර": [5.9549, 80.5550],
  "දික්වැල්ල": [5.9667, 80.7000],
  "තංගල්ල": [6.0243, 80.7941],
  "බෙලිඅත්ත": [6.0469, 80.7225],
  "අම්බලන්තොට": [6.1242, 81.0267],
  "හම්බන්තොට": [6.1429, 81.1212],
  "තිස්සමහාරාමය": [6.2800, 81.2858],
  "කතරගම": [6.4137, 81.3325],

  // Sabaragamuwa Province
  "රත්නපුර": [6.6828, 80.4037],
  "පැල්මඩුල්ල": [6.6231, 80.5486],
  "කහවත්ත": [6.5778, 80.5750],
  "කුරුවිට": [6.7667, 80.3667],
  "ඇහැළියගොඩ": [6.8500, 80.2667],
  "බලන්ගොඩ": [6.6500, 80.7000],
  "ගොඩකවෙල": [6.5167, 80.6333],
  "ඇඹිලිපිටිය": [6.3429, 80.8494],
  "කෑගල්ල": [7.2513, 80.3464],
  "මාවනැල්ල": [7.2526, 80.4468],
  "වරකාපොළ": [7.2255, 80.1983],
  "රඹුක්කන": [7.3167, 80.4000],

  // Central Province
  "මහනුවර": [7.2906, 80.6337],
  "නුවර": [7.2906, 80.6337],
  "පේරාදෙණිය": [7.2608, 80.5976],
  "කටුගස්තොට": [7.3167, 80.6167],
  "කඩුගන්නාව": [7.2562, 80.5218],
  "ගම්පොළ": [7.1644, 80.5694],
  "නාවලපිටිය": [7.0489, 80.5333],
  "හැටන්": [6.8917, 80.5967],
  "තලවකැලේ": [6.9372, 80.6578],
  "නුවරඑළිය": [6.9497, 80.7891],
  "මාතලේ": [7.4675, 80.6234],
  "දඹුල්ල": [7.8742, 80.6511],
  "ගලේවෙල": [7.7500, 80.5667],
  "සීගිරිය": [7.9570, 80.7603],

  // North Western & North Central & Other
  "කුරුණෑගල": [7.4863, 80.3623],
  "කුලියාපිටිය": [7.4689, 80.0400],
  "නාරම්මල": [7.4333, 80.2167],
  "අලව්ව": [7.3000, 80.2333],
  "වාරියපොළ": [7.6167, 80.2667],
  "නිකවැරටිය": [7.7500, 80.1167],
  "හලාවත": [7.5758, 79.7953],
  "පුත්තලම": [8.0362, 79.8283],
  "අනුරාධපුරය": [8.3114, 80.4037],
  "අනුරාධපුර": [8.3114, 80.4037],
  "පොළොන්නරුව": [7.9403, 81.0188],
  "හබරණ": [8.0336, 80.7516],
  "කැකිරාව": [8.0333, 80.5833],
  "වවුනියාව": [8.7514, 80.4971],
  "කිලිනොච්චිය": [9.3803, 80.3770],
  "මන්නාරම": [8.9814, 79.9042],
  "මුලතිව්": [9.2671, 80.8142],
  "යාපනය": [9.6615, 80.0255],
  "බදුල්ල": [6.9934, 81.0550],
  "බණ්ඩාරවෙල": [6.8259, 80.9982],
  "ඇල්ල": [6.8667, 81.0467],
  "හපුතලේ": [6.7667, 80.9500],
  "මොනරාගල": [6.8722, 81.3506],
  "වැල්ලවාය": [6.7333, 81.1000],
  "ත්‍රිකුණාමලය": [8.5874, 81.2152],
  "මඩකලපුව": [7.7310, 81.6747],
  "අම්පාර": [7.2833, 81.6667],
  "කල්මුණේ": [7.4167, 81.8167],
};

/**
 * Validate that a coordinate array is strictly valid and finite
 */
export function isValidCoord(c: unknown): c is [number, number] {
  if (!c || !Array.isArray(c) || c.length < 2) return false;
  const lat = Number(c[0]);
  const lng = Number(c[1]);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    lat >= 5.0 &&
    lat <= 10.5 &&
    lng >= 79.0 &&
    lng <= 82.5
  );
}

/**
 * Sanitize a coordinate, guaranteeing fallback if invalid
 */
export function sanitizeCoord(
  c: unknown,
  fallback: [number, number] = [6.9271, 79.8612]
): [number, number] {
  if (isValidCoord(c)) {
    return [Number(c[0]), Number(c[1])];
  }
  return fallback;
}

/**
 * Resolve city coordinates from free-form text entered by driver or user.
 * Supports Sinhala text, common English spelling variations, and ignores road/noise words.
 */
export function resolveLocationCoordinates(text?: string | null): [number, number] | null {
  if (!text || typeof text !== "string") return null;

  const rawTrimmed = text.trim();
  if (!rawTrimmed) return null;

  // 1. Direct Sinhala match
  for (const [sinName, coords] of Object.entries(SINHALA_CITIES)) {
    if (rawTrimmed.includes(sinName)) {
      return coords;
    }
  }

  // 1b. Sinhala normalization (ළ/ල, ණ/න, ශ/ෂ/ස)
  const sinNorm = rawTrimmed.replace(/ළ/g, "ල").replace(/ණ/g, "න").replace(/[ශෂ]/g, "ස");
  for (const [sinName, coords] of Object.entries(SINHALA_CITIES)) {
    const targetSinNorm = sinName.replace(/ළ/g, "ල").replace(/ණ/g, "න").replace(/[ශෂ]/g, "ස");
    if (sinNorm.includes(targetSinNorm) || targetSinNorm.includes(sinNorm)) {
      return coords;
    }
  }

  // 2. English text: strip road/transport noise words
  const rawLower = rawTrimmed.toLowerCase();
  const strippedNoise = rawLower
    .replace(/\b(road|rd|highway|expressway|street|st|lane|junction|junc|jn|town|city|hub|port|harbor|harbour|fort|park|station|village|estate)\b/gi, "")
    .trim();

  const clean = strippedNoise.replace(/[^a-z0-9]/g, "");
  if (clean && SRI_LANKA_CITIES[clean]) {
    return SRI_LANKA_CITIES[clean];
  }

  // 2b. Phonetic transliteration normalization (th -> t, ee -> i, oo -> u, aa -> a, etc.)
  const cleanPhonetic = clean
    .replace(/th/g, "t")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/aa/g, "a")
    .replace(/tt/g, "t")
    .replace(/dd/g, "d")
    .replace(/ll/g, "l");
  if (cleanPhonetic && SRI_LANKA_CITIES[cleanPhonetic]) {
    return SRI_LANKA_CITIES[cleanPhonetic];
  }

  // 3. Check without stripping noise words
  const rawClean = rawLower.replace(/[^a-z0-9]/g, "");
  if (rawClean && SRI_LANKA_CITIES[rawClean]) {
    return SRI_LANKA_CITIES[rawClean];
  }
  const rawCleanPhonetic = rawClean
    .replace(/th/g, "t")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/aa/g, "a")
    .replace(/tt/g, "t")
    .replace(/dd/g, "d")
    .replace(/ll/g, "l");
  if (rawCleanPhonetic && SRI_LANKA_CITIES[rawCleanPhonetic]) {
    return SRI_LANKA_CITIES[rawCleanPhonetic];
  }

  // 4. Word-boundary and prefix matching against all known Sri Lankan cities (longest first)
  const targetVariants = [clean, cleanPhonetic, rawClean, rawCleanPhonetic].filter((s) => s && s.length >= 3);
  const keys = Object.keys(SRI_LANKA_CITIES).sort((a, b) => b.length - a.length);

  // 4a. Exact or prefix match
  for (const v of targetVariants) {
    for (const key of keys) {
      const keyPhonetic = key
        .replace(/th/g, "t")
        .replace(/ee/g, "i")
        .replace(/oo/g, "u")
        .replace(/aa/g, "a")
        .replace(/tt/g, "t")
        .replace(/dd/g, "d")
        .replace(/ll/g, "l");

      if (v === key || v === keyPhonetic) {
        return SRI_LANKA_CITIES[key];
      }
      if (v.startsWith(key) || v.startsWith(keyPhonetic)) {
        return SRI_LANKA_CITIES[key];
      }
    }
  }

  // 4b. Substring match (only if input contains the city name and city name is substantial)
  for (const v of targetVariants) {
    for (const key of keys) {
      if (key.length < 4) continue;
      const keyPhonetic = key
        .replace(/th/g, "t")
        .replace(/ee/g, "i")
        .replace(/oo/g, "u")
        .replace(/aa/g, "a")
        .replace(/tt/g, "t")
        .replace(/dd/g, "d")
        .replace(/ll/g, "l");

      // e.g. "near bandaragama clock tower" contains "bandaragama"
      if (v.includes(key) && key.length >= Math.min(v.length * 0.6, 6)) {
        return SRI_LANKA_CITIES[key];
      }
      if (v.includes(keyPhonetic) && keyPhonetic.length >= Math.min(v.length * 0.6, 6)) {
        return SRI_LANKA_CITIES[key];
      }
    }
  }

  return null;
}

/**
 * Extract via town waypoints from travel route text or return route text.
 * Splits by commas, hyphens, slashes, "via", "through", "to", "හරහා", etc. and resolves each city coordinate.
 */
export function extractViaWaypoints(
  travelRouteText?: string | null,
  returnRouteText?: string | null,
  startCoord?: [number, number] | null,
  endCoord?: [number, number] | null
): Array<{ name: string; lat: number; lng: number }> {
  const text = [travelRouteText, returnRouteText].filter(Boolean).join(" ");
  if (!text.trim()) return [];

  const tokens = text.split(/[,;\-\/→]|(?:\bvia\b)|(?:\bthrough\b)|(?:\bto\b)|(?:හරහා)/i);
  const result: Array<{ name: string; lat: number; lng: number }> = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const raw = token.trim();
    if (!raw || raw.length < 3) continue;

    const coords = resolveLocationCoordinates(raw);
    if (!coords || !isValidCoord(coords)) continue;

    const key = `${coords[0].toFixed(3)},${coords[1].toFixed(3)}`;
    if (seen.has(key)) continue;

    // Filter out if virtually identical to startCoord or endCoord
    if (startCoord && isValidCoord(startCoord)) {
      if (Math.abs(startCoord[0] - coords[0]) < 0.02 && Math.abs(startCoord[1] - coords[1]) < 0.02) {
        continue;
      }
    }
    if (endCoord && isValidCoord(endCoord)) {
      if (Math.abs(endCoord[0] - coords[0]) < 0.02 && Math.abs(endCoord[1] - coords[1]) < 0.02) {
        continue;
      }
    }

    seen.add(key);
    result.push({
      name: raw,
      lat: coords[0],
      lng: coords[1],
    });
  }

  return result;
}

/**
 * Generate interpolated road waypoints between two points
 * Adds subtle curvature to mimic realistic Sri Lankan highway curvature
 */
function interpolatePoints(
  from: [number, number],
  to: [number, number],
  steps: number = 3
): [number, number][] {
  const [lat1, lng1] = sanitizeCoord(from);
  const [lat2, lng2] = sanitizeCoord(to);
  const result: [number, number][] = [];

  for (let i = 1; i < steps; i++) {
    const fraction = i / steps;
    const midLat = lat1 + (lat2 - lat1) * fraction;
    const midLng = lng1 + (lng2 - lng1) * fraction;
    if (Number.isFinite(midLat) && Number.isFinite(midLng)) {
      result.push([Number(midLat.toFixed(5)), Number(midLng.toFixed(5))]);
    }
  }

  return result;
}

/**
 * Sri Lankan Major Highway & Expressway Corridor Waypoints
 * Provides realistic road waypoints between regions so routes never draw a straight line cutting through mountains.
 */
export function getCorridorWaypoints(
  from: [number, number],
  to: [number, number]
): [number, number][] {
  const [lat1, lng1] = from;
  const [lat2, lng2] = to;

  // 1. Southern Hills (Deniyaya, Morawaka, Kalugalahena) <-> Western Province (Panadura, Kalutara, Bandaragama, Colombo)
  const isSouthHills1 = lat1 >= 6.10 && lat1 <= 6.50 && lng1 >= 80.40 && lng1 <= 80.75;
  const isWest1 = lat1 >= 6.50 && lat1 <= 7.25 && lng1 >= 79.75 && lng1 <= 80.15;
  const isSouthHills2 = lat2 >= 6.10 && lat2 <= 6.50 && lng2 >= 80.40 && lng2 <= 80.75;
  const isWest2 = lat2 >= 6.50 && lat2 <= 7.25 && lng2 >= 79.75 && lng2 <= 80.15;

  if (isSouthHills1 && isWest2) {
    return [
      [6.2667, 80.4833], // Morawaka
      [6.0989, 80.4736], // Akuressa
      [6.0400, 80.4100], // Kokmaduwa / Southern Expressway Entry
      [6.1833, 80.1833], // Baddegama / Southern Expressway
      [6.2550, 80.1450], // Kurundugahahetekma
      [6.5233, 80.1147], // Dodangoda / Matugama
      [6.6850, 80.0200], // Gelanigama / Bandaragama exit
      [6.7140, 79.9890], // Bandaragama
      [6.7130, 79.9074], // Panadura
    ];
  }
  if (isWest1 && isSouthHills2) {
    return [
      [6.7130, 79.9074], // Panadura
      [6.7140, 79.9890], // Bandaragama
      [6.6850, 80.0200], // Gelanigama / Bandaragama exit
      [6.5233, 80.1147], // Dodangoda / Matugama
      [6.2550, 80.1450], // Kurundugahahetekma
      [6.1833, 80.1833], // Baddegama / Southern Expressway
      [6.0400, 80.4100], // Kokmaduwa / Southern Expressway Exit
      [6.0989, 80.4736], // Akuressa
      [6.2667, 80.4833], // Morawaka
    ];
  }

  // 2. South Coast (Matara, Galle, Weligama) <-> Colombo / Western Coast
  const isSouthCoast1 = lat1 >= 5.90 && lat1 <= 6.15 && lng1 >= 80.15 && lng1 <= 80.70;
  const isSouthCoast2 = lat2 >= 5.90 && lat2 <= 6.15 && lng2 >= 80.15 && lng2 <= 80.70;

  if (isSouthCoast1 && isWest2) {
    return [
      [6.0535, 80.2210], // Galle
      [6.1833, 80.1833], // Baddegama / E01
      [6.2550, 80.1450], // Kurundugahahetekma
      [6.5233, 80.1147], // Dodangoda
      [6.6850, 80.0200], // Gelanigama
      [6.7130, 79.9074], // Panadura
    ];
  }
  if (isWest1 && isSouthCoast2) {
    return [
      [6.7130, 79.9074], // Panadura
      [6.6850, 80.0200], // Gelanigama
      [6.5233, 80.1147], // Dodangoda
      [6.2550, 80.1450], // Kurundugahahetekma
      [6.1833, 80.1833], // Baddegama / E01
      [6.0535, 80.2210], // Galle
    ];
  }

  // 3. Central (Kandy) <-> Colombo
  const isKandy1 = lat1 >= 7.20 && lat1 <= 7.35 && lng1 >= 80.55 && lng1 <= 80.75;
  const isColombo2 = lat2 >= 6.85 && lat2 <= 7.10 && lng2 >= 79.80 && lng2 <= 80.00;
  const isColombo1 = lat1 >= 6.85 && lat1 <= 7.10 && lng1 >= 79.80 && lng1 <= 80.00;
  const isKandy2 = lat2 >= 7.20 && lat2 <= 7.35 && lng2 >= 80.55 && lng2 <= 80.75;

  if (isKandy1 && isColombo2) {
    return [
      [7.2562, 80.5218], // Kadugannawa
      [7.2513, 80.3464], // Kegalle
      [7.2255, 80.1983], // Warakapola
      [7.1439, 80.0964], // Nittambuwa
      [7.0016, 79.9525], // Kadawatha
    ];
  }
  if (isColombo1 && isKandy2) {
    return [
      [7.0016, 79.9525], // Kadawatha
      [7.1439, 80.0964], // Nittambuwa
      [7.2255, 80.1983], // Warakapola
      [7.2513, 80.3464], // Kegalle
      [7.2562, 80.5218], // Kadugannawa
    ];
  }

  // 4. Sabaragamuwa (Ratnapura) <-> Colombo
  const isRatnapura1 = lat1 >= 6.60 && lat1 <= 6.75 && lng1 >= 80.35 && lng1 <= 80.55;
  const isRatnapura2 = lat2 >= 6.60 && lat2 <= 6.75 && lng2 >= 80.35 && lng2 <= 80.55;

  if (isRatnapura1 && isColombo2) {
    return [
      [6.7667, 80.3667], // Kuruwita
      [6.9535, 80.2104], // Avissawella
      [6.9000, 80.0833], // Hanwella
      [6.8428, 80.0033], // Homagama
    ];
  }
  if (isColombo1 && isRatnapura2) {
    return [
      [6.8428, 80.0033], // Homagama
      [6.9000, 80.0833], // Hanwella
      [6.9535, 80.2104], // Avissawella
      [6.7667, 80.3667], // Kuruwita
    ];
  }

  return [];
}

/**
 * Build a complete polyline path for a single lorry from Start -> Current GPS -> Destination.
 */
export function generateLorryRouteWaypoints(
  currentInput: unknown,
  startText?: string,
  endText?: string,
  summaryRouteText?: string,
  startCoordOverride?: [number, number] | null,
  endCoordOverride?: [number, number] | null
): {
  start: [number, number];
  current: [number, number];
  end: [number, number];
  hasCorridor?: boolean;
  polyline: [number, number][];
} {
  const current = sanitizeCoord(currentInput, [6.9271, 79.8612]);

  let startCoords: [number, number] | null = isValidCoord(startCoordOverride)
    ? startCoordOverride
    : resolveLocationCoordinates(startText);

  let endCoords: [number, number] | null = isValidCoord(endCoordOverride)
    ? endCoordOverride
    : resolveLocationCoordinates(endText);

  // If start/end not explicitly found, parse from route string (e.g. "Colombo → Kandy" or "Galle - Colombo")
  if ((!startCoords || !endCoords) && summaryRouteText) {
    const sep = summaryRouteText.includes("→") ? "→" : (summaryRouteText.includes("-") ? "-" : null);
    if (sep) {
      const parts = summaryRouteText.split(sep);
      if (!startCoords && parts[0]) startCoords = resolveLocationCoordinates(parts[0]);
      if (!endCoords && parts[1]) endCoords = resolveLocationCoordinates(parts[1]);
    }
  }

  // Exact fallback resolution: if startCoords not found, anchor to current vehicle GPS
  const start = isValidCoord(startCoords)
    ? startCoords
    : current;

  // If endCoords not found, try to resolve from destination or anchor ahead on destination corridor
  const end = isValidCoord(endCoords)
    ? endCoords
    : (isValidCoord(startCoords) && (Math.abs(start[0] - current[0]) > 0.01 || Math.abs(start[1] - current[1]) > 0.01)
        ? [current[0] + (current[0] - start[0]), current[1] + (current[1] - start[1])] as [number, number]
        : [current[0] + 0.12, current[1] + 0.12] as [number, number]);

  // Check if predefined highway/expressway corridor waypoints exist between start and end
  const corridorWaypoints = getCorridorWaypoints(start, end);

  let rawPolyline: [number, number][] = [];
  if (corridorWaypoints.length > 0) {
    // Route curves naturally along Sri Lanka's road network
    rawPolyline = [
      start,
      ...corridorWaypoints,
      end,
    ];
  }

  const polyline = rawPolyline.filter(isValidCoord);

  return {
    start,
    current,
    end,
    hasCorridor: corridorWaypoints.length > 0,
    polyline: polyline.length >= 2 ? polyline : [],
  };
}
