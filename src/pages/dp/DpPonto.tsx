import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Fingerprint } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpPontos } from "@/hooks/useDpPonto";
import { useDpHorarioPrevisto } from "@/hooks/useDpHorarioPrevisto";
import { textoPrevisto } from "@/lib/dp/horario-previsto";
import { diasDaCompetencia } from "@/lib/dp/escala-mes";
import {
  consolidarDia,
  totalizarPeriodo,
  formatarDuracao,
  formatarSaldo,
  horaDaMarcacao,
  ORDEM_MARCACOES,
  PONTO_TIPO_LABEL,
  STATUS_DIA_LABEL,
  type PontoTipo,
} from "@/lib/dp/ponto";

import { DpPage, DpPageHeader, DpFilterCard, DpContentCard } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const competenciaAtual = () => new Date().toISOString().slice(0, 7);

const somarMes = (comp: string, delta: number) => {
  const [ano, mes] = comp.split("-").map(Number);
  const d = new Date(ano, mes - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const rotuloMes = (comp: string) =>
  new Date(`${comp}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

const rotuloDia = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

const hojeIso = () => new Date().toISOString().slice(0, 10);

export default function DpPonto() {
  const { selectedCompanyId } = useCompanyContext();
  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [colaboradorId, setColaboradorId] = useState<string>("");

  const dias = useMemo(() => diasDaCompetencia(competencia), [competencia]);
  const inicio = dias[0];
  const fim = dias[dias.length - 1];

  const colaboradores = useQuery({
    queryKey: ["dp_colaboradores_ponto", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("id, nome")
        .eq("company_id", selectedCompanyId!)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const selecionado = colaboradorId || colaboradores.data?.[0]?.id || "";
  const { porColaboradorData, isLoading, error, lancar } = useDpPontos(inicio, fim, selecionado || null);
  const { porData: previstoPorData } = useDpHorarioPrevisto(selecionado || null, competencia);

  const hoje = hojeIso();
  const resumos = useMemo(
    () =>
      dias.map((data) =>
        consolidarDia({
          data,
          previsto: previstoPorData.get(data) ?? null,
          marcacoes: porColaboradorData.get(`${selecionado}|${data}`) ?? [],
          encerrado: data < hoje,
        }),
      ),
    [dias, previstoPorData, porColaboradorData, selecionado, hoje],
  );

  const totais = useMemo(() => totalizarPeriodo(resumos), [resumos]);

  const salvarHora = (data: string, tipo: PontoTipo, hora: string) => {
    if (!selecionado || !hora) return;
    lancar.mutate(
      { colaborador_id: selecionado, data, tipo, hora },
      {
        onSuccess: () => toast.success(`${PONTO_TIPO_LABEL[tipo]} de ${rotuloDia(data)} atualizada.`),
        onError: (e: unknown) => toast.error((e as Error).message ?? "Não foi possível salvar a marcação."),
      },
    );
  };

  if (error) return <DpErrorState message="Não foi possível carregar o espelho de ponto." />;

  return (
    <DpPage>
      <Helmet>
        <title>Espelho de Ponto | DP 360°FOOD</title>
        <meta
          name="description"
          content="Acompanhe as marcações de ponto do time, compare com o horário previsto e corrija lançamentos."
        />
      </Helmet>

      <DpPageHeader
        title="Espelho de Ponto"
        description="Marcações do mês comparadas ao horário previsto."
        icon={Fingerprint}
      />

      <DpFilterCard>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Colaborador</Label>
            <Select value={selecionado} onValueChange={setColaboradorId}>
              <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
              <SelectContent>
                {(colaboradores.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Competência</Label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => setCompetencia(somarMes(competencia, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="flex-1 text-center text-sm font-medium first-letter:uppercase">
                {rotuloMes(competencia)}
              </span>
              <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => setCompetencia(somarMes(competencia, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </DpFilterCard>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !selecionado ? (
        <DpContentCard contentClassName="p-6">
          <p className="text-sm text-muted-foreground">Cadastre colaboradores para acompanhar o ponto.</p>
        </DpContentCard>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Trabalhado", valor: formatarDuracao(totais.minutosTrabalhados) },
              { label: "Previsto", valor: formatarDuracao(totais.minutosPrevistos) },
              { label: "Saldo", valor: formatarSaldo(totais.saldoMinutos) },
              { label: "Faltas", valor: String(totais.faltas) },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-lg font-semibold">{c.valor}</p>
              </div>
            ))}
          </div>

          <DpContentCard contentClassName="p-0">
            <ul className="divide-y">
              {resumos.map((r) => {
                const previsto = previstoPorData.get(r.data) ?? null;
                const marcacoes = porColaboradorData.get(`${selecionado}|${r.data}`) ?? [];
                return (
                  <li key={r.data} className={`space-y-2 p-3 ${r.data === hoje ? "bg-muted/60" : ""}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium capitalize">{rotuloDia(r.data)}</p>
                        <p className="text-xs text-muted-foreground">
                          Previsto: {previsto ? textoPrevisto(previsto) : "Sem previsão"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.saldoMinutos !== 0 && (
                          <span className="text-xs text-muted-foreground">{formatarSaldo(r.saldoMinutos)}</span>
                        )}
                        <Badge variant={r.status === "falta" ? "destructive" : "outline"}>
                          {STATUS_DIA_LABEL[r.status]}
                        </Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {ORDEM_MARCACOES.map((tipo) => {
                        const m = marcacoes.find((x) => x.tipo === tipo);
                        return (
                          <div key={tipo} className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">{PONTO_TIPO_LABEL[tipo]}</Label>
                            <Input
                              type="time"
                              aria-label={`${PONTO_TIPO_LABEL[tipo]} em ${rotuloDia(r.data)}`}
                              defaultValue={m ? horaDaMarcacao(m.registrado_em) : ""}
                              onBlur={(e) => {
                                const valor = e.target.value;
                                const atual = m ? horaDaMarcacao(m.registrado_em) : "";
                                if (valor && valor !== atual) salvarHora(r.data, tipo, valor);
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </DpContentCard>
        </>
      )}
    </DpPage>
  );
}
