import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { AlertTriangle, Baby, CalendarClock, Check, Plus, Trash2, Pencil, X } from "lucide-react";
import { DpPage, DpPageHeader, DpContentCard } from "@/components/dp/DpPage";
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
import { useDpUnidades, useDpCargos, useDpSindicatos } from "@/hooks/useDpCadastros";
import { moedaBR } from "@/lib/dp/cargos";
import {
  BASE_ADICIONAL_LABEL,
  ESCOPO_ADICIONAL_LABEL,
  rotuloCiclo,
  type BaseAdicional,
  type EscopoAdicional,
  type RegraTempoServico,
} from "@/lib/dp/tempoServico";
import { tabelaSalarioFamiliaVencida } from "@/lib/dp/salarioFamilia";

const hoje = () => new Date().toISOString().slice(0, 10);

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

export default function DpAdicionaisTempoServico() {
  const { regras, isLoading, salvar, salvando, remover, removendo } = useDpAdicionaisTempoServico();
  const { config, salvar: salvarConfig, salvando: salvandoConfig } = useDpSalarioFamiliaConfig();
  const { data: unidades = [] } = useDpUnidades();
  const { data: cargos = [] } = useDpCargos();
  const { data: sindicatos = [] } = useDpSindicatos();

  const [form, setForm] = useState<RegraTempoServicoInput | null>(null);
  const [cota, setCota] = useState<string>("");
  const [teto, setTeto] = useState<string>("");
  const [ano, setAno] = useState<string>(String(new Date().getFullYear()));

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

  const gravarTabela = async () => {
    const c = numero(cota || String(config.cota ?? 0));
    const t = numero(teto || String(config.teto ?? 0));
    if (c <= 0 || t <= 0) {
      toast.error("Informe a cota e o teto do salário-família");
      return;
    }
    try {
      await salvarConfig({
        cota: c,
        teto: t,
        vigencia: `${ano}-01-01`,
        confirmar: true,
      });
      toast.success("Tabela do salário-família atualizada");
      setCota("");
      setTeto("");
    } catch (e) {
      toast.error("Erro ao salvar tabela", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  return (
    <DpPage>
      <Helmet>
        <title>Adicionais e salário-família | Pessoas 360°</title>
        <meta
          name="description"
          content="Configure adicionais por tempo de serviço (anuênio, triênio, quinquênio) e a tabela anual do salário-família."
        />
      </Helmet>

      <DpPageHeader
        icon={CalendarClock}
        title="Adicionais e salário-família"
        description="Regras de adicional por tempo de casa e a tabela anual do salário-família."
      />

      {/* Tabela anual do salário-família */}
      <DpContentCard contentClassName="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Baby className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Salário-família</h2>
          {config.vigencia ? (
            <Badge variant={vencida ? "destructive" : "secondary"}>
              Vigência {config.vigencia.slice(0, 4)}
            </Badge>
          ) : (
            <Badge variant="destructive">Não configurado</Badge>
          )}
        </div>
        {vencida && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            O INSS reajusta a cota e o teto todo ano. Confirme os valores do ano vigente para o
            sistema voltar a calcular o benefício na folha.
          </p>
        )}
        <SalarioFamiliaTabelaForm />

      </DpContentCard>

      {/* Regras de adicional */}
      <DpContentCard contentClassName="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Adicional por tempo de serviço</h2>
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
              Aplicar na folha
            </Label>
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
    </DpPage>
  );
}
