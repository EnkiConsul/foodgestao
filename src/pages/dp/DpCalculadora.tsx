import { useMemo, useState } from "react";
import { Calculator, RotateCcw } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import {
  CalculadoraCompensacao, type OrigemJornadas, type PerfilCalculadora,
} from "@/components/dp/calculadora/CalculadoraCompensacao";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useJornadasCalculadoraGestor, useJornadasCalculadoraMinhas } from "@/hooks/useCalculadoraJornadas";
import { unidadesDosColaboradores, colaboradoresDaUnidade, elegivelCompensacao, type RegraUnidadeComp, type ExcecaoComp } from "@/lib/dp/compensacao/filtroCalculadora";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ColaboradorFormDialog } from "@/components/dp/ColaboradorFormDialog";
import type { RascunhoDesligamento } from "@/components/dp/ColaboradorDesligamentoAvisoPanel";
import type { RegistrarDesligamento } from "@/components/dp/calculadora/CalculadoraDesligamento";

/** Calculadora de simulação (sem gravar nada). Gestor e colaborador usam a mesma tela. */
export default function DpCalculadora({ perfil = "gestor" }: { perfil?: PerfilCalculadora }) {
  return (
    <>
      <Helmet><title>Calculadora — Pessoas 360°</title></Helmet>
      <DpPage narrow>
        <DpPageHeader title="Calculadora" icon={Calculator} help={null} />
        {perfil === "gestor" ? <CalculadoraGestor /> : <CalculadoraColaborador />}
      </DpPage>
    </>
  );
}

function CalculadoraGestor() {
  const [colabId, setColabId] = useState<string | null>(null);
  const [unidade, setUnidade] = useState("todas");
  const [versao, setVersao] = useState(0);
  const [aba, setAba] = useState("compensatoria");
  const novaSimulacao = () => { setColabId(null); setUnidade("todas"); setAba("compensatoria"); setVersao((v) => v + 1); };
  const lista = useDpColaboradores();
  const { selectedCompanyId } = useCompanyContext();
  // Só quem tem banco de horas ou compensação de feriados (unidade + exceção individual).
  const regras = useQuery({
    queryKey: ["calc_elegiveis", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const [u, e] = await Promise.all([
        supabase.from("dp_unidades").select("id, banco_horas, compensa_feriados").eq("company_id", selectedCompanyId!),
        supabase.from("dp_colaborador_compensacao").select("colaborador_id, usa_banco_horas, usa_compensa_feriados").eq("company_id", selectedCompanyId!),
      ]);
      if (u.error) throw u.error;
      if (e.error) throw e.error;
      return {
        un: new Map((u.data ?? []).map((r) => [r.id as string, r as RegraUnidadeComp])),
        ex: new Map((e.data ?? []).map((r) => [r.colaborador_id as string, r as ExcecaoComp])),
      };
    },
  });
  const [ficha, setFicha] = useState<RascunhoDesligamento | null>(null);
  // Desligamento: todos os CLT ativos; as demais abas mantêm o filtro de compensação.
  const elegiveis = useMemo(() => (lista.data ?? []).filter((c) => aba === "desligamento"
    ? c.ativo && !c.data_desligamento && c.regime === "clt"
    : regras.data && elegivelCompensacao(c.unidade_id ? regras.data.un.get(c.unidade_id) : undefined, regras.data.ex.get(c.id))),
  [lista.data, regras.data, aba]);
  const trocarAba = (a: string) => { setAba(a); setColabId(null); };
  const procAberto = useQuery({
    queryKey: ["dp_desligamento_processo_aberto", colabId],
    enabled: !!colabId && aba === "desligamento",
    queryFn: async () => {
      const { data } = await supabase.from("dp_desligamento_processos").select("id")
        .eq("colaborador_id", colabId!).in("status", ["aviso_em_curso", "suspenso", "aguardando_revisao"]).maybeSingle();
      return !!data;
    },
  });
  const colabSel = (lista.data ?? []).find((c) => c.id === colabId) ?? null;
  const registrar: RegistrarDesligamento = {
    rotulo: procAberto.data ? "Abrir desligamento" : "Registrar desligamento",
    bloqueio: colabSel ? null : "Selecione um colaborador acima para registrar. Na simulação manual não há cadastro a abrir.",
    abrir: (r) => setFicha(procAberto.data ? {} : r),
  };
  const unidades = useMemo(() => unidadesDosColaboradores(elegiveis), [elegiveis]);
  const filtrados = useMemo(() => colaboradoresDaUnidade(elegiveis, unidade), [elegiveis, unidade]);
  const q = useJornadasCalculadoraGestor(colabId);

  const origem: OrigemJornadas | undefined = colabId ? {
    chave: colabId,
    estado: q.isLoading ? "carregando" : q.isError ? "erro" : q.data?.semConfig ? "sem_config" : "ok",
    jornadas: q.data?.jornadas ?? [],
    incompletos: q.data?.incompletos ?? [],
    unidadeId: (lista.data ?? []).find((c) => c.id === colabId)?.unidade_id ?? null,
    companyId: selectedCompanyId,
    colaboradorId: colabId,
  } : undefined;

  const vazio = !lista.isLoading && !regras.isLoading && !lista.isError && filtrados.length === 0;
  const topo = (
    <Card>
      <CardContent className="grid gap-2 pt-4 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
        <div>
          <Label htmlFor="calc-unidade" className="text-xs">Unidade</Label>
          <Select value={unidade} onValueChange={(v) => { setUnidade(v); setColabId(null); }}>
            <SelectTrigger id="calc-unidade" aria-label="Filtrar unidade"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as unidades</SelectItem>
              {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="calc-colab" className="text-xs">Colaborador (opcional)</Label>
          <Select value={colabId ?? ""} onValueChange={(v) => setColabId(v || null)} disabled={lista.isLoading || vazio}>
            <SelectTrigger id="calc-colab" aria-label="Selecionar colaborador">
              <SelectValue placeholder={lista.isLoading ? "Carregando…" : lista.isError ? "Erro ao carregar colaboradores" : vazio ? (aba === "desligamento" ? "Nenhum colaborador CLT ativo" : "Nenhum colaborador com banco de horas ou compensação de feriados") : "Simulação manual (sem colaborador)"} />
            </SelectTrigger>
            <SelectContent>
              {filtrados.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={novaSimulacao}><RotateCcw className="h-4 w-4" /> Nova simulação</Button>
      </CardContent>
    </Card>
  );
  const admissao = (lista.data ?? []).find((c) => c.id === colabId)?.data_admissao ?? null;
  return (
    <>
      <CalculadoraCompensacao key={versao} perfil="gestor" origem={origem} topo={topo} admissao={admissao} onAbaChange={trocarAba} registrar={registrar} />
      {colabSel && ficha && (
        <ColaboradorFormDialog open onOpenChange={(o) => { if (!o) setFicha(null); }} colaborador={colabSel}
          abaInicial="desligamento" rascunhoDesligamento={Object.keys(ficha).length ? ficha : null} />
      )}
    </>
  );
}

function CalculadoraColaborador() {
  const q = useJornadasCalculadoraMinhas();
  const v = q.data && q.data.semVinculo === false ? q.data : null;
  const origem: OrigemJornadas = {
    chave: v?.id ?? "meu",
    estado: q.isLoading ? "carregando" : q.isError ? "erro" : !v ? "sem_vinculo" : v.semConfig ? "sem_config" : "ok",
    jornadas: v?.jornadas ?? [],
    incompletos: v?.incompletos ?? [],
    unidadeId: v?.unidadeId ?? null,
    companyId: v?.companyId ?? null,
    colaboradorId: v?.id ?? null,
  };
  return <CalculadoraCompensacao perfil="colaborador" origem={origem} />;
}

export function DpMeuCalculadora() {
  return <DpCalculadora perfil="colaborador" />;
}
