import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import { Checkbox } from "@/components/ui/checkbox";
import { antecedentesElegiveis, antecedenteRecente, textoAntecedentes, type AntecedenteDisciplinar } from "@/lib/dp/disciplinar-reincidencia";

export function DisciplinarAntecedentes({ companyId, colaboradorId, data, excluirId, value, onChange }: {
  companyId: string | null | undefined; colaboradorId: string; data: string; excluirId?: string; value: string[]; onChange: (v: string[]) => void;
}) {
  const query = useQuery({
    queryKey: ["dp_disciplinar_antecedentes", companyId, colaboradorId], enabled: !!companyId && !!colaboradorId,
    queryFn: async () => {
      if (!companyId || !colaboradorId) return { rows: [], admissao: null };
      const colab = await supabase.from("dp_colaboradores").select("data_admissao").eq("company_id", companyId).eq("id", colaboradorId).single();
      if (colab.error) throw colab.error;
      const rows = await fetchAllPages<AntecedenteDisciplinar>((from,to) => supabase.from("dp_registros_disciplinares")
        .select("id,colaborador_id,tipo,data,motivo,removido_em,via_assinada_path").eq("company_id", companyId).eq("colaborador_id", colaboradorId)
        .is("removido_em", null).order("data", { ascending: false }).order("id").range(from,to));
      return { rows, admissao: colab.data.data_admissao };
    },
  });
  const elegiveis = useMemo(() => antecedentesElegiveis(query.data?.rows ?? [], colaboradorId, query.data?.admissao, data, excluirId), [query.data, colaboradorId, data, excluirId]);
  useEffect(() => {
    if (!query.isSuccess) return;
    const validos = value.filter(id => elegiveis.some(r => r.id === id));
    if (validos.length !== value.length) onChange(validos);
  }, [elegiveis, value, onChange, query.isSuccess]);
  const texto = textoAntecedentes(elegiveis.filter(r => value.includes(r.id)));
  return <section className="min-w-0 space-y-3 border-t pt-4">
    <h4 className="text-sm font-semibold">Histórico anterior a citar (opcional)</h4>
    <p className="text-xs text-muted-foreground">Selecione somente fatos anteriores relacionados à nova conduta. Não reaplique punição pelo mesmo fato. A antiguidade não determina validade jurídica nem a próxima penalidade.</p>
    {query.isLoading ? <p className="text-sm text-muted-foreground">Carregando histórico…</p> : query.isError ? <p className="text-sm text-destructive">Não foi possível consultar o histórico. Tente novamente antes de incluir referências.</p> : !query.data?.admissao ? <p className="text-sm text-muted-foreground">Admissão atual não informada; referências indisponíveis.</p> : elegiveis.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro anterior elegível. Medidas formais exigem via assinada arquivada.</p> :
      <div className="max-h-64 space-y-1 overflow-y-auto">{elegiveis.map(r => <label key={r.id} className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
        <Checkbox className="mt-1 shrink-0" checked={value.includes(r.id)} onCheckedChange={v => onChange(v === true ? [...value, r.id] : value.filter(id => id !== r.id))} />
        <span className="min-w-0 break-words"><span className="block font-medium">{r.tipo === "advertencia_verbal" ? "Advertência verbal" : r.tipo === "suspensao" ? "Suspensão" : "Advertência escrita"} · {r.data.split("-").reverse().join("/")}</span>{r.motivo}<span className="block text-xs text-muted-foreground">{antecedenteRecente(r.data, data) ? "Últimos 6 meses" : "Anterior a 6 meses"}</span></span>
      </label>)}</div>}
    {texto && <div className="space-y-2 border-l-2 border-primary pl-3"><h5 className="text-xs font-semibold">Prévia da citação</h5><p className="whitespace-pre-line break-words text-sm">{texto}</p><p className="text-xs text-muted-foreground">Os registros citados contextualizam o histórico; esta medida se refere exclusivamente aos novos fatos descritos.</p></div>}
  </section>;
}