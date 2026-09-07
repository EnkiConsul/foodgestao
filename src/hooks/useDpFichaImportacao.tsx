import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";
import { montarJornadaSugerida, type JornadaSugerida } from "@/lib/dp/ficha-registro/jornada-parse";
import { montarEndereco } from "@/lib/dp/ficha-registro/endereco-parse";

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

const hoje = () => new Date().toISOString().slice(0, 10);
const digits = (v: unknown) => String(v ?? "").replace(/\D+/g, "");

function txt(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function dataIso(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function sexoNorm(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s.startsWith("m")) return "M";
  if (s.startsWith("f")) return "F";
  return null;
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
  return useQuery({
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
}

/** Fichas identificadas dentro de uma importação. */
export function useDpFichaItens(importacaoId?: string | null, processando = false) {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_ficha_itens", selectedCompanyId, importacaoId],
    enabled: !!selectedCompanyId && !!importacaoId,
    refetchInterval: processando ? 3000 : false,
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
  /** Quando o CPF já existe: atualizar o cadastro em vez de criar outro. */
  atualizarExistente: boolean;
  /** Grava também a configuração de jornada sugerida. */
  jornada?: JornadaSugerida | null;
}

/** Cria (ou atualiza) o cadastro do colaborador a partir da ficha revisada. */
export function useAplicarFicha() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async ({ item, dados, cargoId, unidadeId, atualizarExistente, jornada }: AplicarFichaInput) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const nome = txt(dados.nome);
      const cpf = digits(dados.cpf);
      if (!nome) throw new Error("Informe o nome do colaborador.");
      if (cpf.length !== 11) throw new Error("Informe um CPF com 11 dígitos.");

      const endereco = montarEndereco((dados.endereco ?? {}) as Record<string, unknown>);
      const payload = {
        company_id: selectedCompanyId,
        nome,
        cpf,
        matricula: txt(dados.matricula),
        data_nascimento: dataIso(dados.data_nascimento),
        data_admissao: dataIso(dados.data_admissao),
        sexo: sexoNorm(dados.sexo),
        telefone: txt(dados.telefone),
        email_contato: txt(dados.email),
        endereco: endereco as unknown as Database["public"]["Tables"]["dp_colaboradores"]["Insert"]["endereco"],
        cargo_id: cargoId,
        cargo: txt(dados.cargo_nome),
        unidade_id: unidadeId,
        salario_base: num(dados.salario),
        rg_numero: txt(dados.rg_numero),
        rg_orgao: txt(dados.rg_orgao),
        rg_uf: txt(dados.rg_uf),
        rg_emissao: dataIso(dados.rg_emissao),
        ctps_numero: txt(dados.ctps_numero),
        ctps_serie: txt(dados.ctps_serie),
        ctps_uf: txt(dados.ctps_uf),
        ctps_expedicao: dataIso(dados.ctps_expedicao),
        titulo_eleitor: txt(dados.titulo_eleitor),
        titulo_zona: txt(dados.titulo_zona),
        titulo_secao: txt(dados.titulo_secao),
        reservista: txt(dados.reservista),
        reservista_categoria: txt(dados.reservista_categoria),
        nome_pai: txt(dados.nome_pai),
        nome_mae: txt(dados.nome_mae),
        nacionalidade: txt(dados.nacionalidade),
        naturalidade: txt(dados.naturalidade),
        raca_cor: txt(dados.raca_cor),
        grau_instrucao: txt(dados.grau_instrucao),
        deficiencia: txt(dados.deficiencia),
        origem_cadastro: "ficha_importacao",
        ficha_importacao_item_id: item.id,
      };

      let colaboradorId: string;
      if (atualizarExistente && item.colaborador_existente_id) {
        // Atualiza só o que veio preenchido, para não apagar dados já cadastrados.
        const limpo = Object.fromEntries(
          Object.entries(payload).filter(([k, v]) => k === "ficha_importacao_item_id" || k === "origem_cadastro" || (v !== null && v !== undefined)),
        );
        delete (limpo as Record<string, unknown>).company_id;
        delete (limpo as Record<string, unknown>).origem_cadastro;
        const { error } = await supabase
          .from("dp_colaboradores")
          // deno-lint-ignore no-explicit-any
          .update(limpo as any)
          .eq("id", item.colaborador_existente_id)
          .eq("company_id", selectedCompanyId);
        if (error) throw error;
        colaboradorId = item.colaborador_existente_id;
      } else {
        const { data, error } = await supabase
          .from("dp_colaboradores")
          // deno-lint-ignore no-explicit-any
          .insert(payload as any)
          .select("id")
          .single();
        if (error) {
          if (String(error.message).toLowerCase().includes("duplicate")) {
            throw new Error("Já existe um colaborador com este CPF nesta empresa.");
          }
          throw error;
        }
        colaboradorId = (data as { id: string }).id;
      }

      if (jornada && !jornada.vazia) {
        const cfg = await supabase
          .from("dp_colaborador_config_trabalho")
          .insert({
            company_id: selectedCompanyId,
            colaborador_id: colaboradorId,
            unidade_id: unidadeId,
            turno_padrao_id: null,
            folga_variavel: !jornada.dias.some((d) => !d.trabalha),
            folga_fixa_dow: jornada.dias.find((d) => !d.trabalha)?.dow ?? null,
            observacoes: "Importado da ficha de registro",
            vigencia_inicio: dataIso(dados.data_admissao) ?? hoje(),
          })
          .select("id")
          .single();
        if (cfg.error) throw cfg.error;
        const configId = (cfg.data as { id: string }).id;
        const { error: diasErr } = await supabase.from("dp_colaborador_config_dias").insert(
          jornada.dias.map((d) => ({
            company_id: selectedCompanyId,
            config_id: configId,
            dow: d.dow,
            trabalha: d.trabalha,
            turno_id: null,
            entrada: d.trabalha ? d.entrada : null,
            saida: d.trabalha ? d.saida : null,
            intervalo_minutos: d.trabalha ? d.intervalo_minutos ?? 0 : null,
            setor_id: null,
          })),
        );
        if (diasErr) throw diasErr;
      }

      const { error: itemErr } = await supabase
        .from("dp_ficha_importacao_itens")
        .update({
          status: atualizarExistente ? "atualizado" : "criado",
          colaborador_id: colaboradorId,
          dados_extraidos: dados as unknown as Database["public"]["Tables"]["dp_ficha_importacao_itens"]["Update"]["dados_extraidos"],
          erro_mensagem: null,
        })
        .eq("id", item.id);
      if (itemErr) throw itemErr;

      await atualizarContadores(item.importacao_id);
      return { colaboradorId };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_ficha_itens"] });
      qc.invalidateQueries({ queryKey: ["dp_ficha_importacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
    },
  });
}

/** Marca a ficha como ignorada (não gera cadastro). */
export function useIgnorarFicha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: FichaItem) => {
      const { error } = await supabase
        .from("dp_ficha_importacao_itens")
        .update({ status: "ignorado" })
        .eq("id", item.id);
      if (error) throw error;
      await atualizarContadores(item.importacao_id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_ficha_itens"] });
      qc.invalidateQueries({ queryKey: ["dp_ficha_importacoes"] });
    },
  });
}

async function atualizarContadores(importacaoId: string) {
  const { data } = await supabase
    .from("dp_ficha_importacao_itens")
    .select("status")
    .eq("importacao_id", importacaoId);
  const rows = (data ?? []) as Array<{ status: string }>;
  const criados = rows.filter((r) => r.status === "criado").length;
  const atualizados = rows.filter((r) => r.status === "atualizado").length;
  const pendentes = rows.filter((r) => ["pendente", "revisar", "duplicado"].includes(r.status)).length;
  await supabase
    .from("dp_ficha_importacoes")
    .update({
      criados,
      atualizados,
      ...(pendentes === 0 && rows.length > 0 ? { status: "concluida", concluido_em: new Date().toISOString() } : {}),
    })
    .eq("id", importacaoId);
}
