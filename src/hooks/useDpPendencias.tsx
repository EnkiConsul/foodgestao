import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { differenceInCalendarDays } from "date-fns";
import type { LucideIcon } from "lucide-react";
import { ClipboardList, FileText, Wallet, Users, Coins, Clock, Scale } from "lucide-react";

export type Pendencia = {
  id: string;
  icon: LucideIcon;
  titulo: string;
  subtitulo: string;
  tipo: string;
  vencimento?: string | null;
  atrasoDias?: number | null;
  url: string;
};

const MES_NOME = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function useDpPendencias() {
  const { selectedCompanyId } = useCompanyContext();

  return useQuery({
    queryKey: ["dp_pendencias", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<Pendencia[]> => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diaHoje = today.getDate();
      const mesVigente = today.getMonth() + 1; // 1-12
      const anoVigente = today.getFullYear();
      const mesAnterior = mesVigente === 1 ? 12 : mesVigente - 1;
      const anoAnterior = mesVigente === 1 ? anoVigente - 1 : anoVigente;

      const results: Pendencia[] = [];

      // 1. Solicitações pendentes
      try {
        const { data: sols } = await supabase
          .from("dp_solicitacoes")
          .select("id, tipo, created_at, dp_colaboradores(nome)")
          .eq("company_id", selectedCompanyId!)
          .eq("status", "pendente")
          .order("created_at", { ascending: true })
          .limit(20);
        (sols ?? []).forEach((s: any) => {
          const vencimento = new Date(s.created_at);
          vencimento.setDate(vencimento.getDate() + 3);
          const dias = differenceInCalendarDays(today, vencimento);
          results.push({
            id: `sol-${s.id}`,
            icon: ClipboardList,
            titulo: `Solicitação de ${s.tipo}`,
            subtitulo: s.dp_colaboradores?.nome ?? "Colaborador",
            tipo: "Solicitação",
            vencimento: ymd(vencimento),
            atrasoDias: dias > 0 ? dias : null,
            url: "/dp/solicitacoes",
          });
        });
      } catch (e) {
        console.warn("pendencias/solicitacoes:", e);
      }

      // 2. Trocas pendentes de gestor
      try {
        const { data: trocas } = await supabase
          .from("dp_trocas")
          .select("id, status, created_at, solicitante:solicitante_id(nome)")
          .eq("company_id", selectedCompanyId!)
          .in("status", ["pendente_gestor"])
          .order("created_at", { ascending: true })
          .limit(10);
        (trocas ?? []).forEach((t: any) => {
          const dias = differenceInCalendarDays(today, new Date(t.created_at));
          results.push({
            id: `troca-${t.id}`,
            icon: Users,
            titulo: "Troca aguardando aprovação",
            subtitulo: t.solicitante?.nome ?? "Colaborador",
            tipo: "Troca",
            vencimento: t.created_at,
            atrasoDias: dias > 2 ? dias : null,
            url: "/dp/trocas",
          });
        });
      } catch (e) {
        console.warn("pendencias/trocas:", e);
      }

      // Carregar unidades ativas (usadas nos blocos 3-6)
      let unidades: Array<{
        id: string;
        nome: string;
        possui_relogio_ponto: boolean | null;
        tem_adiantamento: boolean | null;
        dia_adiantamento: number | null;
      }> = [];
      try {
        const { data } = await supabase
          .from("dp_unidades")
          .select("id, nome, possui_relogio_ponto, tem_adiantamento, dia_adiantamento")
          .eq("company_id", selectedCompanyId!)
          .eq("ativo", true);
        unidades = (data ?? []) as any;
      } catch (e) {
        console.warn("pendencias/unidades:", e);
      }

      // 3. Contracheque não fechado (mês anterior) — company-level, mas mostramos por unidade
      if (diaHoje >= 10) {
        try {
          const compIni = `${anoAnterior}-${String(mesAnterior).padStart(2, "0")}-01`;
          const compFimDate = new Date(anoAnterior, mesAnterior, 0);
          const compFim = ymd(compFimDate);
          const { data: periodos } = await supabase
            .from("dp_folha_periodos")
            .select("id, status")
            .eq("company_id", selectedCompanyId!)
            .eq("tipo", "contracheque_mensal")
            .gte("competencia", compIni)
            .lte("competencia", compFim)
            .limit(1);
          const fechado = (periodos ?? []).some((p: any) => p.status === "fechado");
          if (!fechado) {
            const vencimento = new Date(anoVigente, mesVigente - 1, 10);
            const dias = differenceInCalendarDays(today, vencimento);
            for (const u of unidades) {
              results.push({
                id: `contracheque-${u.id}-${anoAnterior}-${mesAnterior}`,
                icon: FileText,
                titulo: "Contracheque não fechado",
                subtitulo: `${u.nome} — ${MES_NOME[mesAnterior - 1]}/${anoAnterior}`,
                tipo: "Contracheque",
                vencimento: ymd(vencimento),
                atrasoDias: dias > 0 ? dias : null,
                url: "/dp/folha",
              });
            }
          }
        } catch (e) {
          console.warn("pendencias/contracheque:", e);
        }
      }

      // 4. Adiantamento não fechado (mês vigente) — por unidade que exige adiantamento
      try {
        const compIni = `${anoVigente}-${String(mesVigente).padStart(2, "0")}-01`;
        const compFimDate = new Date(anoVigente, mesVigente, 0);
        const compFim = ymd(compFimDate);
        const { data: periodos } = await supabase
          .from("dp_folha_periodos")
          .select("id, status")
          .eq("company_id", selectedCompanyId!)
          .eq("tipo", "adiantamento")
          .gte("competencia", compIni)
          .lte("competencia", compFim)
          .limit(1);
        const fechado = (periodos ?? []).some((p: any) => p.status === "fechado");
        if (!fechado) {
          for (const u of unidades) {
            if (!u.tem_adiantamento || !u.dia_adiantamento) continue;
            const diaLimite = u.dia_adiantamento + 5;
            if (diaHoje < diaLimite) continue;
            const vencimento = new Date(anoVigente, mesVigente - 1, diaLimite);
            const dias = differenceInCalendarDays(today, vencimento);
            results.push({
              id: `adiantamento-${u.id}-${anoVigente}-${mesVigente}`,
              icon: Coins,
              titulo: "Adiantamento não fechado",
              subtitulo: `${u.nome} — ${MES_NOME[mesVigente - 1]}/${anoVigente}`,
              tipo: "Adiantamento",
              vencimento: ymd(vencimento),
              atrasoDias: dias > 0 ? dias : null,
              url: "/dp/folha",
            });
          }
        }
      } catch (e) {
        console.warn("pendencias/adiantamento:", e);
      }

      // 5. Folha de ponto não importada (mês anterior) — por unidade com relógio
      if (diaHoje >= 10) {
        try {
          const inicio = `${anoAnterior}-${String(mesAnterior).padStart(2, "0")}-01`;
          const fim = ymd(new Date(anoAnterior, mesAnterior, 0));
          for (const u of unidades) {
            if (!u.possui_relogio_ponto) continue;

            const { data: colabs } = await supabase
              .from("dp_colaboradores")
              .select("id")
              .eq("company_id", selectedCompanyId!)
              .eq("unidade_id", u.id);
            const colabIds = (colabs ?? []).map((c: any) => c.id);
            if (colabIds.length === 0) continue;

            const { count } = await supabase
              .from("dp_documentos")
              .select("id", { count: "exact", head: true })
              .eq("company_id", selectedCompanyId!)
              .eq("tipo", "ponto")
              .in("colaborador_id", colabIds)
              .gte("referencia_data", inicio)
              .lte("referencia_data", fim);
            if ((count ?? 0) > 0) continue;

            const vencimento = new Date(anoVigente, mesVigente - 1, 10);
            const dias = differenceInCalendarDays(today, vencimento);
            results.push({
              id: `folha_ponto-${u.id}-${anoAnterior}-${mesAnterior}`,
              icon: Clock,
              titulo: "Folha de ponto não importada",
              subtitulo: `${u.nome} — ${MES_NOME[mesAnterior - 1]}/${anoAnterior}`,
              tipo: "Folha de Ponto",
              vencimento: ymd(vencimento),
              atrasoDias: dias > 0 ? dias : null,
              url: "/dp/documentos/ponto",
            });
          }
        } catch (e) {
          console.warn("pendencias/folha_ponto:", e);
        }
      }

      // 6. Negociação coletiva pendente — por unidade + sindicato laboral
      try {
        // Sindicatos laborais ativos da empresa
        const { data: sinds } = await supabase
          .from("dp_sindicatos")
          .select("id, nome")
          .eq("company_id", selectedCompanyId!)
          .eq("tipo", "laboral")
          .eq("ativo", true);
        const sindicatoNome = new Map<string, string>(
          (sinds ?? []).map((s: any) => [s.id, s.nome])
        );

        // Vínculos unidade↔sindicato (apenas sindicatos laborais ativos)
        const sindIds = Array.from(sindicatoNome.keys());
        const parByUnidade = new Map<string, Set<string>>();
        if (sindIds.length > 0) {
          const { data: vinc } = await supabase
            .from("dp_sindicato_unidades")
            .select("unidade_id, sindicato_id")
            .in("sindicato_id", sindIds);
          (vinc ?? []).forEach((v: any) => {
            if (!parByUnidade.has(v.unidade_id)) parByUnidade.set(v.unidade_id, new Set());
            parByUnidade.get(v.unidade_id)!.add(v.sindicato_id);
          });
        }


        const unidadeMap = new Map(unidades.map((u) => [u.id, u.nome]));

        for (const [unidadeId, sindSet] of parByUnidade.entries()) {
          const unidadeNome = unidadeMap.get(unidadeId);
          if (!unidadeNome) continue; // unidade inativa/fora do escopo
          for (const sindId of sindSet) {
            const nomeSind = sindicatoNome.get(sindId) ?? "Sindicato";
            const { data: negs } = await supabase
              .from("dp_sindicato_negociacoes")
              .select("ano, mes")
              .eq("company_id", selectedCompanyId!)
              .eq("unidade_id", unidadeId)
              .eq("sindicato_laboral_id", sindId)
              .not("ano", "is", null)
              .not("mes", "is", null)
              .order("ano", { ascending: false })
              .order("mes", { ascending: false })
              .limit(1);

            const id = `negociacao-${unidadeId}-${sindId}`;
            if (!negs || negs.length === 0) {
              results.push({
                id,
                icon: Scale,
                titulo: `Negociação coletiva pendente — ${nomeSind}`,
                subtitulo: `${unidadeNome} — nenhuma negociação cadastrada`,
                tipo: "Negociação",
                vencimento: ymd(today),
                atrasoDias: null,
                url: "/dp/documentos/act-cct",
              });
              continue;
            }
            const ultima: any = negs[0];
            // vencimento = último dia de (ano+1, mes)
            const vencimento = new Date(ultima.ano + 1, ultima.mes, 0);
            const dias = differenceInCalendarDays(today, vencimento);
            const diasParaVencer = differenceInCalendarDays(vencimento, today);
            // exibir se atrasado, ou dentro do aviso de 60 dias
            if (dias > 0 || (diasParaVencer >= 0 && diasParaVencer <= 60)) {
              results.push({
                id,
                icon: Scale,
                titulo: `Negociação coletiva pendente — ${nomeSind}`,
                subtitulo: `${unidadeNome} — última ${String(ultima.mes).padStart(2, "0")}/${ultima.ano}`,
                tipo: "Negociação",
                vencimento: ymd(vencimento),
                atrasoDias: dias > 0 ? dias : null,
                url: "/dp/documentos/act-cct",
              });
            }
          }
        }
      } catch (e) {
        console.warn("pendencias/negociacoes:", e);
      }

      // Ordenar: mais atrasado primeiro; empate → vencimento mais próximo
      results.sort((a, b) => {
        const aa = a.atrasoDias ?? -1;
        const bb = b.atrasoDias ?? -1;
        if (bb !== aa) return bb - aa;
        const av = a.vencimento ? new Date(a.vencimento).getTime() : Infinity;
        const bv = b.vencimento ? new Date(b.vencimento).getTime() : Infinity;
        return av - bv;
      });

      return results;
    },
  });
}
