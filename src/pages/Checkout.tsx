import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { formatCents } from "@/lib/billing";
import { toast } from "sonner";
import { notifyError } from "@/lib/notifyError";
import { EnderecoFields, type EnderecoValor } from "@/components/shared/EnderecoFields";
import { maskCnpj, isValidCnpj } from "@/lib/cnpj";

type Method = "PIX" | "BOLETO" | "CREDIT_CARD";

export default function Checkout() {
  const { planSlug } = useParams<{ planSlug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [coupon, setCoupon] = useState("");
  const [method, setMethod] = useState<Method>("PIX");
  const [phone, setPhone] = useState("");
  const [companyId, setCompanyId] = useState<string>("");
  const [razao, setRazao] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [endereco, setEndereco] = useState<EnderecoValor>({});
  const [validatedCoupon, setValidatedCoupon] = useState<any | null>(null);

  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan-by-slug", planSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans").select("*").eq("slug", planSlug!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!planSlug,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile-checkout", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles")
        .select("document, phone, full_name").eq("user_id", user!.id).maybeSingle();
      if (data?.phone) setPhone((p) => p || data.phone);
      return data;
    },
  });

  const { idsContratacao } = useAssinaturaAcesso();

  const { data: empresas = [] } = useQuery({
    queryKey: ["checkout-empresas", user?.id, idsContratacao.join(",")],
    enabled: !!user?.id && idsContratacao.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies")
        .select("id, name, trade_name, cnpj, email, phone, cep, logradouro, numero, complemento, bairro, cidade, uf")
        .in("id", idsContratacao).eq("is_active", true).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!companyId && empresas.length === 1) setCompanyId(empresas[0].id);
  }, [empresas, companyId]);

  useEffect(() => {
    const e = empresas.find((x) => x.id === companyId);
    if (!e) return;
    setRazao((e.name ?? "").toLocaleUpperCase("pt-BR"));
    setCnpj(e.cnpj ? maskCnpj(e.cnpj) : "");
    setEmail(e.email ?? user?.email ?? "");
    if (e.phone) setPhone(e.phone);
    setEndereco({
      cep: e.cep, logradouro: e.logradouro, numero: e.numero, complemento: e.complemento,
      bairro: e.bairro, cidade: e.cidade, uf: e.uf,
    });
  }, [companyId, empresas, user?.email]);

  const empresaSel = empresas.find((x) => x.id === companyId);
  const cnpjTravado = !!empresaSel?.cnpj;

  const validate = async () => {
    if (!coupon.trim()) return setValidatedCoupon(null);
    const { data, error } = await supabase.functions.invoke("validate-coupon", {
      body: { code: coupon.trim(), planId: plan?.id },
    });
    if (error) {
      toast.error("Erro ao validar cupom");
      setValidatedCoupon(null);
      return;
    }
    if (!data?.valid) {
      const reasons: Record<string, string> = {
        not_found: "Cupom inválido",
        expired: "Cupom expirado",
        exhausted: "Cupom esgotado",
        plan_not_eligible: "Cupom não aplicável a este plano",
      };
      toast.error(reasons[data?.reason] ?? "Cupom inválido");
      setValidatedCoupon(null);
      return;
    }
    setValidatedCoupon(data.coupon);
    toast.success("Cupom aplicado");
  };

  const subscribe = useMutation({
    mutationFn: async () => {
      if (!user || !plan) throw new Error("Não autenticado");
      if (!companyId) throw new Error("Escolha a empresa para emissão da nota fiscal");
      const cleaned = cnpj.replace(/\D/g, "");
      if (!isValidCnpj(cleaned)) throw new Error("Informe um CNPJ válido");
      if (!razao.trim()) throw new Error("Informe a Razão Social");
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error("Informe um e-mail válido para a nota fiscal");
      const faltam = (["cep", "logradouro", "numero", "bairro", "cidade", "uf"] as const)
        .filter((k) => !String(endereco[k] ?? "").trim());
      if (faltam.length) throw new Error("Complete o endereço fiscal da empresa");

      const { data, error } = await supabase.functions.invoke("asaas-create-checkout", {
        body: {
          planId: plan.id,
          paymentMethod: method,
          couponCode: validatedCoupon?.code,
          companyId,
          fiscal: {
            razaoSocial: razao, cnpj: cleaned, email: email.trim(), phone,
            cep: endereco.cep, logradouro: endereco.logradouro, numero: endereco.numero,
            complemento: endereco.complemento, bairro: endereco.bairro,
            cidade: endereco.cidade, uf: endereco.uf,
          },
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.free) {
        toast.success("Plano ativado!");
        navigate("/");
        return;
      }
      toast.success("Cobrança criada — finalize o pagamento");
      navigate(`/checkout/pagamento/${data.invoiceId}`);
    },
    onError: (e: any) => notifyError(e, { surface: "Assinatura", action: "concluir a ação", fallback: "Erro ao processar" }),
  });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>;
  }

  if (!plan) {
    return <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <p>Plano não encontrado</p>
      <Button onClick={() => navigate("/")}>Voltar ao início</Button>
    </div>;
  }

  const amount = plan.price_cents;
  let discount = 0;
  if (validatedCoupon) {
    if (validatedCoupon.discount_type === "percent") {
      discount = Math.round(amount * (Number(validatedCoupon.discount_value) / 100));
    } else {
      discount = Math.round(Number(validatedCoupon.discount_value) * 100);
    }
  }
  const total = Math.max(0, amount - discount);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo size="sm" linkTo="/" />
          <Button variant="ghost" onClick={() => navigate("/")}>Voltar</Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 md:py-10">
        <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Finalizar Assinatura</h1>

        <div className="grid md:grid-cols-2 gap-3 md:gap-4">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Dados Para Emissão Da Nota Fiscal</CardTitle>
              <p className="text-sm text-muted-foreground">
                A nota fiscal de cada mensalidade será emitida em nome desta empresa.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {empresas.length === 0 ? (
                <p className="text-sm text-destructive">
                  Cadastre uma empresa antes de assinar.
                </p>
              ) : (
                <div className="space-y-1">
                  <Label htmlFor="ck-empresa">Empresa tomadora *</Label>
                  <Select value={companyId} onValueChange={setCompanyId}>
                    <SelectTrigger id="ck-empresa" className="h-11">
                      <SelectValue placeholder={empresas.length > 1 ? "Escolha por qual empresa emitir a nota" : "Escolher"} />
                    </SelectTrigger>
                    <SelectContent>
                      {empresas.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.trade_name || e.name}{e.cnpj ? ` — ${maskCnpj(e.cnpj)}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {empresas.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Você tem {empresas.length} empresas. Escolha em nome de qual a nota fiscal será emitida.
                    </p>
                  )}
                </div>
              )}

              {companyId && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="ck-razao" className="text-xs">Razão Social *</Label>
                      <Input id="ck-razao" className="h-11" value={razao}
                        onChange={(e) => setRazao(e.target.value.toLocaleUpperCase("pt-BR"))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ck-cnpj" className="text-xs">CNPJ *</Label>
                      <Input id="ck-cnpj" className="h-11" inputMode="numeric" value={cnpj}
                        disabled={cnpjTravado} maxLength={18}
                        onChange={(e) => setCnpj(maskCnpj(e.target.value))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ck-email" className="text-xs">E-mail para receber a nota *</Label>
                      <Input id="ck-email" type="email" className="h-11" value={email}
                        onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ck-fone" className="text-xs">Telefone</Label>
                      <Input id="ck-fone" className="h-11" value={phone}
                        onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
                    </div>
                  </div>
                  <EnderecoFields
                    idPrefix="ck-end"
                    upper
                    valor={endereco}
                    onChange={(p) => setEndereco((v) => ({ ...v, ...p }))}
                    obrigatorios={["cep", "logradouro", "numero", "bairro", "cidade", "uf"]}
                  />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Pagamento</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Método</Label>
                <Select value={method} onValueChange={(v: Method) => setMethod(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PIX">Pix</SelectItem>
                    <SelectItem value="BOLETO">Boleto</SelectItem>
                    <SelectItem value="CREDIT_CARD">Cartão de crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Cupom de desconto</Label>
                <div className="flex gap-2">
                  <Input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="OPCIONAL" />
                  <Button variant="outline" onClick={validate}>Aplicar</Button>
                </div>
                {validatedCoupon && (
                  <p className="text-xs text-emerald-600 mt-1">Desconto aplicado!</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Resumo</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between"><span>{plan.name}</span><span>{formatCents(amount)}</span></div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-600"><span>Desconto</span><span>−{formatCents(discount)}</span></div>
              )}
              <div className="flex justify-between border-t pt-3 font-bold">
                <span>Total</span><span>{formatCents(total)}</span>
              </div>
              {plan.trial_days > 0 && (
                <p className="text-xs text-muted-foreground">
                  Você tem {plan.trial_days} dias de trial — só será cobrado depois.
                </p>
              )}
              <Button
                className="w-full"
                disabled={subscribe.isPending || !companyId}
                onClick={() => subscribe.mutate()}
              >
                {subscribe.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gerar cobrança"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Processado com segurança pelo Asaas.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
