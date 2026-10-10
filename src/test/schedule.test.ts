import { describe, it, expect } from "vitest";
import { slotMembers, validateAssignment } from "@/lib/schedule";

const mk = (id: string, day: string, t: string) => ({ id, active: true, schedule: { [day]: t } });

describe("aforo de sala", () => {
  it("cuenta 6 de horario de medias y el solapado sube a 7", () => {
    const ms = [1, 2, 3, 4, 5, 6].map((i) => mk(String(i), "L", "09:30"));
    ms.push(mk("x", "L", "10:00"));
    expect(slotMembers(ms, "L", "09:30").count).toBe(7);
    expect(slotMembers(ms, "L", "10:30").count).toBe(1);
  });
  it("no permite un 7º socio en hora media", () => {
    const ms = [1, 2, 3, 4, 5, 6].map((i) => mk(String(i), "L", "09:30"));
    expect(validateAssignment(ms, null, "L", "09:30", 6, 1)).not.toBeNull();
  });
  it("solo un socio puede solapar dos sesiones", () => {
    const ms = [mk("x", "L", "10:00")];
    expect(validateAssignment(ms, null, "L", "10:00", 6, 1)).not.toBeNull();
    expect(validateAssignment(ms, null, "L", "11:00", 6, 1)).not.toBeNull();
    expect(validateAssignment([], null, "L", "10:00", 6, 1)).toBeNull();
  });
});
