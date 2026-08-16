import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useDpSindicatos } from "@/hooks/useDpCadastros";
import { useSindicatoDoCargo } from "@/hooks/useSindicatoDoCargo";
import { SindicatoQuickFormDialog } from "@/components/dp/SindicatoQuickFormDialog";
import { maskCnpj } from "@/lib/cnpj";

interface Props {
  cargoId: string;
  cargoNome?: string | null;
  unidadeId: string;
  /** Sindicato do colaborador (`dp_colaboradores.sindicato_id`). */
  value: string;
  onChange: (sindicatoId: string) => void;
}

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : null;

/**
 * Enquadramento sindical do colaborador. O sindicato laboral pertence ao cargo:
 * quando o cargo já tem vínculo, aqui é somente leitura; quando não tem, o
 * usuário vincula um existente ou cadastra um novo sem sair do cadastro.
 */
export function SindicatoEnquadramentoField({
  cargoId, cargoNome, unidadeId, value, onChange,
}: Props) {
  const enquadramento = useSindicatoDoCargo(cargoId || null, unidadeId || null);
  const sindicatos = useDpSindicatos();
  const qc = useQueryClient();
  const [novoOpen, setNovoOpen] = useState(false);
  const [vinculando, setVinculando] = useState(false);

  const laboral = enquadramento.data?.laboral ?? null;
  const patronal = enquadramento.data?.patronal ?? null;
  const negociacao = enquadramento.data?.negociacao ?? null;
  const vinculado = !!laboral;

  const laborais = useMemo(
    () => (sindicatos.data ?? []).filter((s) => s.tipo === "laboral" && s.ativo !== false),
    [sindicatos.data],
  );

  // O cargo é a fonte do enquadramento: mantém o colaborador alinhado ao vínculo.
  useEffect(() => {
    if (laboral && value !== laboral.id) onChange(laboral.id);
  }, [laboral, value, onChange]);

  const vincularExistente = async (sindicatoId: string) => {
    if (!cargoId) { toast.error("Selecione o cargo antes de vincular o sindicato"); return; }
    setVinculando(true);
    try {
      const { error } = await supabase
        .from("dp_sindicato_cargos")
        .insert({ sindicato_id: sindicatoId, cargo_id: cargoId });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["dp_sindicato_do_cargo"] });
      qc.invalidateQueries({ queryKey: ["dp_sindicatos"] });
      qc.invalidateQueries({ queryKey: ["dp_sindicato_vinculos"] });
      onChange(sindicatoId);
      toast.success("Sindicato vinculado ao cargo");
    } catch (e) {
      toast.error("Não foi possível vincular o sindicato", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setVinculando(false);
    }
  };

  return (
    <div className="col-span-2 space-y-3 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Scale className="h-4 w-4 text-primary" />
          Enquadramento Sindical
        </div>
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
          <Link to="/dp/cadastros/sindicatos" target="_blank" rel="noreferrer">
            Abrir cadastro de sindicatos
          </Link>
        </Button>
      </div>

      {!cargoId ? (
        <p className="text-xs text-muted-foreground">
          Selecione o cargo: o sindicato laboral é definido pelo cargo do colaborador.
        </p>
      ) : vinculado ? (
        <div className="space-y-2" data-field="sindicato_id">
          <Label className="text-xs text-muted-foreground">Sindicato laboral do cargo</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Lock className="h-3 w-3" />
              {laboral!.nome}
            </Badge>
            {laboral!.cnpj && (
              <span className="text-xs text-muted-foreground">CNPJ {maskCnpj(laboral!.cnpj)}</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Este cargo já está vinculado ao sindicato <strong>{laboral!.nome}</strong>. Para trocar o
            vínculo, use a tela de Sindicatos — assim o cargo inteiro é atualizado de uma vez.
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-field="sindicato_id">
          <Label className="text-xs text-muted-foreground">
            O cargo {cargoNome ? `"${cargoNome}"` : "selecionado"} ainda não tem sindicato laboral
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={value || undefined} onValueChange={vincularExistente} disabled={vinculando}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Vincular um sindicato existente" />
              </SelectTrigger>
              <SelectContent>
                {laborais.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Nenhum sindicato laboral cadastrado
                  </div>
                ) : (
                  laborais.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 gap-1"
              onClick={() => setNovoOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Novo sindicato
            </Button>
          </div>
          <p className="text-[11px] text-amber-600 dark:text-amber-500">
            Sem sindicato o sistema não consegue conferir piso salarial e reajustes da convenção.
            Você pode concluir o cadastro e definir isso depois.
          </p>
        </div>
      )}

      {(negociacao || patronal || laboral?.data_base) && (
        <div className="space-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
          {laboral?.data_base && <div>Data-base: {dataBR(laboral.data_base)}</div>}
          {negociacao && (
            <div>
              {negociacao.tipo_documento?.toUpperCase() ?? "Negociação"} vigente:{" "}
              {dataBR(negociacao.vigencia_inicio) ?? "—"}
              {negociacao.vigencia_fim ? ` a ${dataBR(negociacao.vigencia_fim)}` : ""}
              {negociacao.reajuste_pct != null ? ` · reajuste ${negociacao.reajuste_pct}%` : ""}
            </div>
          )}
          {patronal && <div>Sindicato patronal da unidade: {patronal.nome} (definido na unidade)</div>}
        </div>
      )}

      <SindicatoQuickFormDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        cargoId={cargoId}
        cargoNome={cargoNome}
        onCreated={(s) => onChange(s.id)}
      />
    </div>
  );
}
