import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { History, Loader2, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { notifyError } from "@/lib/notifyError";
import { aplicarHistoricoFicha, historicoDaFicha, type Linha } from "@/lib/dp/ficha-registro/historico";

type Item = {
  id: string;
  nome_extraido: string | null;
  colaborador_id: string | null;
  colaborador_existente_id: string | null;
  dados_extraidos: unknown;
};

const dataBr = (v: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof v === "string" ? v : "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};

/**
 * Varredura retroativa do histórico (férias, afastamentos e advertências) nas
 * fichas já importadas e conferência antes de gravar nos módulos oficiais.
 */
export function FichaHistoricoPainel({ importacaoId, itens }: { importacaoId: string; itens: Item[] }) {
  const qc = useQueryClient();
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());

  const ligados = useMemo(() => itens.filter((i) => i.colaborador_id || i.colaborador_existente_id), [itens]);
  const varridos = ligados.filter((i) => historicoDaFicha(i.dados_extraidos).varridoEm).length;
  const comHistorico = ligados
    .map((i) => ({ item: i, h: historicoDaFicha(i.dados_extraidos) }))
    .filter(({ h }) => h.ferias.length + h.afastamentos.length + h.advertencias.length > 0);
  const pendentes = comHistorico.filter(({ h }) => !h.aplicadoEm);

  // Enquanto a leitura roda, atualiza a lista a cada 4 s.
  useEffect(() => {
    if (!lendo) return;
    if (varridos >= ligados.length) { setLendo(false); return; }
    const t = window.setInterval(() => qc.invalidateQueries({ queryKey: ["dp_ficha_itens"] }), 4000);
    return () => window.clearInterval(t);
  }, [lendo, varridos, ligados.length, qc]);

  if (!ligados.length) return null;

  const chave = (itemId: string, tipo: string, i: number) => `${itemId}:${tipo}:${i}`;
  const alternar = (k: string) =>
    setDesmarcados((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const ler = async (refazer = false) => {
    setLendo(true);
    const { error } = await supabase.functions.invoke("dp-ficha-historico-varrer", {
      body: { importacao_id: importacaoId, refazer },
    });
    if (error) { setLendo(false); notifyError(error, { action: "ler o histórico das fichas", surface: "dp-ficha-historico" }); return; }
    toast.info("Leitura do histórico iniciada. A lista atualiza sozinha.");
  };

  const gravar = async () => {
    setGravando(true);
    let fer = 0, adv = 0, afa = 0, falhas = 0;
    try {
      for (const { item, h } of pendentes) {
        const filtra = (tipo: string, l: Linha[]) => l.filter((_, i) => !desmarcados.has(chave(item.id, tipo, i)));
        const r = await aplicarHistoricoFicha(item.id, {
          ferias: filtra("f", h.ferias), afastamentos: filtra("a", h.afastamentos), advertencias: filtra("d", h.advertencias),
        });
        fer += r.ferias; adv += r.advertencias; afa += r.afastamentos; falhas += r.erros.length;
      }
      toast.success(`Histórico lançado: ${fer} férias, ${adv} advertências/suspensões e ${afa} afastamentos.`);
      if (falhas) toast.warning(`${falhas} anotação(ões) não puderam ser lançadas (datas inválidas ou já ocupadas). Confira em Férias.`);
      qc.invalidateQueries({ queryKey: ["dp_ficha_itens"] });
    } catch (e) {
      notifyError(e, { action: "lançar o histórico das fichas", surface: "dp-ficha-historico" });
    } finally {
      setGravando(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="h-4 w-4 text-primary" /> Histórico Anterior das Fichas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <p className="text-muted-foreground">
          Lê nas fichas as férias já gozadas, afastamentos e advertências/suspensões anotados. Nada é gravado até você
          confirmar. Advertências e afastamentos ficam no dossiê interno, sem avisar o colaborador.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={lendo} onClick={() => ler(varridos > 0)}>
            {lendo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-1 h-4 w-4" />}
            {varridos > 0 ? "Ler o Histórico de Novo" : "Ler Histórico das Fichas"}
          </Button>
          <span className="text-muted-foreground">
            {varridos} de {ligados.length} fichas lidas · {comHistorico.length} com histórico
          </span>
        </div>

        {comHistorico.map(({ item, h }) => (
          <div key={item.id} className="rounded-md border p-2">
            <p className="font-medium">
              {String((item.dados_extraidos as Record<string, unknown>)?.nome ?? item.nome_extraido ?? "Sem nome")}
              {h.aplicadoEm && <span className="ml-2 text-[11px] font-normal text-primary">Lançado</span>}
            </p>
            {([
              ["f", "Férias", h.ferias, (f: Linha) => `Aquisitivo ${dataBr(f.aquisitivo_inicio)} a ${dataBr(f.aquisitivo_fim)} · gozo ${dataBr(f.gozo_inicio)} a ${dataBr(f.gozo_fim)}`],
              ["a", "Afastamentos", h.afastamentos, (a: Linha) => `${String(a.motivo ?? "Afastamento")} · ${dataBr(a.inicio)} a ${dataBr(a.fim)}`],
              ["d", "Advertências e Suspensões", h.advertencias, (a: Linha) => `${a.tipo === "suspensao" ? "Suspensão" : "Advertência"} · ${dataBr(a.data)}${a.motivo ? ` · ${String(a.motivo)}` : ""}`],
            ] as const).map(([tipo, rotulo, lista, texto]) => lista.length > 0 && (
              <div key={tipo} className="mt-1">
                <p className="text-[11px] text-muted-foreground">{rotulo}</p>
                {lista.map((l, i) => {
                  const k = chave(item.id, tipo, i);
                  return (
                    <label key={k} className="flex items-center gap-2 py-0.5">
                      <Checkbox disabled={!!h.aplicadoEm} checked={!desmarcados.has(k)} onCheckedChange={() => alternar(k)} />
                      <span>{texto(l)}</span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        ))}

        {varridos > 0 && comHistorico.length === 0 && !lendo && (
          <p className="text-muted-foreground">Nenhuma anotação de histórico foi encontrada nas fichas lidas.</p>
        )}

        {pendentes.length > 0 && (
          <Button size="sm" disabled={gravando} onClick={gravar}>
            {gravando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Importar Históricos Confirmados ({pendentes.length})
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
