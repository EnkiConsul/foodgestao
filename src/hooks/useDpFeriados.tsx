import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  FERIADOS_NACIONAIS_FIXOS,
  type FeriadoRegra,
  type FeriadoTipo,
} from "@/lib/dp/feriados";

export type FeriadoInput = {
  id?: string;
  nome: string;
  tipo: FeriadoTipo;
  data?: string | null;
  dia?: number | null;
  mes?: number | null;
  ordinal?: number | null;
  dia_semana?: number | null;
  ativo?: boolean;
  observacao?: string | null;
};

const TEXTO_ERRO: Record<string, string> = {
  FERIADO_CAMPOS_INVALIDOS: "Preencha o nome e a data do feriado.",
  FERIADO_UNIDADE_INVALIDA: "Esta unidade não pertence à empresa selecionada.",
};

const textoErro = (msg?: string | null) => {
  if (!msg) return "Não foi possível concluir a operação.";
  for (const [codigo, texto] of Object.entries(TEXTO_ERRO)) {
    if (msg.includes(codigo)) return texto;
  }
  return msg;
};

/** Calendário de feriados de uma unidade: cadastro, edição e liga/desliga. */
export function useDpFeriados(unidadeId?: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["dp_unidade_feriados"] });
  };

  const query = useQuery({
    queryKey: ["dp_unidade_feriados", unidadeId],
    enabled: !!unidadeId,
    queryFn: async (): Promise<FeriadoRegra[]> => {
      const { data, error } = await supabase
        .from("dp_unidade_feriados")
        .select("id, nome, tipo, data, dia, mes, ordinal, dia_semana, ativo, observacao")
        .eq("unidade_id", unidadeId!)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        nome: r.nome,
        tipo: r.tipo as FeriadoTipo,
        data: r.data,
        dia: r.dia,
        mes: r.mes,
        ordinal: r.ordinal,
        dia_semana: r.dia_semana,
        ativo: r.ativo,
        observacao: r.observacao,
      }));
    },
  });

  const salvar = useMutation({
    mutationFn: async (input: FeriadoInput) => {
      if (!selectedCompanyId || !unidadeId) throw new Error("Salve a unidade primeiro.");
      const payload = {
        company_id: selectedCompanyId,
        unidade_id: unidadeId,
        nome: input.nome.trim(),
        tipo: input.tipo,
        data: input.tipo === "especifica" ? input.data || null : null,
        dia: input.tipo === "anual" ? input.dia ?? null : null,
        mes: input.tipo === "especifica" ? null : input.mes ?? null,
        ordinal: input.tipo === "relativa" ? input.ordinal ?? null : null,
        dia_semana: input.tipo === "relativa" ? input.dia_semana ?? null : null,
        ativo: input.ativo ?? true,
        observacao: input.observacao?.trim() || null,
      };
      if (input.id) {
        const { error } = await supabase
          .from("dp_unidade_feriados")
          .update(payload)
          .eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("dp_unidade_feriados").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Feriado salvo");
      invalidate();
    },
    onError: (e: any) => toast.error(textoErro(e?.message)),
  });

  const alternar = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("dp_unidade_feriados").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(textoErro(e?.message)),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_unidade_feriados").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Feriado removido");
      invalidate();
    },
    onError: (e: any) => toast.error(textoErro(e?.message)),
  });

  /** Inclui os feriados nacionais fixos que ainda não existem na unidade. */
  const incluirNacionais = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId || !unidadeId) throw new Error("Salve a unidade primeiro.");
      const atuais = query.data ?? [];
      const faltantes = FERIADOS_NACIONAIS_FIXOS.filter(
        (f) => !atuais.some((a) => a.tipo === "anual" && a.dia === f.dia && a.mes === f.mes),
      );
      if (faltantes.length === 0) return 0;
      const { error } = await supabase.from("dp_unidade_feriados").insert(
        faltantes.map((f) => ({
          company_id: selectedCompanyId,
          unidade_id: unidadeId,
          nome: f.nome,
          tipo: "anual",
          dia: f.dia,
          mes: f.mes,
          ativo: true,
        })),
      );
      if (error) throw error;
      return faltantes.length;
    },
    onSuccess: (quantos) => {
      toast.success(
        quantos ? `${quantos} feriado(s) nacional(is) incluído(s)` : "Já estavam todos cadastrados",
      );
      invalidate();
    },
    onError: (e: any) => toast.error(textoErro(e?.message)),
  });

  /** Copia o calendário desta unidade para outras unidades da empresa. */
  const replicar = useMutation({
    mutationFn: async ({
      destinos,
      modo,
    }: {
      destinos: string[];
      modo: ReplicarModo;
    }): Promise<ReplicarResumo> => {
      if (!selectedCompanyId || !unidadeId) throw new Error("Salve a unidade primeiro.");
      const origem = query.data ?? [];
      if (origem.length === 0) throw new Error("Esta unidade não tem feriados para copiar.");
      if (destinos.length === 0) throw new Error("Escolha ao menos uma unidade.");

      const linha = (unidade: string, f: FeriadoRegra) => ({
        company_id: selectedCompanyId,
        unidade_id: unidade,
        nome: f.nome,
        tipo: f.tipo,
        data: f.tipo === "especifica" ? f.data ?? null : null,
        dia: f.tipo === "anual" ? f.dia ?? null : null,
        mes: f.tipo === "especifica" ? null : f.mes ?? null,
        ordinal: f.tipo === "relativa" ? f.ordinal ?? null : null,
        dia_semana: f.tipo === "relativa" ? f.dia_semana ?? null : null,
        ativo: f.ativo !== false,
        observacao: f.observacao ?? null,
      });

      if (modo === "substituir") {
        const { error: delErr } = await supabase
          .from("dp_unidade_feriados")
          .delete()
          .in("unidade_id", destinos);
        if (delErr) throw delErr;
        const linhas = destinos.flatMap((u) => origem.map((f) => linha(u, f)));
        const { error } = await supabase.from("dp_unidade_feriados").insert(linhas);
        if (error) throw error;
        return { unidades: destinos.length, copiados: linhas.length, existentes: 0 };
      }

      const { data: atuais, error: readErr } = await supabase
        .from("dp_unidade_feriados")
        .select("unidade_id, tipo, data, dia, mes, ordinal, dia_semana")
        .in("unidade_id", destinos);
      if (readErr) throw readErr;

      const porUnidade = new Map<string, Set<string>>();
      destinos.forEach((u) => porUnidade.set(u, new Set()));
      (atuais ?? []).forEach((r: any) => {
        porUnidade.get(r.unidade_id)?.add(chaveFeriado(r as FeriadoRegra));
      });

      const linhas: ReturnType<typeof linha>[] = [];
      let existentes = 0;
      let unidadesTocadas = 0;
      for (const u of destinos) {
        const set = porUnidade.get(u) ?? new Set<string>();
        let novos = 0;
        for (const f of origem) {
          if (set.has(chaveFeriado(f))) {
            existentes += 1;
            continue;
          }
          linhas.push(linha(u, f));
          novos += 1;
        }
        if (novos > 0) unidadesTocadas += 1;
      }
      if (linhas.length > 0) {
        const { error } = await supabase.from("dp_unidade_feriados").insert(linhas);
        if (error) throw error;
      }
      return { unidades: unidadesTocadas, copiados: linhas.length, existentes };
    },
    onSuccess: (r) => {
      toast.success(
        r.copiados === 0
          ? "Nada a copiar: as unidades já tinham esses feriados"
          : `${r.unidades} unidade(s) atualizada(s), ${r.copiados} feriado(s) copiado(s)` +
              (r.existentes ? `, ${r.existentes} já existiam` : ""),
      );
      invalidate();
    },
    onError: (e: any) => toast.error(textoErro(e?.message)),
  });

  return {
    feriados: query.data ?? [],
    isLoading: query.isLoading,
    salvar,
    alternar,
    excluir,
    incluirNacionais,
    replicar,
  };
}
