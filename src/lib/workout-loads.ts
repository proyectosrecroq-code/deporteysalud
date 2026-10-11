import type { Workout, WorkoutBlock } from "./store";

/** Only explicitly recorded results count as completed loads; legacy load is not a prescription. */
export function previousLoad(
  workouts: Workout[],
  name: string,
  beforeDate: string,
  excludeId?: string,
) {
  for (const workout of [...workouts]
    .filter((w) => w.id !== excludeId && w.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date))) {
    for (const block of workout.blocks) {
      const item = block.items.find(
        (i) => i.name === name && i.recordedLoad !== undefined && i.recordedLoad !== "",
      );
      if (item) return { kg: item.recordedLoad, date: workout.date };
    }
  }
  return undefined;
}

export function editableBlocks(blocks: WorkoutBlock[]): WorkoutBlock[] {
  return blocks.map((block) => ({
    ...block,
    items: block.items.map(({ load: _legacy, ...item }) => ({ ...item })),
  }));
}

export const canRecordLoad = (sessionDate: string, today: string) => sessionDate <= today;
