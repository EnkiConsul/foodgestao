import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { differenceInCalendarDays, format } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  CalendarPlus, FileWarning, Repeat2, Palmtree, Megaphone, UserCog, FileCheck2,
} from "lucide-react";
import { resolverChecklist, resumirChecklist, tituloItem } from "@/lib/dp/documentos-requisitos";

export type PendenciaColaborador = {
  id: string;
  icon: LucideIcon;
  titulo: string;
  subtitulo: string;
  tipo: string;
  vencimento?: string | null;
  atrasoDias: number;
  url: string;
};

const MES_NOME = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

/**
 * Pendências do próprio colaborador (portal). Escopo: apenas os dados do
 * usuário autenticado — nunca a empresa inteira (isso é `useDpPendencias`,
 * o hook administrativo).
 */
export function useDpPendenciasColaborador() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["dp_pendencias_colaborador", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<PendenciaColaborador[]> => {
      const { data: colabId } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (!colabId) return [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const mesInicio = new Date(today.getFullYear(), today.getMonth(), 1);
      const mesFim = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const results: PendenciaColaborador[] = [];

      // 1. Escolher a folga do mês vigente.
      try {
        const { count } = await supabase
          .from("dp_folgas")
          .select("id", { count: "exact", head: true })
          .eq("colaborador_id", colabId as string)
          .neq("status", "cancelada")
          .gte("data", ymd(mesInicio))
          .lte("data", ymd(mesFim));
        if ((count ?? 0) === 0) {
          results.push({
            id: `folga-mes-${format(mesInicio, "yyyy-MM")}`,
            icon: CalendarPlus,
            titulo: "Escolher folga do mês",
            subtitulo: `Você ainda não tem folga agendada em ${MES_NOME[today.getMonth()]}.`,
            tipo: "Folga",
            vencimento: ymd(mesFim),
            atrasoDias: differenceInCalendarDays(today, mesFim),
            url: "/dp/meu/calendario",
          });
        }
      } catch (e) {
        console.warn("pendencias-colab/folga:", e);
      }

      // 2. Documentos recusados que precisam ser reenviados.
      try {
        const { data: docs } = await supabase
          .from("dp_documentos")
          .select("id, titulo, tipo, motivo_recusao, revisado_em, created_at")
          .eq("colaborador_id", colabId as string)
          .eq("aprovacao_status", "recusado")
          .eq("submetido_por_colaborador", true)
          .order("revisado_em", { ascending: true })
          .limit(10);
        (docs ?? []).forEach((d: any) => {
          const base = new Date(d.revisado_em ?? d.created_at);
          base.setDate(base.getDate() + 3);
          results.push({
            id: `doc-recusado-${d.id}`,
            icon: FileWarning,
            titulo: "Reenviar documento recusado",
            subtitulo: d.motivo_recusao ? `${d.titulo} — ${d.motivo_recusao}` : d.titulo,
            tipo: "Documento",
            vencimento: ymd(base),
            atrasoDias: differenceInCalendarDays(today, base),
            url: "/dp/meu/documentos",
          });
        });
      } catch (e) {
        console.warn("pendencias-colab/documentos:", e);
      }

      // 3. Trocas aguardando a minha resposta.
      try {
        const { data: trocas } = await supabase
          .from("dp_trocas")
          .select("id, data_original, data_proposta, created_at, solicitante:solicitante_id(nome)")
          .eq("destino_id", colabId as string)
          .eq("status", "pendente_colega")
          .order("created_at", { ascending: true })
          .limit(10);
        (trocas ?? []).forEach((t: any) => {
          const base = new Date(t.created_at);
          base.setDate(base.getDate() + 2);
          results.push({
            id: `troca-${t.id}`,
            icon: Repeat2,
            titulo: "Responder pedido de troca",
            subtitulo: `${t.solicitante?.nome ?? "Colega"} propôs trocar ${new Date(
              t.data_original + "T00:00:00",
            ).toLocaleDateString("pt-BR")} por ${new Date(
              t.data_proposta + "T00:00:00",
            ).toLocaleDateString("pt-BR")}`,
            tipo: "Troca",
            vencimento: ymd(base),
            atrasoDias: differenceInCalendarDays(today, base),
            url: "/dp/meu/trocas",
          });
        });
      } catch (e) {
        console.warn("pendencias-colab/trocas:", e);
      }

      // 4. Férias disponíveis com limite concessivo se aproximando.
      try {
        const { data: periodos } = await supabase
          .from("dp_ferias_periodos")
          .select("id, dias_saldo, limite_concessivo, status")
          .eq("colaborador_id", colabId as string)
          .in("status", ["disponivel", "parcial", "vencido"])
          .order("limite_concessivo", { ascending: true })
          .limit(5);
        (periodos ?? []).forEach((p: any) => {
          if ((p.dias_saldo ?? 0) <= 0) return;
          const limite = new Date(p.limite_concessivo + "T00:00:00");
          const dias = differenceInCalendarDays(today, limite);
          if (dias < -90) return; // ainda distante — não polui o painel
          results.push({
            id: `ferias-${p.id}`,
            icon: Palmtree,
            titulo: "Programar suas férias",
            subtitulo: `${p.dias_saldo} dias disponíveis — limite em ${limite.toLocaleDateString("pt-BR")}`,
            tipo: "Férias",
            vencimento: ymd(limite),
            atrasoDias: dias,
            url: "/dp/meu/solicitacoes",
          });
        });
      } catch (e) {
        console.warn("pendencias-colab/ferias:", e);
      }

      // 5. Avisos de leitura obrigatória ainda não lidos.
      try {
        const { data: avisos } = await supabase
          .from("dp_avisos")
          .select("id, titulo, publicado_em")
          .eq("leitura_obrigatoria", true)
          .order("publicado_em", { ascending: true })
          .limit(20);
        const ids = (avisos ?? []).map((a: any) => a.id);
        let lidos = new Set<string>();
        if (ids.length) {
          const { data: leituras } = await supabase
            .from("dp_avisos_leituras")
            .select("aviso_id")
            .in("aviso_id", ids)
            .eq("user_id", user!.id);
          lidos = new Set((leituras ?? []).map((l: any) => l.aviso_id));
        }
        (avisos ?? [])
          .filter((a: any) => !lidos.has(a.id))
          .forEach((a: any) => {
            const base = new Date(a.publicado_em);
            base.setDate(base.getDate() + 2);
            results.push({
              id: `aviso-${a.id}`,
              icon: Megaphone,
              titulo: "Confirmar leitura de aviso",
              subtitulo: a.titulo,
              tipo: "Aviso",
              vencimento: ymd(base),
              atrasoDias: differenceInCalendarDays(today, base),
              url: "/dp/meu/mural",
            });
          });
      } catch (e) {
        console.warn("pendencias-colab/avisos:", e);
      }

      // 6. Cadastro incompleto.
      try {
        const { data: colab } = await supabase
          .from("dp_colaboradores")
          .select("telefone, endereco, data_nascimento")
          .eq("id", colabId as string)
          .maybeSingle();
        if (colab) {
          const faltando: string[] = [];
          if (!colab.telefone) faltando.push("telefone");
          if (!colab.endereco) faltando.push("endereço");
          if (!colab.data_nascimento) faltando.push("data de nascimento");
          if (faltando.length) {
            results.push({
              id: "cadastro-incompleto",
              icon: UserCog,
              titulo: "Completar seu cadastro",
              subtitulo: `Faltam: ${faltando.join(", ")}.`,
              tipo: "Cadastro",
              vencimento: null,
              atrasoDias: 0,
              url: "/dp/meu/perfil",
            });
          }
        }
      } catch (e) {
        console.warn("pendencias-colab/cadastro:", e);
      }

      // Documentos exigidos: o colaborador anexa e o DP aprova.
      try {
        const { data: colab } = await supabase
          .from("dp_colaboradores")
          .select(
            "id, company_id, data_nascimento, regime, estado_civil, veiculo_proprio, aprendiz, possui_folha_ponto, dp_cargos(exige_cnh, exige_epi)",
          )
          .eq("id", colabId as string)
          .maybeSingle();

        if (colab) {
          const [reqs, deps, vincs] = await Promise.all([
            supabase
              .from("dp_documento_requisitos")
              .select("*")
              .eq("company_id", colab.company_id)
              .neq("obrigatoriedade", "desativado"),
            supabase
              .from("dp_dependentes")
              .select("id, nome, data_nascimento, deficiencia, cessado_em")
              .eq("colaborador_id", colabId as string)
              .is("cessado_em", null),
            supabase
              .from("dp_colaborador_documentos")
              .select("*")
              .eq("colaborador_id", colabId as string),
          ]);

          const itens = resolverChecklist({
            requisitos: (reqs.data ?? []) as any[],
            colaborador: {
              id: colab.id,
              data_nascimento: colab.data_nascimento,
              regime: colab.regime,
              estado_civil: (colab as any).estado_civil,
              veiculo_proprio: (colab as any).veiculo_proprio,
              aprendiz: colab.aprendiz,
              possui_folha_ponto: colab.possui_folha_ponto,
              cargo_exige_cnh: (colab as any).dp_cargos?.exige_cnh ?? false,
              cargo_exige_epi: (colab as any).dp_cargos?.exige_epi ?? false,
            },
            dependentes: (deps.data ?? []) as any[],
            vinculos: (vincs.data ?? []) as any[],
          });

          const resumo = resumirChecklist(itens);
          const paraEnviar = resumo.pendentesObrigatorios;
          if (paraEnviar.length > 0) {
            results.push({
              id: "documentos-exigidos",
              icon: FileCheck2,
              titulo: `Enviar ${paraEnviar.length} documento(s) obrigatório(s)`,
              subtitulo: `${paraEnviar.slice(0, 3).map((i) => tituloItem(i)).join(", ")}${paraEnviar.length > 3 ? "…" : ""}`,
              tipo: "Documentos",
              vencimento: null,
              atrasoDias: 1,
              url: "/dp/meu/documentos",
            });
          }
          const aceites = itens.filter((i) =>
            (i.anexos ?? []).some((a: any) => a.aceite_solicitado_em && !a.aceito_em),
          );
          if (aceites.length > 0) {
            results.push({
              id: "documentos-aceite",
              icon: FileCheck2,
              titulo: `${aceites.length} documento(s) aguardando seu aceite`,
              subtitulo: aceites.map((i) => tituloItem(i)).slice(0, 3).join(", "),
              tipo: "Documentos",
              vencimento: null,
              atrasoDias: 1,
              url: "/dp/meu/documentos",
            });
          }
          if (resumo.vencendo.length > 0) {
            results.push({
              id: "documentos-vencendo",
              icon: FileCheck2,
              titulo: `${resumo.vencendo.length} documento(s) vencendo`,
              subtitulo: resumo.vencendo.map((i) => tituloItem(i)).slice(0, 3).join(", "),
              tipo: "Documentos",
              vencimento: null,
              atrasoDias: 0,
              url: "/dp/meu/documentos",
            });
          }
        }
      } catch (e) {
        console.warn("pendencias-colab/documentos:", e);
      }

      return results.sort((a, b) => b.atrasoDias - a.atrasoDias);
    },
  });
}
