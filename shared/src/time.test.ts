import { describe, expect, it } from "vitest";
import {
  addDays,
  ageInDays,
  correctedWeek,
  daysBetween,
  lifeWeek,
  lifeWeekStart,
  localDayKey,
  minutesIntoLocalDay,
  relativeSince,
} from "./time.js";

const TZ = "Europe/Berlin";

describe("localDayKey", () => {
  it("ordnet einen UTC-Zeitstempel dem lokalen Kalendertag zu", () => {
    // 22:30 UTC im Sommer = 00:30 lokaler Zeit am FOLGETAG
    expect(localDayKey("2026-08-04T22:30:00Z", TZ)).toBe("2026-08-05");
    // 22:30 UTC im Winter = 23:30 lokal, noch derselbe Tag
    expect(localDayKey("2026-01-04T22:30:00Z", TZ)).toBe("2026-01-04");
  });

  it("hält die Tagesgrenze über die Zeitumstellung hinweg", () => {
    // Nacht der Rückstellung 2026: 03:00 MESZ -> 02:00 MEZ am 25.10.2026
    // 00:30 UTC = 02:30 MESZ, noch der 25.
    expect(localDayKey("2026-10-25T00:30:00Z", TZ)).toBe("2026-10-25");
    // 23:30 UTC = 00:30 MEZ am 26.
    expect(localDayKey("2026-10-25T23:30:00Z", TZ)).toBe("2026-10-26");
  });
});

describe("minutesIntoLocalDay", () => {
  it("liefert Wanduhrzeit, nicht UTC", () => {
    expect(minutesIntoLocalDay("2026-08-04T01:00:00Z", TZ)).toBe(3 * 60); // MESZ = UTC+2
    expect(minutesIntoLocalDay("2026-01-04T01:00:00Z", TZ)).toBe(2 * 60); // MEZ = UTC+1
  });

  it("bildet Mitternacht auf 0 ab, nicht auf 1440", () => {
    expect(minutesIntoLocalDay("2026-08-04T22:00:00Z", TZ)).toBe(0);
  });

  it("verschiebt eine Nachtmahlzeit über die Zeitumstellung nicht", () => {
    // Eine 03:00-Fütterung lokaler Zeit muss vor UND nach der Umstellung 180 ergeben.
    expect(minutesIntoLocalDay("2026-10-20T01:00:00Z", TZ)).toBe(180); // MESZ
    expect(minutesIntoLocalDay("2026-10-30T02:00:00Z", TZ)).toBe(180); // MEZ
  });
});

describe("Kalenderarithmetik", () => {
  it("zählt Tage über die Zeitumstellung korrekt", () => {
    // Über die Rückstellung (ein 25-Stunden-Tag): trotzdem genau 2 Tage.
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    // Über die Vorstellung (ein 23-Stunden-Tag) 2026: 29.03.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("zählt über Monats- und Jahresgrenzen", () => {
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2); // Schaltjahr
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });

  it("addDays ist die Umkehrung von daysBetween", () => {
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("Lebensalter", () => {
  const birth = "2026-06-15";

  it("zählt den Geburtstag als Tag 0 und Woche 0", () => {
    expect(ageInDays(birth, "2026-06-15T10:00:00Z", TZ)).toBe(0);
    expect(lifeWeek(birth, "2026-06-15T10:00:00Z", TZ)).toBe(0);
    // Tag 6 ist noch Woche 0, Tag 7 ist Woche 1
    expect(lifeWeek(birth, "2026-06-21T10:00:00Z", TZ)).toBe(0);
    expect(lifeWeek(birth, "2026-06-22T10:00:00Z", TZ)).toBe(1);
  });

  it("lifeWeekStart ist die Umkehrung von lifeWeek", () => {
    for (const week of [0, 1, 5, 26, 75]) {
      const start = lifeWeekStart(birth, week);
      expect(lifeWeek(birth, `${start}T12:00:00Z`, TZ)).toBe(week);
    }
  });

  it("rechnet Sprungwochen ab errechnetem Termin, nicht ab Geburt", () => {
    // Frühchen: 3 Wochen vor dem Termin geboren.
    const birthEarly = "2026-05-25";
    const due = "2026-06-15";
    const at = "2026-07-20T12:00:00Z";
    expect(lifeWeek(birthEarly, at, TZ)).toBe(8); // seit Geburt
    expect(correctedWeek(due, birthEarly, at, TZ)).toBe(5); // seit ET — 3 Wochen weniger
  });

  it("fällt ohne ET auf das Geburtsdatum zurück", () => {
    const at = "2026-07-20T12:00:00Z";
    expect(correctedWeek(null, birth, at, TZ)).toBe(lifeWeek(birth, at, TZ));
  });

  it("liefert vor dem Termin negative korrigierte Wochen", () => {
    // Frühchen, noch vor dem errechneten Termin — der Zeitstrahl muss das aushalten.
    expect(correctedWeek("2026-06-15", "2026-05-25", "2026-06-01T12:00:00Z", TZ)).toBe(-2);
  });
});

describe("relativeSince", () => {
  const now = new Date("2026-08-04T12:00:00Z");

  it("formatiert die Statuszeile", () => {
    expect(relativeSince("2026-08-04T11:59:30Z", now)).toBe("gerade eben");
    expect(relativeSince("2026-08-04T11:15:00Z", now)).toBe("vor 45 Min");
    expect(relativeSince("2026-08-04T09:45:00Z", now)).toBe("vor 2 Std 15 Min");
    expect(relativeSince("2026-08-04T09:00:00Z", now)).toBe("vor 3 Std");
    expect(relativeSince("2026-08-03T09:00:00Z", now)).toBe("vor 1 Tag");
    expect(relativeSince("2026-08-01T09:00:00Z", now)).toBe("vor 3 Tagen");
  });

  it("stürzt bei Zeitstempeln aus der Zukunft nicht ab", () => {
    expect(relativeSince("2026-08-04T12:05:00Z", now)).toBe("gerade eben");
  });
});
