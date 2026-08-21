import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Store } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useUpsertDpUnidade, type DpUnidade } from "@/hooks/useDpCadastros";
import { supabase } from "@/integrations/supabase/client";
import { HorarioFuncionamentoEditor } from "@/components/dp/HorarioFuncionamentoEditor";

export const onlyNumbers = (v: string) => v.replace(/\D/g, "");

export const formatCNPJ = (value: string) => {
  const c = onlyNumbers(value);
  if (c.length <= 2) return c;
  if (c.length <= 5) return c.replace(/^(\d{2})(\d{0,3})/, "$1.$2");
  if (c.length <= 8) return c.replace(/^(\d{2})(\d{3})(\d{0,3})/, "$1.$2.$3");
  if (c.length <= 12) return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, "$1.$2.$3/$4");
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5");
};

const blank = {
  company_id: "",
  nome: "",
  cnpj: "",
  endereco: "",
  cidade: "",
  uf: "",
  ativo: true,
  telefone: "",
  possui_relogio_ponto: false,
  tem_adiantamento: false,
  dia_adiantamento: "" as string,
};

/** Unidade em edição — o mínimo que o formulário precisa para carregar. */
export interface UnidadeEdicao {
  id: string;
  company_id?: string | null;
  nome: string;
  cnpj?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  ativo: boolean;
  telefone?: string | null;
  possui_relogio_ponto?: boolean | null;
  tem_adiantamento?: boolean | null;
  dia_adiantamento?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando presente, o formulário abre em modo edição. */
  unidade?: UnidadeEdicao | null;
  /** Nome sugerido no cadastro (usado no atalho do colaborador). */
  nomeInicial?: string;
  /** Recebe a unidade salva — usado para selecioná-la de imediato. */
  onSaved?: (unidade: DpUnidade) => void;
  /** Abre direto numa aba (ex.: atalho "Funcionamento" do card da unidade). */
  abaInicial?: "dados" | "funcionamento";
}

/**
 * Cadastro de unidade reaproveitado pela tela de Unidades e pelo atalho
 * "Nova unidade" do cadastro do colaborador: a unidade nasce no mesmo lugar,
 * com as mesmas regras, venha de onde vier.
 */
export function UnidadeFormDialog({ open, onOpenChange, unidade = null, nomeInicial = "", onSaved, abaInicial = "dados" }: Props) {
  const { companies } = useCompanyContext();
  const upsert = useUpsertDpUnidade();
  const [form, setForm] = useState(blank);
  const [loadingBrasilApi, setLoadingBrasilApi] = useState(false);

  const applyCompanyData = async (companyId: string, force = false) => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("name, trade_name, cnpj, phone, whatsapp, cep, logradouro, numero, complemento, bairro, cidade, uf, address")
        .eq("id", companyId)
        .maybeSingle();
      if (error || !data) return;
      const enderecoMontado =
        [
          [data.logradouro, data.numero].filter(Boolean).join(", "),
          data.complemento,
          data.bairro,
          data.cep,
        ]
          .filter(Boolean)
          .join(" - ") || data.address || "";
      let cidade = data.cidade || "";
      let uf = data.uf || "";
      let endereco = enderecoMontado;
      let telefone = data.phone || data.whatsapp || "";

      // Fallback: se a empresa não tem cidade/UF estruturados, consulta CNPJ na BrasilAPI
      const cnpjDigits = onlyNumbers(data.cnpj || "");
      if ((!cidade || !uf) && cnpjDigits.length === 14) {
        setLoadingBrasilApi(true);
        try {
          const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`);
          if (res.ok) {
            const info: any = await res.json();
            if (!cidade) cidade = info.municipio || "";
            if (!uf) uf = info.uf || "";
            if (!endereco) {
              endereco = [
                [info.logradouro, info.numero].filter(Boolean).join(", "),
                info.complemento,
                info.bairro,
                info.cep,
              ].filter(Boolean).join(" - ");
            }
            if (!telefone) telefone = info.ddd_telefone_1 || "";
          }
        } catch { /* ignore */ }
        finally { setLoadingBrasilApi(false); }
      }

      setForm((prev) => ({
        ...prev,
        nome: force || !prev.nome ? (data.trade_name || data.name || prev.nome) : prev.nome,
        cnpj: force || !prev.cnpj ? cnpjDigits : prev.cnpj,
        endereco: force || !prev.endereco ? endereco : prev.endereco,
        cidade: force || !prev.cidade ? cidade : prev.cidade,
        uf: force || !prev.uf ? (uf || "").toUpperCase().slice(0, 2) : prev.uf,
        telefone: force || !prev.telefone ? telefone : prev.telefone,
      }));
    } catch {
      /* ignore */
    }
  };

  // Carrega o formulário sempre que o diálogo abre.
  const [criadaId, setCriadaId] = useState<string | null>(null);
  const [aba, setAba] = useState<"dados" | "funcionamento">(abaInicial);
  const salvarFuncionamento = useRef<(() => Promise<void>) | null>(null);
  const registrarSalvar = useCallback((fn: (() => Promise<void>) | null) => {
    salvarFuncionamento.current = fn;
  }, []);

  useEffect(() => {
    if (!open) return;
    setCriadaId(null);
    setAba(unidade ? abaInicial : "dados");
    if (unidade) {
      setForm({
        company_id: unidade.company_id ?? "",
        nome: unidade.nome,
        cnpj: unidade.cnpj ?? "",
        endereco: unidade.endereco ?? "",
        cidade: unidade.cidade ?? "",
        uf: unidade.uf ?? "",
        ativo: unidade.ativo,
        telefone: unidade.telefone ?? "",
        possui_relogio_ponto: unidade.possui_relogio_ponto ?? false,
        tem_adiantamento: unidade.tem_adiantamento ?? false,
        dia_adiantamento: unidade.dia_adiantamento != null ? String(unidade.dia_adiantamento) : "",
      });
      return;
    }
    // Nova unidade abre em branco: só a empresa é pré-selecionada quando há uma só.
    const only = companies.length === 1 ? companies[0].id : "";
    setForm({ ...blank, company_id: only, nome: nomeInicial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unidade?.id, nomeInicial]);

  const unidadeId = unidade?.id ?? criadaId;

  const save = async () => {
    if (!form.company_id) {
      toast.error("Selecione a empresa vinculada");
      return;
    }
    if (!form.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    try {
      const salva = await upsert.mutateAsync({
        id: unidadeId ?? undefined,
        company_id: form.company_id,
        nome: form.nome.trim(),
        cnpj: onlyNumbers(form.cnpj) || null,
        endereco: form.endereco.trim() || null,
        cidade: form.cidade.trim() || null,
        uf: form.uf.trim().toUpperCase() || null,
        ativo: form.ativo,
        telefone: form.telefone.trim() || null,
        possui_relogio_ponto: form.possui_relogio_ponto,
        tem_adiantamento: form.tem_adiantamento,
        dia_adiantamento: form.dia_adiantamento ? Number(form.dia_adiantamento) : null,
      } as Parameters<typeof upsert.mutateAsync>[0]);
      if (salvarFuncionamento.current) await salvarFuncionamento.current();
      onSaved?.(salva);
      if (unidade || criadaId) {
        toast.success("Unidade atualizada");
        onOpenChange(false);
        return;
      }
      // Nova unidade: mantém aberta para configurar o funcionamento da loja.
      setCriadaId(salva.id);
      setAba("funcionamento");
      toast.success("Unidade criada. Agora defina o horário de funcionamento (opcional).");
    } catch (e) {
      toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-w-2xl flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[92vh] sm:rounded-lg">
        <DialogHeader className="border-b p-4 text-left">
          <DialogTitle className="truncate">
            {unidade ? unidade.nome || "Editar unidade" : "Nova unidade"}
          </DialogTitle>
        </DialogHeader>
        <Tabs
          value={aba}
          onValueChange={(v) => setAba(v as "dados" | "funcionamento")}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="border-b px-4 pt-3">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dados" className="h-10">Dados</TabsTrigger>
              <TabsTrigger value="funcionamento" className="h-10">Funcionamento</TabsTrigger>
            </TabsList>
          </div>
        <TabsContent value="dados" className="mt-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-2">
            <Label>Empresa vinculada *</Label>
            {companies.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                Nenhuma empresa cadastrada.{" "}
                <Link to="/empresas" className="text-primary underline">
                  Cadastre em Minhas Empresas
                </Link>{" "}
                antes de criar unidades.
              </div>
            ) : (
              <Select
                value={form.company_id}
                onValueChange={(v) => setForm((prev) => ({ ...prev, company_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.trade_name || c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-[11px] text-muted-foreground">
              A cobrança do plano é por empresa. Uma empresa pode ter várias unidades sem custo extra.
            </p>
            {!unidade && form.company_id && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={loadingBrasilApi}
                onClick={() => void applyCompanyData(form.company_id, true)}
              >
                {loadingBrasilApi ? "Buscando..." : "Usar dados da empresa"}
              </Button>
            )}
          </div>
          <div className="space-y-2">
            <Label>Nome da Unidade *</Label>
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Unidade Garavelo"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              CNPJ
              {loadingBrasilApi && (
                <span className="inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Buscando dados na BrasilAPI...
                </span>
              )}
            </Label>
            <Input
              value={formatCNPJ(form.cnpj)}
              onChange={(e) => setForm({ ...form, cnpj: onlyNumbers(e.target.value) })}
              placeholder="00.000.000/0000-00"
              maxLength={18}
            />
          </div>
          <div className="space-y-2">
            <Label>Endereço</Label>
            <Input
              value={form.endereco}
              onChange={(e) => setForm({ ...form, endereco: e.target.value })}
              placeholder="Ex: R 9 A, SN"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="sm:col-span-2 space-y-2">
              <Label>Cidade</Label>
              <Input
                value={form.cidade}
                onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                placeholder="Ex: Aparecida de Goiânia"
              />
            </div>
            <div className="space-y-2">
              <Label>UF</Label>
              <Input
                value={form.uf}
                onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })}
                placeholder="GO"
                maxLength={2}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              placeholder="Ex: (62) 99999-9999"
            />
          </div>
          <div className="flex items-center space-x-2 rounded-xl border border-border p-3">
            <Switch
              id="possui_relogio_ponto"
              checked={form.possui_relogio_ponto}
              onCheckedChange={(v) => setForm({ ...form, possui_relogio_ponto: v })}
            />
            <Label htmlFor="possui_relogio_ponto">Possui relógio de ponto</Label>
          </div>
          <div className="flex items-center space-x-2 rounded-xl border border-border p-3">
            <Switch
              id="tem_adiantamento"
              checked={form.tem_adiantamento}
              onCheckedChange={(v) =>
                setForm({ ...form, tem_adiantamento: v, dia_adiantamento: v ? form.dia_adiantamento : "" })
              }
            />
            <Label htmlFor="tem_adiantamento">Tem adiantamento salarial</Label>
          </div>
          {form.tem_adiantamento && (
            <div className="space-y-2">
              <Label>Dia do Adiantamento</Label>
              <Select
                value={form.dia_adiantamento || ""}
                onValueChange={(v) => setForm({ ...form, dia_adiantamento: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o dia" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((dia) => (
                    <SelectItem key={dia} value={dia.toString()}>{dia}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </TabsContent>

        <TabsContent value="funcionamento" className="mt-0 flex-1 space-y-2 overflow-y-auto p-4">
          <Label className="flex items-center gap-1.5">
            <Store className="h-4 w-4" aria-hidden="true" />
            Horário de funcionamento da loja
          </Label>
          <HorarioFuncionamentoEditor unidadeId={unidadeId} semRodape onRegistrarSalvar={registrarSalvar} />
        </TabsContent>

        <TabsContent value="sindicato" className="mt-0 flex-1 overflow-y-auto p-4">
          <UnidadeSindicatoPanel unidadeId={unidadeId} unidadeNome={form.nome} />
        </TabsContent>
        </Tabs>
        <DialogFooter className="flex-col gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row">
          <Button variant="ghost" className="h-11 w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            {criadaId ? "Fechar" : "Cancelar"}
          </Button>
          <Button className="h-11 w-full sm:w-auto" onClick={save} disabled={upsert.isPending}>
            {upsert.isPending ? "Salvando..." : unidade || criadaId ? "Salvar" : "Cadastrar"}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
