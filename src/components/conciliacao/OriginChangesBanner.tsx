import { useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { OriginChange } from "@/hooks/useOriginChanges";

const brl = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dia = (v: string | null) => {
  if (!v) return "—";
  const [y, m, d] = v.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : v;
};

type CampoAlterado = "descricao" | "valor" | "data";

function camposAlterados(c: OriginChange): CampoAlterado[] {
  const out: CampoAlterado[] = [];
  if ((c.previous.description ?? "") !== (c.incoming.description ?? "")) out.push("descricao");
  if (Number(c.previous.amount ?? 0) !== Number(c.incoming.amount ?? 0)) out.push("valor");
  if ((c.previous.transaction_date ?? "").slice(0, 10) !== (c.incoming.transaction_date ?? "").slice(0, 10))
    out.push("data");
  return out;
}

const LABEL: Record<CampoAlterado, string> = {
  descricao: "Descrição",
  valor: "Valor",
  data: "Data",
};

type Filtro = "todos" | "financeiro" | "descricao";

interface Props {
  changes: OriginChange[];
  resolvingId: string | null;
  onResolve: (changeId: string, accept: boolean) => void | Promise<unknown>;
}

/**
 * Faixa "Revisar": o banco reenviou uma versão diferente de um lançamento já
 * conciliado. Mostra apenas os campos que realmente divergem e nunca aplica
 * nada sem escolha explícita do usuário.
 */
export function OriginChangesBanner({ changes, resolvingId, onResolve }: Props) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [lote, setLote] = useState<null | { accept: boolean }>(null);
  const [aplicandoLote, setAplicandoLote] = useState(false);

  const enriquecidos = useMemo(
    () => changes.map((c) => ({ change: c, campos: camposAlterados(c) })),
    [changes],
  );

  const totalFinanceiro = enriquecidos.filter(
    (e) => e.campos.includes("valor") || e.campos.includes("data"),
  ).length;
  const totalSoDescricao = enriquecidos.length - totalFinanceiro;

  const visiveis = useMemo(() => {
    if (filtro === "financeiro")
      return enriquecidos.filter((e) => e.campos.includes("valor") || e.campos.includes("data"));
    if (filtro === "descricao")
      return enriquecidos.filter(
        (e) => !e.campos.includes("valor") && !e.campos.includes("data"),
      );
    return enriquecidos;
  }, [enriquecidos, filtro]);

  if (changes.length === 0) return null;

  const aplicarLote = async (accept: boolean) => {
    setAplicandoLote(true);
    for (const item of visiveis) {
      await onResolve(item.change.id, accept);
    }
    setAplicandoLote(false);
    setLote(null);
  };

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">
              Revisar {changes.length} lançamento(s) com versão diferente no banco
            </p>
            <p className="text-xs text-muted-foreground">
              Depois da conciliação, o banco reenviou esses lançamentos com algum dado diferente —
              na maioria dos casos é a descrição original do banco entrando em conflito com o nome
              que você digitou. Nada foi alterado automaticamente:{" "}
              <span className="font-medium text-foreground">Manter atual</span> preserva o seu
              texto e <span className="font-medium text-foreground">Aceitar do banco</span> troca
              pela versão do banco.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={filtro === "todos" ? "secondary" : "ghost"}
            className="h-7 text-xs"
            onClick={() => setFiltro("todos")}
          >
            Todos ({enriquecidos.length})
          </Button>
          <Button
            size="sm"
            variant={filtro === "financeiro" ? "secondary" : "ghost"}
            className="h-7 text-xs"
            onClick={() => setFiltro("financeiro")}
          >
            Valor/Data ({totalFinanceiro})
          </Button>
          <Button
            size="sm"
            variant={filtro === "descricao" ? "secondary" : "ghost"}
            className="h-7 text-xs"
            onClick={() => setFiltro("descricao")}
          >
            Só descrição ({totalSoDescricao})
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={aplicandoLote || visiveis.length === 0}
              onClick={() => setLote({ accept: false })}
            >
              Manter todos ({visiveis.length})
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={aplicandoLote || visiveis.length === 0}
              onClick={() => setLote({ accept: true })}
            >
              {aplicandoLote ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              Aceitar todos do banco
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {visiveis.map(({ change: c, campos }) => {
            const busy = resolvingId === c.id;
            return (
              <div
                key={c.id}
                className="rounded-md border bg-background p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {campos.length === 0 ? (
                      <Badge variant="outline" className="text-[10px]">
                        Sem diferença detectada
                      </Badge>
                    ) : (
                      campos.map((campo) => (
                        <Badge key={campo} variant="secondary" className="text-[10px]">
                          {LABEL[campo]}
                        </Badge>
                      ))
                    )}
                  </div>

                  {campos.includes("descricao") && (
                    <p className="text-muted-foreground break-words">
                      Descrição: <span className="text-foreground">{c.previous.description || "—"}</span>
                      {" → "}
                      <span className="text-foreground font-medium">
                        {c.incoming.description || "—"}
                      </span>
                    </p>
                  )}

                  {campos.includes("valor") && (
                    <p className="text-muted-foreground">
                      Valor: <span className="text-foreground">{brl(c.previous.amount)}</span>
                      {" → "}
                      <span className="text-foreground font-medium">{brl(c.incoming.amount)}</span>
                    </p>
                  )}

                  {campos.includes("data") && (
                    <p className="text-muted-foreground">
                      Data: <span className="text-foreground">{dia(c.previous.transaction_date)}</span>
                      {" → "}
                      <span className="text-foreground font-medium">
                        {dia(c.incoming.transaction_date)}
                      </span>
                    </p>
                  )}

                  {campos.length === 0 && (
                    <p className="text-muted-foreground truncate">
                      {c.incoming.description || c.previous.description || "Sem descrição"}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || aplicandoLote}
                    onClick={() => onResolve(c.id, false)}
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Manter atual
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy || aplicandoLote}
                    onClick={() => onResolve(c.id, true)}
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5 mr-1" />
                    )}
                    Aceitar do banco
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      <AlertDialog open={lote !== null} onOpenChange={(o) => !o && setLote(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lote?.accept
                ? `Aceitar ${visiveis.length} versão(ões) do banco?`
                : `Manter ${visiveis.length} lançamento(s) como estão?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lote?.accept
                ? "Os lançamentos listados serão atualizados com os dados enviados pelo banco. Descrições que você personalizou serão substituídas."
                : "Os lançamentos listados permanecem como estão e as revisões serão encerradas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void aplicarLote(lote?.accept ?? false)}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </Card>
  );
}
