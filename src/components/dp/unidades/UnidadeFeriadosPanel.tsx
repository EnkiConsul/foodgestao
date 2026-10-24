import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { forcarRecargaPendencias } from "@/lib/dp/pendencias-resolver";
import { CalendarDays, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDpFeriados } from "@/hooks/useDpFeriados";
import {
  descricaoRegra, ehFeriadoLocal, faltaFeriadoLocal, feriadosDoAno, type FeriadoRegra,
} from "@/lib/dp/feriados";
import { ordenarFeriadosCadastro } from "@/lib/dp/feriados-ordenacao";
import { dataDoFeriadoNoAno } from "@/lib/dp/feriados";
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
  const { selectedCompanyId: companyId } = useCompanyContext();
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
  const [nacionaisOpen, setNacionaisOpen] = useState(false);
  const [incluirSextaSanta, setIncluirSextaSanta] = useState(false);
  const [editando, setEditando] = useState<FeriadoRegra | null>(null);
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(String(anoAtual));

  const ordenados = useMemo(() => ordenarFeriadosCadastro(feriados, Number(ano)), [feriados, ano]);
  const doAno = useMemo(() => feriadosDoAno(feriados, Number(ano)), [feriados, ano]);

  if (!unidadeId) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Salve a unidade primeiro para cadastrar os feriados.
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Feriados desta unidade</p>
          <p className="text-xs text-muted-foreground">
            Usados nas férias e na rotina. Cada unidade tem o seu próprio calendário.
          </p>
        </div>
        <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap [&>button]:min-h-11 [&>button]:whitespace-normal">
          <Button
            size="sm"
            variant="outline"
            disabled={isLoading || incluirNacionais.isPending}
            onClick={() => { setIncluirSextaSanta(false); setNacionaisOpen(true); }}
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
          <Button size="sm" className="order-first sm:order-last" onClick={() => { setEditando(null); setOpen(true); }}>
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
          <Button size="sm" variant="outline" className="h-auto min-h-11 w-full whitespace-normal" disabled={confirmar.isPending} onClick={() => confirmar.mutate()}>
            Confirmar que Não Há Feriados Locais
          </Button>
        </div>
      )}
      {cienteEm.data && !feriados.some((f) => f.ativo !== false && ehFeriadoLocal(f)) && (
        <p className="text-xs text-muted-foreground">
          Confirmado que esta unidade não tem feriados locais.{" "}
          <Button type="button" variant="link" className="min-h-11 px-1" onClick={() => desfazer.mutate()}>Desfazer</Button>
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
          {ordenados.map((f) => (
            <li key={f.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
              <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium">{f.nome}</p>
                <p className="mt-1 whitespace-nowrap text-sm font-medium tabular-nums">{dataDoFeriadoNoAno(f, Number(ano)) ? fmt(dataDoFeriadoNoAno(f, Number(ano)) ?? "") : f.tipo === "especifica" && f.data ? fmt(f.data) : `Sem ocorrência em ${ano}`}</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">{descricaoRegra(f)}</p>
              </div>
              <div className="col-span-2 flex min-h-11 flex-wrap items-center justify-end gap-2 sm:col-span-1">
              {f.ativo === false && <Badge variant="outline">Desligado</Badge>}
              <Switch
                checked={f.ativo !== false}
                onCheckedChange={(v) => alternar.mutate({ id: f.id, ativo: v })}
                aria-label={f.ativo !== false ? "Desligar feriado" : "Ligar feriado"}
              />
              <Button
                size="icon"
                className="h-11 w-11 shrink-0"
                variant="ghost"
                aria-label={`Editar ${f.nome}`}
                onClick={() => { setEditando(f); setOpen(true); }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                className="h-11 w-11 shrink-0"
                variant="ghost"
                aria-label={`Remover ${f.nome}`}
                onClick={() => excluir.mutate(f.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-xl border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Feriados de {ano}</p>
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="h-11 w-28 shrink-0"><SelectValue /></SelectTrigger>
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
              <li key={`${f.regraId}-${f.data}`} className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-2 py-1 text-sm">
                <span className="whitespace-nowrap tabular-nums text-muted-foreground">{fmt(f.data)}</span>
                <span className="break-words">{f.nome}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={nacionaisOpen} onOpenChange={(value) => { if (!incluirNacionais.isPending) setNacionaisOpen(value); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Incluir feriados</AlertDialogTitle>
            <AlertDialogDescription>
              Os nove feriados nacionais de data fixa serão incluídos, sem duplicar os já cadastrados.
              Sexta-feira Santa depende de lei municipal; não é feriado nacional automático.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
            <Checkbox className="mt-0.5" checked={incluirSextaSanta}
              disabled={incluirNacionais.isPending}
              onCheckedChange={(value) => setIncluirSextaSanta(value === true)} />
            <span className="min-w-0 break-words">Incluir também Sexta-feira Santa nesta unidade, conforme a legislação local</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={incluirNacionais.isPending}>Cancelar</AlertDialogCancel>
            <Button className="min-h-11" disabled={incluirNacionais.isPending}
              onClick={() => incluirNacionais.mutate(incluirSextaSanta, { onSuccess: () => setNacionaisOpen(false) })}>
              {incluirNacionais.isPending ? "Incluindo…" : "Incluir feriados"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
