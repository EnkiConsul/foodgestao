import { Link } from "react-router-dom";
import { Gift } from "lucide-react";
import { FIDELIDADE_FREE_MONTHS, FIDELIDADE_TEXT } from "@/lib/marketing/content";
import { cn } from "@/lib/utils";

export function Fidelidade360() {
  const months = Array.from({ length: 12 }, (_, index) => index + 1);

  return (
    <div className="mt-14 overflow-hidden rounded-site-lg bg-gradient-site-hero p-7 text-white shadow-site-float sm:p-10">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-site-md bg-white/12">
          <Gift className="h-5 w-5" />
        </span>
        <h3 className="text-xl font-extrabold sm:text-2xl">{FIDELIDADE_TEXT.title}</h3>
      </div>

      <p className="mt-4 text-lg font-bold sm:text-xl">{FIDELIDADE_TEXT.claim}</p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/75">{FIDELIDADE_TEXT.detail}</p>

      <ol className="mt-8 grid grid-cols-6 gap-2 sm:grid-cols-12" aria-label="Linha do tempo dos 12 meses">
        {months.map((month) => {
          const free = FIDELIDADE_FREE_MONTHS.includes(month);
          return (
            <li
              key={month}
              className={cn(
                "rounded-site-md border p-2 text-center",
                free ? "border-site-success/60 bg-site-success/20" : "border-white/15 bg-white/5",
              )}
            >
              <span className="block text-[11px] font-semibold text-white/60">Mês</span>
              <span className="block text-base font-extrabold">{month}</span>
              <span className={cn("mt-1 block text-[10px] font-bold uppercase", free ? "text-white" : "text-white/55")}>
                {free ? "Grátis" : "Pago"}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-6 text-xs text-white/70">
        Programa promocional aplicável ao Financeiro 360°.{" "}
        <Link to="/termos-de-uso#fidelidade-360" className="font-bold text-white underline">
          Consulte o regulamento da oferta
        </Link>
        .
      </p>
    </div>
  );
}
