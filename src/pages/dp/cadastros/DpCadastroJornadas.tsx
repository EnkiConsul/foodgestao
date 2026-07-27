import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { Clock, Plus, Pencil, Trash2 } from "lucide-react";
import { DpPage, DpPageHeader, DpContentCard, DpEmptyState } from "@/components/dp/DpPage";
import { CoberturaMinimaCard } from "@/components/dp/CoberturaMinimaCard";
import { ValidacaoMenorCard } from "@/components/dp/ValidacaoMenorCard";

import { DpErrorState } from "@/components/dp/DpErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDpJornadas, JORNADA_DEFAULT, type DpJornada, type DpJornadaInput } from "@/hooks/useDpJornadas";
import { TIPO_ESCALA_LABEL, TURNO_LABEL } from "@/lib/dp/dsr-rules";

const DIAS = [
  { v: 0, label: "Dom" }, { v: 1, label: "Seg" }, { v: 2, label: "Ter" }, { v: 3, label: "Qua" },
  { v: 4, label: "Qui" }, { v: 5, label: "Sex" }, { v: 6, label: "Sáb" },
];

const ESCALAS = ["6x1", "5x2", "5x1", "4x2", "12x36", "intermitente", "personalizada"] as const;
const TURNOS = ["matutino", "vespertino", "noturno", "misto"] as const;

function diasLabel(dias: number[]) {
  if (!dias?.length) return "—";
  return dias.slice().sort().map((d) => DIAS.find((x) => x.v === d)?.label ?? d).join(", ");
}

export default function DpCadastroJornadas() {
  const { jornadas, isLoading, isError, refetch, create, update, remove, saving } = useDpJornadas();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DpJornada | null>(null);
  const [form, setForm] = useState<DpJornadaInput>(JORNADA_DEFAULT);
  const [confirmDelete, setConfirmDelete] = useState<DpJornada | null>(null);

  const set = <K extends keyof DpJornadaInput>(k: K, v: DpJornadaInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const abrirNova = () => { setEditing(null); setForm(JORNADA_DEFAULT); setOpen(true); };
  const abrirEdicao = (j: DpJornada) => {
    setEditing(j);
    setForm({
      nome: j.nome, tipo_escala: j.tipo_escala, turno: j.turno,
      carga_horaria_diaria: j.carga_horaria_diaria, carga_horaria_semanal: j.carga_horaria_semanal,
      dias_trabalho: j.dias_trabalho ?? [], dias_folga: j.dias_folga ?? [],
      horario_entrada: j.horario_entrada, horario_saida: j.horario_saida,
      intervalo_inicio: j.intervalo_inicio, intervalo_fim: j.intervalo_fim,
      permite_intervalo_fracionado: j.permite_intervalo_fracionado,
      observacoes: j.observacoes, ativo: j.ativo,
    });
    setOpen(true);
  };

  const salvar = async () => {
    if (!form.nome.trim()) { toast.error("Informe o nome da jornada"); return; }
    if (form.dias_trabalho.length === 0) { toast.error("Selecione ao menos um dia de trabalho"); return; }
    try {
      if (editing) await update({ id: editing.id, ...form });
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
        <title>Jornadas e escalas | DP 360°FOOD</title>
        <meta name="description" content="Cadastre modelos de jornada (6x1, 5x2, 12x36) com turnos, intervalos e dias de folga para o Departamento Pessoal." />
      </Helmet>

      <DpPageHeader
        title="Jornadas e escalas"
        description={`Modelos de jornada aplicados aos colaboradores. ${ativas} ativa(s).`}
        icon={Clock}
        actions={
          <Button onClick={abrirNova} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Nova jornada
          </Button>
        }
      />

      <ValidacaoMenorCard />



      {isError ? (
        <DpErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : jornadas.length === 0 ? (
        <DpContentCard contentClassName="p-4 md:p-6">
          <DpEmptyState icon={Clock} dashed>
            Nenhuma jornada cadastrada. Crie um modelo (ex.: 6x1 matutino) para vincular aos colaboradores.
          </DpEmptyState>
        </DpContentCard>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {jornadas.map((j) => (
            <DpContentCard key={j.id} contentClassName="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{j.nome}</h2>
                  <p className="text-xs text-muted-foreground">
                    {TIPO_ESCALA_LABEL[j.tipo_escala] ?? j.tipo_escala}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant={j.ativo ? "default" : "secondary"}>{j.ativo ? "Ativa" : "Inativa"}</Badge>
                  <Button variant="ghost" size="icon" aria-label={`Editar ${j.nome}`} onClick={() => abrirEdicao(j)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Excluir ${j.nome}`} onClick={() => setConfirmDelete(j)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div><dt className="inline text-muted-foreground">Turno: </dt><dd className="inline">{TURNO_LABEL[j.turno] ?? j.turno}</dd></div>
                <div><dt className="inline text-muted-foreground">Carga: </dt><dd className="inline">{j.carga_horaria_diaria}h/dia · {j.carga_horaria_semanal}h/sem</dd></div>
                <div><dt className="inline text-muted-foreground">Horário: </dt><dd className="inline">{j.horario_entrada?.slice(0, 5) ?? "—"} às {j.horario_saida?.slice(0, 5) ?? "—"}</dd></div>
                <div><dt className="inline text-muted-foreground">Folgas: </dt><dd className="inline">{diasLabel(j.dias_folga ?? [])}</dd></div>
                <div className="col-span-2"><dt className="inline text-muted-foreground">Trabalha: </dt><dd className="inline">{diasLabel(j.dias_trabalho ?? [])}</dd></div>
              </dl>
            </DpContentCard>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar jornada" : "Nova jornada"}</DialogTitle>
            <DialogDescription>
              Defina escala, turno e horários. Menores de 18 anos não podem ser vinculados a turnos noturnos.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="j-nome">Nome</Label>
              <Input id="j-nome" value={form.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: 6x1 Matutino — Loja Garavelo" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="j-escala">Tipo de escala</Label>
              <Select value={form.tipo_escala} onValueChange={(v) => set("tipo_escala", v as DpJornadaInput["tipo_escala"])}>
                <SelectTrigger id="j-escala"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESCALAS.map((e) => <SelectItem key={e} value={e}>{TIPO_ESCALA_LABEL[e] ?? e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="j-turno">Turno</Label>
              <Select value={form.turno} onValueChange={(v) => set("turno", v as DpJornadaInput["turno"])}>
                <SelectTrigger id="j-turno"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TURNOS.map((t) => <SelectItem key={t} value={t}>{TURNO_LABEL[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="j-cd">Carga diária (h)</Label>
              <Input id="j-cd" type="number" min={1} max={12} step={0.5} value={form.carga_horaria_diaria}
                onChange={(e) => set("carga_horaria_diaria", Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="j-cs">Carga semanal (h)</Label>
              <Input id="j-cs" type="number" min={1} max={60} step={0.5} value={form.carga_horaria_semanal}
                onChange={(e) => set("carga_horaria_semanal", Number(e.target.value) || 0)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="j-ent">Entrada</Label>
              <Input id="j-ent" type="time" value={form.horario_entrada ?? ""} onChange={(e) => set("horario_entrada", e.target.value || null)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="j-sai">Saída</Label>
              <Input id="j-sai" type="time" value={form.horario_saida ?? ""} onChange={(e) => set("horario_saida", e.target.value || null)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="j-ii">Intervalo — início</Label>
              <Input id="j-ii" type="time" value={form.intervalo_inicio ?? ""} onChange={(e) => set("intervalo_inicio", e.target.value || null)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="j-if">Intervalo — fim</Label>
              <Input id="j-if" type="time" value={form.intervalo_fim ?? ""} onChange={(e) => set("intervalo_fim", e.target.value || null)} />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Dias de trabalho</Label>
              <ToggleGroup
                type="multiple"
                className="flex flex-wrap justify-start gap-1"
                value={form.dias_trabalho.map(String)}
                onValueChange={(v) => set("dias_trabalho", v.map(Number).sort())}
              >
                {DIAS.map((d) => (
                  <ToggleGroupItem key={d.v} value={String(d.v)} aria-label={d.label} className="h-9 px-3 text-xs">
                    {d.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Dias de folga fixa</Label>
              <ToggleGroup
                type="multiple"
                className="flex flex-wrap justify-start gap-1"
                value={form.dias_folga.map(String)}
                onValueChange={(v) => set("dias_folga", v.map(Number).sort())}
              >
                {DIAS.map((d) => (
                  <ToggleGroupItem key={d.v} value={String(d.v)} aria-label={d.label} className="h-9 px-3 text-xs">
                    {d.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
              <Label htmlFor="j-frac" className="text-sm font-normal">Permite intervalo fracionado</Label>
              <Switch id="j-frac" checked={form.permite_intervalo_fracionado}
                onCheckedChange={(v) => set("permite_intervalo_fracionado", v)} />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
              <Label htmlFor="j-ativo" className="text-sm font-normal">Jornada ativa</Label>
              <Switch id="j-ativo" checked={form.ativo} onCheckedChange={(v) => set("ativo", v)} />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="j-obs">Observações</Label>
              <Textarea id="j-obs" rows={2} value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value || null)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => void salvar()} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir jornada</AlertDialogTitle>
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
