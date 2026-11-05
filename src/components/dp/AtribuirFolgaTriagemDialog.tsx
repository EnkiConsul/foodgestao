/**
 * Triagem da atribuição manual de folga pelo gestor.
 *
 * Marcar um dia de folga para alguém pode significar três coisas diferentes, e
 * cada uma tem efeito distinto na escala. O diálogo obriga a escolha para que o
 * gestor não precise cancelar a folga anterior na mão depois.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { podeReceberFolga, podeReceberCompensatoria } from "@/lib/dp/folga-elegibilidade";
import { invalidarRotina } from "@/lib/dp/rotina-cache";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { mensagemErroFolga } from "@/lib/dp/folga-erro";

type Modo = "substituir_fds" | "troca_semanal" | "extra" | "compensatoria";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  colaboradorId: string;
  colaboradorNome: string;
  /** Dia que receberá a folga (ISO). */
  dataIso: string;
  onDone?: () => void;
}

const descreverDia = (iso: string) =>
  format(parseISO(iso), "EEEE, dd/MM/yyyy", { locale: ptBR });

export function AtribuirFolgaTriagemDialog({
  open,
  onOpenChange,
  companyId,
  colaboradorId,
  colaboradorNome,
  dataIso,
  onDone,
}: Props) {
  const qc = useQueryClient();
  const mobile = useIsMobile();
  const Root = mobile ? Sheet : Dialog;
  const Content = mobile ? SheetContent : DialogContent;
  const Header = mobile ? SheetHeader : DialogHeader;
  const Title = mobile ? SheetTitle : DialogTitle;
  const Description = mobile ? SheetDescription : DialogDescription;
  const Footer = mobile ? SheetFooter : DialogFooter;
  const [modo, setModo] = useState<Modo>("extra");
  const [folgaSubstituir, setFolgaSubstituir] = useState("");
  const [dataTrabalho, setDataTrabalho] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [viewport, setViewport] = useState<{ height: number; bottom: number } | null>(null);

  useEffect(() => {
    if (!open || !mobile) return;
    const vv = window.visualViewport;
    const atualizar = () => setViewport({
      height: vv?.height ?? window.innerHeight,
      bottom: Math.max(0, window.innerHeight - ((vv?.height ?? window.innerHeight) + (vv?.offsetTop ?? 0))),
    });
    atualizar();
    vv?.addEventListener("resize", atualizar);
    vv?.addEventListener("scroll", atualizar);
    window.addEventListener("resize", atualizar);
    return () => {
      vv?.removeEventListener("resize", atualizar);
      vv?.removeEventListener("scroll", atualizar);
      window.removeEventListener("resize", atualizar);
    };
  }, [open, mobile]);

  const mesInicio = dataIso ? `${dataIso.slice(0, 7)}-01` : "";
  const mesFim = useMemo(() => {
    if (!dataIso) return "";
    const d = parseISO(`${dataIso.slice(0, 7)}-01`);
    return format(new Date(d.getFullYear(), d.getMonth() + 1, 0), "yyyy-MM-dd");
  }, [dataIso]);

  /** Folgas ativas do colaborador no mês: candidatas a serem substituídas. */
  const folgasQuery = useQuery({
    queryKey: ["dp_triagem_folgas", colaboradorId, mesInicio],
    enabled: open && !!colaboradorId && !!mesInicio,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folgas")
        .select("id, data, tipo, extra, status")
        .eq("colaborador_id", colaboradorId)
        .gte("data", mesInicio)
        .lte("data", mesFim)
        .neq("status", "cancelada")
        .order("data");
      if (error) throw error;
      return (data ?? []).filter((f: any) => f.data !== dataIso);
    },
  });

  /** Dias fixos de folga do colaborador, para oferecer a troca da folga semanal. */
  const fixosQuery = useQuery({
    queryKey: ["dp_triagem_fixos", companyId, colaboradorId, dataIso],
    enabled: open && !!colaboradorId,
    queryFn: async (): Promise<number[]> => {
      const { data: cfg, error: cfgError } = await supabase
        .from("dp_colaborador_config_trabalho")
        .select("id")
        .eq("colaborador_id", colaboradorId)
        .eq("company_id", companyId)
        .lte("vigencia_inicio", dataIso)
        .or(`vigencia_fim.is.null,vigencia_fim.gte.${dataIso}`)
        .order("vigencia_inicio", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cfgError) throw cfgError;
      if (!cfg?.id) return [];
      const { data: dias, error: diasError } = await supabase
        .from("dp_colaborador_config_dias")
        .select("dow, trabalha")
        .eq("config_id", cfg.id);
      if (diasError) throw diasError;
      return (dias ?? [])
        .filter((d: any) => d.trabalha === false)
        .map((d: any) => Number(d.dow));
    },
  });

  /** Datas da semana do dia escolhido em que o colaborador folga por regra fixa. */
  const diasSemanaFixos = useMemo(() => {
    const fixos = fixosQuery.data ?? [];
    if (!dataIso || !fixos.length) return [] as string[];
    const inicio = startOfWeek(parseISO(dataIso), { weekStartsOn: 1 });
    const out: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(inicio, i);
      const iso = format(d, "yyyy-MM-dd");
      if (iso === dataIso) continue;
      if (fixos.includes(d.getDay())) out.push(iso);
    }
    return out;
  }, [fixosQuery.data, dataIso]);

  /** Este vínculo não participa da atribuição de folgas. Registre ausência ou indisponibilidade no calendário. */
  const regimeQuery = useQuery({
    queryKey: ["dp_triagem_regime", colaboradorId],
    enabled: open && !!colaboradorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("regime, unidade_id, forma_pagamento, vinculo_label")
        .eq("company_id", companyId)
        .eq("id", colaboradorId)
        .maybeSingle();
      if (error) throw error;
      const row = data;
      if (!row) throw new Error("Colaborador não encontrado.");
      let compensa = false;
      if (row?.unidade_id) {
        const { data: u, error: ue } = await supabase.from("dp_unidades").select("compensa_feriados").eq("company_id", companyId).eq("id", row.unidade_id).maybeSingle();
        if (ue) throw ue;
        compensa = !!u?.compensa_feriados;
      }
      const { data: ex, error: ee } = await supabase.from("dp_colaborador_compensacao").select("usa_compensa_feriados").eq("company_id", companyId).eq("colaborador_id", colaboradorId).maybeSingle();
      if (ee) throw ee;
      return { pessoa: row, compensa, individual: ex?.usa_compensa_feriados };
    },
  });
  const elegivel = !!regimeQuery.data && podeReceberFolga(regimeQuery.data.pessoa);
  const intermitente = !elegivel;
  /** Compensatória só para CLT (não intermitente) em unidade que compensa feriados. */
  const podeCompensatoria = !!regimeQuery.data && podeReceberCompensatoria(regimeQuery.data.pessoa, regimeQuery.data.compensa, regimeQuery.data.individual);
  const temCompensacao = podeCompensatoria;

  const [limiteMsg, setLimiteMsg] = useState<string | null>(null);
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    if (!open) return;
    setModo("extra");
    setFolgaSubstituir("");
    setDataTrabalho("");
    setMotivo("");
    setLimiteMsg(null);
    setJustificativa("");
    setErroSalvar(null);
  }, [open, dataIso, colaboradorId]);

  const atribuir = useMutation({
    mutationFn: async (autorizar: boolean = false) => {
      setErroSalvar(null);
      if (!elegivel) throw new Error("Este vínculo não participa da atribuição de folgas. Use ausência ou indisponibilidade.");
      if (modo === "compensatoria" && !podeCompensatoria) throw new Error("Compensação não habilitada para este colaborador.");
      if (modo === "compensatoria" && !motivo.trim()) throw new Error("Informe a justificativa da folga compensatória.");
      if (modo === "substituir_fds" && !folgaSubstituir)
        throw new Error("Escolha a folga que será substituída.");
      if (modo === "troca_semanal" && !dataTrabalho)
        throw new Error("Escolha o dia em que o colaborador vai trabalhar.");
      if (autorizar && justificativa.trim().length < 15)
        throw new Error("Descreva o motivo da exceção (mínimo 15 caracteres).");
      const { data, error } = await supabase.rpc("dp_folga_atribuir_admin_v2" as any, {
        p_colaborador: colaboradorId,
        p_data: dataIso,
        p_modo: modo,
        p_folga_substituir_id: modo === "substituir_fds" ? folgaSubstituir : null,
        p_data_trabalho: modo === "troca_semanal" ? dataTrabalho : null,
        p_motivo:
          motivo.trim() || null,
        p_autorizar_excedente: autorizar,
        p_justificativa_excedente: autorizar ? justificativa.trim() : null,
      });
      if (error) {
        throw new Error(mensagemErroFolga(error));
      }
      const res = (data ?? {}) as { ok?: boolean; mensagem?: string; limite_atingido?: boolean; ja_existia?: boolean };
      if (res.ja_existia) throw new Error("Este colaborador já tem folga registrada neste dia. Nenhuma folga foi alterada.");
      if (res.ok === false && res.limite_atingido) {
        setLimiteMsg(res.mensagem ?? "Este dia já atingiu o limite de pessoas em folga.");
        throw new Error("LIMITE_SILENCIOSO");
      }
      if (res.ok !== true)
        throw new Error(res.mensagem ?? "Não foi possível atribuir a folga neste dia.");
    },
    onSuccess: () => {
      toast.success("Folga atribuída", {
        description:
          modo === "substituir_fds"
            ? "A folga anterior foi cancelada automaticamente."
            : modo === "troca_semanal"
              ? "O dia de folga semanal foi registrado como trabalho por troca."
              : modo === "compensatoria" ? "Folga compensatória registrada com justificativa em Ocorrências." : "Folga extra registrada sem alterar as folgas do mês.",
      });
      qc.invalidateQueries({ queryKey: ["dp_folgas"] });
      qc.invalidateQueries({ queryKey: ["dp_folgas_efetivadas"] });
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
      qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
      qc.invalidateQueries({ queryKey: ["dp_ausencias_do_dia"] });
      qc.invalidateQueries({ queryKey: ["dp_ocorrencias"] });
      qc.invalidateQueries({ queryKey: ["minhas_ocorrencias_mes"] });
      void invalidarRotina(qc);
      onOpenChange(false);
      onDone?.();
    },
    onError: (e: unknown) => {
      if (e instanceof Error && e.message === "LIMITE_SILENCIOSO") return;
      const descricao = mensagemErroFolga(e);
      setErroSalvar(descricao);
      toast.error("Não foi possível atribuir a folga", { description: descricao });
    },
  });

  /** Fechar com preenchimento em andamento pede confirmação para não perder dados. */
  const handleOpenChange = (v: boolean) => {
    if (!v && atribuir.isPending) return;
    if (!v && !atribuir.isPending) {
      const sujo = modo !== "extra" || !!folgaSubstituir || !!dataTrabalho || !!motivo.trim() || !!justificativa.trim();
      if (sujo && !window.confirm("Descartar o preenchimento desta folga?")) return;
    }
    onOpenChange(v);
  };

  return (
    <Root open={open} onOpenChange={handleOpenChange}>
      <Content
        {...(mobile ? { side: "bottom" as const } : {})}
        style={mobile && viewport ? { maxHeight: viewport.height - 16, bottom: viewport.bottom } : undefined}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="flex max-h-[calc(var(--vvh,100dvh)-1rem)] flex-col overflow-hidden sm:max-w-md [&_input]:min-h-12 [&_button]:whitespace-normal"
      >
        <Header className="shrink-0 pr-6 text-left">
          <Title className="text-2xl font-black">Atribuir folga</Title>
          <Description>
            {colaboradorNome} vai folgar em <b>{dataIso && descreverDia(dataIso)}</b>. Diga o que esta
            folga significa na escala.
          </Description>
        </Header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-2">
          {regimeQuery.isError && <p role="alert" className="text-sm text-destructive">Não foi possível conferir a elegibilidade. <Button variant="ghost" onClick={() => void regimeQuery.refetch()}>Tentar novamente</Button></p>}
          <div>
            <Label>Tipo de folga</Label>
            <Select value={modo} onValueChange={(v) => setModo(v as Modo)}>
              <SelectTrigger className="min-h-12" disabled={!elegivel || regimeQuery.isError}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!intermitente && (
                  <SelectItem
                    value="substituir_fds"
                    disabled={folgasQuery.isError || (folgasQuery.data ?? []).length === 0}
                  >
                    Troca de uma folga já marcada
                  </SelectItem>
                )}
                {!intermitente && (
                  <SelectItem value="troca_semanal" disabled={fixosQuery.isError || diasSemanaFixos.length === 0}>
                    Troca da folga semanal da semana
                  </SelectItem>
                )}
                {podeCompensatoria && <SelectItem value="compensatoria">Folga compensatória</SelectItem>}
                <SelectItem value="extra">Folga extra</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {modo === "substituir_fds"
                ? "A folga escolhida abaixo é cancelada e esta entra no lugar dela."
                : modo === "troca_semanal"
                  ? "O colaborador trabalha no dia da folga semanal e folga neste dia no lugar dele."
                  : modo === "compensatoria"
                    ? "Descanso autorizado conforme a regra de compensação da unidade. Não apura ponto ou saldo de horas."
                    : "Folga adicional: a folga semanal e as folgas já marcadas continuam como estão."}
            </p>
            {modo === "extra" && temCompensacao && (
              <p className="mt-2 rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs">
                Este colaborador pode ter folga compensatória (a unidade compensa feriados trabalhados). Confirme se não é o caso antes de lançar como folga extra.
              </p>
            )}
          </div>

          {modo === "substituir_fds" && (
            <div>
              <Label>Folga atual</Label>
              <Select value={folgaSubstituir} onValueChange={setFolgaSubstituir}>
                <SelectTrigger className="min-h-12">
                  <SelectValue placeholder="Escolha a folga" />
                </SelectTrigger>
                <SelectContent>
                  {(folgasQuery.data ?? []).map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>
                      {descreverDia(f.data)}
                      {f.extra ? " — extra" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {modo === "troca_semanal" && (
            <div>
              <Label>Folga atual · dia que passará a trabalhar</Label>
              <Select value={dataTrabalho} onValueChange={setDataTrabalho}>
                <SelectTrigger className="min-h-12">
                  <SelectValue placeholder="Escolha o dia" />
                </SelectTrigger>
                <SelectContent>
                  {diasSemanaFixos.map((iso) => (
                    <SelectItem key={iso} value={iso}>
                      {descreverDia(iso)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="flex items-center gap-2">
              Motivo
              <span className="text-xs font-normal text-muted-foreground">{modo === "compensatoria" ? "(obrigatório)" : "(opcional)"}</span>
            </Label>
            <Textarea
              rows={3}
              className="rounded-xl"
              placeholder="Registre o combinado com o colaborador"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>

          {intermitente && !regimeQuery.isLoading && (
            <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              Este vínculo não participa da atribuição de folgas. Registre ausência ou indisponibilidade no calendário.
            </p>
          )}

          {limiteMsg && (
            <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm font-semibold text-destructive">{limiteMsg}</p>
              <p className="text-xs text-muted-foreground">
                Só Dono ou Administrador pode autorizar acima do limite. A justificativa fica registrada na
                auditoria.
              </p>
              <Textarea
                rows={2}
                className="rounded-xl"
                placeholder="Justificativa da exceção (mínimo 15 caracteres)"
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
              />
              <Button
                variant="destructive"
                className="min-h-12 w-full"
                disabled={atribuir.isPending || justificativa.trim().length < 15}
                onClick={() => atribuir.mutate(true)}
              >
                Autorizar acima do limite
              </Button>
            </div>
          )}
        </div>

        {erroSalvar && <p role="alert" className="shrink-0 text-sm text-destructive">{erroSalvar}</p>}
        <Footer className="shrink-0 flex-col-reverse gap-2 border-t bg-background pt-3 sm:flex-row">
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={atribuir.isPending}
            className="min-h-12 w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <Button
            onClick={() => atribuir.mutate(false)}
            disabled={atribuir.isPending || regimeQuery.isLoading || regimeQuery.isError || !elegivel || (modo === "compensatoria" && (!podeCompensatoria || !motivo.trim()))}
            className="min-h-12 w-full sm:w-auto"
          >
            {atribuir.isPending ? "Atribuindo..." : "Confirmar folga"}
          </Button>
        </Footer>
      </Content>
    </Root>
  );
}
