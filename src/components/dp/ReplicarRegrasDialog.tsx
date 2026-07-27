import { useEffect, useState } from "react";
import { Copy, AlertTriangle } from "lucide-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

export interface UnidadeAlvo {
  id: string;
  nome: string;
  /** A unidade já possui regra própria (será sobrescrita). */
  configurada: boolean;
}

interface Props {
  open: boolean;
  unidadeAtualNome: string;
  outrasUnidades: UnidadeAlvo[];
  saving?: boolean;
  onCancel: () => void;
  /** Confirma a gravação; `alvosExtras` são as unidades adicionais marcadas. */
  onConfirm: (alvosExtras: string[]) => void;
}

/**
 * Passo de confirmação ao salvar as regras de folgas de uma unidade: permite
 * replicar exatamente a mesma configuração para outras unidades da empresa.
 */
export function ReplicarRegrasDialog({
  open, unidadeAtualNome, outrasUnidades, saving, onCancel, onConfirm,
}: Props) {
  const [selecionadas, setSelecionadas] = useState<string[]>([]);

  useEffect(() => { if (open) setSelecionadas([]); }, [open]);

  const toggle = (id: string) =>
    setSelecionadas((s) => (s.includes(id) ? s.filter((v) => v !== id) : [...s, id]));

  const sobrescreve = outrasUnidades.some((u) => u.configurada && selecionadas.includes(u.id));

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-primary" aria-hidden="true" />
            Aplicar Estas Regras Também Em Outras Unidades?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left">
              <p className="text-sm">
                As regras serão salvas em <strong>{unidadeAtualNome}</strong>. Marque abaixo as
                unidades que devem receber exatamente a mesma configuração.
              </p>
              <ul className="space-y-2">
                {outrasUnidades.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 rounded-md border p-3">
                    <Checkbox
                      id={`replicar-${u.id}`}
                      checked={selecionadas.includes(u.id)}
                      onCheckedChange={() => toggle(u.id)}
                    />
                    <label htmlFor={`replicar-${u.id}`} className="flex flex-1 flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{u.nome}</span>
                      {u.configurada ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          Já configurada — será sobrescrita
                        </Badge>
                      ) : (
                        <Badge variant="outline">Ainda não configurada</Badge>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
              {sobrescreve && (
                <p className="text-xs text-destructive">
                  As regras atuais das unidades marcadas como sobrescritas serão substituídas.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="outline" onClick={() => onConfirm([])} disabled={saving}>
            Salvar Somente Nesta Unidade
          </Button>
          <Button
            onClick={() => onConfirm(selecionadas)}
            disabled={saving || selecionadas.length === 0}
          >
            {saving ? "Salvando..." : `Salvar E Replicar (${selecionadas.length})`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
