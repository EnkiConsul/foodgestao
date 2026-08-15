import { useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { DpColaborador } from "@/hooks/useDpColaboradores";
import { useDpBeneficios } from "@/hooks/useDpBeneficios";
import { contratoPolicy } from "@/lib/dp/contrato-policy";
import {
  FORMA_PAGAMENTO_LABEL,
  ASSIDUIDADE_CRITERIO_LABEL,
} from "@/lib/dp/remuneracao";
import { MOTIVO_DESLIGAMENTO_LABEL, ELEGIBILIDADE_LABEL } from "@/lib/dp/desligamento";
import {
  User, Briefcase, Mail, Phone, Clock, Wallet, Lock, LogOut, Shield, CheckCircle2, XCircle, Pencil,
} from "lucide-react";
import { maskCpf } from "@/lib/cpf";

const fmtDate = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const fmtCurrency = (v?: number | null) =>
  v == null || Number.isNaN(v)
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const VINCULO_LABEL: Record<string, string> = {
  CLT: "CLT efetivo",
  Intermitente: "CLT intermitente",
  Estagiario: "Estagiário",
  Temporario: "Temporário",
  PJ: "PJ",
  Socio: "Sócio",
  Freelancer: "Freelancer (sem registro)",
};

const vinculoLabel = (c: { regime?: string | null; vinculo_label?: string | null }): string =>
  (c.vinculo_label ? VINCULO_LABEL[c.vinculo_label] : null) ??
  (c.regime ? contratoPolicy(c.regime).label : null) ??
  "—";

const PERFIL_LABEL: Record<string, string> = {
  colaborador: "Colaborador",
  gestor: "Gestor",
  admin: "Admin",
};

const DIAS_SEMANA: Record<string, string> = {
  "0": "Domingo",
  "1": "Segunda-feira",
  "2": "Terça-feira",
  "3": "Quarta-feira",
  "4": "Quinta-feira",
  "5": "Sexta-feira",
  "6": "Sábado",
};

interface ColaboradorFichaDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  colaborador?: DpColaborador | null;
  onEdit: () => void;
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      <Separator />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-sm text-foreground">{value || "—"}</div>
    </div>
  );
}

export function ColaboradorFichaDialog({ open, onOpenChange, colaborador, onEdit }: ColaboradorFichaDialogProps) {
  if (!colaborador) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl" />
      </Dialog>
    );
  }

  const { atribuicoes } = useDpBeneficios(colaborador.id);

  const perfil = (colaborador as any)?.perfil_acesso as string | null;
  const isDesligado = !!colaborador?.data_desligamento;
  const folga = (colaborador as any)?.folga_fixa_semana;
  const possuiFolha = (colaborador as any)?.possui_folha_ponto as boolean | null;
  const optanteAdiantamento = (colaborador as any)?.optante_adiantamento as boolean | null;
  const acessoPortalAte = (colaborador as any)?.acesso_portal_ate as string | null;
  const userId = (colaborador as any)?.user_id as string | null;

  const beneficioAtivos = useMemo(
    () => atribuicoes.filter((a) => a.colaborador_id === colaborador?.id && a.ativo),
    [atribuicoes, colaborador?.id],
  );

  const formaPagamento = (colaborador as any)?.forma_pagamento as keyof typeof FORMA_PAGAMENTO_LABEL | null;
  const salarioBase = (colaborador as any)?.salario_base as number | null;
  const valorHora = (colaborador as any)?.valor_hora as number | null;
  const baseSalarial = (colaborador as any)?.base_salarial as number | null;
  const baseHorasMes = (colaborador as any)?.base_horas_mes as number | null;
  const baseDiasMes = (colaborador as any)?.base_dias_mes as number | null;
  const valorHoraManual = (colaborador as any)?.valor_hora_manual as boolean | null;
  const adicionalPercentual = (colaborador as any)?.adicional_percentual as number | null;
  const dependentesIrrf = (colaborador as any)?.dependentes_irrf as number | null;
  const valeTransporte = (colaborador as any)?.vale_transporte as boolean | null;
  const valeTransporteDia = (colaborador as any)?.vale_transporte_valor_dia as number | null;
  const premioAssiduidade = (colaborador as any)?.premio_assiduidade as boolean | null;
  const premioAssiduidadeValor = (colaborador as any)?.premio_assiduidade_valor as number | null;
  const assiduidadeCriterio = (colaborador as any)?.assiduidade_criterio as keyof typeof ASSIDUIDADE_CRITERIO_LABEL | null;
  const assiduidadeTolerancia = (colaborador as any)?.assiduidade_tolerancia_min as number | null;
  const assiduidadeMaxAtrasos = (colaborador as any)?.assiduidade_max_atrasos as number | null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-xl font-bold uppercase leading-tight">
                {colaborador?.nome || "Colaborador"}
              </DialogTitle>
              <DialogDescription className="mt-1">
                Ficha completa do colaborador. Clique em <strong>Editar</strong> para alterar os dados.
              </DialogDescription>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {colaborador?.ativo ? (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                  <XCircle className="h-3 w-3 mr-1" /> Desligado
                </Badge>
              )}
              <Badge
                variant="outline"
                className={
                  perfil === "admin"
                    ? "bg-destructive/10 text-destructive border-destructive/30"
                    : perfil === "gestor"
                    ? "bg-primary/10 text-primary border-primary/30"
                    : ""
                }
              >
                <Shield className="h-3 w-3 mr-1" />
                {PERFIL_LABEL[perfil ?? "colaborador"]}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Identificação */}
          <Section icon={User} title="Identificação">
            <Field label="CPF" value={colaborador?.cpf ? maskCpf(colaborador.cpf) : "—"} />
            <Field label="Matrícula" value={colaborador?.matricula} />
            <Field label="Tipo de Vínculo" value={vinculoLabel(colaborador as any)} />
            <Field label="Data de Nascimento" value={fmtDate((colaborador as any)?.data_nascimento)} />
          </Section>

          {/* Contato e vínculo */}
          <Section icon={Mail} title="Contato e Vínculo">
            <Field label="E-mail" value={(colaborador as any)?.email} />
            <Field label="WhatsApp" value={(colaborador as any)?.whatsapp} />
            <Field label="Cargo" value={colaborador?.cargo_nome ?? (colaborador as any)?.cargo} />
            <Field label="Unidade" value={colaborador?.unidade_nome} />
            <Field label="Data de Admissão" value={fmtDate((colaborador as any)?.data_admissao)} />
            <Field label="Folga Fixa Semanal" value={folga != null ? DIAS_SEMANA[String(folga)] : "—"} />
          </Section>

          {/* Jornada */}
          <Section icon={Clock} title="Jornada">
            <Field
              label="Folha de Ponto"
              value={possuiFolha ? "Sim — vinculado à folha de ponto" : "Não"}
            />
            <Field
              label="Adiantamento Salarial"
              value={optanteAdiantamento ? "Optante" : "Não optante"}
            />
          </Section>

          {/* Remuneração */}
          <Section icon={Wallet} title="Remuneração">
            <Field label="Forma de Pagamento" value={formaPagamento ? FORMA_PAGAMENTO_LABEL[formaPagamento] : "—"} />
            <Field label="Salário Base" value={fmtCurrency(salarioBase)} />
            <Field label="Valor da Hora" value={fmtCurrency(valorHora)} />
            <Field
              label="Base de Cálculo"
              value={
                baseSalarial != null
                  ? `${fmtCurrency(baseSalarial)} / ${baseHorasMes ?? "—"}h${baseDiasMes ? ` ou ${baseDiasMes} dias` : ""}${valorHoraManual ? " (valor manual)" : ""}`
                  : "—"
              }
            />
            <Field label="Adicional %" value={adicionalPercentual != null ? `${adicionalPercentual}%` : "—"} />
            <Field label="Dependentes IRRF" value={dependentesIrrf ?? "—"} />
            <Field
              label="Vale-Transporte"
              value={valeTransporte ? `Sim — ${fmtCurrency(valeTransporteDia)}/dia` : "Não"}
            />
            <Field
              label="Prêmio de Assiduidade"
              value={
                premioAssiduidade
                  ? `${fmtCurrency(premioAssiduidadeValor)} — ${assiduidadeCriterio ? ASSIDUIDADE_CRITERIO_LABEL[assiduidadeCriterio] : ""}`
                  : "Não"
              }
            />
            {premioAssiduidade && (
              <>
                <Field label="Tolerância de Atraso" value={assiduidadeTolerancia != null ? `${assiduidadeTolerancia} min` : "—"} />
                <Field label="Máx. Atrasos Tolerados" value={assiduidadeMaxAtrasos ?? "—"} />
              </>
            )}
          </Section>

          {/* Benefícios */}
          <Section icon={Briefcase} title="Benefícios">
            {beneficioAtivos.length > 0 ? (
              <div className="col-span-full flex flex-wrap gap-2">
                {beneficioAtivos.map((b) => (
                  <Badge key={b.id} variant="outline" className="text-xs">
                    {b.beneficio_nome ?? "Benefício"}
                    {b.valor ? ` — ${fmtCurrency(b.valor)}` : ""}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="col-span-full text-sm text-muted-foreground">Nenhum benefício ativo.</div>
            )}
          </Section>

          {/* Acesso ao portal */}
          <Section icon={Lock} title="Acesso ao Portal">
            <Field
              label="Usuário Vinculado"
              value={userId ? "Sim — acesso liberado via CPF" : "Não vinculado"}
            />
            {userId && (
              <Field label="Login (CPF)" value={colaborador?.cpf ? maskCpf(colaborador.cpf) : "—"} />
            )}
          </Section>

          {/* Desligamento */}
          {isDesligado && (
            <Section icon={LogOut} title="Desligamento">
              <Field label="Data da Demissão" value={fmtDate(colaborador?.data_desligamento)} />
              <Field
                label="Motivo"
                value={
                  MOTIVO_DESLIGAMENTO_LABEL[(colaborador as any)?.motivo_desligamento as keyof typeof MOTIVO_DESLIGAMENTO_LABEL]
                }
              />
              <Field
                label="Elegibilidade para Recontratação"
                value={
                  ELEGIBILIDADE_LABEL[(colaborador as any)?.elegivel_recontratacao as keyof typeof ELEGIBILIDADE_LABEL]
                }
              />
              <Field label="Acesso ao Portal Até" value={fmtDate(acessoPortalAte)} />
              <Field label="Observações" value={(colaborador as any)?.observacao_desligamento} />
            </Section>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onEdit();
            }}
          >
            <Pencil className="h-4 w-4 mr-2" /> Editar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
