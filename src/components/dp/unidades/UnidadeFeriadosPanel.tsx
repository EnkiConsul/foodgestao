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
  const qc = useQueryClient();
  const { companyId } = useCompanyContext() as any;
  const cienteEm = useQuery({
    queryKey: ["dp_unidade_feriados_ciente", unidadeId],
    enabled: !!unidadeId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("dp_unidades").select("feriados_locais_ciente_em").eq("id", unidadeId).maybeSingle();
      return (data?.feriados_locais_ciente_em as string | null) ?? null;
    },
  });
  const definirCiencia = async (ciente: boolean) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("dp_unidades").update({
      feriados_locais_ciente_em: ciente ? new Date().toISOString() : null,
      feriados_locais_ciente_por: ciente ? u.user?.id ?? null : null,
    }).eq("id", unidadeId);
    if (error) throw error;
  };
  const aposCiencia = {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_unidade_feriados_ciente", unidadeId] });
      if (companyId) forcarRecargaPendencias(companyId);
    },
    onError: () => toast.error("Não foi possível registrar a confirmação."),
  };
  const confirmar = useMutation({ mutationFn: () => definirCiencia(true), ...aposCiencia });
  const desfazer = useMutation({ mutationFn: () => definirCiencia(false), ...aposCiencia });
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
          <Button
            size="sm"
            variant="outline"
            disabled={feriados.length === 0 || replicar.isPending}
            onClick={() => setReplicarOpen(true)}
          >
            <Copy className="mr-1 h-4 w-4" /> Replicar para outras unidades
          </Button>
          <Button size="sm" onClick={() => { setEditando(null); setOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" /> Novo feriado
          </Button>
        </div>
      </div>

      {!isLoading && !cienteEm.isLoading && faltaFeriadoLocal(feriados, cienteEm.data) && (
        <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium">Faltam os feriados municipais e estaduais</p>
          <p className="text-xs text-muted-foreground">
            Esta unidade só tem feriados nacionais. Cadastre os feriados da cidade e do estado
            (ex.: aniversário da cidade, padroeiro) para que férias, folgas e escalas fiquem corretas.
          </p>
          <Button size="sm" variant="outline" disabled={confirmar.isPending} onClick={() => confirmar.mutate()}>
            Confirmar que Não Há Feriados Locais
          </Button>
        </div>
      )}
      {cienteEm.data && !feriados.some((f) => f.ativo !== false && ehFeriadoLocal(f)) && (
        <p className="text-xs text-muted-foreground">
          Confirmado que esta unidade não tem feriados locais.{" "}
          <button type="button" className="underline" onClick={() => desfazer.mutate()}>Desfazer</button>
        </p>
      )}

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

      <ReplicarFeriadosDialog
        open={replicarOpen}
        onOpenChange={setReplicarOpen}
        unidadeId={unidadeId}
        totalOrigem={feriados.length}
        saving={replicar.isPending}
        onConfirm={(input) =>
          replicar.mutate(input, { onSuccess: () => setReplicarOpen(false) })
        }
      />

    </div>
  );
}
