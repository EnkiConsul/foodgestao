import { useState } from "react";
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

type Method = "PIX" | "BOLETO" | "CREDIT_CARD";

export default function Checkout() {
  const { planSlug } = useParams<{ planSlug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [coupon, setCoupon] = useState("");
  const [method, setMethod] = useState<Method>("PIX");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [phone, setPhone] = useState("");
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
      if (data?.document) setCpfCnpj(data.document);
      if (data?.phone) setPhone(data.phone);
      return data;
    },
  });

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
      const cleaned = cpfCnpj.replace(/\D/g, "");
      if (cleaned.length !== 11 && cleaned.length !== 14) {
        throw new Error("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido");
      }

      const { data, error } = await supabase.functions.invoke("asaas-create-checkout", {
        body: {
          planId: plan.id,
          paymentMethod: method,
          couponCode: validatedCoupon?.code,
          holder: { cpfCnpj: cleaned, phone },
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
    onError: (e: any) => toast.error(e.message ?? "Erro ao processar"),
  });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>;
  }

  if (!plan) {
    return <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <p>Plano não encontrado</p>
      <Button onClick={() => navigate("/planos")}>Ver planos</Button>
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
          <Button variant="ghost" onClick={() => navigate("/planos")}>Voltar</Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 md:py-10">
        <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Finalizar Assinatura</h1>

        <div className="grid md:grid-cols-2 gap-3 md:gap-4">
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
                <Label>CPF ou CNPJ *</Label>
                <Input
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(e.target.value)}
                  placeholder="Somente números"
                  inputMode="numeric"
                />
              </div>

              <div>
                <Label>Telefone</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                />
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
                disabled={subscribe.isPending}
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
