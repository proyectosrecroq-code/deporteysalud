import logo from "@/assets/logo-transparent.png.asset.json";

export const LOGO_URL = logo.url;

export function Logo({ size = "md", withText = true }: { size?: "sm" | "md" | "lg"; withText?: boolean }) {
  const img = { sm: "h-9 w-9", md: "h-16 w-16", lg: "h-36 w-36 md:h-44 md:w-44" }[size];
  const txt = { sm: "text-xl", md: "text-3xl", lg: "text-5xl md:text-6xl" }[size];
  return (
    <div className={`flex items-center gap-3 ${size === "lg" ? "flex-col" : ""}`}>
      <img src={logo.url} alt="Logo Centro Funcional" className={`${img} object-contain`} />
      {withText && (
        <div className={`font-display font-black uppercase leading-none ${txt}`}>
          <span className="text-foreground">Centro</span> <span className="italic text-primary">Funcional</span>
        </div>
      )}
    </div>
  );
}
