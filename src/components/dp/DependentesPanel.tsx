import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Baby, Plus, Trash2, AlertTriangle, Pencil, X, Settings2 } from "lucide-react";
import { SalarioFamiliaTabelaDialog } from "@/components/dp/SalarioFamiliaTabelaDialog";
import { useCompanyPermissions } from "@/hooks/useCompanyPermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDpDependentes, type DependenteInput } from "@/hooks/useDpDependentes";
import { useDpSalarioFamiliaConfig } from "@/hooks/useDpSalarioFamiliaConfig";
import { moedaBR } from "@/lib/dp/cargos";
import {
  PARENTESCO_LABEL,
  alertasDependentes,
  calcularSalarioFamilia,
  dependenteElegivel,
  descreverTabelaSalarioFamilia,
  idadeEm,
  tabelaSalarioFamiliaVencida,
  type Dependente,
  type Parentesco,
} from "@/lib/dp/salarioFamilia";

const VAZIO: DependenteInput = {
  nome: "",
  data_nascimento: null,
  parentesco: "filho",
  cpf: null,
  deficiencia: false,
  laudo_validade: null,
  conta_irrf: true,
  conta_salario_familia: true,
  vacinacao_em: null,
  frequencia_escolar_em: null,
  cessado_em: null,
  observacao: null,
};

interface Props {
  colaboradorId: string | null | undefined;
  /** Remuneração mensal usada para o teste do teto de baixa renda. */
  remuneracaoMensal: number;
}

/**
 * Cadastro de dependentes do colaborador, com cálculo da cota do
 * salário-família e alertas de manutenção do benefício.
 */
export function DependentesPanel({ colaboradorId, remuneracaoMensal }: Props) {
  const { dependentes, isLoading, salvar, salvando, remover, removendo } =
    useDpDependentes(colaboradorId);
  const { config } = useDpSalarioFamiliaConfig();
  const [form, setForm] = useState<DependenteInput | null>(null);

  const calculo = useMemo(
    () =>
      calcularSalarioFamilia({
        dependentes,
        remuneracaoMensal,
        config: {
          cota: config.cota,
          teto: config.teto,
          vigencia: config.vigencia,
          confirmadoEm: config.confirmadoEm,
        },
      }),
    [dependentes, remuneracaoMensal, config],
  );

  const alertas = useMemo(() => alertasDependentes(dependentes), [dependentes]);
  const tabelaVencida = tabelaSalarioFamiliaVencida({
    cota: config.cota,
    teto: config.teto,
    vigencia: config.vigencia,
    confirmadoEm: config.confirmadoEm,
  });

  if (!colaboradorId) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Salve o colaborador para cadastrar os dependentes e apurar o salário-família.
      </div>
    );
  }

  const editar = (dep: Dependente) => setForm({ ...dep });

  const gravar = async () => {
    if (!form) return;
    if (!form.nome.trim()) {
      toast.error("Informe o nome do dependente");
      return;
    }
    if (!form.data_nascimento && !form.deficiencia) {
      toast.error("Informe a data de nascimento", {
        description: "Ela define até quando a cota do salário-família é devida.",
      });
      return;
    }
    try {
      await salvar(form);
      toast.success("Dependente salvo");
      setForm(null);
    } catch (e) {
      toast.error("Erro ao salvar dependente", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  const excluir = async (id: string) => {
    try {
      await remover(id);
      toast.success("Dependente removido");
    } catch (e) {
      toast.error("Erro ao remover", { description: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <div className="space-y-4">
      {/* Resumo do benefício */}
      <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <Baby className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">Salário-família</span>
          {calculo.valor > 0 ? (
            <Badge variant="secondary">
              {calculo.quantidade} cota(s) · {moedaBR(calculo.valor)}/mês
            </Badge>
          ) : (
            <Badge variant="outline">Sem valor no mês</Badge>
          )}
          {podeConfigurar && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto h-7"
              onClick={() => setTabelaAberta(true)}
            >
              <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Atualizar tabela
            </Button>
          )}
        </div>
        <p className="mt-1">{calculo.motivo}</p>
        <p className="mt-1">
          {descreverTabelaSalarioFamilia({
            cota: config.cota,
            teto: config.teto,
            vigencia: config.vigencia,
            confirmadoEm: config.confirmadoEm,
          })}
          {config.teto ? ` · Teto: ${moedaBR(config.teto)}` : ""}
          {config.cota ? ` · Cota: ${moedaBR(config.cota)}` : ""}
        </p>
        {tabelaVencida && (
          <div className="mt-2 flex flex-wrap items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p className="min-w-[12rem] flex-1">
              A tabela do salário-família é reajustada todo ano. Enquanto a cota e o teto do ano
              vigente não forem confirmados, o benefício não é calculado na folha.
              {!podeConfigurar && " Peça ao gestor da empresa para atualizar."}
            </p>
            {podeConfigurar && (
              <Button
                type="button"
                size="sm"
                className="h-7"
                onClick={() => setTabelaAberta(true)}
              >
                Configurar agora
              </Button>
            )}
          </div>
        )}
      </div>

      {podeConfigurar && (
        <SalarioFamiliaTabelaDialog open={tabelaAberta} onOpenChange={setTabelaAberta} />
      )}


      {alertas.length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <p className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" /> Documentos pendentes para manter o benefício
          </p>
          {alertas.map((a) => (
            <p key={`${a.dependenteId}-${a.tipo}`} className="text-muted-foreground">
              <span className="font-medium text-foreground">{a.nome}:</span> {a.titulo} — {a.descricao}
            </p>
          ))}
        </div>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando dependentes…</p>}
        {!isLoading && dependentes.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nenhum dependente cadastrado.
          </p>
        )}
        {dependentes.map((dep) => {
          const idade = idadeEm(dep.data_nascimento);
          return (
            <div
              key={dep.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{dep.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {PARENTESCO_LABEL[dep.parentesco]}
                  {idade != null ? ` · ${idade} anos` : ""}
                  {dep.deficiencia ? " · Pessoa com deficiência" : ""}
                  {dep.cessado_em ? ` · Cessado em ${dep.cessado_em}` : ""}
                </p>
              </div>
              {dep.conta_irrf && <Badge variant="outline">IRRF</Badge>}
              {dependenteElegivel(dep) && <Badge variant="secondary">Salário-família</Badge>}
              <Button type="button" size="icon" variant="ghost" onClick={() => editar(dep)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={removendo}
                onClick={() => void excluir(dep.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>

      {/* Formulário */}
      {form ? (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{form.id ? "Editar dependente" : "Novo dependente"}</p>
            <Button type="button" size="icon" variant="ghost" onClick={() => setForm(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Nome completo *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Maria Silva"
              />
            </div>
            <div className="space-y-2">
              <Label>Data de nascimento</Label>
              <Input
                type="date"
                value={form.data_nascimento ?? ""}
                onChange={(e) => setForm({ ...form, data_nascimento: e.target.value || null })}
              />
            </div>
            <div className="space-y-2">
              <Label>Parentesco</Label>
              <Select
                value={form.parentesco}
                onValueChange={(v) => setForm({ ...form, parentesco: v as Parentesco })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PARENTESCO_LABEL) as Parentesco[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PARENTESCO_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input
                value={form.cpf ?? ""}
                onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                placeholder="Somente números"
              />
            </div>
            <div className="space-y-2">
              <Label>Comprovação de vacinação</Label>
              <Input
                type="date"
                value={form.vacinacao_em ?? ""}
                onChange={(e) => setForm({ ...form, vacinacao_em: e.target.value || null })}
              />
            </div>
            <div className="space-y-2">
              <Label>Frequência escolar</Label>
              <Input
                type="date"
                value={form.frequencia_escolar_em ?? ""}
                onChange={(e) => setForm({ ...form, frequencia_escolar_em: e.target.value || null })}
              />
            </div>
            <div className="space-y-2">
              <Label>Cessado em</Label>
              <Input
                type="date"
                value={form.cessado_em ?? ""}
                onChange={(e) => setForm({ ...form, cessado_em: e.target.value || null })}
              />
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border p-3 md:col-span-2">
              <Switch
                id="dep_deficiencia"
                checked={form.deficiencia}
                onCheckedChange={(v) => setForm({ ...form, deficiencia: v })}
              />
              <Label htmlFor="dep_deficiencia" className="cursor-pointer text-sm">
                Pessoa com deficiência (cota devida em qualquer idade)
              </Label>
            </div>
            {form.deficiencia && (
              <div className="space-y-2">
                <Label>Validade do laudo</Label>
                <Input
                  type="date"
                  value={form.laudo_validade ?? ""}
                  onChange={(e) => setForm({ ...form, laudo_validade: e.target.value || null })}
                />
              </div>
            )}
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <Switch
                id="dep_irrf"
                checked={form.conta_irrf}
                onCheckedChange={(v) => setForm({ ...form, conta_irrf: v })}
              />
              <Label htmlFor="dep_irrf" className="cursor-pointer text-sm">
                Dedução do IRRF
              </Label>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <Switch
                id="dep_sf"
                checked={form.conta_salario_familia}
                onCheckedChange={(v) => setForm({ ...form, conta_salario_familia: v })}
              />
              <Label htmlFor="dep_sf" className="cursor-pointer text-sm">
                Considerar no salário-família
              </Label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void gravar()} disabled={salvando}>
              Salvar dependente
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setForm({ ...VAZIO })}>
          <Plus className="mr-2 h-4 w-4" /> Adicionar dependente
        </Button>
      )}
    </div>
  );
}
