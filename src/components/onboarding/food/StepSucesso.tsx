import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { MODULES } from "@/lib/modules";

interface Props {
  nomeFantasia: string;
  razaoSocial: string;
  modulosSlugs: string[];
  trialTerminaEm: string;
  onContinuar: () => void;
}

export function StepSucesso({ nomeFantasia, razaoSocial, modulosSlugs, trialTerminaEm, onContinuar }: Props) {
  const modulosAtivos = MODULES.filter((m) => modulosSlugs.includes(m.slug));
  const fim = new Date(trialTerminaEm).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="space-y-6 text-center py-4">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <CheckCircle2 className="h-8 w-8" />
      </div>

      <div className="space-y-2">
        <h2 className="font-display text-2xl font-bold text-foreground">
          Cadastro concluído!
        </h2>
        <p className="text-sm text-muted-foreground">
          Bem-vindo(a) ao Aveto 360. Sua empresa já está pronta para operar.
        </p>
      </div>

      <div className="rounded-xl border bg-muted/40 p-4 text-left space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Empresa</p>
          <p className="font-semibold text-foreground">{nomeFantasia || razaoSocial}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Módulos ativados</p>
          <ul className="mt-1 space-y-1">
            {modulosAtivos.map((m) => {
              const Icon = m.icon;
              return (
                <li key={m.slug} className="flex items-center gap-2 text-sm text-foreground">
                  <Icon className="h-4 w-4 text-primary" />
                  {m.name}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="rounded-lg bg-primary/10 px-3 py-2">
          <p className="text-xs text-muted-foreground">Teste gratuito até</p>
          <p className="font-semibold text-primary">{fim}</p>
        </div>
      </div>

      <Button size="lg" className="w-full" onClick={onContinuar}>
        Acessar Painel
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}
