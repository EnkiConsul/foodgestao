import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Banknote, ArrowRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { TIPOS_COM_COMPROVANTE } from "@/lib/dp/documentoTipos";

type Grupo = {
  chave: string;
  titulo: string;
  ano: string;
  mes: string;
  total: number;
  nomes: string[];
};

const TITULO_POR_TIPO: Record<string, string> = {
  contracheque: "Folha de Pagamento",
  adiantamento: "Adiantamento Salarial",
  contracheque_13: "13º Salário",
  ferias: "Férias",
  pro_labore: "Pró-Labore",
};

/** "Resolver Depois" adia o aviso por 12 horas (por empresa e por grupo). */
const SNOOZE_MS = 12 * 60 * 60 * 1000;
const SNOOZE_KEY_PREFIX = "dp_pagto_alerta_adiado:";

function tituloDoTipo(tipo: string) {
  if (TITULO_POR_TIPO[tipo]) return TITULO_POR_TIPO[tipo];
  if (/resc|trct|acerto/i.test(tipo)) return "Rescisão";
  return "Pagamento";
}

function listarNomes(nomes: string[]) {
  const n = nomes.slice(0, 3);
  const resto = nomes.length - n.length;
  const base = n.length > 1 ? `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}` : n[0] ?? "";
  return resto > 0 ? `${n.join(", ")} e mais ${resto}` : base;
}

function lerAdiados(companyId: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY_PREFIX + companyId);
    if (!raw) return {};
    const obj = JSON.parse(raw) as Record<string, number>;
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

/**
 * Aviso para quem paga: documentos de pagamento ainda sem comprovante,
 * agrupados por tipo e competência. Cada cartão pode ser adiado com
 * "Resolver Depois" (volta a aparecer depois de 12h) e some de vez quando
 * o último comprovante do grupo é importado.
 */
export function FolhaPagamentoAlerta() {
  const { selectedCompanyId } = useCompanyContext();
  const [adiados, setAdiados] = useState<Record<string, number>>(() =>
    selectedCompanyId ? lerAdiados(selectedCompanyId) : {},
  );
  // Ao trocar de empresa no seletor, carrega os adiamentos da empresa nova.
  useEffect(() => {
    setAdiados(selectedCompanyId ? lerAdiados(selectedCompanyId) : {});
  }, [selectedCompanyId]);

  const q = useQuery({
    queryKey: ["dp_pagamentos_pendentes_alerta", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<Grupo[]> => {
      const { data, error } = await supabase
        .from("dp_documentos")
        .select("id, tipo, referencia_data, colaborador_id, comprovante_modalidade, comprovante_pago_em")
        .eq("company_id", selectedCompanyId!)
        .in("tipo", [...TIPOS_COM_COMPROVANTE] as never)
        .is("comprovante_file_path", null)
        .eq("ciclo_status", "ativo")
        .is("arquivado_em", null)
        .gte("referencia_data", "2026-09-01")
        .limit(500);
      if (error) throw error;
      const docs = ((data ?? []) as any[]).filter(
        (d) => !(d.comprovante_modalidade === "especie" && d.comprovante_pago_em) && d.referencia_data,
      );
      const ids = [...new Set(docs.map((d) => d.colaborador_id).filter(Boolean))] as string[];
      const nomes = new Map<string, string>();
      if (ids.length) {
        const { data: cs } = await supabase
          .from("dp_colaboradores")
          .select("id, nome, nome_social")
          .in("id", ids);
        for (const c of (cs ?? []) as any[]) {
          const n = String(c.nome_social || c.nome || "").trim().split(/\s+/)[0] ?? "";
          nomes.set(c.id, n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : "");
        }
      }
      const grupos = new Map<string, Grupo & { set: Set<string> }>();
      for (const d of docs) {
        const ref = String(d.referencia_data);
        const titulo = tituloDoTipo(String(d.tipo));
        const chave = `${titulo}-${ref.slice(0, 7)}`;
        let g = grupos.get(chave);
        if (!g) {
          g = { chave, titulo, ano: ref.slice(0, 4), mes: ref.slice(5, 7), total: 0, nomes: [], set: new Set() };
          grupos.set(chave, g);
        }
        g.total++;
        const nome = d.colaborador_id ? nomes.get(d.colaborador_id) : "";
        if (nome && !g.set.has(nome)) { g.set.add(nome); g.nomes.push(nome); }
      }
      return [...grupos.values()].sort((a, b) => (a.ano + a.mes < b.ano + b.mes ? -1 : 1));
    },
  });

  const agora = Date.now();
  const grupos = (q.data ?? []).filter((g) => (adiados[g.chave] ?? 0) <= agora);
  if (!grupos.length) return null;

  const resolverDepois = (chave: string) => {
    if (!selectedCompanyId) return;
    const proximo = { ...lerAdiados(selectedCompanyId), [chave]: agora + SNOOZE_MS };
    try {
      localStorage.setItem(SNOOZE_KEY_PREFIX + selectedCompanyId, JSON.stringify(proximo));
    } catch {
      /* armazenamento indisponível: adia só nesta sessão */
    }
    setAdiados(proximo);
  };

  return (
    <div className="space-y-2">
      {grupos.map((g) => (
        <section
          key={g.chave}
          className="rounded-2xl border border-primary/40 bg-primary/5 p-4 flex flex-col gap-3 sm:flex-row sm:items-center min-w-0"
        >
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <Banknote className="h-6 w-6 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="font-semibold text-sm sm:text-base break-words">
                {g.titulo} Disponível Para Pagamento
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground break-words">
                {g.total} {g.total === 1 ? "documento" : "documentos"} da competência {g.mes}/{g.ano} aguardando
                pagamento e comprovante{g.nomes.length ? ` (${listarNomes(g.nomes)})` : ""}.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button asChild size="sm">
              <Link to={`/dp/documentos/historico?pendencia=comprovante&mes=${g.mes}&ano=${g.ano}`}>
                Ver Documentos Para Pagar <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => resolverDepois(g.chave)}
              aria-label="Resolver depois"
            >
              <X className="h-4 w-4 mr-1" /> Resolver Depois
            </Button>
          </div>
        </section>
      ))}
    </div>
  );
}
