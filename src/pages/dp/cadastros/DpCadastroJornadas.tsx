import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { Clock, Plus, Pencil, Trash2, ArrowLeft, ArrowRight, Check, Copy } from "lucide-react";
import { DpPage, DpPageHeader, DpContentCard, DpEmptyState } from "@/components/dp/DpPage";
import { CoberturaMinimaCard } from "@/components/dp/CoberturaMinimaCard";
import { ValidacaoMenorCard } from "@/components/dp/ValidacaoMenorCard";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { JornadaTemplates, type JornadaTemplate } from "@/components/dp/JornadaTemplates";
import { HorariosSemanaEditor } from "@/components/dp/HorariosSemanaEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDpJornadas, JORNADA_FORM_DEFAULT, type DpJornada, type DpJornadaForm } from "@/hooks/useDpJornadas";
import { TIPO_ESCALA_LABEL, TURNO_LABEL } from "@/lib/dp/dsr-rules";
import {
  calcularCargaSemanal, formatarHoras, formatarIntervalo, resumoJornada, validarSemana,
} from "@/lib/dp/jornada-utils";

const ESCALAS = ["6x1", "5x2", "5x1", "4x2", "12x36", "intermitente", "personalizada"] as const;
const TURNOS = ["matutino", "vespertino", "noturno", "misto"] as const;
const PASSOS = ["Modelo", "Semana", "Detalhes", "Revisão"] as const;

export default function DpCadastroJornadas() {
  const { jornadas, isLoading, isError, refetch, create, update, remove, saving } = useDpJornadas();
  const [open, setOpen] = useState(false);
  const [passo, setPasso] = useState(0);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [editing, setEditing] = useState<DpJornada | null>(null);
  const [form, setForm] = useState<DpJornadaForm>(JORNADA_FORM_DEFAULT);
  const [confirmDelete, setConfirmDelete] = useState<DpJornada | null>(null);

  const set = <K extends keyof DpJornadaForm>(k: K, v: DpJornadaForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const abrirNova = () => {
    setEditing(null);
    setTemplateId(null);
    setForm(JORNADA_FORM_DEFAULT);
    setPasso(0);
    setOpen(true);
  };

  const abrirEdicao = (j: DpJornada) => {
    setEditing(j);
    setTemplateId(null);
    setForm({
      nome: j.nome,
      descricao: j.descricao ?? null,
      tipo_escala: j.tipo_escala,
      turno: j.turno,
      ativo: j.ativo,
      observacoes: j.observacoes,
      horarios: j.horarios,
    });
    setPasso(1);
    setOpen(true);
  };

  const duplicarJornada = (j: DpJornada) => {
    setEditing(null);
    setTemplateId(null);
    setForm({
      nome: `${j.nome} (cópia)`,
      descricao: j.descricao ?? null,
      tipo_escala: j.tipo_escala,
      turno: j.turno,
      ativo: true,
      observacoes: j.observacoes,
      horarios: j.horarios,
    });
    setPasso(1);
    setOpen(true);
  };

  const escolherTemplate = (t: JornadaTemplate) => {
    setTemplateId(t.id);
    setForm({ ...t.form });
    setPasso(1);
  };

  const erros = useMemo(() => validarSemana(form.horarios), [form.horarios]);
  const semanal = useMemo(() => calcularCargaSemanal(form.horarios), [form.horarios]);

  const podeAvancar = () => {
    if (passo === 1) return form.horarios.length > 0 && erros.length === 0;
    if (passo === 2) return form.nome.trim().length > 0;
    return true;
  };

  const avancar = () => {
    if (passo === 1 && form.horarios.length === 0) {
      toast.error("Marque ao menos um dia de trabalho");
      return;
    }
    if (passo === 1 && erros.length) {
      toast.error(erros[0].erro);
      return;
    }
    if (passo === 2 && !form.nome.trim()) {
      toast.error("Informe o nome da jornada");
      return;
    }
    setPasso((p) => Math.min(p + 1, PASSOS.length - 1));
  };

  const salvar = async () => {
    if (!form.nome.trim()) { toast.error("Informe o nome da jornada"); return; }
    if (!form.horarios.length) { toast.error("Selecione ao menos um dia de trabalho"); return; }
    if (erros.length) { toast.error(erros[0].erro); return; }
    try {
      if (editing) await update({ id: editing.id, form });
      else await create(form);
      toast.success(editing ? "Jornada atualizada" : "Jornada criada");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a jornada");
    }
  };

  const excluir = async () => {
    if (!confirmDelete) return;
    try {
      await remove(confirmDelete.id);
      toast.success("Jornada removida");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Jornada em uso por colaboradores");
    } finally {
      setConfirmDelete(null);
    }
  };

  const ativas = useMemo(() => jornadas.filter((j) => j.ativo).length, [jornadas]);

  return (
    <DpPage>
      <Helmet>
        <title>Jornadas e Escalas | DP 360°FOOD</title>
        <meta name="description" content="Cadastre jornadas com horários diferentes por dia da semana, intervalos e folgas para o Departamento Pessoal." />
      </Helmet>

      <DpPageHeader
        title="Jornadas e Escalas"
        description={`Modelos de jornada aplicados aos colaboradores. ${ativas} ativa(s).`}
        icon={Clock}
        actions={
          <Button onClick={abrirNova} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Nova Jornada
          </Button>
        }
      />

      <ValidacaoMenorCard />

      {isError ? (
        <DpErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : jornadas.length === 0 ? (
        <DpContentCard contentClassName="p-4 md:p-6">
          <DpEmptyState icon={Clock} dashed>
            Nenhuma jornada cadastrada. Comece por um modelo pronto (6x1, 5x2, 12x36) e ajuste os horários de cada dia.
          </DpEmptyState>
        </DpContentCard>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {jornadas.map((j) => {
            const faixas = resumoJornada(j.horarios).filter((f) => f.detalhe !== "Folga");
            return (
              <DpContentCard key={j.id} contentClassName="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">{j.nome}</h2>
                    <p className="text-xs text-muted-foreground">
                      {TIPO_ESCALA_LABEL[j.tipo_escala] ?? j.tipo_escala} · {TURNO_LABEL[j.turno] ?? j.turno}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant={j.ativo ? "default" : "secondary"}>{j.ativo ? "Ativa" : "Inativa"}</Badge>
                    <Button variant="ghost" size="icon" aria-label={`Duplicar ${j.nome}`} onClick={() => duplicarJornada(j)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Editar ${j.nome}`} onClick={() => abrirEdicao(j)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Excluir ${j.nome}`} onClick={() => setConfirmDelete(j)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <ul className="space-y-1 text-sm">
                  {faixas.length === 0 ? (
                    <li className="text-muted-foreground">Sem horários cadastrados</li>
                  ) : (
                    faixas.map((f) => (
                      <li key={f.rotulo} className="flex items-center justify-between gap-3">
                        <span className="font-medium">{f.rotulo}</span>
                        <span className="tabular-nums text-muted-foreground">{f.detalhe}</span>
                      </li>
                    ))
                  )}
                </ul>

                <p className="text-xs text-muted-foreground">
                  {formatarHoras(j.carga_horaria_semanal ?? 0)} por semana · {j.horarios.length} dia(s) de trabalho
                </p>
              </DpContentCard>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col gap-4 overflow-hidden p-0">
          <DialogHeader className="space-y-3 border-b p-4 text-left">
            <div>
              <DialogTitle>{editing ? "Editar Jornada" : "Nova Jornada"}</DialogTitle>
              <DialogDescription>
                Etapa {passo + 1} de {PASSOS.length} — {PASSOS[passo]}
              </DialogDescription>
            </div>
            <Progress value={((passo + 1) / PASSOS.length) * 100} aria-label="Progresso do cadastro" />
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-2">
            {passo === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Escolha um modelo para começar. Você poderá ajustar cada dia na próxima etapa.
                </p>
                <JornadaTemplates selecionado={templateId} onSelect={escolherTemplate} />
              </div>
            )}

            {passo === 1 && (
              <HorariosSemanaEditor horarios={form.horarios} onChange={(h) => set("horarios", h)} />
            )}

            {passo === 2 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="j-nome">Nome da jornada</Label>
                  <Input
                    id="j-nome"
                    className="h-12 text-base"
                    value={form.nome}
                    onChange={(e) => set("nome", e.target.value)}
                    placeholder="Ex.: 6x1 Matutino — Loja Garavelo"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="j-desc">Descrição</Label>
                  <Input
                    id="j-desc"
                    className="h-12 text-base"
                    value={form.descricao ?? ""}
                    onChange={(e) => set("descricao", e.target.value || null)}
                    placeholder="Onde essa jornada é usada"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="j-escala">Tipo de escala</Label>
                  <Select value={form.tipo_escala} onValueChange={(v) => set("tipo_escala", v as DpJornadaForm["tipo_escala"])}>
                    <SelectTrigger id="j-escala" className="h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ESCALAS.map((e) => <SelectItem key={e} value={e}>{TIPO_ESCALA_LABEL[e] ?? e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="j-turno">Turno</Label>
                  <Select value={form.turno} onValueChange={(v) => set("turno", v as DpJornadaForm["turno"])}>
                    <SelectTrigger id="j-turno" className="h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TURNOS.map((t) => <SelectItem key={t} value={t}>{TURNO_LABEL[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
                  <Label htmlFor="j-ativo" className="text-sm font-normal">Jornada ativa</Label>
                  <Switch id="j-ativo" checked={form.ativo} onCheckedChange={(v) => set("ativo", v)} />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="j-obs">Observações</Label>
                  <Textarea id="j-obs" rows={3} value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value || null)} />
                </div>
              </div>
            )}

            {passo === 3 && (
              <div className="space-y-4">
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <p className="text-lg font-semibold">{form.nome || "Sem nome"}</p>
                  <p className="text-sm text-muted-foreground">
                    {TIPO_ESCALA_LABEL[form.tipo_escala] ?? form.tipo_escala} · {TURNO_LABEL[form.turno] ?? form.turno} ·{" "}
                    {formatarHoras(semanal)} por semana
                  </p>
                </div>
                <ul className="divide-y rounded-xl border">
                  {resumoJornada(form.horarios).map((f) => (
                    <li key={f.rotulo} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <span className="font-medium">{f.rotulo}</span>
                      <span className="tabular-nums text-muted-foreground">{f.detalhe}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Intervalos: {[...new Set(form.horarios.map((h) => h.intervalo_minutos))]
                    .sort((a, b) => a - b)
                    .map(formatarIntervalo)
                    .join(" · ") || "—"}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-row justify-between gap-2 border-t p-4 sm:justify-between">
            <Button
              variant="outline"
              className="h-12 flex-1 gap-2 sm:flex-none"
              onClick={() => (passo === 0 ? setOpen(false) : setPasso((p) => p - 1))}
            >
              <ArrowLeft className="h-4 w-4" /> {passo === 0 ? "Cancelar" : "Voltar"}
            </Button>
            {passo < PASSOS.length - 1 ? (
              <Button className="h-12 flex-1 gap-2 sm:flex-none" onClick={avancar} disabled={!podeAvancar()}>
                Continuar <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button className="h-12 flex-1 gap-2 sm:flex-none" onClick={() => void salvar()} disabled={saving}>
                <Check className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar Jornada"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Jornada</AlertDialogTitle>
            <AlertDialogDescription>
              A jornada “{confirmDelete?.nome}” será removida. Colaboradores vinculados impedem a exclusão —
              nesse caso, desative-a.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void excluir(); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CoberturaMinimaCard />
    </DpPage>
  );
}
