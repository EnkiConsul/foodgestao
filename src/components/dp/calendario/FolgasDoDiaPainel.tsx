import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { RefreshCw, X, AlertTriangle } from "lucide-react";
import { ConfirmarAcaoDialog } from "@/components/dp/ConfirmarAcaoDialog";
import { hojeIsoLocal } from "@/lib/dp/dataLocal";
import { emitirTermoTrocaGestor, termoTrocaGestorParagrafos, ORIGEM_TROCA_LABEL, type AssinaturaTermo, type OrigemTrocaGestor } from "@/lib/dp/termo-troca-gestor";

interface Props {
  companyId: string;
  data: string;
  /** Nomes de quem pertence à unidade do dia (filtra a lista). */
  nomes: Map<string, string>;
  /** Só as ações desta pessoa, embutidas na linha de "Fora da Operação". */
  colaboradorId?: string;
  /** A folga do dia é a fixa da jornada (sem registro): oferece "Trocar". */
  folgaFixa?: boolean;
}

interface FolgaDia {
  key: string;
  folgaId: string | null;
  solicitacaoId: string | null;
  colaboradorId: string;
  origem: string | null;
}

/** Troca da folga fixa pelo gestor: a pessoa trabalha neste dia e folga no novo, com termo. */
function TrocarFolgaFixa({ companyId, colaboradorId, data, nome, onFeito }: { companyId: string; colaboradorId: string; data: string; nome: string; onFeito: () => void }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [novaData, setNovaData] = useState("");
  const [origem, setOrigem] = useState<OrigemTrocaGestor | "">("");
  const [motivo, setMotivo] = useState("");
  const [assinatura, setAssinatura] = useState<AssinaturaTermo>("digital");
  const [revisar, setRevisar] = useState(false);
  const empresaQ = useQuery({
    queryKey: ["empresa_nome", companyId],
    enabled: aberto,
    queryFn: async () => ((await supabase.from("companies").select("name").eq("id", companyId).maybeSingle()).data as { name?: string } | null)?.name ?? "Empresa",
  });
  const m = useMutation({
    mutationFn: async () => {
      if (!novaData) throw new Error("Escolha o dia em que a pessoa vai folgar.");
      if (!origem) throw new Error("Informe se a troca foi pedida pelo colaborador ou pela empresa.");
      const texto = `${ORIGEM_TROCA_LABEL[origem]}${motivo.trim() ? `: ${motivo.trim()}` : ""}`;
      const { error } = await supabase.rpc("dp_folga_admin_trocar_fixa" as never, {
        p_colaborador: colaboradorId, p_data_fixa: data, p_data_nova: novaData, p_motivo: texto,
      } as never);
      if (error) throw error;
      const { data: emp } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
      const bytes = await emitirTermoTrocaGestor({
        companyId, colaboradorId, empresa: (emp as { name?: string } | null)?.name ?? "Empresa", nome,
        dataFixa: data, dataNova: novaData, origem, motivo: motivo.trim() || null, folgaFixa: true, assinatura,
      });
      if (assinatura === "manual") {
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        window.open(url, "_blank");
      }
    },
    onSuccess: () => {
      toast.success(assinatura === "digital" ? "Folga trocada. Termo enviado ao Portal para assinatura." : "Folga trocada. Termo pronto para imprimir.");
      setAberto(false); setRevisar(false); setNovaData(""); setOrigem(""); setMotivo("");
      qc.invalidateQueries({ queryKey: ["dp_dia_trabalho_excepcional"] });
      onFeito();
    },
    onError: (e) => toast.error("Não foi possível concluir a troca", {
      description: `${e instanceof Error ? e.message : String(e)} Confira os dados e tente de novo.`,
    }),
  });
  return (
    <>
      <Button size="icon" variant="outline" className="ml-auto h-8 w-8" title="Remarcar Folga" aria-label="Remarcar Folga" onClick={() => setAberto(true)}><RefreshCw className="h-4 w-4" /></Button>
      <Dialog open={aberto} onOpenChange={(o) => { setAberto(o); if (!o) setRevisar(false); }}>
        <DialogContent className="max-w-md">
          {data < hojeIsoLocal() && (
            <p className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Esta data já passou ({data.split("-").reverse().join("/")}). A alteração muda o histórico do colaborador.</p>
          )}
          <DialogHeader>
            <DialogTitle>{revisar ? "Conferir Termo de Alteração de Folga" : "Remarcar Folga Fixa"}</DialogTitle>
            <DialogDescription>{nome} trabalha neste dia e folga na nova data. Um termo é gerado para assinatura.</DialogDescription>
          </DialogHeader>
          {revisar && origem ? (
            <div className="max-h-[50vh] space-y-2 overflow-y-auto rounded-lg border bg-muted/30 p-3 text-sm">
              {termoTrocaGestorParagrafos({ empresa: empresaQ.data ?? "Empresa", nome, dataFixa: data, dataNova: novaData, origem, motivo: motivo.trim() || null, folgaFixa: true }).map((t, i) => (
                <p key={i}>{t}</p>
              ))}
              <p className="pt-2 text-xs text-muted-foreground">
                {assinatura === "digital" ? "Após confirmar, o termo vai ao Portal para assinatura digital." : "Após confirmar, o termo abre para impressão e fica pendente a importação da via assinada."}
              </p>
            </div>
          ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Novo dia de folga</Label>
              <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Quem pediu a troca?</Label>
              <RadioGroup value={origem} onValueChange={(v) => setOrigem(v as OrigemTrocaGestor)}>
                {(["colaborador", "empresa"] as const).map((o) => (
                  <label key={o} className="flex items-center gap-2 text-sm"><RadioGroupItem value={o} /> {ORIGEM_TROCA_LABEL[o]}</label>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo (opcional)</Label>
              <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Assinatura do termo</Label>
              <RadioGroup value={assinatura} onValueChange={(v) => setAssinatura(v as AssinaturaTermo)}>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="digital" /> Digital pelo Portal</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="manual" /> Impressa, assinatura à mão</label>
              </RadioGroup>
            </div>
          </div>
          )}
          <DialogFooter>
            {revisar ? (
              <>
                <Button variant="ghost" onClick={() => setRevisar(false)}>Voltar e Editar</Button>
                <Button disabled={m.isPending} onClick={() => m.mutate()}>{assinatura === "digital" ? "Confirmar e Enviar" : "Confirmar e Imprimir"}</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setAberto(false)}>Voltar</Button>
                <Button onClick={() => {
                  if (!novaData) return toast.error("Escolha o dia em que a pessoa vai folgar.");
                  if (!origem) return toast.error("Informe se a troca foi pedida pelo colaborador ou pela empresa.");
                  setRevisar(true);
                }}>Ver Termo</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Cancela a folga fixa do dia: a pessoa passa a trabalhar nele, sem outra folga. */
function CancelarFolgaFixa({ companyId, colaboradorId, data, nome, passado, dataBr, onFeito }: { companyId: string; colaboradorId: string; data: string; nome: string; passado: boolean; dataBr: string; onFeito: () => void }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ciente, setCiente] = useState(false);
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("dp_dia_trabalho_excepcional").insert({
        company_id: companyId, colaborador_id: colaboradorId, data, origem: "cancelamento_gestor", criado_por: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Folga fixa de ${nome} cancelada. Ela passa a trabalhar em ${dataBr}.`);
      setAberto(false); setMotivo(""); setCiente(false);
      qc.invalidateQueries({ queryKey: ["dp_dia_trabalho_excepcional"] });
      qc.invalidateQueries({ queryKey: ["dp_dia_trabalho_excepcional_panorama"] });
      onFeito();
    },
    onError: (e) => toast.error("Não foi possível cancelar a folga fixa", {
      description: `${e instanceof Error ? e.message : String(e)} Se o dia já tem registro de troca, use Remarcar Folga.`,
    }),
  });
  return (
    <>
      <Button size="icon" variant="outline" className="h-8 w-8 border-destructive/40 text-destructive hover:bg-destructive/10" title="Cancelar Folga" aria-label="Cancelar Folga" onClick={() => setAberto(true)}><X className="h-4 w-4" /></Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" />Cancelar a Folga Fixa de {nome}?</DialogTitle>
            <DialogDescription>
              Esta é a folga fixa da jornada. Ao cancelar, {nome} trabalha em {dataBr} e fica sem o descanso da semana. Isso pode gerar pagamento em dobro e risco trabalhista. O recomendado é remarcar para outro dia.
            </DialogDescription>
          </DialogHeader>
          {passado && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">Esta data já passou ({dataBr}). O cancelamento altera o histórico do colaborador.</p>
          )}
          <div className="grid gap-1.5">
            <Label>Justificativa <span className="text-destructive">*</span></Label>
            <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por que a folga fixa será cancelada sem outro dia?" />
            <p className="text-[11px] text-muted-foreground">Mínimo de 5 caracteres.</p>
          </div>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={ciente} onChange={(e) => setCiente(e.target.checked)} />
            Estou ciente de que {nome} ficará sem folga nesta semana.
          </label>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className="w-full" onClick={() => setAberto(false)}><RefreshCw className="mr-2 h-4 w-4" />Prefiro Remarcar para Outro Dia (Recomendado)</Button>
            <Button variant="destructive" className="w-full" disabled={motivo.trim().length < 5 || !ciente || m.isPending} onClick={() => m.mutate()}>Confirmar Cancelamento da Folga</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Folgas marcadas no dia, com cancelar e remarcar pelas mesmas rotinas do
 * Calendário de Folgas (dp_folga_admin_cancelar / dp_folga_admin_remarcar).
 * A folga fixa da jornada é trocada por dp_folga_admin_trocar_fixa.
 */
export function FolgasDoDiaPainel({ companyId, data, nomes, colaboradorId, folgaFixa }: Props) {
  const qc = useQueryClient();
  const [acao, setAcao] = useState<{ item: FolgaDia; tipo: "cancelar" | "remarcar" } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [novaData, setNovaData] = useState("");

  const q = useQuery({
    queryKey: ["dp_folgas_do_dia", companyId, data],
    queryFn: async (): Promise<FolgaDia[]> => {
      const [f, s] = await Promise.all([
        supabase
          .from("dp_folgas")
          .select("id, colaborador_id, origem, tipo")
          .eq("company_id", companyId)
          .eq("data", data)
          .neq("status", "cancelada"),
        supabase
          .from("dp_solicitacoes")
          .select("id, colaborador_id")
          .eq("company_id", companyId)
          .eq("tipo", "folga")
          .eq("status", "aprovada")
          .eq("data_alvo", data)
          .is("removido_em", null),
      ]);
      if (f.error) throw f.error;
      if (s.error) throw s.error;
      const lista: FolgaDia[] = (f.data ?? [])
        .filter((x) => x.tipo !== "ferias" && x.tipo !== "licenca")
        .map((x) => ({
          key: `f:${x.id}`,
          folgaId: x.id,
          solicitacaoId: null,
          colaboradorId: x.colaborador_id,
          origem: (x as { origem?: string | null }).origem ?? null,
        }));
      const tem = new Set(lista.map((l) => l.colaboradorId));
      for (const x of s.data ?? []) {
        if (tem.has(x.colaborador_id)) continue;
        lista.push({ key: `s:${x.id}`, folgaId: null, solicitacaoId: x.id, colaboradorId: x.colaborador_id, origem: "solicitacao" });
      }
      return lista;
    },
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["dp_folgas_do_dia"] });
    qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
    qc.invalidateQueries({ queryKey: ["dp_folgas"] });
    qc.invalidateQueries({ queryKey: ["dp_folgas_efetivadas"] });
  };

  const executar = useMutation({
    mutationFn: async () => {
      if (!acao) return;
      const { item, tipo } = acao;
      if (tipo === "cancelar") {
        const { error } = await supabase.rpc("dp_folga_admin_cancelar", {
          p_folga_id: item.folgaId,
          p_solicitacao_id: item.solicitacaoId,
          p_colaborador: item.colaboradorId,
          p_data: data,
          p_motivo: motivo.trim() || null,
        });
        if (error) throw error;
      } else {
        if (!novaData) throw new Error("Escolha a nova data.");
        const { error } = await supabase.rpc("dp_folga_admin_remarcar", {
          p_folga_id: item.folgaId,
          p_solicitacao_id: item.solicitacaoId,
          p_colaborador: item.colaboradorId,
          p_data_atual: data,
          p_data_nova: novaData,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(acao?.tipo === "cancelar" ? "Folga cancelada." : "Folga remarcada.");
      setAcao(null);
      setMotivo("");
      setNovaData("");
      invalidar();
    },
    onError: (e) =>
      toast.error("Não foi possível concluir", {
        description: `${e instanceof Error ? e.message : String(e)} Confira a data e tente de novo.`,
      }),
  });

  const passado = data < hojeIsoLocal();
  const dataBr = data.split("-").reverse().join("/");
  const itens = (q.data ?? []).filter((i) => nomes.has(i.colaboradorId));
  if (q.isLoading) return null;

  if (colaboradorId) {
    const i = itens.find((x) => x.colaboradorId === colaboradorId);
    if (!i && folgaFixa) {
      const nome = (nomes.get(colaboradorId) ?? "").split(" ")[0] || "Colaborador";
      return (
        <div className="ml-auto flex items-center gap-1">
          <TrocarFolgaFixa companyId={companyId} colaboradorId={colaboradorId} data={data} nome={nome} onFeito={invalidar} />
          <CancelarFolgaFixa companyId={companyId} colaboradorId={colaboradorId} data={data} nome={nome} passado={passado} dataBr={dataBr} onFeito={invalidar} />
        </div>
      );
    }
    if (!i) return null;
    return (
      <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
        {acao?.item.key === i.key && acao.tipo === "remarcar" ? (
          <>
            <Input type="date" className="h-8 w-40" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
            {passado ? (
              <ConfirmarAcaoDialog destrutivo={false} titulo="Data já passou" descricao={`A folga de ${dataBr} já passou. Remarcar vai alterar o histórico do colaborador. Deseja continuar?`} confirmar="Sim, Remarcar" onConfirm={() => executar.mutate()} disabled={executar.isPending || !novaData}>
                <Button size="sm" className="h-8" disabled={executar.isPending || !novaData}>Confirmar</Button>
              </ConfirmarAcaoDialog>
            ) : (
              <Button size="sm" className="h-8" disabled={executar.isPending || !novaData} onClick={() => executar.mutate()}>Confirmar</Button>
            )}
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setAcao(null)}>Voltar</Button>
          </>
        ) : (
          <>
            <Button size="icon" variant="outline" className="h-8 w-8" title="Remarcar Folga" aria-label="Remarcar Folga" onClick={() => { setAcao({ item: i, tipo: "remarcar" }); setNovaData(""); }}><RefreshCw className="h-4 w-4" /></Button>
            <Button size="icon" variant="outline" className="h-8 w-8 border-destructive/40 text-destructive hover:bg-destructive/10" title="Cancelar Folga" aria-label="Cancelar Folga" onClick={() => { setAcao({ item: i, tipo: "cancelar" }); setMotivo(""); }}><X className="h-4 w-4" /></Button>
          </>
        )}
        <Dialog open={acao?.item.key === i.key && acao.tipo === "cancelar"} onOpenChange={(o) => { if (!o) setAcao(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" />Cancelar Folga?</DialogTitle>
              <DialogDescription>
                O colaborador precisa do descanso. Cancelar sem dar outro dia pode deixá-lo sem folga na semana e gerar pagamento em dobro. O recomendado é remarcar a folga para outro dia.
              </DialogDescription>
            </DialogHeader>
            {passado && (
              <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200">Esta data já passou ({dataBr}). O cancelamento altera o histórico do colaborador.</p>
            )}
            <div className="grid gap-1.5">
              <Label>Justificativa <span className="text-destructive">*</span></Label>
              <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por que a folga será cancelada sem outro dia?" />
              <p className="text-[11px] text-muted-foreground">Mínimo de 5 caracteres. Fica registrada no histórico.</p>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button className="w-full" onClick={() => { setAcao({ item: i, tipo: "remarcar" }); setNovaData(""); }}><RefreshCw className="mr-2 h-4 w-4" />Prefiro Remarcar para Outro Dia (Recomendado)</Button>
              <Button variant="destructive" className="w-full" disabled={motivo.trim().length < 5 || executar.isPending} onClick={() => executar.mutate()}>Confirmar Cancelamento da Folga</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Folgas marcadas neste dia</p>
      {!itens.length && (
        <p className="text-xs text-muted-foreground">
          Nenhuma folga marcada (a folga fixa da jornada muda só por troca).
        </p>
      )}
      <ul className="divide-y rounded-md border">
        {itens.map((i) => (
          <li key={i.key} className="space-y-2 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                {nomes.get(i.colaboradorId)}
                {i.origem === "troca" && <Badge variant="outline" className="ml-2 text-[10px]">Troca</Badge>}
              </span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => { setAcao({ item: i, tipo: "remarcar" }); setNovaData(""); }}>
                  Remarcar
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setAcao({ item: i, tipo: "cancelar" }); setMotivo(""); }}>
                  Cancelar
                </Button>
              </div>
            </div>
            {acao?.item.key === i.key && (
              <div className="flex flex-wrap items-center gap-2">
                {acao.tipo === "remarcar" ? (
                  <Input type="date" className="h-8 w-44" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
                ) : (
                  <Input className="h-8 w-64" placeholder="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                )}
                <Button size="sm" disabled={executar.isPending} onClick={() => executar.mutate()}>
                  Confirmar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAcao(null)}>Voltar</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
