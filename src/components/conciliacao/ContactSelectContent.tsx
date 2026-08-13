import { useMemo, useState } from "react";
import { SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { onlyDigits } from "@/lib/conciliacao/counterparty";

export interface ContactSelectOption {
  id: string;
  name: string;
  type: string | null;
  document: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  ambos: "Ambos",
};

/** Quantos itens renderizamos por vez (carregamento incremental na rolagem). */
const CHUNK = 50;

/**
 * Conteúdo do seletor de fornecedor/cliente com busca e renderização
 * incremental: a lista completa fica disponível sem travar o navegador
 * quando a empresa tem centenas/milhares de contatos.
 */
export function ContactSelectContent({
  contacts,
  className,
}: {
  contacts: ContactSelectOption[];
  className?: string;
}) {
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(CHUNK);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts;
    const digits = onlyDigits(term);
    return contacts.filter((c) => {
      if (c.name.toLowerCase().includes(term)) return true;
      if (digits.length >= 3 && onlyDigits(c.document).includes(digits)) return true;
      return false;
    });
  }, [contacts, search]);

  const shown = filtered.slice(0, visible);
  const remaining = filtered.length - shown.length;

  return (
    <SelectContent className={className}>
      <div className="sticky top-0 z-10 bg-popover p-2">
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setVisible(CHUNK); }}
          placeholder="Buscar por nome ou documento…"
          className="h-8 text-xs"
          // Evita que o Select capture as teclas de digitação como atalhos.
          onKeyDown={(e) => e.stopPropagation()}
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          {filtered.length} de {contacts.length}
        </p>
      </div>

      {shown.map((c) => (
        <SelectItem key={c.id} value={c.id}>
          <span className="flex items-center gap-2">
            <span>{c.name}</span>
            {c.type && (
              <span className="text-[10px] uppercase text-muted-foreground">
                {TYPE_LABELS[c.type] ?? c.type}
              </span>
            )}
          </span>
        </SelectItem>
      ))}

      {filtered.length === 0 && (
        <p className="px-2 py-3 text-center text-xs text-muted-foreground">
          Nenhum contato encontrado
        </p>
      )}

      {remaining > 0 && (
        <div className="p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-full text-[11px]"
            onClick={(e) => { e.preventDefault(); setVisible((v) => v + CHUNK); }}
          >
            Carregar mais ({remaining})
          </Button>
        </div>
      )}
    </SelectContent>
  );
}
