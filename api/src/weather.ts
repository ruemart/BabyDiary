import type { Db } from "./db.ts";

/**
 * Tagestemperaturen von Open-Meteo.
 *
 * Open-Meteo, weil es ohne Anmeldung, ohne Schlüssel und ohne Nutzungsbedingungen
 * auskommt, die man in einer Familien-App nicht lesen will. Es gehen ausschließlich
 * Koordinaten hinaus — keine Daten über das Kind.
 *
 * Einmal täglich geholt und in der Datenbank behalten: Der Dienst liefert nur ein
 * begrenztes Fenster in die Vergangenheit, unsere eigene Historie wächst dadurch mit.
 */

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";

/** So weit zurück liefert die Vorhersage-Schnittstelle Vergangenheit. */
const PAST_DAYS = 92;

export type WeatherRow = { day: string; tmax_dc: number | null; tmin_dc: number | null };

export function createWeatherStore(db: Db) {
  const upsert = db.prepare(`
    INSERT INTO weather (day, tmax_dc, tmin_dc, fetched_at)
    VALUES (@day, @tmax_dc, @tmin_dc, @fetched_at)
    ON CONFLICT(day) DO UPDATE SET
      tmax_dc = excluded.tmax_dc,
      tmin_dc = excluded.tmin_dc,
      fetched_at = excluded.fetched_at
  `);

  const selectRange = db.prepare<[string, string], WeatherRow>(
    "SELECT day, tmax_dc, tmin_dc FROM weather WHERE day >= ? AND day <= ? ORDER BY day",
  );

  const lastFetch = db.prepare<[], { fetched_at: string }>(
    "SELECT MAX(fetched_at) AS fetched_at FROM weather",
  );

  return {
    range(from: string, to: string) {
      return selectRange.all(from, to).map((r) => ({
        day: r.day,
        tmax: r.tmax_dc === null ? null : r.tmax_dc / 10,
        tmin: r.tmin_dc === null ? null : r.tmin_dc / 10,
      }));
    },

    /** Wann zuletzt geholt wurde — Grundlage für "höchstens einmal pro Stunde". */
    lastFetchedAt(): string | null {
      return lastFetch.get()?.fetched_at ?? null;
    },

    save(days: { day: string; tmax: number | null; tmin: number | null }[]) {
      const now = new Date().toISOString();
      db.transaction(() => {
        for (const d of days) {
          upsert.run({
            day: d.day,
            tmax_dc: d.tmax === null ? null : Math.round(d.tmax * 10),
            tmin_dc: d.tmin === null ? null : Math.round(d.tmin * 10),
            fetched_at: now,
          });
        }
      })();
    },
  };
}

export type WeatherStore = ReturnType<typeof createWeatherStore>;

export async function fetchDailyTemperatures(
  latitude: number,
  longitude: number,
  timezone: string,
  /** Optionaler Zeitraum — für Urlaube, die außerhalb des rollenden Fensters liegen. */
  range?: { from: string; to: string },
): Promise<{ day: string; tmax: number | null; tmin: number | null }[]> {
  // Für Zeiträume, die älter sind als das rollende Fenster der Vorhersage, das
  // Archiv befragen. Sonst käme für einen Urlaub im letzten Jahr schlicht nichts.
  const useArchive =
    !!range && daysAgo(range.to) > PAST_DAYS - 5;

  const url = new URL(useArchive ? ARCHIVE_URL : FORECAST_URL);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  // Die Zone mitgeben, damit die Tagesgrenzen des Dienstes zu unseren passen.
  url.searchParams.set("timezone", timezone);

  if (range) {
    url.searchParams.set("start_date", range.from);
    url.searchParams.set("end_date", range.to);
  } else {
    url.searchParams.set("past_days", String(PAST_DAYS));
    url.searchParams.set("forecast_days", "2");
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Open-Meteo antwortete mit ${response.status}`);

  const body = (await response.json()) as {
    daily?: {
      time?: string[];
      temperature_2m_max?: (number | null)[];
      temperature_2m_min?: (number | null)[];
    };
  };

  const times = body.daily?.time ?? [];
  return times.map((day, i) => ({
    day,
    tmax: body.daily?.temperature_2m_max?.[i] ?? null,
    tmin: body.daily?.temperature_2m_min?.[i] ?? null,
  }));
}

function daysAgo(day: string): number {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return Math.round((Date.now() - Date.UTC(y, m - 1, d, 12)) / 86_400_000);
}

export type Place = { name: string; latitude: number; longitude: number; admin?: string };

/** Ortssuche, damit niemand Koordinaten heraussuchen muss. */
export async function searchPlaces(query: string): Promise<Place[]> {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("name", query);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "de");
  url.searchParams.set("format", "json");

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Ortssuche antwortete mit ${response.status}`);

  const body = (await response.json()) as {
    results?: { name: string; latitude: number; longitude: number; admin1?: string }[];
  };

  return (body.results ?? []).map((r) => ({
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    admin: r.admin1,
  }));
}
