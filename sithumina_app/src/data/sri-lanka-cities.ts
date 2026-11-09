/**
 * Comprehensive Sri Lanka cities database with real coordinates.
 * Covers all 9 provinces with 180+ cities/towns.
 */

export interface CityEntry {
  name: string;      // Display name (e.g. "Colombo")
  sinhala: string;   // Sinhala name (e.g. "කොළඹ")
  lat: number;
  lng: number;
  aliases: string[]; // Alternative spellings
}

export const SRI_LANKA_CITIES: CityEntry[] = [
  // ===== Western Province =====
  { name: "Colombo", sinhala: "කොළඹ", lat: 6.9271, lng: 79.8612, aliases: ["kolomba", "kolamba"] },
  { name: "Gampaha", sinhala: "ගම්පහ", lat: 7.0840, lng: 79.9943, aliases: ["gampaha"] },
  { name: "Negombo", sinhala: "මීගමුව", lat: 7.2008, lng: 79.8736, aliases: ["negambo", "necombo", "meegamuwa", "meegemuwa"] },
  { name: "Kalutara", sinhala: "කළුතර", lat: 6.5854, lng: 79.9607, aliases: ["kaluthara", "kalutura"] },
  { name: "Panadura", sinhala: "පානදුර", lat: 6.7130, lng: 79.9074, aliases: ["panadure"] },
  { name: "Moratuwa", sinhala: "මොරටුව", lat: 6.7730, lng: 79.8816, aliases: ["morathuwa", "morathuwe"] },
  { name: "Dehiwala", sinhala: "දෙහිවල", lat: 6.8511, lng: 79.8653, aliases: ["dehiwela", "dehiwala-mount lavinia"] },
  { name: "Maharagama", sinhala: "මහරගම", lat: 6.8480, lng: 79.9265, aliases: ["maharagame"] },
  { name: "Kottawa", sinhala: "කොට්ටාව", lat: 6.8414, lng: 79.9654, aliases: ["kottaawa"] },
  { name: "Kaduwela", sinhala: "කඩුවෙල", lat: 6.9344, lng: 79.9839, aliases: ["kaduwele"] },
  { name: "Malabe", sinhala: "මාලඹේ", lat: 6.9042, lng: 79.9547, aliases: ["maalabe"] },
  { name: "Nugegoda", sinhala: "නුගේගොඩ", lat: 6.8649, lng: 79.8997, aliases: ["nugeegoda"] },
  { name: "Homagama", sinhala: "හෝමාගම", lat: 6.8428, lng: 80.0033, aliases: ["homagame"] },
  { name: "Kelaniya", sinhala: "කැලණිය", lat: 6.9538, lng: 79.9189, aliases: ["kelaniye"] },
  { name: "Wattala", sinhala: "වත්තල", lat: 6.9899, lng: 79.8927, aliases: ["wathala"] },
  { name: "Ja-Ela", sinhala: "ජාඇල", lat: 7.0761, lng: 79.8916, aliases: ["jaela", "ja ela"] },
  { name: "Kadawatha", sinhala: "කඩවත", lat: 7.0016, lng: 79.9525, aliases: ["kadawatte", "kaduwatha"] },
  { name: "Kiribathgoda", sinhala: "කිරිබත්ගොඩ", lat: 6.9806, lng: 79.9292, aliases: ["kirribathgoda"] },
  { name: "Peliyagoda", sinhala: "පෑලියගොඩ", lat: 6.9680, lng: 79.8885, aliases: ["peliyagode"] },
  { name: "Katunayake", sinhala: "කටුනායක", lat: 7.1695, lng: 79.8884, aliases: ["katunayaka", "katunayeke"] },
  { name: "Piliyandala", sinhala: "පිළියන්දල", lat: 6.8018, lng: 79.9227, aliases: ["piliyandale"] },
  { name: "Kesbewa", sinhala: "කැස්බෑව", lat: 6.7900, lng: 79.9400, aliases: ["kesbewe"] },
  { name: "Hanwella", sinhala: "හංවැල්ල", lat: 6.9000, lng: 80.0833, aliases: ["hanwelle"] },
  { name: "Padukka", sinhala: "පාදුක්ක", lat: 6.8475, lng: 80.1039, aliases: ["padukke"] },
  { name: "Avissawella", sinhala: "අවිස්සාවේල්ල", lat: 6.9535, lng: 80.2104, aliases: ["avissaawella", "avissawelle"] },
  { name: "Wadduwa", sinhala: "වාද්දුව", lat: 6.6667, lng: 79.9333, aliases: ["wadduwe"] },
  { name: "Bandaragama", sinhala: "බණ්ඩාරගම", lat: 6.7140, lng: 79.9890, aliases: ["bandaragame"] },
  { name: "Horana", sinhala: "හොරණ", lat: 6.7167, lng: 80.0667, aliases: ["horane"] },
  { name: "Beruwala", sinhala: "බේරුවල", lat: 6.4788, lng: 79.9828, aliases: ["beruwela", "baruwala"] },
  { name: "Aluthgama", sinhala: "අලුත්ගම", lat: 6.4294, lng: 80.0031, aliases: ["aluthgame"] },
  { name: "Bentota", sinhala: "බෙන්තොට", lat: 6.4261, lng: 79.9967, aliases: ["benthota"] },
  { name: "Nittambuwa", sinhala: "නිට්ටඹුව", lat: 7.1439, lng: 80.0964, aliases: ["nittambuwe"] },
  { name: "Mirigama", sinhala: "මීරිගම", lat: 7.2439, lng: 80.1294, aliases: ["meerigama"] },
  { name: "Minuwangoda", sinhala: "මිනුවන්ගොඩ", lat: 7.1667, lng: 79.9500, aliases: ["minuwangode"] },
  { name: "Divulapitiya", sinhala: "දිවුලපිටිය", lat: 7.2167, lng: 80.0167, aliases: ["divulapitiye"] },
  { name: "Battaramulla", sinhala: "බත්තරමුල්ල", lat: 6.8994, lng: 79.9222, aliases: ["baththaramulla", "batharamulla"] },
  { name: "Mount Lavinia", sinhala: "ගල්කිස්ස", lat: 6.8383, lng: 79.8644, aliases: ["mt lavinia", "galkissa", "mount-lavinia"] },
  { name: "Ratmalana", sinhala: "රත්මලාන", lat: 6.8206, lng: 79.8864, aliases: ["rathmalana"] },
  { name: "Ragama", sinhala: "රාගම", lat: 7.0270, lng: 79.9240, aliases: ["raagama"] },
  { name: "Gelanigama", sinhala: "ගෙලනිගම", lat: 6.6850, lng: 80.0200, aliases: ["gelanigame"] },
  { name: "Dodangoda", sinhala: "දොඩංගොඩ", lat: 6.5667, lng: 80.0833, aliases: ["dodangode"] },
  { name: "Matugama", sinhala: "මතුගම", lat: 6.5233, lng: 80.1147, aliases: ["mathugama"] },
  { name: "Ingiriya", sinhala: "ඉංගිරිය", lat: 6.7500, lng: 80.1667, aliases: ["ingiriye"] },
  { name: "Fort", sinhala: "කොටුව", lat: 6.9344, lng: 79.8428, aliases: ["colombo fort", "kotuwa"] },
  { name: "Pettah", sinhala: "පිටකොටුව", lat: 6.9367, lng: 79.8531, aliases: ["pitakotuwa"] },
  { name: "Maradana", sinhala: "මරදාන", lat: 6.9279, lng: 79.8655, aliases: ["maradaana"] },
  { name: "Borella", sinhala: "බොරැල්ල", lat: 6.9147, lng: 79.8778, aliases: ["boralle", "borellla"] },

  // ===== Southern Province =====
  { name: "Galle", sinhala: "ගාල්ල", lat: 6.0535, lng: 80.2210, aliases: ["gaalle", "gall"] },
  { name: "Matara", sinhala: "මාතර", lat: 5.9549, lng: 80.5550, aliases: ["mathara", "maathara"] },
  { name: "Hambantota", sinhala: "හම්බන්තොට", lat: 6.1429, lng: 81.1212, aliases: ["hambanthota"] },
  { name: "Tangalle", sinhala: "තංගල්ල", lat: 6.0243, lng: 80.7941, aliases: ["tangalla", "thangalle"] },
  { name: "Hikkaduwa", sinhala: "හික්කඩුව", lat: 6.1395, lng: 80.1063, aliases: ["hikkadoowa"] },
  { name: "Ambalangoda", sinhala: "අම්බලන්ගොඩ", lat: 6.2359, lng: 80.0541, aliases: ["ambalangode"] },
  { name: "Weligama", sinhala: "වැලිගම", lat: 5.9734, lng: 80.4289, aliases: ["weligame"] },
  { name: "Dikwella", sinhala: "දික්වැල්ල", lat: 5.9667, lng: 80.7000, aliases: ["dickwella", "dikwelle"] },
  { name: "Beliatta", sinhala: "බෙලිඅත්ත", lat: 6.0469, lng: 80.7225, aliases: ["beliattha"] },
  { name: "Deniyaya", sinhala: "දෙනියාය", lat: 6.3409, lng: 80.5595, aliases: ["deniyaye"] },
  { name: "Akuressa", sinhala: "අකුරැස්ස", lat: 6.0989, lng: 80.4736, aliases: ["akuresse"] },
  { name: "Kamburupitiya", sinhala: "කඹුරුපිටිය", lat: 6.0833, lng: 80.5667, aliases: ["kamburupitiye"] },
  { name: "Morawaka", sinhala: "මොරවක", lat: 6.2667, lng: 80.4833, aliases: ["morawake"] },
  { name: "Baddegama", sinhala: "බද්දේගම", lat: 6.1833, lng: 80.1833, aliases: ["baddegame"] },
  { name: "Elpitiya", sinhala: "ඇල්පිටිය", lat: 6.2667, lng: 80.1833, aliases: ["elpitiye"] },
  { name: "Balapitiya", sinhala: "බලපිටිය", lat: 6.2667, lng: 80.0333, aliases: ["balapitiye"] },
  { name: "Tissamaharama", sinhala: "තිස්සමහාරාමය", lat: 6.2800, lng: 81.2858, aliases: ["tissa", "thissamaharama", "thissamaharamaya"] },
  { name: "Kataragama", sinhala: "කතරගම", lat: 6.4137, lng: 81.3325, aliases: ["katharagama", "kathirgamam"] },
  { name: "Ambalantota", sinhala: "අම්බලන්තොට", lat: 6.1242, lng: 81.0267, aliases: ["ambalanthota"] },
  { name: "Kalugalahena", sinhala: "කළුගලහේන", lat: 6.3410, lng: 80.5695, aliases: [] },
  { name: "Hakmana", sinhala: "හක්මන", lat: 6.0833, lng: 80.6500, aliases: ["hakmane"] },
  { name: "Embilipitiya", sinhala: "ඇඹිලිපිටිය", lat: 6.3429, lng: 80.8494, aliases: ["embilipitiye"] },

  // ===== Central Province =====
  { name: "Kandy", sinhala: "මහනුවර", lat: 7.2906, lng: 80.6337, aliases: ["mahanuwara", "maha nuwara", "kandy city"] },
  { name: "Peradeniya", sinhala: "පේරාදෙණිය", lat: 7.2608, lng: 80.5976, aliases: ["peradeniye"] },
  { name: "Katugastota", sinhala: "කටුගස්තොට", lat: 7.3167, lng: 80.6167, aliases: ["katugasthota"] },
  { name: "Gampola", sinhala: "ගම්පොළ", lat: 7.1644, lng: 80.5694, aliases: ["gamopola"] },
  { name: "Nawalapitiya", sinhala: "නාවලපිටිය", lat: 7.0489, lng: 80.5333, aliases: ["nawalapitiye"] },
  { name: "Hatton", sinhala: "හැටන්", lat: 6.8917, lng: 80.5967, aliases: ["hatten", "hatton city"] },
  { name: "Nuwara Eliya", sinhala: "නුවරඑළිය", lat: 6.9497, lng: 80.7891, aliases: ["nuwara", "nuwaraeliya", "nuwara eliye"] },
  { name: "Matale", sinhala: "මාතලේ", lat: 7.4675, lng: 80.6234, aliases: ["mathale", "maathale"] },
  { name: "Dambulla", sinhala: "දඹුල්ල", lat: 7.8742, lng: 80.6511, aliases: ["dhambulle", "dambullegama"] },
  { name: "Kadugannawa", sinhala: "කඩුගන්නාව", lat: 7.2562, lng: 80.5218, aliases: ["kadugannave"] },
  { name: "Talawakele", sinhala: "තලවකැලේ", lat: 6.9372, lng: 80.6578, aliases: ["talawakelle"] },
  { name: "Sigiriya", sinhala: "සීගිරිය", lat: 7.9570, lng: 80.7603, aliases: ["sigiri", "seegiriya"] },

  // ===== Sabaragamuwa Province =====
  { name: "Ratnapura", sinhala: "රත්නපුර", lat: 6.6828, lng: 80.4037, aliases: ["rathnapura", "rathnapure"] },
  { name: "Kegalle", sinhala: "කෑගල්ල", lat: 7.2513, lng: 80.3464, aliases: ["kegalla", "kaegalle"] },
  { name: "Balangoda", sinhala: "බලන්ගොඩ", lat: 6.6500, lng: 80.7000, aliases: ["balangode"] },
  { name: "Pelmadulla", sinhala: "පැල්මඩුල්ල", lat: 6.6231, lng: 80.5486, aliases: ["pelmadullla"] },
  { name: "Kuruwita", sinhala: "කුරුවිට", lat: 6.7667, lng: 80.3667, aliases: ["kuruwite"] },
  { name: "Ehaliyagoda", sinhala: "ඇහැළියගොඩ", lat: 6.8500, lng: 80.2667, aliases: ["eheliyagoda", "ehaliyagode"] },
  { name: "Mawanella", sinhala: "මාවනැල්ල", lat: 7.2526, lng: 80.4468, aliases: ["mawanelle"] },
  { name: "Warakapola", sinhala: "වරකාපොළ", lat: 7.2255, lng: 80.1983, aliases: ["warakapole"] },
  { name: "Rambukkana", sinhala: "රඹුක්කන", lat: 7.3167, lng: 80.4000, aliases: ["rambukkane"] },
  { name: "Godakawela", sinhala: "ගොඩකවෙල", lat: 6.5167, lng: 80.6333, aliases: ["godakawele"] },

  // ===== North Western Province =====
  { name: "Kurunegala", sinhala: "කුරුණෑගල", lat: 7.4863, lng: 80.3623, aliases: ["kurunagala", "kurunegale"] },
  { name: "Chilaw", sinhala: "හලාවත", lat: 7.5758, lng: 79.7953, aliases: ["halawata", "chillaw"] },
  { name: "Puttalam", sinhala: "පුත්තලම", lat: 8.0362, lng: 79.8283, aliases: ["puttalama", "puthalam"] },
  { name: "Kuliyapitiya", sinhala: "කුලියාපිටිය", lat: 7.4689, lng: 80.0400, aliases: ["kuliyapitiye"] },
  { name: "Narammala", sinhala: "නාරම්මල", lat: 7.4333, lng: 80.2167, aliases: ["narammale"] },
  { name: "Alawwa", sinhala: "අලව්ව", lat: 7.3000, lng: 80.2333, aliases: ["alawwe"] },
  { name: "Wariyapola", sinhala: "වාරියපොළ", lat: 7.6167, lng: 80.2667, aliases: ["wariyapole"] },
  { name: "Nikaweratiya", sinhala: "නිකවැරටිය", lat: 7.7500, lng: 80.1167, aliases: ["nikaweratiye"] },

  // ===== North Central Province =====
  { name: "Anuradhapura", sinhala: "අනුරාධපුර", lat: 8.3114, lng: 80.4037, aliases: ["anuradhapure", "anuradapura"] },
  { name: "Polonnaruwa", sinhala: "පොළොන්නරුව", lat: 7.9403, lng: 81.0188, aliases: ["pollonnaruwa", "polonnaruwe"] },
  { name: "Habarana", sinhala: "හබරණ", lat: 8.0336, lng: 80.7516, aliases: ["habarane"] },
  { name: "Kekirawa", sinhala: "කැකිරාව", lat: 8.0333, lng: 80.5833, aliases: ["kekirawe"] },

  // ===== Uva Province =====
  { name: "Badulla", sinhala: "බදුල්ල", lat: 6.9934, lng: 81.0550, aliases: ["badulle"] },
  { name: "Bandarawela", sinhala: "බණ්ඩාරවෙල", lat: 6.8259, lng: 80.9982, aliases: ["bandarawele", "bandaraawela"] },
  { name: "Ella", sinhala: "ඇල්ල", lat: 6.8667, lng: 81.0467, aliases: ["elle"] },
  { name: "Monaragala", sinhala: "මොනරාගල", lat: 6.8722, lng: 81.3506, aliases: ["monaragale", "moneragala"] },
  { name: "Wellawaya", sinhala: "වැල්ලවාය", lat: 6.7333, lng: 81.1000, aliases: ["wellawaye", "wellawaa"] },
  { name: "Haputale", sinhala: "හපුතලේ", lat: 6.7667, lng: 80.9500, aliases: ["haputhale", "haputhalee"] },

  // ===== Northern Province =====
  { name: "Jaffna", sinhala: "යාපනය", lat: 9.6615, lng: 80.0255, aliases: ["yaapanaya", "yalppanam", "yapanam"] },
  { name: "Vavuniya", sinhala: "වවුනියාව", lat: 8.7514, lng: 80.4971, aliases: ["vavuniyawa", "vavuniyaawa"] },
  { name: "Kilinochchi", sinhala: "කිලිනොච්චිය", lat: 9.3803, lng: 80.3770, aliases: ["killinochchi", "kilinochchiiya"] },
  { name: "Mannar", sinhala: "මන්නාරම", lat: 8.9814, lng: 79.9042, aliases: ["mannaram", "mannarama"] },
  { name: "Mullaitivu", sinhala: "මුලතිව්", lat: 9.2671, lng: 80.8142, aliases: ["mulathivu", "mullativu"] },
  { name: "Point Pedro", sinhala: "පේදුරුතුඩුව", lat: 9.8167, lng: 80.2333, aliases: ["peduru thudawa", "pedro"] },
  { name: "Chavakachcheri", sinhala: "චාවකච්චේරි", lat: 9.6614, lng: 80.1610, aliases: ["chawakachcheri"] },
  { name: "Nallur", sinhala: "නල්ලූර්", lat: 9.6667, lng: 80.0167, aliases: ["naloor"] },
  { name: "Chunnakam", sinhala: "චුන්නාකම්", lat: 9.7387, lng: 80.0343, aliases: ["chunnaakam"] },
  { name: "Elephant Pass", sinhala: "අලිමංකඩ", lat: 9.5167, lng: 80.3667, aliases: ["alimankada"] },

  // ===== Eastern Province =====
  { name: "Trincomalee", sinhala: "ත්‍රිකුණාමලය", lat: 8.5874, lng: 81.2152, aliases: ["trinco", "thrincomalee", "thrikunamalaya"] },
  { name: "Batticaloa", sinhala: "මඩකලපුව", lat: 7.7310, lng: 81.6747, aliases: ["batti", "madakalapuwa"] },
  { name: "Ampara", sinhala: "අම්පාර", lat: 7.2833, lng: 81.6667, aliases: ["ampaara", "ampare"] },
  { name: "Kalmunai", sinhala: "කල්මුණේ", lat: 7.4167, lng: 81.8167, aliases: ["kalmunei"] },
  { name: "Arugam Bay", sinhala: "අරුගම් බේ", lat: 6.8404, lng: 81.8360, aliases: ["arugambay", "arugam"] },
  { name: "Pasikuda", sinhala: "පාසිකුඩා", lat: 7.9333, lng: 81.5667, aliases: ["passikudah", "passikuda"] },
  { name: "Valaichchenai", sinhala: "වාලච්චේන", lat: 7.9333, lng: 81.5500, aliases: ["valachenai"] },
  { name: "Pottuvil", sinhala: "පොතුවිල්", lat: 6.8747, lng: 81.8333, aliases: ["potuvil", "pothuvil"] },
  { name: "Akkaraipattu", sinhala: "අක්කරෙයිපත්තු", lat: 7.2167, lng: 81.8500, aliases: ["akkareipattu"] },

  // ===== Additional Notable Locations =====
  // Wayamba / NW
  { name: "Hettipola", sinhala: "හෙට්ටිපොළ", lat: 7.6167, lng: 80.1667, aliases: ["hettipole"] },
  { name: "Giriulla", sinhala: "ගිරිඋල්ල", lat: 7.3333, lng: 80.1167, aliases: ["giriulle"] },
  { name: "Pannala", sinhala: "පන්නල", lat: 7.3167, lng: 80.1167, aliases: ["pannale"] },
  { name: "Dankotuwa", sinhala: "දංකොටුව", lat: 7.2833, lng: 79.9833, aliases: ["dankotuwe"] },
  { name: "Marawila", sinhala: "මාරවිල", lat: 7.3500, lng: 79.8500, aliases: ["maravila"] },
  { name: "Wennappuwa", sinhala: "වෙන්නප්පුව", lat: 7.3500, lng: 79.8667, aliases: ["wennappuwe"] },
  { name: "Bingiriya", sinhala: "බිංගිරිය", lat: 7.5667, lng: 80.1167, aliases: ["bingiriye"] },
  { name: "Maho", sinhala: "මාහෝ", lat: 7.8167, lng: 80.2833, aliases: ["maaho"] },
  { name: "Anamaduwa", sinhala: "ආනමඩුව", lat: 7.8833, lng: 80.0167, aliases: ["anamaduwe"] },
  { name: "Mundel", sinhala: "මුන්දල්", lat: 7.6333, lng: 79.8500, aliases: [] },

  // North Central additional
  { name: "Medawachchiya", sinhala: "මැදවාච්චිය", lat: 8.5333, lng: 80.4833, aliases: ["medawachiya"] },
  { name: "Mihintale", sinhala: "මිහින්තලේ", lat: 8.3500, lng: 80.5000, aliases: ["mihinthale"] },
  { name: "Tambuttegama", sinhala: "තඹුත්තේගම", lat: 8.1500, lng: 80.3000, aliases: ["thambuthegama"] },
  { name: "Hingurakgoda", sinhala: "හිඟුරක්ගොඩ", lat: 8.0333, lng: 80.9500, aliases: ["hingurakgode"] },
  { name: "Medirigiriya", sinhala: "මැදිරිගිරිය", lat: 8.1333, lng: 80.9833, aliases: ["medirigiriye"] },
  { name: "Lankapura", sinhala: "ලංකාපුර", lat: 7.8000, lng: 81.1333, aliases: ["lankapure"] },

  // Southern additional
  { name: "Mirissa", sinhala: "මිරිස්ස", lat: 5.9470, lng: 80.4540, aliases: ["mirisse"] },
  { name: "Unawatuna", sinhala: "උණවටුන", lat: 6.0100, lng: 80.2490, aliases: ["unawathuna"] },
  { name: "Ahangama", sinhala: "අහංගම", lat: 5.9725, lng: 80.3646, aliases: ["ahangame"] },
  { name: "Koggala", sinhala: "කොග්ගල", lat: 5.9875, lng: 80.3129, aliases: ["koggale"] },
  { name: "Imaduwa", sinhala: "ඉමදුව", lat: 6.1500, lng: 80.3667, aliases: ["imaduwe"] },

  // Central additional
  { name: "Akurana", sinhala: "අකුරණ", lat: 7.3667, lng: 80.6167, aliases: ["akurane"] },
  { name: "Kundasale", sinhala: "කුණ්ඩසාලේ", lat: 7.3000, lng: 80.7000, aliases: ["kundasaale"] },
  { name: "Digana", sinhala: "දිගන", lat: 7.3000, lng: 80.7333, aliases: ["digane"] },
  { name: "Teldeniya", sinhala: "තැල්දෙණිය", lat: 7.3333, lng: 80.7833, aliases: ["theldeniya"] },
  { name: "Wattegama", sinhala: "වත්තේගම", lat: 7.3500, lng: 80.6667, aliases: ["waththegama"] },
  { name: "Deltota", sinhala: "දෙල්තොට", lat: 7.2000, lng: 80.6833, aliases: ["delthota"] },
  { name: "Kandy Lake Area", sinhala: "කන්ද උඩරට", lat: 7.2930, lng: 80.6410, aliases: [] },
  { name: "Galaha", sinhala: "ගලහ", lat: 7.2500, lng: 80.7000, aliases: [] },
  { name: "Rikillagaskada", sinhala: "රිකිල්ලගස්කඩ", lat: 7.1833, lng: 80.7333, aliases: ["rikillagaskade"] },
  { name: "Maskeliya", sinhala: "මස්කෙලිය", lat: 6.8333, lng: 80.5500, aliases: ["maskelliya"] },
  { name: "Norwood", sinhala: "නෝර්වුඩ්", lat: 6.8333, lng: 80.6167, aliases: [] },
  { name: "Kotagala", sinhala: "කොටගල", lat: 6.8500, lng: 80.5833, aliases: ["kothagala"] },
  { name: "Dikoya", sinhala: "දික්ඔය", lat: 6.8833, lng: 80.6167, aliases: ["dickoya"] },

  // Uva additional
  { name: "Mahiyanganaya", sinhala: "මහියංගනය", lat: 7.3333, lng: 81.1167, aliases: ["mahiyangana", "mahiyangane"] },
  { name: "Bibile", sinhala: "බිබිලේ", lat: 7.1667, lng: 81.2167, aliases: ["bibilee"] },
  { name: "Welimada", sinhala: "වැලිමඩ", lat: 6.9000, lng: 80.9167, aliases: ["welimade"] },
  { name: "Passara", sinhala: "පස්සර", lat: 6.9333, lng: 81.1500, aliases: ["passare"] },
  { name: "Hali Ela", sinhala: "හාලි ඇළ", lat: 6.9500, lng: 81.0167, aliases: ["haliela", "hali-ela"] },
  { name: "Diyatalawa", sinhala: "දියතලාව", lat: 6.8000, lng: 80.9667, aliases: ["diyathalawa"] },

  // Sabaragamuwa additional
  { name: "Embilipitiya", sinhala: "ඇඹිලිපිටිය", lat: 6.3429, lng: 80.8494, aliases: ["embilipitiye"] },
  { name: "Deraniyagala", sinhala: "දැරණියගල", lat: 6.9333, lng: 80.3333, aliases: ["deraniyagale"] },
  { name: "Ruwanwella", sinhala: "රුවන්වැල්ල", lat: 7.0500, lng: 80.2500, aliases: ["ruwanwelle"] },
  { name: "Yatiyantota", sinhala: "යටියන්තොට", lat: 7.0167, lng: 80.3000, aliases: ["yatiyanthota"] },
  { name: "Dehiowita", sinhala: "දෙහිඕවිට", lat: 6.9833, lng: 80.2667, aliases: ["dehiowite"] },
  { name: "Kahawatta", sinhala: "කහවත්ත", lat: 6.5667, lng: 80.5833, aliases: ["kahawaththa"] },
  { name: "Nivithigala", sinhala: "නිවිතිගල", lat: 6.5000, lng: 80.4667, aliases: ["nivithigale"] },
  { name: "Kalawana", sinhala: "කලවාන", lat: 6.5333, lng: 80.3833, aliases: ["kalawane"] },

  // Northern additional
  { name: "Kayts", sinhala: "පුනරීන්", lat: 9.6833, lng: 79.9000, aliases: ["kaithady", "punaryn"] },
  { name: "Neduntivu", sinhala: "මඬු දුපත", lat: 9.5000, lng: 79.8667, aliases: ["delft island", "delft"] },
  { name: "Tellippalai", sinhala: "තෙල්ලිපලෙයි", lat: 9.7333, lng: 80.0167, aliases: ["tellipallai"] },
  { name: "Mallakam", sinhala: "මල්ලාකම්", lat: 9.7000, lng: 80.0500, aliases: [] },
  { name: "Karainagar", sinhala: "කරෛනගර්", lat: 9.7333, lng: 79.9000, aliases: ["karaitivu"] },
  { name: "Palaly", sinhala: "පලාලි", lat: 9.7889, lng: 80.0667, aliases: ["palaali"] },
  { name: "Oddusuddan", sinhala: "ඔඩ්ඩුසුඩ්ඩාන්", lat: 9.1500, lng: 80.6500, aliases: ["oddusudan"] },

  // Eastern additional
  { name: "Kantale", sinhala: "කන්තලේ", lat: 8.3667, lng: 80.9833, aliases: ["kanthale"] },
  { name: "Nilaveli", sinhala: "නිලාවේලි", lat: 8.7000, lng: 81.1833, aliases: ["nilaweli"] },
  { name: "Uppuveli", sinhala: "උප්පුවේලි", lat: 8.6167, lng: 81.2000, aliases: ["uppuweli"] },
  { name: "Eravur", sinhala: "ඒරාවූර්", lat: 7.7667, lng: 81.6000, aliases: ["erawur"] },
  { name: "Sammanthurai", sinhala: "සම්මන්තුරෙයි", lat: 7.3667, lng: 81.8167, aliases: ["samanthurai", "sammanturai"] },
  { name: "Kattankudy", sinhala: "කත්තන්කුඩි", lat: 7.6833, lng: 81.7333, aliases: ["kaththankudi"] },
  { name: "Sainthamaruthu", sinhala: "සෙයින්තමරුතු", lat: 7.4000, lng: 81.8500, aliases: [] },
  { name: "Dehiattakandiya", sinhala: "දෙහිඅත්තකණ්ඩිය", lat: 7.5000, lng: 81.1333, aliases: ["dehiaththakandiya"] },

  // Extra tourist & notable places
  { name: "Pinnawala", sinhala: "පින්නවල", lat: 7.3006, lng: 80.3863, aliases: ["pinnawela", "pinnawale"] },
  { name: "Kitulgala", sinhala: "කිතුල්ගල", lat: 6.9833, lng: 80.4167, aliases: ["kithulgala"] },
  { name: "Sinharaja", sinhala: "සිංහරාජ", lat: 6.4000, lng: 80.5000, aliases: ["sinharaaja"] },
  { name: "Yala", sinhala: "යාල", lat: 6.3726, lng: 81.5144, aliases: ["ruhuna", "yala national park"] },
  { name: "Wilpattu", sinhala: "විල්පත්තු", lat: 8.4500, lng: 80.0500, aliases: ["wilpatthu", "wilpattu national park"] },
  { name: "Udawalawe", sinhala: "උඩවලව", lat: 6.4667, lng: 80.8833, aliases: ["udawalawa", "udawalwe"] },
  { name: "Horton Plains", sinhala: "හෝර්ටන් තැන්න", lat: 6.8097, lng: 80.8000, aliases: ["horton", "worlds end"] },
  { name: "Adam's Peak", sinhala: "ශ්‍රී පාද", lat: 6.8094, lng: 80.4994, aliases: ["sri pada", "samanala kanda", "adams peak"] },
  { name: "Pidurangala", sinhala: "පිදුරංගල", lat: 7.9667, lng: 80.7500, aliases: [] },
  { name: "Knuckles", sinhala: "දුම්බර කන්ද", lat: 7.4500, lng: 80.7833, aliases: ["dumbara", "knuckles range"] },
];

// Helper: detect if a string contains Sinhala characters
function isSinhala(text: string): boolean {
  return /[\u0D80-\u0DFF]/.test(text);
}

/**
 * Search cities by prefix (English/aliases) or substring (Sinhala).
 * Pure in-memory filtering — no network calls.
 */
export function searchCities(query: string, limit: number = 8): CityEntry[] {
  if (!query || query.trim().length === 0) return [];

  const q = query.trim();

  if (isSinhala(q)) {
    // Sinhala substring match
    const results: CityEntry[] = [];
    for (const city of SRI_LANKA_CITIES) {
      if (city.sinhala.includes(q)) {
        results.push(city);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  // English: prefix match on name and aliases (case-insensitive)
  const lowerQ = q.toLowerCase();
  const results: CityEntry[] = [];

  for (const city of SRI_LANKA_CITIES) {
    if (results.length >= limit) break;

    const nameLower = city.name.toLowerCase();
    if (nameLower.startsWith(lowerQ)) {
      results.push(city);
      continue;
    }

    // Check aliases
    let matched = false;
    for (const alias of city.aliases) {
      if (alias.toLowerCase().startsWith(lowerQ)) {
        matched = true;
        break;
      }
    }
    if (matched) {
      results.push(city);
    }
  }

  return results;
}

/**
 * Resolve a city name (English or Sinhala) to coordinates.
 * Returns null if not found.
 */
export function resolveCityCoords(name: string): { lat: number; lng: number } | null {
  if (!name || name.trim().length === 0) return null;

  const q = name.trim();

  // If Sinhala, do substring match
  if (isSinhala(q)) {
    for (const city of SRI_LANKA_CITIES) {
      if (city.sinhala.includes(q)) {
        return { lat: city.lat, lng: city.lng };
      }
    }
    return null;
  }

  const lowerQ = q.toLowerCase();

  // 1. Exact match on name
  for (const city of SRI_LANKA_CITIES) {
    if (city.name.toLowerCase() === lowerQ) {
      return { lat: city.lat, lng: city.lng };
    }
  }

  // 2. Exact match on alias
  for (const city of SRI_LANKA_CITIES) {
    for (const alias of city.aliases) {
      if (alias.toLowerCase() === lowerQ) {
        return { lat: city.lat, lng: city.lng };
      }
    }
  }

  return null;
}
