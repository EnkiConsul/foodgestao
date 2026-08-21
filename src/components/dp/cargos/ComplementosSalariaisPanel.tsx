import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Baby, Award, Moon, ShieldAlert, Plus, Trash2, Pencil, X } from "lucide-react";
import { DpContentCard } from "@/components/dp/DpPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDpAdicionaisTempoServico, type RegraTempoServicoInput } from "@/hooks/useDpAdicionaisTempoServico";
import { useDpSalarioFamiliaConfig } from "@/hooks/useDpSalarioFamiliaConfig";
import { SalarioFamiliaTabelaForm } from "@/components/dp/SalarioFamiliaTabelaDialog";
import { useDpUnidades, useDpCargos, useDpSindicatos } from "@/hooks/useDpCadastros";
import { moedaBR } from "@/lib/dp/cargos";
import {
  BASE_ADICIONAL_LABEL,
  ESCOPO_ADICIONAL_LABEL,
  MODO_ADICIONAL_LABEL,
  calcularAdicionalPorModo,
  rotuloCiclo,
  type ModoAdicional,
  type BaseAdicional,
  type EscopoAdicional,
  type RegraTempoServico,
} from "@/lib/dp/tempoServico";
import { tabelaSalarioFamiliaVencida } from "@/lib/dp/salarioFamilia";

const hoje = () => new Date().toISOString().slice(0, 10);

/** Salário fictício usado só na prévia do modo de cálculo. */
const BASE_PREVIA = 2000;
const ANOS_PREVIA = [3, 5, 9];

const REGRA_VAZIA: RegraTempoServicoInput = {
  nome: "Adicional por tempo de serviço",
  escopo: "empresa",
  sindicato_id: null,
  unidade_id: null,
  cargo_id: null,
  ciclo_meses: 36,
  percentual_por_ciclo: 3,
  base: "salario_base",
  max_ciclos: null,
  acumula: true,
  vigencia_inicio: hoje(),
  vigencia_fim: null,
  ativo: true,
  observacao: null,
};

const numero = (v: string): number => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function ComplementosSalariaisPanel({
  onEditarCargo,
}: {
  /** Abre a edição do cargo (aba Riscos) a partir dos cards de risco. */
  onEditarCargo?: (cargoId: string) => void;
}) {
  const { regras, isLoading, salvar, salvando, remover, removendo } = useDpAdicionaisTempoServico();
  const { config, salvar: salvarConfig, salvando: salvandoConfig } = useDpSalarioFamiliaConfig();
  const { data: unidades = [] } = useDpUnidades();
  const { data: cargos = [] } = useDpCargos();
  const { data: sindicatos = [] } = useDpSindicatos();

  const [form, setForm] = useState<RegraTempoServicoInput | null>(null);
  const navigate = useNavigate();

  /** Cargos com risco cadastrado — mesma fonte usada na ficha do colaborador. */
  const cargosRisco = useMemo(
    () =>
      (cargos as any[]).filter(
        (c) => Number(c.insalubridade_percentual ?? 0) > 0 || Number(c.periculosidade_percentual ?? 0) > 0,
      ),
    [cargos],
  );

  const complementosExtras: ReactNode = (
    <>
      {/* Insalubridade e periculosidade — percentual padrão do cargo */}
      <DpContentCard contentClassName="space-y-3 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Insalubridade e Periculosidade</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          O percentual é do cargo e vale para todos os colaboradores nele — o mesmo campo que aparece
          na remuneração da ficha, onde é possível abrir exceção para um colaborador.
        </p>
        {cargosRisco.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nenhum cargo com insalubridade ou periculosidade cadastrada.
          </p>
        ) : (
          <div className="space-y-2">
            {cargosRisco.map((c: any) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm"
              >
                <p className="min-w-0 flex-1 truncate font-medium uppercase">{c.nome}</p>
                {Number(c.insalubridade_percentual ?? 0) > 0 && (
                  <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400" variant="secondary">
                    Insalubridade {Number(c.insalubridade_percentual)}%
                  </Badge>
                )}
                {Number(c.periculosidade_percentual ?? 0) > 0 && (
                  <Badge variant="destructive">
                    Periculosidade {Number(c.periculosidade_percentual)}%
                  </Badge>
                )}
                {onEditarCargo && (
                  <Button size="icon" variant="ghost" onClick={() => onEditarCargo(c.id)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </DpContentCard>

      {/* Prêmio de assiduidade — mesmos campos da ficha do colaborador */}
      <DpContentCard contentClassName="space-y-3 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Prêmio de Assiduidade</h2>
            {!config.assiduidadeAtiva && <Badge variant="outline">Não utilizado</Badge>}
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="assid_ativa"
              checked={config.assiduidadeAtiva}
              onCheckedChange={(v) => void salvarConfig({ assiduidadeAtiva: v })}
            />
            <Label htmlFor="assid_ativa" className="cursor-pointer text-sm">
              Usar nesta empresa
            </Label>
          </div>
        </div>
        {config.assiduidadeAtiva ? (
          <>
            <p className="text-xs text-muted-foreground">
              Tipo, valor e critérios são os mesmos campos da remuneração da ficha — editar aqui
              muda o padrão da empresa, da unidade ou do cargo; a ficha continua podendo abrir
              exceção para um colaborador.
            </p>
            <div className="space-y-2">
              {escoposAssiduidade.map((e) => (
                <div
                  key={e.chave}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.rotulo}</p>
                    <p className="text-xs text-muted-foreground">{e.resumo}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" onClick={() => setAssiduidadeAberta(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar Regras
            </Button>
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Esta empresa não paga prêmio de assiduidade. Ligue a chave acima para configurar as
            regras.
          </p>
        )}
      </DpContentCard>


      {/* Adicional noturno */}
      <DpContentCard contentClassName="space-y-3 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Moon className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Adicional Noturno</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Mínimo legal de 20% sobre as horas entre 22h e 5h (ou o percentual da convenção). O
          sistema identifica essas horas pelo turno cadastrado, então o adicional é definido no
          horário de trabalho, não aqui.
        </p>
        <Button variant="outline" onClick={() => navigate("/dp/cadastros/cargos?aba=turnos")}>
          Abrir turnos
        </Button>
      </DpContentCard>
    </>
  );

  const laborais = useMemo(
    () => sindicatos.filter((s) => (s as { tipo?: string }).tipo === "laboral"),
    [sindicatos],
  );

  const vencida = tabelaSalarioFamiliaVencida({
    cota: config.cota,
    teto: config.teto,
    vigencia: config.vigencia,
    confirmadoEm: config.confirmadoEm,
  });

  // Prévia: como o modo escolhido se comporta em 3, 5 e 9 anos de casa.
  const previa = useMemo(() => {
    const ref = hoje();
    return ANOS_PREVIA.map((anos) => {
      const admissao = `${Number(ref.slice(0, 4)) - anos}${ref.slice(4)}`;
      const total = calcularAdicionalPorModo({
        regras,
        alvo: {},
        admissao,
        referencia: ref,
        base: BASE_PREVIA,
        pisoCargo: BASE_PREVIA,
        modo: config.adicionalModo,
      });
      return {
        anos,
        percentual: total.percentual,
        valor: total.valor,
        detalhe: total.itens.map((i) => rotuloCiclo(i.regra.ciclo_meses)).join(" + "),
      };
    });
  }, [regras, config.adicionalModo]);

  // Duas ou mais regras vigentes de empresa competindo entre si.
  const concorrentes = useMemo(
    () => regras.filter((r) => r.ativo && r.escopo === "empresa").length > 1,
    [regras],
  );

  const nomeEscopo = (r: RegraTempoServico): string => {
    if (r.escopo === "cargo") return cargos.find((c) => c.id === r.cargo_id)?.nome ?? "Cargo";
    if (r.escopo === "unidade") return unidades.find((u) => u.id === r.unidade_id)?.nome ?? "Unidade";
    if (r.escopo === "sindicato")
      return sindicatos.find((s) => s.id === r.sindicato_id)?.nome ?? "Sindicato";
    return "Toda a empresa";
  };

  const gravarRegra = async () => {
    if (!form) return;
    if (form.percentual_por_ciclo <= 0) {
      toast.error("Informe o percentual por ciclo");
      return;
    }
    if (form.escopo === "cargo" && !form.cargo_id) return toast.error("Selecione o cargo");
    if (form.escopo === "unidade" && !form.unidade_id) return toast.error("Selecione a unidade");
    if (form.escopo === "sindicato" && !form.sindicato_id)
      return toast.error("Selecione o sindicato laboral");
    try {
      await salvar(form);
      toast.success("Regra salva");
      setForm(null);
    } catch (e) {
      toast.error("Erro ao salvar regra", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };


  return (
    <div className="space-y-4">
      {/* Tabela anual do salário-família */}
      <DpContentCard contentClassName="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Baby className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Salário-Família</h2>
          {config.vigencia ? (
            <Badge variant={vencida ? "destructive" : "secondary"}>
              Vigência {config.vigencia.slice(0, 4)}
            </Badge>
          ) : (
            <Badge variant="destructive">Não configurado</Badge>
          )}
          <div className="ml-auto flex items-center gap-3">
            <Switch
              id="sf_ativo"
              checked={config.salarioFamiliaAtivo}
              onCheckedChange={(v) => void salvarConfig({ salarioFamiliaAtivo: v })}
            />
            <Label htmlFor="sf_ativo" className="cursor-pointer text-sm">
              Usar nesta empresa
            </Label>
          </div>
        </div>
        {config.salarioFamiliaAtivo && vencida && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            O INSS reajusta a cota e o teto todo ano. Confirme os valores do ano vigente para o
            sistema voltar a calcular o benefício na folha.
          </p>
        )}
        {config.salarioFamiliaAtivo ? (
          <SalarioFamiliaTabelaForm />
        ) : (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Esta empresa não paga salário-família. Ligue a chave acima para configurar a tabela.
          </p>
        )}

      </DpContentCard>

      {/* Regras de adicional */}
      <DpContentCard contentClassName="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Adicional por Tempo de Serviço</h2>
            <p className="text-xs text-muted-foreground">
              Anuênio, triênio ou quinquênio negociados em convenção — o sistema aplica o percentual
              conforme os meses completos de casa.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="adic_ativo"
              checked={config.adicionalAtivo}
              onCheckedChange={(v) => void salvarConfig({ adicionalAtivo: v })}
            />
            <Label htmlFor="adic_ativo" className="cursor-pointer text-sm">
              Usar nesta empresa
            </Label>
          </div>
        </div>

        {/* Como combinar regras concorrentes: escada (padrão) ou cumulativo */}
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-border p-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Quando há mais de uma regra para o mesmo colaborador</Label>
            <Select
              value={config.adicionalModo}
              onValueChange={(v) =>
                void salvarConfig({ adicionalModo: v as ModoAdicional }).then(() =>
                  toast.success("Modo de cálculo atualizado"),
                )
              }
              disabled={salvandoConfig}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MODO_ADICIONAL_LABEL) as ModoAdicional[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODO_ADICIONAL_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {config.adicionalModo === "cumulativo"
                ? "As regras somam: um colaborador com 9 anos recebe o triênio e o quinquênio."
                : "Vale o maior ciclo já alcançado: com 5 anos o quinquênio substitui o triênio."}
            </p>
          </div>
          <div className="space-y-1.5 rounded-lg border border-dashed border-border p-3 text-xs">
            <p className="font-medium text-foreground">Prévia sobre {moedaBR(BASE_PREVIA)}</p>
            {previa.map((p) => (
              <p key={p.anos} className="text-muted-foreground">
                {p.anos} ano(s) de casa: <span className="text-foreground">{p.percentual}%</span> ·{" "}
                {moedaBR(p.valor)}/mês
                {p.detalhe ? ` (${p.detalhe})` : ""}
              </p>
            ))}
            {concorrentes && (
              <p className="flex items-start gap-1.5 pt-1 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Há mais de uma regra vigente para o mesmo escopo — elas serão combinadas no modo{" "}
                {config.adicionalModo === "cumulativo" ? "cumulativo" : "escada"}.
              </p>
            )}
          </div>
        </div>


        <div className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando regras…</p>}
          {!isLoading && regras.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Nenhuma regra cadastrada.
            </p>
          )}
          {regras.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {ESCOPO_ADICIONAL_LABEL[r.escopo]} · {nomeEscopo(r)} · {rotuloCiclo(r.ciclo_meses)} ·{" "}
                  {r.percentual_por_ciclo}% por ciclo sobre {BASE_ADICIONAL_LABEL[r.base].toLowerCase()}
                  {r.max_ciclos ? ` · até ${r.max_ciclos} ciclos` : ""}
                  {r.acumula ? "" : " · não acumula"}
                </p>
              </div>
              <Badge variant={r.ativo ? "secondary" : "outline"}>{r.ativo ? "Ativa" : "Inativa"}</Badge>
              <Button size="icon" variant="ghost" onClick={() => setForm({ ...r })}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={removendo}
                onClick={() => void remover(r.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        {form ? (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{form.id ? "Editar regra" : "Nova regra"}</p>
              <Button size="icon" variant="ghost" onClick={() => setForm(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Nome da regra</Label>
                <Input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: Triênio CCT 2026"
                />
              </div>
              <div className="space-y-2">
                <Label>Aplicar a</Label>
                <Select
                  value={form.escopo}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      escopo: v as EscopoAdicional,
                      cargo_id: null,
                      unidade_id: null,
                      sindicato_id: null,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ESCOPO_ADICIONAL_LABEL) as EscopoAdicional[]).map((e) => (
                      <SelectItem key={e} value={e}>
                        {ESCOPO_ADICIONAL_LABEL[e]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.escopo === "cargo" && (
                <div className="space-y-2">
                  <Label>Cargo</Label>
                  <Select
                    value={form.cargo_id ?? ""}
                    onValueChange={(v) => setForm({ ...form, cargo_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {cargos.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.escopo === "unidade" && (
                <div className="space-y-2">
                  <Label>Unidade</Label>
                  <Select
                    value={form.unidade_id ?? ""}
                    onValueChange={(v) => setForm({ ...form, unidade_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {unidades.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.escopo === "sindicato" && (
                <div className="space-y-2">
                  <Label>Sindicato laboral</Label>
                  <Select
                    value={form.sindicato_id ?? ""}
                    onValueChange={(v) => setForm({ ...form, sindicato_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {laborais.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Ciclo (meses)</Label>
                <Select
                  value={String(form.ciclo_meses)}
                  onValueChange={(v) => setForm({ ...form, ciclo_meses: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[12, 24, 36, 48, 60].map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {rotuloCiclo(m)} ({m} meses)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Percentual por ciclo (%)</Label>
                <Input
                  value={String(form.percentual_por_ciclo)}
                  onChange={(e) =>
                    setForm({ ...form, percentual_por_ciclo: numero(e.target.value) })
                  }
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-2">
                <Label>Base de cálculo</Label>
                <Select
                  value={form.base}
                  onValueChange={(v) => setForm({ ...form, base: v as BaseAdicional })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(BASE_ADICIONAL_LABEL) as BaseAdicional[]).map((b) => (
                      <SelectItem key={b} value={b}>
                        {BASE_ADICIONAL_LABEL[b]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Limite de ciclos (opcional)</Label>
                <Input
                  value={form.max_ciclos != null ? String(form.max_ciclos) : ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      max_ciclos: e.target.value ? Math.trunc(numero(e.target.value)) : null,
                    })
                  }
                  inputMode="numeric"
                  placeholder="Sem limite"
                />
              </div>
              <div className="space-y-2">
                <Label>Vigência início</Label>
                <Input
                  type="date"
                  value={form.vigencia_inicio}
                  onChange={(e) => setForm({ ...form, vigencia_inicio: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Vigência fim (opcional)</Label>
                <Input
                  type="date"
                  value={form.vigencia_fim ?? ""}
                  onChange={(e) => setForm({ ...form, vigencia_fim: e.target.value || null })}
                />
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <Switch
                  id="acumula"
                  checked={form.acumula}
                  onCheckedChange={(v) => setForm({ ...form, acumula: v })}
                />
                <Label htmlFor="acumula" className="cursor-pointer text-sm">
                  Acumula a cada ciclo
                </Label>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <Switch
                  id="regra_ativa"
                  checked={form.ativo}
                  onCheckedChange={(v) => setForm({ ...form, ativo: v })}
                />
                <Label htmlFor="regra_ativa" className="cursor-pointer text-sm">
                  Regra ativa
                </Label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button onClick={() => void gravarRegra()} disabled={salvando}>
                Salvar regra
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setForm({ ...REGRA_VAZIA })}>
            <Plus className="mr-2 h-4 w-4" /> Nova regra
          </Button>
        )}
      </DpContentCard>

      {complementosExtras}
    </div>
  );
}
