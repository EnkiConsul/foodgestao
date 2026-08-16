import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, Lock, Plus, Scale, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useDpSindicatos, useDpUnidades } from "@/hooks/useDpCadastros";
import { useSindicatoDoCargo, type NegociacaoResumo, type SindicatoResumo } from "@/hooks/useSindicatoDoCargo";
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

function ResumoVinculado({
  sindicato, negociacao, origem,
}: { sindicato: SindicatoResumo; negociacao: NegociacaoResumo | null; origem: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          {sindicato.nome}
        </Badge>
        {sindicato.cnpj && (
          <span className="text-xs text-muted-foreground">CNPJ {maskCnpj(sindicato.cnpj)}</span>
        )}
      </div>
      <div className="space-y-0.5 text-[11px] text-muted-foreground">
        {sindicato.data_base && <div>Data-base: {dataBR(sindicato.data_base)}</div>}
        {negociacao && (
          <div>
            {negociacao.tipo_documento?.toUpperCase() ?? "Negociação"} vigente:{" "}
            {dataBR(negociacao.vigencia_inicio) ?? "—"}
            {negociacao.vigencia_fim ? ` a ${dataBR(negociacao.vigencia_fim)}` : ""}
            {negociacao.reajuste_pct != null ? ` · reajuste ${negociacao.reajuste_pct}%` : ""}
          </div>
        )}
        <div className="flex items-center gap-1">
          <Lock className="h-3 w-3" />
          Preenchido automaticamente pelo {origem}. Para trocar, use a tela de Sindicatos.
        </div>
      </div>
    </div>
  );
}

/**
 * Enquadramento sindical do colaborador. O laboral pertence ao cargo e o patronal
 * à unidade: quando já existe vínculo, o sistema traz preenchido e em leitura;
 * quando falta, o usuário vincula ou cadastra completo sem sair desta tela.
 */
export function SindicatoEnquadramentoField({
  cargoId, cargoNome, unidadeId, value, onChange,
}: Props) {
  const enquadramento = useSindicatoDoCargo(cargoId || null, unidadeId || null);
  const sindicatos = useDpSindicatos();
  const unidades = useDpUnidades();
  const qc = useQueryClient();
  const [novoOpen, setNovoOpen] = useState(false);
  const [vinculando, setVinculando] = useState(false);

  const laboral = enquadramento.data?.laboral ?? null;
  const patronal = enquadramento.data?.patronal ?? null;
  const negociacao = enquadramento.data?.negociacao ?? null;
  const negociacaoPatronal = enquadramento.data?.negociacaoPatronal ?? null;
  // Enquanto a consulta não responde, não afirmamos que falta vínculo.
  const carregando = enquadramento.isPending || enquadramento.isLoading;

  const unidadeNome = useMemo(
    () => (unidades.data ?? []).find((u) => u.id === unidadeId)?.nome ?? null,
    [unidades.data, unidadeId],
  );

  const porTipo = (tipo: "laboral" | "patronal") =>
    (sindicatos.data ?? []).filter((s) => (s as any).tipo === tipo && s.ativo !== false);
  const laborais = useMemo(() => porTipo("laboral"), [sindicatos.data]);
  const patronais = useMemo(() => porTipo("patronal"), [sindicatos.data]);
  /** Único patronal da empresa: sugerimos o vínculo com um clique. */
  const patronalSugerido = patronais.length === 1 ? patronais[0] : null;

  // O cargo é a fonte do enquadramento: mantém o colaborador alinhado ao vínculo.
  useEffect(() => {
    if (carregando) return;
    if (laboral && value !== laboral.id) onChange(laboral.id);
  }, [carregando, laboral, value, onChange]);

  const invalidar = () => {
    for (const key of [
      "dp_sindicato_do_cargo", "dp_sindicatos", "dp_sindicato_vinculos",
      "dp_sindicato_contexto_unidade",
    ]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };

  const vincularExistente = async (sindicatoId: string, tipo: "laboral" | "patronal") => {
    if (tipo === "laboral" && !cargoId) {
      toast.error("Selecione o cargo antes de vincular o sindicato"); return;
    }
    if (tipo === "patronal" && !unidadeId) {
      toast.error("Selecione a unidade antes de vincular o sindicato patronal"); return;
    }
    setVinculando(true);
    try {
      const { error } = tipo === "laboral"
        ? await supabase.from("dp_sindicato_cargos")
            .insert({ sindicato_id: sindicatoId, cargo_id: cargoId })
        : await supabase.from("dp_sindicato_unidades")
            .insert({ sindicato_id: sindicatoId, unidade_id: unidadeId });
      if (error) throw error;
      invalidar();
      if (tipo === "laboral") onChange(sindicatoId);
      toast.success(
        tipo === "laboral" ? "Sindicato vinculado ao cargo" : "Sindicato vinculado à unidade",
      );
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Laboral — do cargo */}
        <div className="space-y-2 rounded-lg border border-border bg-background p-3" data-field="sindicato_id">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Users className="h-3.5 w-3.5 text-primary" />
            Laboral (do cargo)
          </div>
          {!cargoId ? (
            <p className="text-[11px] text-muted-foreground">
              Selecione o cargo: o sindicato laboral vem do cargo do colaborador.
            </p>
          ) : carregando ? (
            <p className="text-[11px] text-muted-foreground">Buscando o sindicato do cargo…</p>
          ) : laboral ? (
            <ResumoVinculado sindicato={laboral} negociacao={negociacao} origem="cargo" />
          ) : (
            <div className="space-y-2">
              <Label className="text-[11px] text-muted-foreground">
                O cargo {cargoNome ? `"${cargoNome}"` : "selecionado"} ainda não tem sindicato laboral
              </Label>
              <Select
                value={undefined}
                onValueChange={(v) => vincularExistente(v, "laboral")}
                disabled={vinculando}
              >
                <SelectTrigger><SelectValue placeholder="Vincular existente" /></SelectTrigger>
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
            </div>
          )}
        </div>

        {/* Patronal — da unidade */}
        <div className="space-y-2 rounded-lg border border-border bg-background p-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            Patronal (da unidade)
          </div>
          {!unidadeId ? (
            <p className="text-[11px] text-muted-foreground">
              Selecione a unidade: o sindicato patronal vem da unidade do colaborador.
            </p>
          ) : carregando ? (
            <p className="text-[11px] text-muted-foreground">Buscando o sindicato da unidade…</p>
          ) : patronal ? (
            <ResumoVinculado
              sindicato={patronal}
              negociacao={negociacaoPatronal}
              origem="unidade"
            />
          ) : (
            <div className="space-y-2">
              <Label className="text-[11px] text-muted-foreground">
                A unidade {unidadeNome ? `"${unidadeNome}"` : "selecionada"} ainda não tem sindicato patronal
              </Label>
              {patronalSugerido ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    Sugestão: {patronalSugerido.nome}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={vinculando}
                    onClick={() => vincularExistente(patronalSugerido.id, "patronal")}
                  >
                    Vincular à unidade
                  </Button>
                </div>
              ) : (
                <Select
                  value={undefined}
                  onValueChange={(v) => vincularExistente(v, "patronal")}
                  disabled={vinculando}
                >
                  <SelectTrigger><SelectValue placeholder="Vincular existente" /></SelectTrigger>
                  <SelectContent>
                    {patronais.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Nenhum sindicato patronal cadastrado
                      </div>
                    ) : (
                      patronais.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>
      </div>


      {!carregando && (!laboral || !patronal) && (
        <div className="flex flex-col gap-2 border-t border-border pt-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-amber-600 dark:text-amber-500">
            Sem sindicato o sistema não confere piso salarial, reajustes e contribuições da
            convenção. Você pode concluir o cadastro e definir isso depois.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1"
            onClick={() => setNovoOpen(true)}
            disabled={!cargoId && !unidadeId}
          >
            <Plus className="h-4 w-4" />
            Cadastrar sindicato
          </Button>
        </div>
      )}

      <SindicatoQuickFormDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        cargoId={cargoId}
        cargoNome={cargoNome}
        unidadeId={unidadeId || undefined}
        unidadeNome={unidadeNome}
        faltaLaboral={!laboral && !!cargoId}
        faltaPatronal={!patronal && !!unidadeId}
        onCreated={(s) => onChange(s.id)}
      />
    </div>
  );
}
