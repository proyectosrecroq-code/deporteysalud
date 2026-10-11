import { describe, it, expect } from "vitest";
import { weekStart, requestDate, weekSchedules } from "@/lib/schedule";

describe("week navigation", () => {
  it("monday of week and offsets", () => {
    expect(weekStart(new Date(2026, 9, 10)).getDate()).toBe(5);
    expect(weekStart(new Date(2026, 9, 10), -1).getDate()).toBe(28);
  });
  it("approved absence only removes that week's session", () => {
    const m = [{ id: "a", active: true, schedule: { L: "09:30" } }];
    const r = [
      {
        member_id: "a",
        type: "ausencia",
        day: "L",
        desired_time: null,
        status: "aprobado",
        created_at: "2026-10-07T10:00:00",
      },
    ];
    expect(requestDate(r[0]!.created_at, "L")).toBe("2026-10-12");
    expect(weekSchedules(m, r, new Date(2026, 9, 12))[0]!.schedule.L).toBeUndefined();
    expect(weekSchedules(m, r, new Date(2026, 9, 5))[0]!.schedule.L).toBe("09:30");
  });
});
