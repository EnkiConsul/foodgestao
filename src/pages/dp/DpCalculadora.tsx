import { useMemo, useState } from "react";
import { Calculator, X } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import {
  CalculadoraCompensacao, type OrigemJornadas, type PerfilCalculadora,
} from "@/components/dp/calculadora/CalculadoraCompensacao";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useJornadasCalculadoraGestor, useJornadasCalculadoraMinhas } from "@/hooks/useCalculadoraJornadas";
import { unidadesDosColaboradores, colaboradoresDaUnidade } from "@/lib/dp/compensacao/filtroCalculadora";

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
  const lista = useDpColaboradores();
  const unidades = useMemo(() => unidadesDosColaboradores(lista.data ?? []), [lista.data]);
  const filtrados = useMemo(() => colaboradoresDaUnidade(lista.data ?? [], unidade), [lista.data, unidade]);
  const q = useJornadasCalculadoraGestor(colabId);

  const origem: OrigemJornadas | undefined = colabId ? {
    chave: colabId,
    estado: q.isLoading ? "carregando" : q.isError ? "erro" : q.data?.semConfig ? "sem_config" : "ok",
    jornadas: q.data?.jornadas ?? [],
    incompletos: q.data?.incompletos ?? [],
    unidadeId: (lista.data ?? []).find((c) => c.id === colabId)?.unidade_id ?? null,
  } : undefined;

  const vazio = !lista.isLoading && !lista.isError && filtrados.length === 0;
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
              <SelectValue placeholder={lista.isLoading ? "Carregando…" : lista.isError ? "Erro ao carregar colaboradores" : vazio ? "Nenhum colaborador ativo nesta unidade" : "Simulação manual (sem colaborador)"} />
            </SelectTrigger>
            <SelectContent>
              {filtrados.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {colabId && (
          <Button variant="outline" size="sm" onClick={() => setColabId(null)}><X className="h-4 w-4" /> Simulação manual</Button>
        )}
      </CardContent>
    </Card>
  );
  return <CalculadoraCompensacao perfil="gestor" origem={origem} topo={topo} />;
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
  };
  return <CalculadoraCompensacao perfil="colaborador" origem={origem} />;
}

export function DpMeuCalculadora() {
  return <DpCalculadora perfil="colaborador" />;
}
