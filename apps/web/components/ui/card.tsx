import { cn } from "@/lib/utils";

type CardProps = { children: React.ReactNode; className?: string };

export function Card({ children, className }: CardProps) {
  return (
    <section
      className={cn("rounded-2xl p-5", className)}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      {children}
    </section>
  );
}
