import { useMemo, useState } from "react";
import { Search, User, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface SubstitutoOpcao {
  id: string;
  nome: string;
  detalhe?: string | null;
  origem: "colaborador" | "apoio";
}

interface Props {
  opcoes: SubstitutoOpcao[];
  value: SubstitutoOpcao | null;
  onChange: (opcao: SubstitutoOpcao | null) => void;
}

/** Escolha de quem vai cobrir a ausência: colaborador cadastrado ou pessoa de apoio. */
export function SubstitutoPicker({ opcoes, value, onChange }: Props) {
  const [busca, setBusca] = useState("");

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = termo ? opcoes.filter((o) => o.nome.toLowerCase().includes(termo)) : opcoes;
    return base.slice(0, 40);
  }, [opcoes, busca]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome..."
          className="pl-8"
        />
      </div>

      <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-1">
        {filtradas.length === 0 && (
          <p className="p-3 text-center text-sm text-muted-foreground">
            Ninguém encontrado com esse nome.
          </p>
        )}
        {filtradas.map((o) => {
          const ativo = value?.id === o.id && value?.origem === o.origem;
          return (
            <button
              key={`${o.origem}-${o.id}`}
              type="button"
              onClick={() => onChange(ativo ? null : o)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                ativo ? "bg-primary/10 text-foreground" : "hover:bg-muted",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                {o.origem === "colaborador" ? (
                  <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <UserPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{o.nome}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {o.detalhe && (
                  <span className="text-xs text-muted-foreground">{o.detalhe}</span>
                )}
                <Badge variant="outline" className="text-[10px]">
                  {o.origem === "colaborador" ? "Equipe" : "Apoio"}
                </Badge>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
