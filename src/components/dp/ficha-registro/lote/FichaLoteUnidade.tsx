import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, CheckCircle2, MapPin, Pencil, Plus, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UnidadeFormDialog, type UnidadeEdicao } from "@/components/dp/UnidadeFormDialog";
import { SindicatoLaboralRapidoDialog } from "./SindicatoLaboralRapidoDialog";
import { useDpPatronalPorUnidade, useDpSindicatos, useDpUnidades } from "@/hooks/useDpCadastros";
import { formatCnpj } from "@/lib/dp/ficha-registro/unidade-match";
import { cn } from "@/lib/utils";

/** Data-base guardada como 2000-MM-DD: mostramos só dia/mês. */
function dataBaseBr(v: string | null | undefined): string | null {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(v ?? ""));
  return m ? `${m[2]}/${m[1]}` : null;
}

interface Props {
  companyId: string | null;
  unidades: Array<{ id: string; nome: string; cnpj?: string | null }>;
  unidadeId: string | null;
  /** A unidade escolhida é a do CNPJ lido na ficha. */
  identificadaPeloCnpj: boolean;
  onUnidade: (id: string | null) => void;
  sindicatoId: string | null;
  onSindicato: (id: string | null) => void;
  cnpjLido: string | null;
  empregadorLido: string | null;
  totalFichas: number;
  onContinuar: () => void;
}

/** Etapa 1: onde a equipe trabalha e qual convenção vale, antes de olhar as pessoas. */
export function FichaLoteUnidade({
  companyId, unidades, unidadeId, identificadaPeloCnpj, onUnidade, sindicatoId, onSindicato,
  cnpjLido, empregadorLido, totalFichas, onContinuar,
}: Props) {
  const [novaUnidade, setNovaUnidade] = useState(false);
  const [editarUnidade, setEditarUnidade] = useState(false);
  const [trocarUnidade, setTrocarUnidade] = useState(false);
  const [novoSindicato, setNovoSindicato] = useState(false);
  const { data: sindicatos = [] } = useDpSindicatos();
  const { data: patronais = {} } = useDpPatronalPorUnidade();
  const { data: unidadesCompletas = [] } = useDpUnidades();
  const laborais = sindicatos.filter((s) => s.tipo === "laboral" && s.ativo !== false);
  const sindicato = laborais.find((s) => s.id === sindicatoId) ?? null;
  const patronal = unidadeId ? patronais[unidadeId] ?? null : null;
  const unidade = useMemo(
    () => (unidadeId ? (unidadesCompletas.find((u) => u.id === unidadeId) as unknown as UnidadeEdicao | undefined) ?? null : null),
    [unidadesCompletas, unidadeId],
  );
  const local = unidade ? [unidade.cidade, unidade.uf].filter(Boolean).join(" - ") : "";
  const mostrarSeletor = !unidadeId || trocarUnidade;

  return (
    <Card>
      <CardContent className="space-y-5 p-4">
        <p className="text-sm text-muted-foreground">
          {totalFichas} fichas{empregadorLido ? ` de ${empregadorLido}` : ""}
          {cnpjLido ? ` · CNPJ ${formatCnpj(cnpjLido)}` : ""}
        </p>

        {/* Unidade */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm"><Building2 className="h-4 w-4" /> Unidade</Label>
          {unidadeId && !trocarUnidade && (
            <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{unidade?.nome ?? unidades.find((u) => u.id === unidadeId)?.nome}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  {local && <><MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{local}</span></>}
                  {identificadaPeloCnpj && <span className="shrink-0">{local ? " · " : ""}identificada pelo CNPJ</span>}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                {unidade && (
                  <Button type="button" variant="ghost" size="sm" className="h-9 px-2" onClick={() => setEditarUnidade(true)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                  </Button>
                )}
                {unidades.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" className="h-9 px-2" onClick={() => setTrocarUnidade(true)}>
                    Trocar
                  </Button>
                )}
              </div>
            </div>
          )}
          {mostrarSeletor && unidades.length > 0 && (
            <Select
              value={unidadeId ?? undefined}
              onValueChange={(v) => { onUnidade(v); setTrocarUnidade(false); }}
            >
              <SelectTrigger className="h-11"><SelectValue placeholder="Escolha a unidade" /></SelectTrigger>
              <SelectContent>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}{u.cnpj ? ` · ${formatCnpj(u.cnpj)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(!unidadeId || trocarUnidade) && (
            <Button
              type="button"
              variant={unidades.length === 0 ? "default" : "outline"}
              size="sm"
              className="h-10 w-full sm:w-auto"
              onClick={() => setNovaUnidade(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Cadastrar unidade com os dados da ficha
            </Button>
          )}
        </div>

        {/* Sindicato */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm"><Scale className="h-4 w-4" /> Sindicato da categoria</Label>
          {laborais.length > 0 ? (
            <Select value={sindicatoId ?? "__none"} onValueChange={(v) => onSindicato(v === "__none" ? null : v)}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Escolha o sindicato" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Definir depois</SelectItem>
                {laborais.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}{dataBaseBr(s.data_base) ? ` · data-base ${dataBaseBr(s.data_base)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Sindicato da categoria">
              <button
                type="button"
                role="radio"
                aria-checked={!sindicatoId}
                onClick={() => onSindicato(null)}
                className={cn(
                  "rounded-lg border p-3 text-left text-sm transition-colors",
                  !sindicatoId ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                )}
              >
                <span className="font-medium">Definir depois</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Os cargos são criados do mesmo jeito. A convenção pode ser vinculada quando a empresa tiver.
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={false}
                onClick={() => setNovoSindicato(true)}
                className="rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted/50"
              >
                <span className="font-medium">Cadastrar agora</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Só o nome e a data-base (dia/mês).</span>
              </button>
            </div>
          )}
          {sindicato ? (
            <p className="text-xs text-muted-foreground">
              Data-base {dataBaseBr(sindicato.data_base) ?? "não informada"}.{" "}
              <Link to="/dp/cadastros/cargos?aba=sindicatos" className="underline underline-offset-2">Alterar no cadastro</Link>
            </p>
          ) : laborais.length > 0 ? (
            <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => setNovoSindicato(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Cadastrar outro sindicato
            </Button>
          ) : null}
          {unidadeId && !patronal && (
            <p className="text-xs text-muted-foreground">O piso de cada cargo fica direto na unidade.</p>
          )}
        </div>

        <Button className="h-11 w-full sm:w-auto" disabled={!unidadeId} onClick={onContinuar}>
          Continuar para cargos e setores <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </CardContent>

      {novoSindicato && (
        <SindicatoLaboralRapidoDialog
          open={novoSindicato}
          onOpenChange={setNovoSindicato}
          onCreated={(id) => onSindicato(id)}
        />
      )}

      {novaUnidade && (
        <UnidadeFormDialog
          open={novaUnidade}
          onOpenChange={setNovaUnidade}
          nomeInicial={(empregadorLido ?? "").toUpperCase()}
          inicial={{ cnpj: cnpjLido ?? "", ...(companyId ? { company_id: companyId } : {}) }}
          onSaved={(u) => { onUnidade(u.id); setTrocarUnidade(false); }}
        />
      )}

      {editarUnidade && unidade && (
        <UnidadeFormDialog open={editarUnidade} onOpenChange={setEditarUnidade} unidade={unidade} />
      )}
    </Card>
  );
}
