import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DescriptionEditorProps {
  value: string | null;
  /** Impede a edição (lançamentos já confirmados/ignorados). */
  disabled?: boolean;
  /** Salva a nova descrição. Deve lançar/retornar false em caso de erro. */
  onSave: (value: string) => Promise<boolean | void>;
  className?: string;
  /** Layout compacto usado na tabela desktop. */
  compact?: boolean;
}

/**
 * Descrição do lançamento importado com edição no local.
 * Mantém o texto original visível e só entra em modo de edição sob demanda.
 */
export function DescriptionEditor({
  value,
  disabled,
  onSave,
  className,
  compact,
}: DescriptionEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = async () => {
    const next = draft.trim();
    if (!next) return;
    if (next === (value ?? "")) { setEditing(false); return; }
    setSaving(true);
    try {
      const result = await onSave(next);
      if (result !== false) setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void commit(); }
            if (e.key === "Escape") { e.preventDefault(); setDraft(value ?? ""); setEditing(false); }
          }}
          maxLength={200}
          disabled={saving}
          className={cn("min-w-0 flex-1", compact ? "h-8 text-xs" : "h-10 text-sm")}
          aria-label="Descrição do lançamento"
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={compact ? "h-8 w-8 shrink-0" : "h-10 w-10 shrink-0"}
          onClick={() => void commit()}
          disabled={saving || !draft.trim()}
          aria-label="Salvar descrição"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={compact ? "h-8 w-8 shrink-0" : "h-10 w-10 shrink-0"}
          onClick={() => { setDraft(value ?? ""); setEditing(false); }}
          disabled={saving}
          aria-label="Cancelar edição"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex items-start gap-1", className)}>
      <p
        className={cn("min-w-0 flex-1", compact ? "truncate" : "break-words text-sm")}
        title={value ?? ""}
      >
        {value ?? "-"}
      </p>
      {!disabled && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn("shrink-0 text-muted-foreground", compact ? "h-6 w-6" : "h-8 w-8")}
          onClick={() => setEditing(true)}
          aria-label="Editar descrição"
        >
          <Pencil className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        </Button>
      )}
    </div>
  );
}
