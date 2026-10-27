import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { previaTrocaGestor, useRegistrarTrocaGestor } from "@/hooks/useTrocaGestor";
import { DpDialogShell } from "@/components/dp/DpDialogShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mensagemErroTroca } from "@/lib/dp/trocas-erros";
import { dataComDiaSemana } from "@/lib/dp/troca-apresentacao";
import { useDpOperacaoPanorama } from "@/hooks/useDpOperacaoPanorama";
import { folgasDisponiveisTroca } from "@/lib/dp/troca-gestor";
import { hojeIsoLocal } from "@/lib/dp/dataLocal";

type Pessoa = { id: string; nome: string; unidade_id: string | null; origem_cadastro: string | null };
type Props = { open: boolean; onOpenChange: (open: boolean) => void; unidadeId?: string; dataInicial?: string; colaboradorInicialId?: string };

export function RegistrarTrocaGestorDialog(props: Props) {
  // Mount the calendar reads only while the dialog is open.
  return props.open ? <RegistrarTrocaGestorConteudo {...props} /> : null;
}

function RegistrarTrocaGestorConteudo({ open, onOpenChange, unidadeId, dataInicial, colaboradorInicialId }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [sol, setSol] = useState("");
  const [dest, setDest] = useState("");
  const [original, setOriginal] = useState("");
  const [proposta, setProposta] = useState("");
  const [mesFolgas, setMesFolgas] = useState((dataInicial ?? hojeIsoLocal()).slice(0, 7));
  const [motivo, setMotivo] = useState("");
  const [ciente, setCiente] = useState(false);
  const [notificar, setNotificar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const registrar = useRegistrarTrocaGestor();
  useEffect(() => {
    if (!open) return;
    setSol(colaboradorInicialId ?? ""); setDest(""); setOriginal(dataInicial ?? ""); setProposta(""); setMesFolgas((dataInicial ?? hojeIsoLocal()).slice(0, 7)); setMotivo(""); setCiente(false); setNotificar(false); setErro(null);
  }, [open, dataInicial, colaboradorInicialId, selectedCompanyId]);
  useEffect(() => { setCiente(false); setErro(null); }, [sol, dest, original, proposta]);

  const pessoas = useQuery({
    queryKey: ["dp_troca_gestor_pessoas", selectedCompanyId], enabled: open && !!selectedCompanyId,
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const { data, error } = await supabase.from("dp_colaboradores").select("id,nome,unidade_id,origem_cadastro").eq("company_id", selectedCompanyId).eq("ativo", true).is("deleted_at", null).order("nome");
      if (error) throw error;
      return (data ?? []) as Pessoa[];
    },
  });
  const primeira = pessoas.data?.find(p => p.id === sol);
  const segunda = pessoas.data?.find(p => p.id === dest);
  const calendario = useDpOperacaoPanorama(mesFolgas, primeira?.unidade_id ?? unidadeId ?? null);
  const datasColega = folgasDisponiveisTroca(calendario.dias, dest, sol, original);
  const diaOriginal = calendario.contarData(original);
  const colegas = (pessoas.data ?? []).filter(p => p.id !== sol && p.unidade_id === primeira?.unidade_id);
  const trabalhaNoDia = (id: string) => diaOriginal?.pessoas.some(p => p.colaborador_id === id && !p.avulso_id && ["fixo", "convocado_aceito", "atrasado", "saida_antecipada"].includes(p.categoria));
  const colegasOrdenados = [...colegas].sort((a, b) => Number(!!trabalhaNoDia(b.id)) - Number(!!trabalhaNoDia(a.id)) || a.nome.localeCompare(b.nome, "pt-BR"));
  useEffect(() => { setProposta(""); }, [sol, dest, original, mesFolgas]);
  useEffect(() => {
    if (proposta && !calendario.isLoading && !datasColega.includes(proposta)) setProposta("");
  }, [proposta, calendario.isLoading, datasColega]);
  const input = { companyId: selectedCompanyId ?? "", solicitanteId: sol, destinoId: dest, dataOriginal: original, dataProposta: proposta };
  const completo = !!selectedCompanyId && !!sol && !!dest && !!original && !!proposta && sol !== dest && original !== proposta;
  const previa = useQuery({ queryKey: ["dp_troca_gestor_previa", input], enabled: open && completo, retry: false, staleTime: 0, queryFn: () => previaTrocaGestor(input) });
  const riscos = previa.data?.riscos ?? [];
  const emAdmissao = primeira?.origem_cadastro === "preadmissao_rotina" || segunda?.origem_cadastro === "preadmissao_rotina";
  const salvar = async () => {
    if (!completo || !previa.isSuccess || (riscos.length > 0 && !ciente)) return;
    setErro(null);
    try {
      await registrar.mutateAsync({ ...input, motivo, cienteDsr: ciente, notificar });
      toast.success("Troca registrada", { description: "Rotina e justificativas atualizadas para as duas pessoas." });
      onOpenChange(false);
    } catch (e) { setErro(mensagemErroTroca(e instanceof Error ? e.message : "")); }
  };
  return <DpDialogShell open={open} onOpenChange={v => !registrar.isPending && onOpenChange(v)} icon={ArrowLeftRight} title="Registrar troca" footer={<>
    <Button variant="outline" disabled={registrar.isPending} onClick={() => onOpenChange(false)}>Cancelar</Button>
    <Button disabled={!completo || !previa.isSuccess || previa.isFetching || motivo.trim().length < 3 || (riscos.length > 0 && !ciente) || registrar.isPending} onClick={() => void salvar()}>
      {registrar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Registrar troca
    </Button>
  </>}>
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="troca-primeira">Primeira pessoa</Label><Select value={sol} onValueChange={v => { setSol(v); setDest(""); }} disabled={registrar.isPending}><SelectTrigger id="troca-primeira"><SelectValue placeholder="Selecionar" /></SelectTrigger><SelectContent>{(pessoas.data ?? []).filter(p => !unidadeId || p.unidade_id === unidadeId).map(p => <SelectItem key={p.id} value={p.id}>{p.nome}{p.origem_cadastro === "preadmissao_rotina" ? " · Em admissão" : ""}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="troca-segunda">Trocar com</Label><Select value={dest} onValueChange={setDest} disabled={!sol || registrar.isPending}><SelectTrigger id="troca-segunda"><SelectValue placeholder="Selecionar colega" /></SelectTrigger><SelectContent>{colegasOrdenados.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}{p.origem_cadastro === "preadmissao_rotina" ? " · Em admissão" : ""}{trabalhaNoDia(p.id) ? " · Trabalha neste dia" : ""}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="troca-original">Folga atual da primeira pessoa</Label><Input id="troca-original" type="date" value={original} onChange={e => setOriginal(e.target.value)} disabled={registrar.isPending} /></div>
        <div className="space-y-2"><Label htmlFor="troca-mes-folgas">Mês das folgas do colega</Label><Input id="troca-mes-folgas" type="month" value={mesFolgas} onChange={e => { if (e.target.value) setMesFolgas(e.target.value); }} disabled={registrar.isPending} /></div>
      </div>
      {dest && <div className="space-y-2">
        <Label>Folga de {segunda?.nome}</Label>
        {calendario.isLoading ? <p className="text-sm text-muted-foreground">Carregando folgas…</p> : calendario.error ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar as folgas. <Button variant="link" onClick={() => void qc.invalidateQueries({ queryKey: ["dp_panorama_base"] })}>Tentar novamente</Button></p> : datasColega.length ?
          <div className="grid gap-2 sm:grid-cols-2">{datasColega.map(d => <Button key={d} variant={proposta === d ? "default" : "outline"} aria-pressed={proposta === d} className="h-auto min-h-11 whitespace-normal" disabled={registrar.isPending} onClick={() => setProposta(d)}>{dataComDiaSemana(d)}</Button>)}</div> :
          <p className="text-sm text-muted-foreground">Nenhuma folga disponível para esta troca neste mês.</p>}
      </div>}
      {pessoas.isLoading && <p className="text-sm text-muted-foreground">Carregando pessoas…</p>}
      {pessoas.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar as pessoas. <Button variant="link" onClick={() => void pessoas.refetch()}>Tentar novamente</Button></p>}
      {completo && <div className="space-y-2 border-y border-border py-3 text-sm"><p><strong>{dataComDiaSemana(original)}</strong>: {primeira?.nome} trabalha; {segunda?.nome} folga.</p><p><strong>{dataComDiaSemana(proposta)}</strong>: {segunda?.nome} trabalha; {primeira?.nome} folga.</p></div>}
      {completo && previa.isFetching && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Conferindo folgas e descanso…</p>}
      {completo && previa.isError && <div role="alert" className="text-sm text-destructive">{mensagemErroTroca(previa.error.message)} <Button variant="link" onClick={() => void previa.refetch()}>Conferir novamente</Button></div>}
      {emAdmissao && <p className="text-sm text-muted-foreground">Pessoa em admissão: registro operacional, sem termo ou assinatura. A troca não efetiva a admissão.</p>}
      {riscos.length > 0 && <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{riscos.map(r => <p key={r.colaborador_id}>{r.nome}: previsão de {r.dias} dias seguidos sem descanso. Recomenda-se antecipar a folga para respeitar o limite de 6 dias.</p>)}<label className="flex items-start gap-2"><Checkbox checked={ciente} onCheckedChange={v => setCiente(v === true)} disabled={registrar.isPending} /><span>Estou ciente do alerta de descanso. Esta autorização não afasta as obrigações trabalhistas.</span></label></div>}
      <div className="space-y-2"><Label htmlFor="troca-motivo">Motivo e acordo informado ao gestor</Label><Textarea id="troca-motivo" value={motivo} onChange={e => setMotivo(e.target.value)} disabled={registrar.isPending} /></div>
      <label className="flex items-start gap-2 text-sm"><Checkbox checked={notificar} onCheckedChange={v => setNotificar(v === true)} disabled={registrar.isPending} /><span>Notificar colaboradores com acesso ao portal, sem solicitar assinatura.</span></label>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    </div>
  </DpDialogShell>;
}