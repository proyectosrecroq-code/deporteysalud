// Logotipo provisional: se sustituirá por el logo real del centro.
export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = { sm: "text-2xl", md: "text-4xl", lg: "text-6xl md:text-7xl" }[size];
  return (
    <div className={`font-display font-black uppercase leading-none ${s}`}>
      <span className="text-foreground">Centro</span>{" "}
      <span className="text-primary italic">Funcional</span>
    </div>
  );
}
