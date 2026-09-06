import { useMemo, useState } from "react";
import { CalendarDays, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDpFeriados } from "@/hooks/useDpFeriados";
import {
  descricaoRegra, feriadosDoAno, type FeriadoRegra,
} from "@/lib/dp/feriados";
import { FeriadoFormDialog } from "@/components/dp/unidades/FeriadoFormDialog";
import { ReplicarFeriadosDialog } from "@/components/dp/unidades/ReplicarFeriadosDialog";

interface Props {
  /** Unidade em edição. Quando ausente, a unidade ainda não foi salva. */
  unidadeId?: string | null;
}

const fmt = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

/** Calendário de feriados desta unidade, com a visão do ano resolvida. */
export function UnidadeFeriadosPanel({ unidadeId }: Props) {
  const { feriados, isLoading, salvar, alternar, excluir, incluirNacionais, replicar } =
    useDpFeriados(unidadeId ?? null);
  const [open, setOpen] = useState(false);
  const [replicarOpen, setReplicarOpen] = useState(false);
  const [editando, setEditando] = useState<FeriadoRegra | null>(null);
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(String(anoAtual));

  const doAno = useMemo(() => feriadosDoAno(feriados, Number(ano)), [feriados, ano]);

  if (!unidadeId) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Salve a unidade primeiro para cadastrar os feriados.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Feriados desta unidade</p>
          <p className="text-xs text-muted-foreground">
            Usados nas férias e na rotina. Cada unidade tem o seu próprio calendário.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={incluirNacionais.isPending}
            onClick={() => incluirNacionais.mutate()}
          >
            Incluir nacionais
          </Button>
          <Button size="sm" onClick={() => { setEditando(null); setOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" /> Novo feriado
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : feriados.length === 0 ? (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Nenhum feriado cadastrado nesta unidade.
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {feriados.map((f) => (
            <li key={f.id} className="flex items-center gap-3 p-3">
              <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{f.nome}</p>
                <p className="truncate text-xs text-muted-foreground">{descricaoRegra(f)}</p>
              </div>
              {f.ativo === false && <Badge variant="outline">Desligado</Badge>}
              <Switch
                checked={f.ativo !== false}
                onCheckedChange={(v) => alternar.mutate({ id: f.id, ativo: v })}
                aria-label={f.ativo !== false ? "Desligar feriado" : "Ligar feriado"}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Editar ${f.nome}`}
                onClick={() => { setEditando(f); setOpen(true); }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remover ${f.nome}`}
                onClick={() => excluir.mutate(f.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-xl border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Feriados de {ano}</p>
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[anoAtual - 1, anoAtual, anoAtual + 1, anoAtual + 2].map((a) => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {doAno.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum feriado neste ano.</p>
        ) : (
          <ul className="space-y-1">
            {doAno.map((f) => (
              <li key={`${f.regraId}-${f.data}`} className="flex items-center gap-2 text-sm">
                <span className="tabular-nums text-muted-foreground">{fmt(f.data)}</span>
                <span className="truncate">{f.nome}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <FeriadoFormDialog
        open={open}
        onOpenChange={setOpen}
        feriado={editando}
        saving={salvar.isPending}
        onSubmit={(input) => salvar.mutate(input, { onSuccess: () => setOpen(false) })}
      />
    </div>
  );
}
