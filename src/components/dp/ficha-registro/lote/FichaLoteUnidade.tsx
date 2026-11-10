import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, Plus, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UnidadeFormDialog } from "@/components/dp/UnidadeFormDialog";
import { SindicatoLaboralRapidoDialog } from "./SindicatoLaboralRapidoDialog";
import { useDpPatronalPorUnidade, useDpSindicatos } from "@/hooks/useDpCadastros";
import { formatCnpj } from "@/lib/dp/ficha-registro/unidade-match";

/** Data-base guardada como 2000-MM-DD: mostramos só dia/mês. */
function dataBaseBr(v: string | null | undefined): string | null {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(v ?? ""));
  return m ? `${m[2]}/${m[1]}` : null;
}

interface Props {
  unidades: Array<{ id: string; nome: string; cnpj?: string | null }>;
  unidadeId: string | null;
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
  unidades, unidadeId, onUnidade, sindicatoId, onSindicato, cnpjLido, empregadorLido, totalFichas, onContinuar,
}: Props) {
  const [novaUnidade, setNovaUnidade] = useState(false);
  const [novoSindicato, setNovoSindicato] = useState(false);
  const { data: sindicatos = [] } = useDpSindicatos();
  const { data: patronais = {} } = useDpPatronalPorUnidade();
  const laborais = sindicatos.filter((s) => s.tipo === "laboral" && s.ativo !== false);
  const sindicato = laborais.find((s) => s.id === sindicatoId) ?? null;
  const patronal = unidadeId ? patronais[unidadeId] ?? null : null;

  return (
    <Card>
      <CardContent className="space-y-5 p-4">
        <div>
          <p className="text-sm font-semibold">Onde essa equipe trabalha?</p>
          <p className="text-sm text-muted-foreground">
            {totalFichas} fichas neste arquivo
            {cnpjLido ? ` · CNPJ ${formatCnpj(cnpjLido)}` : ""}
            {empregadorLido ? ` · ${empregadorLido}` : ""}
          </p>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm"><Building2 className="h-4 w-4" /> Unidade</Label>
          {unidades.length > 0 ? (
            <Select value={unidadeId ?? undefined} onValueChange={(v) => onUnidade(v)}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Escolha a unidade" /></SelectTrigger>
              <SelectContent>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}{u.cnpj ? ` · ${formatCnpj(u.cnpj)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada ainda.</p>
          )}
          <Button type="button" variant="outline" size="sm" className="h-10 w-full sm:w-auto" onClick={() => setNovaUnidade(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Cadastrar unidade com os dados da ficha
          </Button>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm"><Scale className="h-4 w-4" /> Sindicato da categoria (laboral)</Label>
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
          <p className="text-xs text-muted-foreground">
            {sindicato
              ? `Os cargos deste lote ficam vinculados a ${sindicato.nome}${dataBaseBr(sindicato.data_base) ? `, com data-base em ${dataBaseBr(sindicato.data_base)}` : ""}. Cada restaurante pode alterar a data-base no cadastro do sindicato.`
              : "Sem sindicato agora, os cargos são criados do mesmo jeito e o vínculo pode ser feito depois."}
          </p>
          {unidadeId && (
            <p className="text-xs text-muted-foreground">
              {patronal
                ? `Sindicato patronal da unidade: ${patronal.nome}.`
                : "A unidade não tem sindicato patronal: o piso de cada cargo fica direto na unidade."}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Button type="button" variant="outline" size="sm" className="h-10 w-full sm:w-auto" onClick={() => setNovoSindicato(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Cadastrar sindicato aqui
            </Button>
            {sindicato && (
              <Button variant="link" size="sm" className="h-auto px-0" asChild>
                <Link to="/dp/cadastros/cargos?aba=sindicatos">Alterar data-base no cadastro</Link>
              </Button>
            )}
          </div>
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
          inicial={{ cnpj: cnpjLido ?? "" }}
          onSaved={(u) => onUnidade(u.id)}
        />
      )}
    </Card>
  );
}
