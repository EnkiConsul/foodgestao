import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { formatBR, parseYMD } from "@/lib/dp/folga-rules";

export type VisaoCalendario = "convocados" | "disponiveis" | "indisponiveis";

interface Pessoa {
  colaborador_id?: string;
  nome: string;
  cargo_nome?: string | null;
  unidade_nome?: string | null;
  status?: string;
  entrada?: string;
  saida?: string;
  substituicao?: boolean;
  motivo?: string | null;
  alteracao_tardia?: boolean;
  telefone?: string;
  no_lugar_de?: string;
}
interface Dia { convocados: Pessoa[]; folguistas: Pessoa[]; disponiveis: Pessoa[]; indisponiveis: Pessoa[] }

function Linha({ p, extra }: { p: Pessoa; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
      <div className="min-w-0">
        <p className="font-medium">{p.nome}</p>
        <p className="text-muted-foreground">{p.cargo_nome ?? "—"} · {p.unidade_nome ?? "—"}</p>
      </div>
      {extra}
    </div>
  );
}

export function DiaDisponibilidadeDialog({
  data, unidadeId, visao, onClose,
}: { data: string | null; unidadeId: string | null; visao: VisaoCalendario; onClose: () => void }) {
  const { selectedCompanyId } = useCompanyContext();
  const q = useQuery({
    queryKey: ["dp_disponibilidade_dia", selectedCompanyId, unidadeId, data],
    enabled: !!data && !!selectedCompanyId,
    queryFn: async () => {
      const { data: r, error } = await (supabase.rpc as any)("dp_disponibilidade_dia", {
        _company_id: selectedCompanyId, _unidade_id: unidadeId, _data: data,
      });
      if (error) throw error;
      return r as Dia;
    },
  });
  const d = q.data;
  const vazio = (t: string) => <p className="py-4 text-center text-xs text-muted-foreground">{t}</p>;

  return (
    <Dialog open={!!data} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{data ? formatBR(parseYMD(data)) : ""}</DialogTitle>
        </DialogHeader>
        {q.isLoading || !d ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
        ) : (
          <Tabs defaultValue={visao}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="convocados">Convocados ({d.convocados.length + d.folguistas.length})</TabsTrigger>
              <TabsTrigger value="disponiveis">Disponíveis ({d.disponiveis.length})</TabsTrigger>
              <TabsTrigger value="indisponiveis">Indisponíveis ({d.indisponiveis.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="convocados" className="max-h-[55vh] space-y-1.5 overflow-y-auto">
              {d.convocados.length + d.folguistas.length === 0 && vazio("Ninguém convocado neste dia.")}
              {d.convocados.map((p) => (
                <Linha key={p.colaborador_id} p={p} extra={
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">{p.entrada}–{p.saida}</span>
                    <Badge variant={p.status === "aceita" ? "default" : "outline"} className="text-[10px]">
                      {p.status === "aceita" ? "Confirmada" : "Aguardando aceite"}
                    </Badge>
                    {p.substituicao ? <Badge variant="secondary" className="text-[10px]">Troca</Badge> : null}
                  </div>
                } />
              ))}
              {d.folguistas.map((p, i) => (
                <Linha key={`f${i}`} p={{ ...p, cargo_nome: "Folguista", unidade_nome: `no lugar de ${p.no_lugar_de}` }}
                  extra={<span className="text-muted-foreground">{p.telefone}</span>} />
              ))}
            </TabsContent>
            <TabsContent value="disponiveis" className="max-h-[55vh] space-y-1.5 overflow-y-auto">
              {d.disponiveis.length === 0 && vazio("Ninguém livre neste dia.")}
              {d.disponiveis.map((p) => <Linha key={p.colaborador_id} p={p} />)}
            </TabsContent>
            <TabsContent value="indisponiveis" className="max-h-[55vh] space-y-1.5 overflow-y-auto">
              {d.indisponiveis.length === 0 && vazio("Ninguém informou indisponibilidade.")}
              {d.indisponiveis.map((p) => (
                <Linha key={p.colaborador_id} p={p} extra={
                  <div className="flex items-center gap-1.5">
                    {p.motivo ? <span className="text-muted-foreground">{p.motivo}</span> : null}
                    {p.alteracao_tardia ? <Badge variant="outline" className="border-amber-500/50 text-[10px]">Tardia</Badge> : null}
                  </div>
                } />
              ))}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
