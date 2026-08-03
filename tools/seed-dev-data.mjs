/**
 * Sät realistische Testdaten in eine laufende API — nur für die Entwicklung.
 *
 * Ohne echte Daten lassen sich die Auswertungen nicht beurteilen: Ein einzelner
 * Datenpunkt zeigt weder, ob die Achsen stimmen, noch ob das Rhythmus-Diagramm
 * tatsächlich das nächtliche Band sichtbar macht.
 *
 * Modelliert wird ein Säugling über 30 Tage: die Trinkmenge steigt langsam, die
 * Mahlzeiten werden seltener, und die Nachtfütterungen werden weniger.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3010";
const INVITE = process.env.HOUSEHOLD_SECRET ?? "dev-household-secret-1234567890abcd";
const DAYS = 30;

// Deterministischer Zufall, damit zwei Läufe dieselben Daten erzeugen.
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function uuidv7(ms) {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[0] = Math.floor(ms / 2 ** 40) & 0xff;
  b[1] = Math.floor(ms / 2 ** 32) & 0xff;
  b[2] = Math.floor(ms / 2 ** 24) & 0xff;
  b[3] = Math.floor(ms / 2 ** 16) & 0xff;
  b[4] = Math.floor(ms / 2 ** 8) & 0xff;
  b[5] = ms & 0xff;
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const login = await fetch(`${BASE}/api/session`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: INVITE, name: "Mama" }),
});
if (!login.ok) throw new Error(`Anmeldung fehlgeschlagen: ${login.status}`);
const cookie = login.headers.get("set-cookie").split(";")[0];

const pull = await fetch(`${BASE}/api/sync`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ childId: "seed", since: 0, changes: [], child: null }),
}).then((r) => r.json());

const child = pull.child;
if (!child) throw new Error("Kein Kind eingerichtet — erst die App einrichten.");

const base = (type, at, extra) => ({
  id: uuidv7(at.getTime()),
  childId: child.id,
  type,
  startedAt: at.toISOString(),
  endedAt: null,
  amountMl: null,
  diaper: null,
  weightG: null,
  lengthMm: null,
  headMm: null,
  label: null,
  lifeWeek: null,
  mediaId: null,
  note: null,
  createdBy: "Mama",
  editedAt: new Date().toISOString(),
  deleted: false,
  ...extra,
});

const changes = [];
const today = new Date();
today.setHours(0, 0, 0, 0);

for (let ago = DAYS - 1; ago >= 0; ago--) {
  const day = new Date(today);
  day.setDate(day.getDate() - ago);
  const progress = (DAYS - 1 - ago) / (DAYS - 1); // 0 = ältester Tag

  // Mahlzeiten: von 8/Tag auf 6/Tag, Menge von 75 auf 135 ml.
  const feedCount = Math.round(8 - progress * 2);
  const targetMl = 75 + progress * 60;

  // Nachtfütterungen werden über den Zeitraum seltener.
  const nightFeeds = Math.max(1, Math.round(3 - progress * 2));
  const dayFeeds = feedCount - nightFeeds;

  const times = [];
  for (let i = 0; i < nightFeeds; i++) times.push(0.5 + (i * 5.5) / nightFeeds + rnd() * 0.7);
  for (let i = 0; i < dayFeeds; i++) times.push(7 + (i * 15) / dayFeeds + rnd() * 1.1);

  for (const hour of times) {
    const at = new Date(day);
    at.setHours(Math.floor(hour), Math.floor((hour % 1) * 60), 0, 0);
    if (at > new Date()) continue;
    const ml = Math.max(30, Math.round((targetMl + (rnd() - 0.5) * 35) / 5) * 5);
    changes.push(base("feed", at, { amountMl: ml }));
  }

  // Windeln: 5–7 am Tag, Verteilung folgt grob den Mahlzeiten.
  const diaperCount = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < diaperCount; i++) {
    const at = new Date(day);
    at.setHours(Math.floor((i * 24) / diaperCount + rnd() * 2), Math.floor(rnd() * 60), 0, 0);
    if (at > new Date()) continue;
    const roll = rnd();
    const kind = roll < 0.15 ? "empty" : roll < 0.65 ? "wet" : "soiled";
    changes.push(base("diaper", at, { diaper: kind }));
  }

  // Ein längerer Schlaf pro Nacht, der über die Wochen länger wird.
  const sleepStart = new Date(day);
  sleepStart.setHours(20, Math.floor(rnd() * 50), 0, 0);
  const sleepEnd = new Date(sleepStart);
  sleepEnd.setMinutes(sleepEnd.getMinutes() + Math.round(150 + progress * 160 + rnd() * 40));
  if (sleepEnd < new Date()) {
    changes.push(base("sleep", sleepStart, { endedAt: sleepEnd.toISOString() }));
  }
}

// Wachstum: wöchentliche Wiegungen.
for (let week = 0; week <= 4; week++) {
  const at = new Date(today);
  at.setDate(at.getDate() - (28 - week * 7));
  at.setHours(10, 0, 0, 0);
  changes.push(
    base("growth", at, {
      weightG: 4100 + week * 190,
      lengthMm: 530 + week * 8,
      headMm: 372 + week * 4,
    }),
  );
}

changes.push(
  base("milestone", new Date(today.getTime() - 9 * 86400000), { label: "Erstes bewusstes Lächeln" }),
);

// In Blöcken senden — der Server nimmt maximal 500 Änderungen pro Anfrage.
let sent = 0;
for (let i = 0; i < changes.length; i += 400) {
  const batch = changes.slice(i, i + 400);
  const res = await fetch(`${BASE}/api/sync`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ childId: child.id, since: 0, changes: batch, child: null }),
  });
  if (!res.ok) throw new Error(`Sync fehlgeschlagen: ${res.status} ${await res.text()}`);
  sent += batch.length;
}

console.log(`${sent} Einträge gesät für ${child.name} (Geburt ${child.birthDate}).`);
