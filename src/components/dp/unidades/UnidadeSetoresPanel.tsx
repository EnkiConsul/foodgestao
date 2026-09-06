import { useState } from "react";
import { toast } from "sonner";
import { LayoutGrid, Pencil, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  useDpSetores, useToggleDpSetorAtivo, type DpSetorComContagem,
} from "@/hooks/useDpSetores";
import { SetorFormDialog } from "@/components/dp/setores/SetorFormDialog";

interface Props {
  /** Unidade em edição. Quando ausente, a unidade ainda não foi salva. */
  unidadeId?: string | null;
  unidadeNome?: string;
}

/** Setores/áreas operacionais da unidade: criar, editar e ativar/desativar. */
export function UnidadeSetoresPanel({ unidadeId, unidadeNome }: Props) {
  const { setores, isLoading } = useDpSetores(unidadeId ?? null);
  const toggle = useToggleDpSetorAtivo();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DpSetorComContagem | null>(null);

  if (!unidadeId) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Salve a unidade primeiro para cadastrar os setores.
      </div>
    );
  }

  const alternar = async (setor: DpSetorComContagem, ativo: boolean) => {
    try {
      await toggle.mutateAsync({ id: setor.id, ativo });
      toast.success(ativo ? "Setor reativado" : "Setor desativado");
    } catch (e) {
      toast.error("Não foi possível alterar o setor", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Setores / áreas</p>
          <p className="text-xs text-muted-foreground">
            Áreas operacionais desta unidade, como Salão, Cozinha ou Delivery.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => { setEditing(null); setOpen(true); }}
        >
          <Plus className="mr-1 h-4 w-4" /> Novo setor
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : setores.length === 0 ? (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Nenhum setor cadastrado nesta unidade.
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {setores.map((s) => (
            <li key={s.id} className="flex items-center gap-3 p-3">
              <LayoutGrid className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.nome}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="gap-1">
                    <Users className="h-3 w-3" aria-hidden="true" />
                    {s.colaboradores_count} colaborador{s.colaboradores_count === 1 ? "" : "es"}
                  </Badge>
                  {!s.ativo && <Badge variant="outline">Inativo</Badge>}
                  {s.descricao && (
                    <span className="truncate text-xs text-muted-foreground">{s.descricao}</span>
                  )}
                </div>
              </div>
              <Switch
                checked={s.ativo}
                onCheckedChange={(v) => void alternar(s, v)}
                aria-label={s.ativo ? "Desativar setor" : "Ativar setor"}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Editar setor ${s.nome}`}
                onClick={() => { setEditing(s); setOpen(true); }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <SetorFormDialog
        open={open}
        onOpenChange={setOpen}
        unidadeId={unidadeId}
        unidadeNome={unidadeNome}
        setor={editing}
      />
    </div>
  );
}
