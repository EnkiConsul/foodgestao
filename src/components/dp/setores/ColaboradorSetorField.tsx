import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDpSetores } from "@/hooks/useDpSetores";
import { SetorFormDialog } from "@/components/dp/setores/SetorFormDialog";

const SEM_SETOR = "__sem_setor__";

interface Props {
  unidadeId: string | null;
  value: string | null;
  onChange: (setorId: string | null) => void;
}

/**
 * Setor / área de atuação do colaborador (opcional). Lista apenas setores
 * ativos da unidade escolhida, permite criar um setor sem sair do cadastro e
 * limpa o vínculo quando a unidade muda.
 */
export function ColaboradorSetorField({ unidadeId, value, onChange }: Props) {
  const { setores } = useDpSetores(unidadeId);
  const [novoOpen, setNovoOpen] = useState(false);
  const unidadeAnterior = useRef<string | null>(unidadeId);

  const selecionado = setores.find((s) => s.id === value) ?? null;
  const opcoes = setores.filter((s) => s.ativo || s.id === value);

  // Trocar de unidade invalida o setor da unidade anterior.
  useEffect(() => {
    if (unidadeAnterior.current === unidadeId) return;
    const anterior = unidadeAnterior.current;
    unidadeAnterior.current = unidadeId;
    if (!value) return;
    if (setores.some((s) => s.id === value)) return;
    if (anterior === null && unidadeId) return;
    onChange(null);
    toast.info(
      "O setor foi removido porque pertence à unidade anterior. Selecione um setor da nova unidade.",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeId, setores]);

  return (
    <div className="space-y-2">
      <Label>Setor / Área</Label>
      <div className="flex items-center gap-2">
        <Select
          value={value ?? SEM_SETOR}
          onValueChange={(v) => onChange(v === SEM_SETOR ? null : v)}
          disabled={!unidadeId}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Nenhum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_SETOR}>Nenhum</SelectItem>
            {opcoes.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nome}{s.ativo ? "" : " — inativo"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={!unidadeId}
          onClick={() => setNovoOpen(true)}
        >
          Novo setor
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {unidadeId
          ? "Opcional. Use para identificar a área da unidade onde o colaborador atua normalmente."
          : "Escolha a unidade primeiro para selecionar o setor."}
      </p>
      {selecionado && !selecionado.ativo && (
        <p className="text-[11px] text-amber-600">
          O setor “{selecionado.nome}” está inativo. O vínculo foi mantido; escolha outro se quiser alterar.
        </p>
      )}

      {unidadeId && (
        <SetorFormDialog
          open={novoOpen}
          onOpenChange={setNovoOpen}
          unidadeId={unidadeId}
          onSaved={(s) => onChange(s.id)}
        />
      )}
    </div>
  );
}
