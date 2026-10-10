import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { WorkoutEditor } from "@/components/WorkoutEditor";
import { useAppData, fullName } from "@/lib/store";

export const Route = createFileRoute("/app/entrenos")({ component: Entrenos });

function Entrenos() {
  const { data } = useAppData();
  const [id, setId] = useState("");
  if (!data) return null;
  const members = [...data.members].sort((a, b) => a.first_name.localeCompare(b.first_name));
  const sel = id || members[0]?.id;
  const m = members.find((x) => x.id === sel);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-black uppercase">Entrenos</h1>
        <select className="field ml-auto w-full sm:w-72" value={sel} onChange={(e) => setId(e.target.value)}>
          {members.map((x) => <option key={x.id} value={x.id}>{fullName(x)}</option>)}
        </select>
      </div>
      {m && (
        <>
          {m.conditions.length > 0 && <div className="flex flex-wrap gap-1">{m.conditions.map((c) => <span key={c} className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">{c}</span>)}</div>}
          <WorkoutEditor key={m.id} memberId={m.id} />
        </>
      )}
    </div>
  );
}
