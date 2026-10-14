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
  const lista = useDpColaboradores();
  const ativos = useMemo(() => (lista.data ?? []).filter((c) => c.ativo), [lista.data]);
  const q = useJornadasCalculadoraGestor(colabId);

  const origem: OrigemJornadas | undefined = colabId ? {
    chave: colabId,
    estado: q.isLoading ? "carregando" : q.isError ? "erro" : q.data?.semConfig ? "sem_config" : "ok",
    jornadas: q.data?.jornadas ?? [],
    incompletos: q.data?.incompletos ?? [],
  } : undefined;

  const topo = (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-2 pt-4">
        <div className="min-w-[14rem] flex-1">
          <Label htmlFor="calc-colab" className="text-xs">Colaborador (opcional)</Label>
          <Select value={colabId ?? ""} onValueChange={(v) => setColabId(v || null)} disabled={lista.isLoading}>
            <SelectTrigger id="calc-colab" aria-label="Selecionar colaborador">
              <SelectValue placeholder={lista.isLoading ? "Carregando…" : lista.isError ? "Erro ao carregar colaboradores" : "Simulação manual (sem colaborador)"} />
            </SelectTrigger>
            <SelectContent>
              {ativos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome_social || c.nome}</SelectItem>)}
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
  const d = q.data;
  const origem: OrigemJornadas = {
    chave: d && !d.semVinculo ? d.id : "meu",
    estado: q.isLoading ? "carregando" : q.isError ? "erro" : !d || d.semVinculo ? "sem_vinculo" : d.semConfig ? "sem_config" : "ok",
    jornadas: d && !d.semVinculo ? d.jornadas : [],
    incompletos: d && !d.semVinculo ? d.incompletos : [],
  };
  return <CalculadoraCompensacao perfil="colaborador" origem={origem} />;
}

export function DpMeuCalculadora() {
  return <DpCalculadora perfil="colaborador" />;
}
