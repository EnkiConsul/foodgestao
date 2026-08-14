import { useEffect, useMemo, useState } from "react";
import { Clock, AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CienciaLegalDialog } from "@/components/dp/CienciaLegalDialog";
import {
  CORES_TURNO, DEFAULT_INTERVALOS, categoriasTurno,
  cargaLiquidaHoras, formatarFaixaTurno, intervaloAbaixoDoLegal, nomeSugeridoTurno,
  sugerirCategoria, turnoTemErro, validarTurno,
} from "@/lib/dp/turno-utils";
import { useTurnoCategoriaLabels } from "@/hooks/useTurnoCategoriaLabels";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import { TURNO_FORM_DEFAULT, type CienciaTurno, type DpTurnoForm } from "@/hooks/useDpTurnos";

export interface TurnoSubmitPayload {
  form: DpTurnoForm;
  ciencia?: CienciaTurno | null;
}

interface TurnoFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: DpTurnoForm | null;
  unidades: { id: string; nome: string }[];
  saving?: boolean;
  titulo: string;
  onSubmit: (payload: TurnoSubmitPayload) => void;
}

const SEM_UNIDADE = "__todas__";

export function TurnoForm({
  open, onOpenChange, initial, unidades, saving, titulo, onSubmit,
}: TurnoFormProps) {
  const [form, setForm] = useState<DpTurnoForm>(initial ?? TURNO_FORM_DEFAULT);
  const [apelidoAberto, setApelidoAberto] = useState(false);
  const [cienciaAberta, setCienciaAberta] = useState(false);

  useEffect(() => {
    if (open) {
      const base = initial ?? TURNO_FORM_DEFAULT;
      setForm(base);
      setApelidoAberto(!!base.nome?.trim());
      setCienciaAberta(false);
    }
  }, [open, initial]);

  const set = <K extends keyof DpTurnoForm>(k: K, v: DpTurnoForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const { labels: categoriaLabels } = useTurnoCategoriaLabels();
  const categoriasDisponiveis = useMemo(() => categoriasTurno(categoriaLabels), [categoriaLabels]);
  const categoria = form.categoria ?? sugerirCategoria(form.entrada);
  const nomeAutomatico = nomeSugeridoTurno(categoria, form.entrada, form.saida, categoriaLabels);
  const nomeFinal = form.nome?.trim() ? form.nome.trim() : nomeAutomatico;

  const validacoes = useMemo(
    () => validarTurno({ ...form, nome: nomeFinal }),
    [form, nomeFinal],
  );
  const erros = validacoes.filter((v) => v.nivel === "erro");
  // O intervalo abaixo do mínimo legal tem tratamento próprio (ciência registrada).
  const avisos = validacoes.filter((v) => v.nivel === "aviso" && v.campo !== "intervalo_minutos");
  const carga = cargaLiquidaHoras(form);
  const alertaIntervalo = useMemo(() => intervaloAbaixoDoLegal(form), [form]);

  const construir = (): DpTurnoForm => ({ ...form, nome: nomeFinal, categoria });

  const submit = () => {
    if (turnoTemErro(validacoes)) return;
    if (alertaIntervalo) {
      setCienciaAberta(true);
      return;
    }
    onSubmit({ form: construir() });
  };

  const confirmarCiencia = (justificativa: string) => {
    setCienciaAberta(false);
    onSubmit({ form: construir(), ciencia: { confirmada: true, justificativa } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[100dvh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none">
        <DialogHeader className="shrink-0 border-b px-4 py-3 text-left sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
            {titulo}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Um turno é só um horário reutilizável. Dias de trabalho e folgas são definidos na escala.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="space-y-1.5">
            <Label>Categoria do turno</Label>
            <Select value={categoria} onValueChange={(v) => set("categoria", v)}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS_TURNO.map((c) => (
                  <SelectItem key={c.v} value={c.v}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              O nome do turno é gerado por aqui: <span className="font-medium text-foreground">{nomeAutomatico}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="turno-entrada">Entrada</Label>
              <Input
                id="turno-entrada"
                type="time"
                value={form.entrada}
                onChange={(e) => set("entrada", e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="turno-saida">Saída</Label>
              <Input
                id="turno-saida"
                type="time"
                value={form.saida}
                onChange={(e) => set("saida", e.target.value)}
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="turno-intervalo">Intervalo (minutos)</Label>
            <Input
              id="turno-intervalo"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.intervalo_minutos}
              onChange={(e) => set("intervalo_minutos", Number(e.target.value || 0))}
              className="h-11"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {DEFAULT_INTERVALOS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={form.intervalo_minutos === m ? "default" : "outline"}
                  className="h-8"
                  onClick={() => set("intervalo_minutos", m)}
                >
                  {m === 0 ? "Sem intervalo" : `${m} min`}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{formatarFaixaTurno(form)}</span>
              <Badge variant="secondary">{formatarHoras(carga)} líquidas</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              O total da semana é calculado na escala, não aqui.
            </p>
          </div>

          {alertaIntervalo && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                Intervalo abaixo do mínimo legal
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{alertaIntervalo.mensagem}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ao salvar, será solicitada a confirmação de ciência do responsável, registrada no histórico de regras.
              </p>
            </div>
          )}

          {avisos.map((a) => (
            <p key={a.mensagem} className="flex items-start gap-2 text-xs text-amber-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {a.mensagem}
            </p>
          ))}
          {erros.map((e) => (
            <p key={e.mensagem} className="flex items-start gap-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {e.mensagem}
            </p>
          ))}

          <div className="space-y-1.5">
            <Label>Unidade</Label>
            <Select
              value={form.unidade_id ?? SEM_UNIDADE}
              onValueChange={(v) => set("unidade_id", v === SEM_UNIDADE ? null : v)}
            >
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_UNIDADE}>Todas as unidades</SelectItem>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Cor na escala</Label>
            <div className="flex flex-wrap gap-2">
              {CORES_TURNO.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Usar a cor ${c}`}
                  onClick={() => set("cor", c)}
                  className={cn(
                    "h-9 w-9 rounded-full border-2 transition",
                    form.cor === c ? "border-foreground scale-110" : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {apelidoAberto ? (
            <div className="space-y-1.5">
              <Label htmlFor="turno-apelido">Apelido (opcional)</Label>
              <Input
                id="turno-apelido"
                value={form.nome ?? ""}
                onChange={(e) => set("nome", e.target.value)}
                placeholder={nomeAutomatico}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                Útil quando há dois turnos da mesma categoria (ex.: Jantar Salão e Jantar Delivery).
              </p>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="h-9 px-2 text-xs"
              onClick={() => setApelidoAberto(true)}
            >
              Personalizar nome
            </Button>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="turno-desc">Observações</Label>
            <Textarea
              id="turno-desc"
              value={form.descricao ?? ""}
              onChange={(e) => set("descricao", e.target.value || null)}
              placeholder="Ex.: turno usado apenas em sextas e sábados"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <Label htmlFor="turno-ativo" className="text-sm">Turno ativo</Label>
              <p className="text-xs text-muted-foreground">Turnos inativos não aparecem na escala.</p>
            </div>
            <Switch id="turno-ativo" checked={form.ativo} onCheckedChange={(v) => set("ativo", v)} />
          </div>
        </div>

        <div className="shrink-0 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="flex gap-2">
            <Button variant="outline" className="h-11 flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button className="h-11 flex-1" onClick={submit} disabled={saving || erros.length > 0}>
              {saving ? "Salvando..." : "Salvar turno"}
            </Button>
          </div>
        </div>
      </DialogContent>

      <CienciaLegalDialog
        open={cienciaAberta}
        alertas={alertaIntervalo ? [{ campo: alertaIntervalo.campo, mensagem: alertaIntervalo.mensagem }] : []}
        titulo="Intervalo abaixo do mínimo legal (art. 71 da CLT)"
        onCancel={() => setCienciaAberta(false)}
        onConfirm={confirmarCiencia}
        confirming={saving}
      />
    </Dialog>
  );
}
