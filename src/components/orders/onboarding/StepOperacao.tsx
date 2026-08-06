import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { useSaveOrdersUnitIdentity, type OrdersUnit } from "@/hooks/useOrdersUnits";
import {
  TIMEZONES,
  composeCompanyAddress,
  timezoneForUf,
  validateUnitIdentity,
} from "@/lib/orders/units";
import { StepErrors } from "@/components/orders/onboarding/StepErrors";
import { HelpHint } from "@/components/common/HelpHint";


const HELP = {
  nome: "Nome usado para identificar esta unidade em relatórios e telas do módulo.",
  codigo: "Código próprio para identificar a unidade internamente, ex.: LOJA-01.",
  telefone: "Telefone de contato da unidade, exibido em documentos e integrações.",
  endereco: "Endereço completo da unidade, usado em entregas e no cardápio.",
  cidade: "Cidade onde a unidade está localizada.",
  uf: "Estado (sigla) onde a unidade está localizada, ex.: GO.",
  timezone: "Fuso horário usado para calcular os horários de funcionamento da unidade.",
} as const;

interface Props {
  unit: OrdersUnit | null;
  onSaved: (unitId: string) => void;
}

export function StepOperacao({ unit, onSaved }: Props) {
  const { user } = useAuth();
  const { companies, selectedCompanyId } = useCompanyContext();
  const company = companies.find((c) => c.id === selectedCompanyId);
  const save = useSaveOrdersUnitIdentity();

  const { data: companyDetails } = useQuery({
    queryKey: ["orders-onboarding-company", selectedCompanyId],
    enabled: Boolean(selectedCompanyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select(
          "id, name, trade_name, phone, whatsapp, address, cep, logradouro, numero, complemento, bairro, cidade, uf",
        )
        .eq("id", selectedCompanyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [timezone, setTimezone] = useState<string>(TIMEZONES[0]);
  const [errors, setErrors] = useState<string[]>([]);

  const companyDefaults = useMemo(() => {
    if (!companyDetails) return null;
    return {
      nome: (companyDetails.trade_name || companyDetails.name || "").trim(),
      telefone: (companyDetails.phone || companyDetails.whatsapp || "").trim(),
      endereco: composeCompanyAddress(companyDetails),
      cidade: (companyDetails.cidade || "").trim(),
      uf: (companyDetails.uf || "").trim().toUpperCase(),
      timezone: timezoneForUf(companyDetails.uf),
    };
  }, [companyDetails]);

  const applyCompanyDefaults = useCallback(() => {
    if (!companyDefaults) return;
    setNome(companyDefaults.nome);
    setTelefone(companyDefaults.telefone);
    setEndereco(companyDefaults.endereco);
    setCidade(companyDefaults.cidade);
    setUf(companyDefaults.uf);
    setTimezone(companyDefaults.timezone);
  }, [companyDefaults]);

  useEffect(() => {
    // Dados já salvos na unidade sempre prevalecem; o cadastro da empresa
    // só preenche o que ainda está vazio.
    setNome(unit?.nome ?? companyDefaults?.nome ?? company?.name ?? "");
    setCodigo(unit?.codigo_interno ?? "");
    setTelefone(unit?.telefone ?? companyDefaults?.telefone ?? "");
    setEndereco(unit?.endereco ?? companyDefaults?.endereco ?? "");
    setCidade(unit?.cidade ?? companyDefaults?.cidade ?? "");
    setUf(unit?.uf ?? companyDefaults?.uf ?? "");
    setTimezone(unit?.timezone ?? companyDefaults?.timezone ?? TIMEZONES[0]);
  }, [unit, company?.name, companyDefaults]);

  const prefilled = Boolean(
    !unit &&
      companyDefaults &&
      (companyDefaults.telefone || companyDefaults.endereco || companyDefaults.cidade),
  );
  const readyToAdvance = Boolean(nome.trim() && timezone);

  const responsavel = useMemo(
    () => unit?.responsible_user_id ?? user?.id ?? null,
    [unit?.responsible_user_id, user?.id],
  );

  const submit = () => {
    const found = validateUnitIdentity({ nome, timezone, codigo_interno: codigo, uf });
    setErrors(found);
    if (found.length > 0) return;
    save.mutate(
      {
        unitId: unit?.id,
        nome: nome.trim(),
        codigo_interno: codigo.trim() || null,
        telefone: telefone.trim() || null,
        endereco: endereco.trim() || null,
        cidade: cidade.trim() || null,
        uf: uf.trim().toUpperCase() || null,
        timezone,
        responsible_user_id: responsavel,
      },
      { onSuccess: (res) => res?.unit_id && onSaved(res.unit_id) },
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        <p>
          Empresa: <strong className="text-foreground">{company?.name ?? "—"}</strong>
        </p>

        <p className="mt-1">
          Responsável pela unidade: <strong className="text-foreground">você</strong> (
          {user?.email ?? "usuário atual"}).
        </p>
        {prefilled && (
          <p className="mt-2 text-foreground">
            Preenchemos os campos abaixo com os dados da sua empresa — confira e ajuste se
            precisar.
          </p>
        )}
        {companyDefaults && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={applyCompanyDefaults}
          >
            <Building2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Usar dados da empresa
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="unit-nome" className="flex items-center gap-1.5">
            Nome da unidade <span className="text-destructive">*</span>
            <HelpHint text={HELP.nome} />
          </Label>
          <Input
            id="unit-nome"
            value={nome}
            maxLength={120}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Matriz — Centro"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit-codigo" className="flex items-center gap-1.5">
            Código interno (opcional) <HelpHint text={HELP.codigo} />
          </Label>
          <Input id="unit-codigo" value={codigo} maxLength={30} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex.: LOJA-01" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit-telefone" className="flex items-center gap-1.5">
            Telefone (opcional) <HelpHint text={HELP.telefone} />
          </Label>
          <Input id="unit-telefone" value={telefone} maxLength={20} onChange={(e) => setTelefone(e.target.value)} placeholder="(62) 99999-0000" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="unit-endereco" className="flex items-center gap-1.5">
            Endereço (opcional) <HelpHint text={HELP.endereco} />
          </Label>
          <Input id="unit-endereco" value={endereco} maxLength={200} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, bairro" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit-cidade" className="flex items-center gap-1.5">
            Cidade (opcional) <HelpHint text={HELP.cidade} />
          </Label>
          <Input id="unit-cidade" value={cidade} maxLength={80} onChange={(e) => setCidade(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit-uf" className="flex items-center gap-1.5">
            UF (opcional) <HelpHint text={HELP.uf} />
          </Label>
          <Input id="unit-uf" value={uf} maxLength={2} onChange={(e) => setUf(e.target.value.toUpperCase())} placeholder="GO" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="flex items-center gap-1.5">
            Fuso horário da unidade <span className="text-destructive">*</span>
            <HelpHint text={HELP.timezone} />
          </Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz.replace("America/", "").replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Os horários de funcionamento seguem este fuso, independente do fuso do dispositivo.
          </p>
        </div>
      </div>

      <StepErrors errors={errors} />

      <Button onClick={submit} disabled={save.isPending} className="min-h-11 w-full sm:w-auto">
        {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        {prefilled && readyToAdvance ? "Salvar e ir para configuração" : "Salvar e continuar"}
      </Button>
    </div>
  );
}
