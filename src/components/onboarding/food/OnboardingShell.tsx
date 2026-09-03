import { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import logo from "@/assets/aveto360-horizontal.png.asset.json";
import { cn } from "@/lib/utils";

interface OnboardingShellProps {
  currentStep: 1 | 2 | 3;
  children: ReactNode;
}

const STEPS = [
  { n: 1, label: "Dados da Empresa" },
  { n: 2, label: "Módulos" },
] as const;

export function OnboardingShell({ currentStep, children }: OnboardingShellProps) {
  return (
    <div className="min-h-screen bg-[hsl(var(--onboarding-canvas))] px-4 py-8 md:py-12">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <img src={logo.url} alt="Aveto 360" className="h-10 md:h-12 w-auto" />
        </div>

        {/* Stepper */}
        {currentStep < 3 && (
          <div className="flex items-center justify-center gap-2 md:gap-4">
            {STEPS.map((s, idx) => {
              const done = currentStep > s.n;
              const active = currentStep === s.n;
              return (
                <div key={s.n} className="flex items-center gap-2 md:gap-4">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                        done && "bg-primary text-primary-foreground",
                        active && "bg-primary text-primary-foreground ring-4 ring-primary/25",
                        !done && !active && "bg-white/10 text-white/70",
                      )}
                    >
                      {done ? <CheckCircle2 className="h-4 w-4" /> : s.n}
                    </div>
                    <span
                      className={cn(
                        "hidden sm:inline text-sm font-medium",
                        active ? "text-white" : "text-white/70",
                      )}
                    >
                      {s.label}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div
                      className={cn(
                        "h-0.5 w-8 md:w-16 rounded-full transition-colors",
                        currentStep > s.n ? "bg-primary" : "bg-white/20",
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Card */}
        <div className="rounded-2xl bg-[hsl(var(--onboarding-card))] p-6 md:p-8 shadow-2xl">
          {children}
        </div>

        <p className="text-center text-xs text-white/60">
          © {new Date().getFullYear()} Aveto 360 — Gestão inteligente para bares e restaurantes
        </p>
      </div>
    </div>
  );
}
