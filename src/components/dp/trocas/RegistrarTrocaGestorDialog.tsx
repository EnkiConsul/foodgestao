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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mensagemErroTroca } from "@/lib/dp/trocas-erros";
import { dataComDiaSemana } from "@/lib/dp/troca-apresentacao";
import { useDpOperacaoPanorama } from "@/hooks/useDpOperacaoPanorama";
import { folgasDisponiveisTroca, folgasPropriasTroca } from "@/lib/dp/troca-gestor";
import { hojeIsoLocal } from "@/lib/dp/dataLocal";
import { TrocaMiniCalendario } from "./TrocaMiniCalendario";

/** Retroactive manager swaps are accepted up to 31 days back (mirrors the server limit). */
function dataMinimaTroca(): string {
  const d = new Date(`${hojeIsoLocal()}T12:00:00`); d.setDate(d.getDate() - 31);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
  const [cienteRetro, setCienteRetro] = useState(false);
  const [pessoaCalendario, setPessoaCalendario] = useState<"primeira" | "segunda">("primeira");
  const [erro, setErro] = useState<string | null>(null);
  const registrar = useRegistrarTrocaGestor();
  useEffect(() => {
    if (!open) return;
    setSol(colaboradorInicialId ?? ""); setDest(""); setOriginal(dataInicial ?? ""); setProposta(""); setMesFolgas((dataInicial ?? hojeIsoLocal()).slice(0, 7)); setMotivo(""); setCiente(false); setPessoaCalendario("primeira"); setErro(null);
  }, [open, dataInicial, colaboradorInicialId, selectedCompanyId]);
  useEffect(() => { setCiente(false); setCienteRetro(false); setErro(null); }, [sol, dest, original, proposta]);

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
  const datasProprias = folgasPropriasTroca(calendario.dias, sol, dataMinimaTroca());
  const datasPrimeira = original && !datasProprias.includes(original) ? [original, ...datasProprias] : datasProprias;
  const datasColega = folgasDisponiveisTroca(calendario.dias, dest, sol, original, dataMinimaTroca());
  const diaOriginal = calendario.contarData(original);
  const colegas = (pessoas.data ?? []).filter(p => p.id !== sol && p.unidade_id === primeira?.unidade_id);
  const trabalhaNoDia = (id: string) => diaOriginal?.pessoas.some(p => p.colaborador_id === id && !p.avulso_id && ["fixo", "convocado_aceito", "atrasado", "saida_antecipada"].includes(p.categoria));
  const colegasOrdenados = [...colegas].sort((a, b) => Number(!!trabalhaNoDia(b.id)) - Number(!!trabalhaNoDia(a.id)) || a.nome.localeCompare(b.nome, "pt-BR"));
  useEffect(() => { setProposta(""); }, [sol, dest, original]);
  const input = { companyId: selectedCompanyId ?? "", solicitanteId: sol, destinoId: dest, dataOriginal: original, dataProposta: proposta };
  const completo = !!selectedCompanyId && !!sol && !!dest && !!original && !!proposta && sol !== dest && original !== proposta;
  const previa = useQuery({ queryKey: ["dp_troca_gestor_previa", input], enabled: open && completo, retry: false, staleTime: 0, queryFn: () => previaTrocaGestor(input) });
  const riscos = previa.data?.riscos ?? [];
  const retroativa = completo && (original < hojeIsoLocal() || proposta < hojeIsoLocal());
  const salvar = async () => {
    if (!completo || !previa.isSuccess || (riscos.length > 0 && !ciente) || (retroativa && !cienteRetro)) return;
    setErro(null);
    try {
      await registrar.mutateAsync({ ...input, motivo, cienteDsr: ciente, notificar: true });
      toast.success("Troca registrada", { description: "Rotina e justificativas atualizadas para as duas pessoas." });
      onOpenChange(false);
    } catch (e) { setErro(mensagemErroTroca(e instanceof Error ? e.message : "")); }
  };
  return <DpDialogShell open={open} onOpenChange={v => !registrar.isPending && onOpenChange(v)} icon={ArrowLeftRight} title="Registrar troca" footer={<>
    <Button variant="outline" disabled={registrar.isPending} onClick={() => onOpenChange(false)}>Cancelar</Button>
    <Button disabled={!completo || !previa.isSuccess || !previa.data?.participantes || previa.isFetching || motivo.trim().length < 3 || (riscos.length > 0 && !ciente) || (retroativa && !cienteRetro) || registrar.isPending} onClick={() => void salvar()}>
      {registrar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Registrar troca
    </Button>
  </>}>
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="troca-primeira">Primeira pessoa</Label><Select value={sol} onValueChange={v => { setSol(v); setDest(""); setOriginal(""); setPessoaCalendario("primeira"); }} disabled={registrar.isPending}><SelectTrigger id="troca-primeira"><SelectValue placeholder="Selecionar" /></SelectTrigger><SelectContent>{(pessoas.data ?? []).filter(p => !unidadeId || p.unidade_id === unidadeId).map(p => <SelectItem key={p.id} value={p.id}>{p.nome}{p.origem_cadastro === "preadmissao_rotina" ? " · Em admissão" : ""}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="troca-segunda">Trocar com</Label><Select value={dest} onValueChange={v => { setDest(v); if (original) setPessoaCalendario("segunda"); }} disabled={!sol || registrar.isPending}><SelectTrigger id="troca-segunda"><SelectValue placeholder="Selecionar colega" /></SelectTrigger><SelectContent>{colegasOrdenados.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}{p.origem_cadastro === "preadmissao_rotina" ? " · Em admissão" : ""}{trabalhaNoDia(p.id) ? " · Trabalha neste dia" : ""}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <p className="text-xs text-muted-foreground">Trocas retroativas valem até 31 dias para trás.</p>
      {sol && <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2" aria-label="Pessoa no calendário">
          <Button variant={pessoaCalendario === "primeira" ? "default" : "outline"} aria-pressed={pessoaCalendario === "primeira"} className="h-auto min-h-11 whitespace-normal break-words" disabled={registrar.isPending} onClick={() => setPessoaCalendario("primeira")}>{primeira?.nome}</Button>
          <Button variant={pessoaCalendario === "segunda" ? "default" : "outline"} aria-pressed={pessoaCalendario === "segunda"} className="h-auto min-h-11 whitespace-normal break-words" disabled={!dest || !original || registrar.isPending} onClick={() => setPessoaCalendario("segunda")}>{segunda?.nome ?? "Colega"}</Button>
        </div>
        <TrocaMiniCalendario mes={mesFolgas} onMesChange={setMesFolgas} hoje={hojeIsoLocal()} disponiveis={pessoaCalendario === "primeira" ? datasPrimeira : datasColega} selecionada={pessoaCalendario === "primeira" ? original : proposta} outraData={pessoaCalendario === "primeira" ? proposta : original} carregando={calendario.isLoading} disabled={registrar.isPending} onSelecionar={d => { if (pessoaCalendario === "primeira") { setOriginal(d); if (dest) setPessoaCalendario("segunda"); } else setProposta(d); }} />
        {!calendario.isLoading && !(pessoaCalendario === "primeira" ? datasPrimeira : datasColega).length && <p className="text-sm text-muted-foreground">Nenhuma folga disponível para esta pessoa neste mês.</p>}
        {calendario.error && <p role="alert" className="text-sm text-destructive">Não foi possível carregar as folgas. <Button variant="link" onClick={() => void qc.invalidateQueries({ queryKey: ["dp_panorama_base"] })}>Tentar novamente</Button></p>}
      </div>}
      {original && original < dataMinimaTroca() && <p role="alert" className="text-sm text-destructive">Esta folga tem mais de 31 dias. Trocas retroativas só valem para o último mês.</p>}
      {pessoas.isLoading && <p className="text-sm text-muted-foreground">Carregando pessoas…</p>}
      {pessoas.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar as pessoas. <Button variant="link" onClick={() => void pessoas.refetch()}>Tentar novamente</Button></p>}
      {completo && <div className="space-y-2 border-y border-border py-3 text-sm"><p><strong>{dataComDiaSemana(original)}</strong>: {primeira?.nome} trabalha; {segunda?.nome} folga.</p><p><strong>{dataComDiaSemana(proposta)}</strong>: {segunda?.nome} trabalha; {primeira?.nome} folga.</p></div>}
      {completo && previa.isFetching && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Conferindo folgas e descanso…</p>}
      {completo && previa.isError && <div role="alert" className="text-sm text-destructive">{mensagemErroTroca(previa.error.message)} <Button variant="link" onClick={() => void previa.refetch()}>Conferir novamente</Button></div>}
      {retroativa && <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"><p>Uma das datas já passou. A troca será registrada como retroativa e altera o histórico das duas pessoas.</p><label className="flex items-start gap-2"><Checkbox checked={cienteRetro} onCheckedChange={v => setCienteRetro(v === true)} disabled={registrar.isPending} /><span>Confirmo que esta troca já aconteceu ou foi combinada com as duas pessoas.</span></label></div>}
      {previa.data?.participantes && <div role="status" className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">{previa.data.participantes.map(p => <p key={p.colaborador_id}>{!p.formal ? <><strong>{p.nome}</strong> não tem vínculo formal e não assinará termo. A troca é somente operacional para esta pessoa.</> : <><strong>{p.nome}</strong> receberá seu Termo de Alteração de Folga individual{p.portal ? " para assinatura no Portal." : ". Sem acesso ao Portal: a assinatura ficará pendente até disponibilizar o acesso."}</>}</p>)}<p className="text-xs text-muted-foreground">A autorização do gestor não substitui a assinatura nem efetiva uma admissão.</p></div>}
      {riscos.length > 0 && <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{riscos.map(r => <p key={r.colaborador_id}>{r.nome}: previsão de {r.dias} dias seguidos sem descanso. Recomenda-se antecipar a folga para respeitar o limite de 6 dias.</p>)}<label className="flex items-start gap-2"><Checkbox checked={ciente} onCheckedChange={v => setCiente(v === true)} disabled={registrar.isPending} /><span>Estou ciente do alerta de descanso. Esta autorização não afasta as obrigações trabalhistas.</span></label></div>}
      <div className="space-y-2"><Label htmlFor="troca-motivo">Motivo e acordo informado ao gestor</Label><Textarea id="troca-motivo" value={motivo} onChange={e => setMotivo(e.target.value)} disabled={registrar.isPending} placeholder="Ex.: cobertura combinada entre as pessoas, ajuste da escala, pedido do colaborador." /><p className="text-xs text-muted-foreground">Justificativa objetiva fortalece o registro em eventuais fiscalizações.</p></div>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    </div>
  </DpDialogShell>;
}