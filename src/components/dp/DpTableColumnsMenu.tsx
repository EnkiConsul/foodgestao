import { Columns3, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Controle "Colunas": mostrar/ocultar colunas da tabela e restaurar o padrão.
 * Colunas essenciais ficam travadas para a tela nunca ficar sem contexto.
 * As mudanças são salvas automaticamente (sem botão de salvar).
 */
export function DpTableColumnsMenu<K extends string>(props: {
  columns: { key: K; label: string }[];
  hidden: K[];
  essentialKeys?: K[];
  onToggle: (k: K) => void;
  onReset: () => void;
}) {
  const essential = props.essentialKeys ?? [];
  const visiveis = props.columns.filter((c) => !props.hidden.includes(c.key)).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-10 rounded-full" title="Escolher colunas visíveis">
          <Columns3 className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Colunas</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2">
        <p className="px-1 pb-2 text-xs font-semibold text-muted-foreground">Colunas visíveis</p>
        <div className="space-y-1">
          {props.columns.map((c) => {
            const travada = essential.includes(c.key);
            const ultima = !props.hidden.includes(c.key) && visiveis <= 1;
            const desabilitada = travada || ultima;
            return (
              <label
                key={c.key}
                className={`flex items-center gap-2 rounded px-1 py-1 text-xs ${
                  desabilitada ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-muted"
                }`}
                title={travada ? "Coluna essencial: não pode ser ocultada" : ultima ? "A tabela precisa de ao menos uma coluna" : undefined}
              >
                <Checkbox
                  checked={!props.hidden.includes(c.key)}
                  disabled={desabilitada}
                  onCheckedChange={() => props.onToggle(c.key)}
                />
                <span className="truncate">{c.label}</span>
              </label>
            );
          })}
        </div>
        <DropdownMenuSeparator className="my-2" />
        <DropdownMenuItem onSelect={props.onReset} className="text-xs">
          <RotateCcw className="mr-2 h-3.5 w-3.5" /> Restaurar Padrão
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default DpTableColumnsMenu;
