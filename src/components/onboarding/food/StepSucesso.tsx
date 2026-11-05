import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight, Wallet, Users, Check } from "lucide-react";
import { MODULES } from "@/lib/modules";

interface Props {
  nomeFantasia: string;
  razaoSocial: string;
  modulosSlugs: string[];
  lojaCriada?: boolean;
  trialTerminaEm: string;
  onContinuar: (destino?: string) => void;
}

export function StepSucesso({ nomeFantasia, razaoSocial, modulosSlugs, lojaCriada, trialTerminaEm, onContinuar }: Props) {
  const modulosAtivos = MODULES.filter((m) => modulosSlugs.includes(m.slug));
  const fim = new Date(trialTerminaEm).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const temFin = modulosSlugs.includes("financeiro");
  const temDp = modulosSlugs.includes("dp");

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
          <p className="text-xs font-medium text-muted-foreground">Empresa</p>
          <p className="font-semibold text-foreground">{nomeFantasia || razaoSocial}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Módulos ativados</p>
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
        {(temFin || lojaCriada) && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Já deixamos pronto para você</p>
            <ul className="mt-1 space-y-1 text-sm text-foreground">
              {temFin && (
                <li className="flex items-start gap-2"><Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />DRE e categorias de food service (CMV, custos, pessoal)</li>
              )}
              {lojaCriada && (
                <li className="flex items-start gap-2"><Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />Loja {nomeFantasia || razaoSocial} cadastrada no Pessoas 360°</li>
              )}
            </ul>
          </div>
        )}
        <div className="rounded-lg bg-primary/10 px-3 py-2">
          <p className="text-xs text-muted-foreground">Teste gratuito até</p>
          <p className="font-semibold text-primary">{fim}</p>
        </div>
      </div>

      {temFin && temDp ? (
        <div className="space-y-2 text-left">
          <p className="text-sm font-semibold text-foreground text-center">Por onde você quer começar hoje?</p>
          <FocoCard icon={Wallet} titulo="Organizar o caixa e as contas" desc="Conectar o banco e lançar contas a pagar e receber" onClick={() => onContinuar("/dashboard")} />
          <FocoCard icon={Users} titulo="Cadastrar a equipe e a escala" desc="Importar fichas de registro ou enviar pré-admissão" onClick={() => onContinuar("/dp")} />
          <p className="text-xs text-muted-foreground text-center">Você pode trocar de módulo a qualquer momento.</p>
        </div>
      ) : (
        <Button size="lg" className="h-12 w-full" onClick={() => onContinuar(temDp ? "/dp" : temFin ? "/dashboard" : "/hub")}>
          {temDp ? "Acessar Pessoas 360°" : temFin ? "Acessar Financeiro" : "Acessar Painel"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function FocoCard({ icon: Icon, titulo, desc, onClick }: { icon: typeof Wallet; titulo: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-card p-4 text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[64px]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">{titulo}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
    </button>
  );
}
