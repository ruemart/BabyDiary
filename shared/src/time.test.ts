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
  elapsedSince,
  startOfWeek,
  weekdayIndex,
} from "./time.ts";

const TZ = "Europe/Berlin";

describe("localDayKey", () => {
  it("assigns a UTC timestamp to the local calendar day", () => {
    // 22:30 UTC in summer = 00:30 local time on the NEXT day
    expect(localDayKey("2026-08-04T22:30:00Z", TZ)).toBe("2026-08-05");
    // 22:30 UTC in winter = 23:30 local, still the same day
    expect(localDayKey("2026-01-04T22:30:00Z", TZ)).toBe("2026-01-04");
  });

  it("holds the day boundary across the clock change", () => {
    // The night the clocks go back in 2026: 03:00 CEST -> 02:00 CET on 25 Oct 2026.
    // 00:30 UTC = 02:30 CEST, still the 25th.
    expect(localDayKey("2026-10-25T00:30:00Z", TZ)).toBe("2026-10-25");
    // 23:30 UTC = 00:30 MEZ am 26.
    expect(localDayKey("2026-10-25T23:30:00Z", TZ)).toBe("2026-10-26");
  });
});

describe("minutesIntoLocalDay", () => {
  it("returns wall-clock time, not UTC", () => {
    expect(minutesIntoLocalDay("2026-08-04T01:00:00Z", TZ)).toBe(3 * 60); // MESZ = UTC+2
    expect(minutesIntoLocalDay("2026-01-04T01:00:00Z", TZ)).toBe(2 * 60); // MEZ = UTC+1
  });

  it("maps midnight to 0, not to 1440", () => {
    expect(minutesIntoLocalDay("2026-08-04T22:00:00Z", TZ)).toBe(0);
  });

  it("does not shift a night feed across the clock change", () => {
    // A 03:00 local-time feed must come out as 180 both before AND after the change.
    expect(minutesIntoLocalDay("2026-10-20T01:00:00Z", TZ)).toBe(180); // MESZ
    expect(minutesIntoLocalDay("2026-10-30T02:00:00Z", TZ)).toBe(180); // MEZ
  });
});

describe("Calendar arithmetic", () => {
  it("counts days correctly across the clock change", () => {
    // Across the fall back (a 25-hour day): still exactly 2 days.
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    // Across the spring forward (a 23-hour day) in 2026: 29 March.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("counts across month and year boundaries", () => {
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2); // Schaltjahr
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });

  it("addDays is the inverse of daysBetween", () => {
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("Calendar weeks", () => {
  it("counts Monday as the first day of the week", () => {
    // 3 August 2026 is a Monday.
    expect(weekdayIndex("2026-08-03")).toBe(0);
    expect(weekdayIndex("2026-08-05")).toBe(2);
    // Sunday is the END of the week, not its start.
    expect(weekdayIndex("2026-08-09")).toBe(6);
  });

  it("finds the start of the week from any day of it", () => {
    for (const tag of ["2026-08-03", "2026-08-05", "2026-08-09"]) {
      expect(startOfWeek(tag)).toBe("2026-08-03");
    }
    // Sunday still belongs to the previous week.
    expect(startOfWeek("2026-08-02")).toBe("2026-07-27");
  });

  it("stays correct across the clock change", () => {
    // The clocks go back in the night of 25 Oct 2026.
    expect(startOfWeek("2026-10-25")).toBe("2026-10-19");
    expect(weekdayIndex("2026-10-26")).toBe(0);
  });

  it("carries the turn of the year", () => {
    // 1 January 2027 is a Friday.
    expect(weekdayIndex("2027-01-01")).toBe(4);
    expect(startOfWeek("2027-01-01")).toBe("2026-12-28");
  });
});

describe("Age of life", () => {
  const birth = "2026-06-15";

  it("counts the birthday as day 0 and week 0", () => {
    expect(ageInDays(birth, "2026-06-15T10:00:00Z", TZ)).toBe(0);
    expect(lifeWeek(birth, "2026-06-15T10:00:00Z", TZ)).toBe(0);
    // Day 6 is still week 0, day 7 is week 1
    expect(lifeWeek(birth, "2026-06-21T10:00:00Z", TZ)).toBe(0);
    expect(lifeWeek(birth, "2026-06-22T10:00:00Z", TZ)).toBe(1);
  });

  it("lifeWeekStart is the inverse of lifeWeek", () => {
    for (const week of [0, 1, 5, 26, 75]) {
      const start = lifeWeekStart(birth, week);
      expect(lifeWeek(birth, `${start}T12:00:00Z`, TZ)).toBe(week);
    }
  });

  it("counts leap weeks from the due date, not from birth", () => {
    // Premature: born 3 weeks before the due date.
    const birthEarly = "2026-05-25";
    const due = "2026-06-15";
    const at = "2026-07-20T12:00:00Z";
    expect(lifeWeek(birthEarly, at, TZ)).toBe(8); // seit Geburt
    expect(correctedWeek(due, birthEarly, at, TZ)).toBe(5); // seit ET — 3 Wochen weniger
  });

  it("falls back to the date of birth without a due date", () => {
    const at = "2026-07-20T12:00:00Z";
    expect(correctedWeek(null, birth, at, TZ)).toBe(lifeWeek(birth, at, TZ));
  });

  it("returns negative corrected weeks before the due date", () => {
    // A premature baby, still before the due date — the timeline has to cope with that.
    expect(correctedWeek("2026-06-15", "2026-05-25", "2026-06-01T12:00:00Z", TZ)).toBe(-2);
  });
});

describe("elapsedSince", () => {
  const now = new Date("2026-08-04T12:00:00Z");

  it("breaks elapsed time into a number and a unit", () => {
    // No words: the phrasing comes from the language files.
    expect(elapsedSince("2026-08-04T11:59:30Z", now)).toEqual({ unit: "now" });
    expect(elapsedSince("2026-08-04T11:15:00Z", now)).toEqual({ unit: "minutes", minutes: 45 });
    expect(elapsedSince("2026-08-04T09:45:00Z", now)).toEqual({
      unit: "hoursMinutes",
      hours: 2,
      minutes: 15,
    });
    expect(elapsedSince("2026-08-04T09:00:00Z", now)).toEqual({ unit: "hours", hours: 3 });
    expect(elapsedSince("2026-08-03T09:00:00Z", now)).toEqual({ unit: "days", days: 1 });
    expect(elapsedSince("2026-08-01T09:00:00Z", now)).toEqual({ unit: "days", days: 3 });
  });

  it("does not crash on timestamps from the future", () => {
    // It happens: a device with a wrongly set clock pushes an entry up.
    expect(elapsedSince("2026-08-04T12:05:00Z", now)).toEqual({ unit: "now" });
  });
});
