import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";
import { montarJornadaSugerida, type JornadaSugerida } from "@/lib/dp/ficha-registro/jornada-parse";
import { digits, montarPayloadFicha, txt } from "@/lib/dp/ficha-registro/payload";
import {
  aplicarFichaRpc,
  efetivarPreadmissaoComFichaRpc,
  ignorarFichaRpc,
} from "@/lib/dp/ficha-registro/aplicarFichaRpc";
import { DP_DOCUMENTOS_BUCKET } from "@/hooks/useDpDocumentos";
import {
  anexarFichaRecorte,
  type AnexoFichaStatus,
} from "@/lib/dp/ficha-registro/anexarFichaRecorte";

export type FichaImportacao = Database["public"]["Tables"]["dp_ficha_importacoes"]["Row"];
export type FichaItem = Database["public"]["Tables"]["dp_ficha_importacao_itens"]["Row"];

const BUCKET = "dp-bulk-import";
const MAX_SIZE_MB = 20;

/** Campos que a revisão pode editar antes de aplicar no cadastro. */
export interface FichaDadosEditaveis {
  nome?: string | null;
  cpf?: string | null;
  matricula?: string | null;
  data_nascimento?: string | null;
  data_admissao?: string | null;
  sexo?: string | null;
  telefone?: string | null;
  email?: string | null;
  salario?: number | string | null;
  cargo_nome?: string | null;
  cbo?: string | null;
  // deno-lint-ignore no-explicit-any
  [key: string]: unknown;
}

/** Jornada sugerida pela ficha, pronta para a tela de revisão. */
export function jornadaDaFicha(dados: Record<string, unknown> | null): JornadaSugerida {
  const d = (dados ?? {}) as Record<string, unknown>;
  return montarJornadaSugerida({
    jornada_texto: (d.jornada_texto as string | null) ?? null,
    // deno-lint-ignore no-explicit-any
    jornada_dias: (d.jornada_dias as any[]) ?? [],
  });
}


/** Lista de importações de ficha da empresa selecionada, com polling durante o processamento. */
export function useDpFichaImportacoes() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const anteriores = useRef<Map<string, string>>(new Map());

  const query = useQuery({
    queryKey: ["dp_ficha_importacoes", selectedCompanyId],
    enabled: !!selectedCompanyId,
    refetchInterval: (q) => {
      const rows = (q.state.data ?? []) as FichaImportacao[];
      return rows.some((r) => r.status === "processing") ? 3000 : false;
    },
    queryFn: async (): Promise<FichaImportacao[]> => {
      const { data, error } = await supabase
        .from("dp_ficha_importacoes")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as FichaImportacao[];
    },
  });

  // A ficha é gravada no mesmo instante em que a leitura é marcada como concluída:
  // ao ver a transição processing → ready/failed, recarrega as fichas daquele arquivo.
  useEffect(() => {
    for (const row of query.data ?? []) {
      const antes = anteriores.current.get(row.id);
      anteriores.current.set(row.id, row.status);
      if (antes === "processing" && row.status !== "processing") {
        qc.invalidateQueries({ queryKey: ["dp_ficha_itens", selectedCompanyId, row.id] });
      }
    }
  }, [query.data, qc, selectedCompanyId]);

  return query;
}

/** Fichas identificadas dentro de uma importação. */
export function useDpFichaItens(
  importacaoId?: string | null,
  processando = false,
  aguardandoFichas = false,
) {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_ficha_itens", selectedCompanyId, importacaoId],
    enabled: !!selectedCompanyId && !!importacaoId,
    refetchInterval: (q) => {
      if (processando) return 3000;
      // Leitura concluída com fichas encontradas mas nada carregado ainda: tenta de novo.
      const rows = (q.state.data ?? []) as FichaItem[];
      if (aguardandoFichas && rows.length === 0 && q.state.dataUpdateCount < 8) return 2000;
      return false;
    },
    queryFn: async (): Promise<FichaItem[]> => {
      const { data, error } = await supabase
        .from("dp_ficha_importacao_itens")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .eq("importacao_id", importacaoId!)
        .order("pagina_inicio");
      if (error) throw error;
      return (data ?? []) as FichaItem[];
    },
  });
}


/** Envia o PDF das fichas e dispara a leitura em segundo plano. */
export function useEnviarFichaPdf() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (file: File) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("Envie a ficha em PDF.");
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        throw new Error(`O arquivo passa de ${MAX_SIZE_MB} MB. Divida em partes menores.`);
      }
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error("Sessão expirada. Entre novamente.");

      const ins = await supabase
        .from("dp_ficha_importacoes")
        .insert({
          company_id: selectedCompanyId,
          arquivo_path: "pendente",
          arquivo_nome: file.name,
          status: "processing",
          criado_por: uid,
        })
        .select("id")
        .single();
      if (ins.error) throw ins.error;
      const importacaoId = (ins.data as { id: string }).id;

      const path = `${selectedCompanyId}/fichas/${importacaoId}/source.pdf`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (up.error) throw up.error;

      await supabase.from("dp_ficha_importacoes").update({ arquivo_path: path }).eq("id", importacaoId);

      const { error: invErr } = await supabase.functions.invoke("dp-ficha-registro-parse", {
        body: { importacao_id: importacaoId },
      });
      if (invErr) {
        await supabase
          .from("dp_ficha_importacoes")
          .update({ status: "failed", erro_mensagem: invErr.message ?? "Falha ao iniciar a leitura" })
          .eq("id", importacaoId);
        throw new Error("Não foi possível iniciar a leitura da ficha.");
      }
      return { importacaoId };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_ficha_importacoes"] });
    },
  });
}

export interface AplicarFichaInput {
  item: FichaItem;
  /** Valores revisados pelo usuário (sobrepõem o que a leitura trouxe). */
  dados: FichaDadosEditaveis;
  cargoId: string | null;
  unidadeId: string | null;
  /** Setor escolhido na conferência (a ficha não traz setor). */
  setorId?: string | null;
  /** Vínculo escolhido na conferência (clt, intermitente, pj…). */
  regime?: string | null;

  /** Quando o CPF já existe: atualizar o cadastro em vez de criar outro. */
  atualizarExistente: boolean;
  /** Grava também a configuração de jornada sugerida. */
  jornada?: JornadaSugerida | null;
  /** Turno reconhecido para os dias trabalhados (null grava só os horários). */
  turnoId?: string | null;
  /**
   * Ao atualizar quem já existe: colunas escolhidas na comparação lado a lado.
   * Quando não informado, todas as colunas preenchidas da ficha são gravadas.
   */
  camposPermitidos?: string[] | null;
  /** Anexa o PDF original da ficha nos documentos do colaborador. */
  anexarFicha?: boolean;
  formaPagamento: string;
  possuiFolhaPonto: boolean;
  optanteAdiantamento: boolean;
  /**
   * Conferência da ficha oficial de uma Pré-Admissão: quando informado, o
   * cadastro e a conclusão da pré-admissão acontecem na MESMA transação.
   */
  preadmissaoId?: string | null;
}

/** Resultado da aplicação: o cadastro é transacional; o anexo é separado. */
export interface AplicarFichaResultado {
  colaboradorId: string;
  jaAplicado: boolean;
  anexo: AnexoFichaStatus;
  anexoMotivo?: string;
  /** Só na conferência de pré-admissão: "importacao", "recontratacao" ou "idempotente". */
  modo?: string;
}

/**
 * Cria (ou atualiza) o cadastro do colaborador a partir da ficha revisada.
 *
 * Tudo o que é banco (colaborador + configuração vigente + dias + dados
 * revisados/status do item + contadores) vai em UMA transação, na rotina
 * `dp_ficha_aplicar`. Se qualquer parte falhar, nada é gravado.
 *
 * O anexo do PDF é do Storage, portanto NÃO participa dessa transação: ele
 * roda depois, é repetível sem multiplicar arquivos e uma falha aqui não
 * desfaz — nem repete — o cadastro já confirmado.
 */
export function useAplicarFicha() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async ({
      item,
      dados,
      cargoId,
      unidadeId,
      setorId,
      regime,
      atualizarExistente,
      jornada,
      turnoId,
      camposPermitidos,
      anexarFicha,
      formaPagamento,
      possuiFolhaPonto,
      optanteAdiantamento,
      preadmissaoId,
    }: AplicarFichaInput) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const nome = txt(dados.nome);
      const cpf = digits(dados.cpf);
      if (!nome) throw new Error("Informe o nome do colaborador.");
      if (cpf.length !== 11) throw new Error("Informe um CPF com 11 dígitos.");

      // O servidor tem a própria lista de campos permitidos: aqui só mapeamos a
      // ficha para as colunas do cadastro. Empresa, conta, perfil e permissões
      // nunca vão no payload.
      const dadosCadastro = montarPayloadFicha(dados as Record<string, unknown>);

      // Conferência da ficha oficial de uma Pré-Admissão: cadastro + conclusão
      // da pré-admissão em UMA transação, com familiares e documentos já
      // enviados pelo candidato aproveitados pela própria rotina do banco.
      if (preadmissaoId) {
        const pr = await efetivarPreadmissaoComFichaRpc({
          p_preadmissao_id: preadmissaoId,
          p_item_id: item.id,
          p_dados: { ...dadosCadastro, nome, cpf },
          p_campos: camposPermitidos ?? null,
          p_cargo_id: cargoId,
          p_unidade_id: unidadeId,
          p_setor_id: setorId ?? null,
          p_turno_id: turnoId ?? null,
          p_regime: regime ?? null,
          p_forma_pagamento: formaPagamento,
          p_jornada: jornada && !jornada.vazia
            ? { dias: jornada.dias as unknown as Array<Record<string, unknown>> }
            : null,
          p_justificativa: null,
          // Recontratação também respeita o que o gestor decidiu na revisão:
          // salário e data de admissão da ficha conferida, não o rascunho.
          p_salario: Number.isFinite(Number(dadosCadastro.salario_base))
            ? Number(dadosCadastro.salario_base)
            : null,
          p_data_admissao: (dadosCadastro.data_admissao as string | null) ?? null,
        });
        return {
          colaboradorId: pr.colaborador_id,
          jaAplicado: !!pr.ja_aplicado,
          anexo: "nao_solicitado" as AnexoFichaStatus,
          modo: pr.modo,
        };
      }

      const res = await aplicarFichaRpc({
        p_item_id: item.id,
        p_dados: { ...dadosCadastro, nome, cpf },
        p_dados_extraidos: dados as Record<string, unknown>,
        p_campos: atualizarExistente ? camposPermitidos ?? null : null,
        // A decisão do usuário vai como está: quem recusa vínculo inválido é a
        // rotina no banco (nunca transformamos "atualizar" em "criar" aqui).
        p_atualizar_existente: atualizarExistente,
        p_cargo_id: cargoId,
        p_unidade_id: unidadeId,
        p_setor_id: setorId ?? null,
        p_turno_id: turnoId ?? null,
        p_regime: regime ?? null,
        p_forma_pagamento: formaPagamento,
        p_possui_folha_ponto: possuiFolhaPonto,
        p_optante_adiantamento: optanteAdiantamento,
        p_jornada: jornada && !jornada.vazia ? { dias: jornada.dias as unknown as Array<Record<string, unknown>> } : null,
      });

      const colaboradorId = res.colaborador_id;
      let anexo: AnexoFichaStatus = "nao_solicitado";
      let anexoMotivo: string | undefined;

      // Anexo em Storage: fora da transação do banco, por isso é tratado à
      // parte — o cadastro já está confirmado e nunca é refeito por causa dele.
      // O lote é um PDF com várias pessoas: anexamos SOMENTE o recorte das
      // páginas deste item, jamais o arquivo completo. O caminho de origem vem
      // do servidor, nunca do cliente, e o destino é determinístico, então
      // repetir o anexo não multiplica arquivo nem registro.
      if (anexarFicha) {
        const r = await anexarFichaRecorte(
          {
            companyId: selectedCompanyId,
            colaboradorId,
            itemId: item.id,
            arquivoPath: res.arquivo_path,
            paginaInicio: res.pagina_inicio,
            paginaFim: res.pagina_fim,
          },
          {
            baixarLote: async (path) => {
              const dl = await supabase.storage.from(BUCKET).download(path);
              if (dl.error || !dl.data) throw new Error(dl.error?.message ?? "Arquivo do lote não encontrado.");
              return await dl.data.arrayBuffer();
            },
            enviarRecorte: async (destino, pdf) =>
              await supabase.storage.from(DP_DOCUMENTOS_BUCKET).upload(
                destino,
                new Blob([pdf as unknown as BlobPart], { type: "application/pdf" }),
                { contentType: "application/pdf", upsert: false },
              ),
            documentoExistente: async (destino) => {
              const q = await supabase
                .from("dp_documentos")
                .select("id")
                .eq("company_id", selectedCompanyId)
                .eq("colaborador_id", colaboradorId)
                .eq("file_path", destino)
                .maybeSingle();
              if (q.error) throw q.error;
              return !!q.data?.id;
            },
            registrarDocumento: async ({ destino, descricao }) =>
              await supabase.from("dp_documentos").insert({
                company_id: selectedCompanyId,
                colaborador_id: colaboradorId,
                file_path: destino,
                file_name: "ficha-registro.pdf",
                mime_type: "application/pdf",
                tipo: "ficha_registro",
                titulo: "Ficha de registro importada",
                descricao,
              }),
          },
        );
        anexo = r.status;
        anexoMotivo = r.motivo;
      }

      return { colaboradorId, jaAplicado: res.ja_aplicado, anexo, anexoMotivo } satisfies AplicarFichaResultado;
    },
    onSuccess: (res) => {
      // O cadastro está confirmado: nada aqui pede para criar outro. O erro do
      // anexo é mostrado sem ser silenciado e o anexo pode ser repetido depois.
      if (res.anexo === "falhou" || res.anexo === "sem_paginas") {
        const motivo = res.anexoMotivo ? ` ${res.anexoMotivo}` : "";
        toast.error(
          `Cadastro salvo, mas o PDF da ficha não foi anexado.${motivo} Anexe o arquivo pelos documentos do colaborador.`,
        );
      }
      if (res.modo === "recontratacao") {
        toast.success(
          "Recontratação registrada: o cadastro anterior foi reativado com um novo vínculo e os dados conferidos.",
        );
      }
      qc.invalidateQueries({ queryKey: ["dp_preadmissoes"] });
      qc.invalidateQueries({ queryKey: ["dp_ficha_itens"] });
      qc.invalidateQueries({ queryKey: ["dp_ficha_importacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
      // Chaves REAIS dos hooks de jornada/escala (a rotina grava configuração e dias).
      qc.invalidateQueries({ queryKey: ["dp_colab_config_trabalho"] });
      qc.invalidateQueries({ queryKey: ["dp_escala_base_mes"] });
      qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
      qc.invalidateQueries({ queryKey: ["dp_cargo_padrao"] });
      qc.invalidateQueries({ queryKey: ["dp_modelos_horario"] });
      qc.invalidateQueries({ queryKey: ["dp_documentos"] });
    },
  });
}

/**
 * Marca a ficha como ignorada (não gera cadastro).
 *
 * Usa a mesma rotina transacional do aplicar, com o mesmo bloqueio por lote,
 * para nunca sobrescrever os contadores com uma contagem obsoleta feita no
 * cliente.
 */
export function useIgnorarFicha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: FichaItem) => ignorarFichaRpc(item.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_ficha_itens"] });
      qc.invalidateQueries({ queryKey: ["dp_ficha_importacoes"] });
    },
  });
}
