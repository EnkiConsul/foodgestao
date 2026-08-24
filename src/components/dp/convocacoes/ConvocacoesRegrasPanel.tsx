import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DpContentCard } from "@/components/dp/DpPage";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import {
  useDpConvocacaoConfig,
  useSalvarConvocacaoConfig,
} from "@/hooks/useDpConvocacaoGrupos";

const EMPRESA = "__empresa__";

/** Regras de convocação por empresa ou por unidade (herança: unidade > empresa). */
export function ConvocacoesRegrasPanel() {
  const [escopo, setEscopo] = useState<string>(EMPRESA);
  const unidadeId = escopo === EMPRESA ? null : escopo;

  const unidades = useDpUnidades();
  const config = useDpConvocacaoConfig(unidadeId);
  const salvar = useSalvarConvocacaoConfig();

  const [form, setForm] = useState({
    antecedencia_minima_dias: 3,
    prazo_resposta_dias_uteis: 1,
    permite_oferta_aberta: true,
    exige_justificativa_excecao: true,
    reabre_vaga_em_desistencia: true,
    autonomia_colaborador_desistir: false,
    aprovacao_modo: "gestor",
    sub_intermitente_por_intermitente: true,
    sub_intermitente_por_freelancer: false,
    sub_freelancer_por_freelancer: true,
    sub_freelancer_por_intermitente: false,
    sub_fixo_em_folga_dominical: false,
  });
  const [expected, setExpected] = useState<string | null>(null);

  useEffect(() => {
    const c: any = config.data;
    if (!c) return;
    setForm({
      antecedencia_minima_dias: c.antecedencia_minima_dias ?? 3,
      prazo_resposta_dias_uteis: c.prazo_resposta_dias_uteis ?? 1,
      permite_oferta_aberta: !!c.permite_oferta_aberta,
      exige_justificativa_excecao: !!c.exige_justificativa_excecao,
      reabre_vaga_em_desistencia: !!c.reabre_vaga_em_desistencia,
      autonomia_colaborador_desistir: !!c.autonomia_colaborador_desistir,
      aprovacao_modo: c.aprovacao_modo ?? "gestor",
      sub_intermitente_por_intermitente: !!c.sub_intermitente_por_intermitente,
      sub_intermitente_por_freelancer: !!c.sub_intermitente_por_freelancer,
      sub_freelancer_por_freelancer: !!c.sub_freelancer_por_freelancer,
      sub_freelancer_por_intermitente: !!c.sub_freelancer_por_intermitente,
      sub_fixo_em_folga_dominical: !!c.sub_fixo_em_folga_dominical,
    });
    // Só há controle otimista quando a linha existe para o escopo escolhido.
    const mesmoEscopo = (c.unidade_id ?? null) === unidadeId;
    setExpected(mesmoEscopo ? (c.updated_at ?? null) : null);
  }, [config.data, unidadeId]);

  const herdada = config.data && (config.data as any).unidade_id !== unidadeId;

  const gravar = async () => {
    try {
      await salvar.mutateAsync({
        unidade_id: unidadeId,
        expected_updated_at: expected,
        ...form,
      });
      toast.success("Regras de convocação salvas.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível salvar as regras.");
    }
  };

  const switchRow = (
    key: keyof typeof form,
    titulo: string,
    descricao: string,
  ) => (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
      <div>
        <div className="text-sm font-medium">{titulo}</div>
        <p className="text-[11px] text-muted-foreground">{descricao}</p>
      </div>
      <Switch
        checked={form[key] as boolean}
        onCheckedChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
      />
    </div>
  );

  return (
    <DpContentCard>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <Label>Escopo das regras</Label>
            <Select value={escopo} onValueChange={setEscopo}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPRESA}>Empresa (padrão)</SelectItem>
                {(unidades.data ?? []).map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            {herdada && (
              <Badge variant="outline" className="text-[10px]">
                Herdando o padrão da empresa
              </Badge>
            )}
            <Button size="sm" onClick={gravar} disabled={salvar.isPending || config.isLoading}>
              {salvar.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              Salvar regras
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Antecedência mínima (dias corridos)</Label>
            <Input
              inputMode="numeric"
              value={String(form.antecedencia_minima_dias)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  antecedencia_minima_dias: Number(e.target.value.replace(/\D/g, "")) || 0,
                }))
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Abaixo disso o sistema avisa e exige justificativa — não bloqueia a operação.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Prazo de resposta (dias úteis)</Label>
            <Input
              inputMode="numeric"
              value={String(form.prazo_resposta_dias_uteis)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  prazo_resposta_dias_uteis: Number(e.target.value.replace(/\D/g, "")) || 0,
                }))
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Contado em dias úteis a partir do envio, independente do início do turno.
            </p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Aprovação do aceite</Label>
            <Select
              value={form.aprovacao_modo}
              onValueChange={(v) => setForm((f) => ({ ...f, aprovacao_modo: v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="automatico">Automático — aceite confirma a vaga</SelectItem>
                <SelectItem value="gestor">Gestor confirma antes de valer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {switchRow("permite_oferta_aberta", "Permitir oferta aberta", "Vagas ofertadas ao grupo elegível.")}
          {switchRow("exige_justificativa_excecao", "Exigir justificativa em exceção", "Fora da antecedência, registra quem autorizou.")}
          {switchRow("reabre_vaga_em_desistencia", "Reabrir vaga na desistência", "A vaga volta a ficar disponível automaticamente.")}
          {switchRow("autonomia_colaborador_desistir", "Colaborador pode desistir", "Permite desistência pelo portal, com registro.")}
          {switchRow("sub_intermitente_por_intermitente", "Intermitente cobre intermitente", "Substituição entre intermitentes.")}
          {switchRow("sub_intermitente_por_freelancer", "Freelancer cobre intermitente", "Use com cautela: vínculos diferentes.")}
          {switchRow("sub_freelancer_por_freelancer", "Freelancer cobre freelancer", "Substituição entre freelancers.")}
          {switchRow("sub_freelancer_por_intermitente", "Intermitente cobre freelancer", "Use com cautela: vínculos diferentes.")}
          {switchRow(
            "sub_fixo_em_folga_dominical",
            "Convocar quem está em folga dominical",
            "Chamar pessoa cuja folga cai no domingo. Não substitui o DSR: a folga precisa ser compensada em outro dia da mesma semana.",
          )}
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            As regras valem como orientação e trilha de auditoria. O banco revalida empresa,
            vínculo e permissões em toda gravação.
          </span>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] text-amber-800 dark:text-amber-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Consentimento — informativo.</strong> Na convocação de intermitente, o aceite é
            uma faculdade da pessoa: recusar não é falta e não gera punição. O sistema registra a
            resposta e a data, mas não coleta consentimento eletrônico com valor probatório próprio;
            o documento formal continua a cargo do contrato e da assessoria jurídica.
          </span>
        </div>

      </div>
    </DpContentCard>
  );
}
