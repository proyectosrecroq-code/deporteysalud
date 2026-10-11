import type { Exercise, WorkoutBlock } from "./store";

/** Fisher-Yates: an unbiased shuffle (sorting with a random comparator is not). */
function pick<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, n);
}
const byCat = (ex: Exercise[], ...cats: string[]) => ex.filter((e) => cats.includes(e.category));

export type WorkoutType = "Completo" | "WOD" | "Hyrox" | "Sueltos";

export function generateWorkout(
  type: WorkoutType,
  ex: Exercise[],
): { title: string; blocks: WorkoutBlock[] } {
  if (type === "WOD") {
    const items = pick(byCat(ex, "Fuerza", "Aeróbico", "Core"), 4).map((e, i) => ({
      name: e.name,
      reps: String([10, 15, 12, 20][i]),
    }));
    return {
      title: "WOD · AMRAP 15'",
      blocks: [
        {
          block: "Calentamiento",
          items: pick(byCat(ex, "Calentamiento", "Activación"), 3).map((e) => ({
            name: e.name,
            reps: "3'",
          })),
        },
        { block: "AMRAP 15 minutos", items },
      ],
    };
  }
  if (type === "Hyrox") {
    const st = [
      "Skierg 1000m",
      "Sled push 50m",
      "Sled pull 50m",
      "Burpee broad jumps 80m",
      "Remo 1000m",
      "Farmer carry 200m",
      "Sandbag lunges 100m",
      "Wall balls 100",
    ];
    const items = st.flatMap((s) => [{ name: "Carrera 1 km" }, { name: s }]);
    return {
      title: "Simulación Hyrox",
      blocks: [
        { block: "Activación", items: [{ name: "Movilidad general", reps: "8'" }] },
        { block: "Estaciones", items },
      ],
    };
  }
  if (type === "Sueltos")
    return { title: "Ejercicios sueltos", blocks: [{ block: "Ejercicios", items: [] }] };
  return {
    title: "Entreno completo",
    blocks: [
      {
        block: "Calentamiento / Activación",
        items: [
          ...pick(byCat(ex, "Calentamiento"), 1).map((e) => ({ name: e.name, reps: "5'" })),
          ...pick(byCat(ex, "Activación", "Movilidad"), 2).map((e) => ({
            name: e.name,
            sets: "2",
            reps: "10",
          })),
        ],
      },
      {
        block: "Fuerza",
        items: pick(byCat(ex, "Fuerza"), 3).map((e) => ({ name: e.name, sets: "4", reps: "8" })),
      },
      {
        block: "Aeróbico",
        items: pick(byCat(ex, "Aeróbico"), 3).map((e) => ({
          name: e.name,
          reps: '45" on / 15" off ×4',
        })),
      },
    ],
  };
}
