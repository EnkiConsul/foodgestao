import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TreePine, Loader2 } from "lucide-react";
import { formatCents } from "@/lib/billing";
import { toast } from "sonner";

export default function Checkout() {
  const { planSlug } = useParams<{ planSlug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [coupon, setCoupon] = useState("");
  const [method, setMethod] = useState<"pix" | "boleto" | "card">("pix");
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

  const validate = async () => {
    if (!coupon.trim()) return setValidatedCoupon(null);
    const { data } = await supabase
      .from("coupons").select("*")
      .eq("code", coupon.trim().toUpperCase())
      .eq("is_active", true)
      .maybeSingle();
    if (!data) {
      toast.error("Cupom inválido");
      setValidatedCoupon(null);
      return;
    }
    if (data.valid_until && new Date(data.valid_until) < new Date()) {
      toast.error("Cupom expirado");
      return;
    }
    if (data.max_redemptions && data.times_redeemed >= data.max_redemptions) {
      toast.error("Cupom esgotado");
      return;
    }
    setValidatedCoupon(data);
    toast.success("Cupom aplicado");
  };

  const subscribe = useMutation({
    mutationFn: async () => {
      if (!user || !plan) throw new Error("Não autenticado");

      // Cancel previous active subscription
      await supabase
        .from("subscriptions")
        .update({ status: "canceled", canceled_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .in("status", ["trialing", "active", "past_due", "pending"]);

      // Compute price with coupon
      let amount = plan.price_cents;
      let discount = 0;
      if (validatedCoupon) {
        if (validatedCoupon.discount_type === "percent") {
          discount = Math.round(amount * (validatedCoupon.discount_value / 100));
        } else {
          discount = Math.round(validatedCoupon.discount_value * 100);
        }
      }

      const trialDays = plan.trial_days || 0;
      const now = new Date();
      const periodEnd = new Date(now);
      if (plan.billing_period === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      else periodEnd.setMonth(periodEnd.getMonth() + 1);

      // Create subscription
      const { data: sub, error: subErr } = await supabase
        .from("subscriptions")
        .insert({
          user_id: user.id,
          plan_id: plan.id,
          status: trialDays > 0 ? "trialing" : (plan.price_cents === 0 ? "active" : "pending"),
          trial_ends_at: trialDays > 0 ? new Date(now.getTime() + trialDays * 86400_000).toISOString() : null,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
        })
        .select()
        .single();
      if (subErr) throw subErr;

      // Create invoice if paid plan
      if (plan.price_cents > 0) {
        const { error: invErr } = await supabase.from("invoices").insert({
          subscription_id: sub.id,
          user_id: user.id,
          amount_cents: amount,
          discount_cents: discount,
          status: "open",
          due_date: new Date(now.getTime() + 7 * 86400_000).toISOString().slice(0, 10),
          period_start: now.toISOString().slice(0, 10),
          period_end: periodEnd.toISOString().slice(0, 10),
          payment_method: method,
          coupon_id: validatedCoupon?.id ?? null,
        });
        if (invErr) throw invErr;

        if (validatedCoupon) {
          await supabase.from("coupon_redemptions").insert({
            coupon_id: validatedCoupon.id,
            user_id: user.id,
            subscription_id: sub.id,
          });
          await supabase
            .from("coupons")
            .update({ times_redeemed: validatedCoupon.times_redeemed + 1 })
            .eq("id", validatedCoupon.id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["current-subscription"] });
      toast.success(plan!.price_cents === 0 ? "Plano ativado!" : "Assinatura criada — aguardando pagamento");
      navigate("/");
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

  let amount = plan.price_cents;
  let discount = 0;
  if (validatedCoupon) {
    if (validatedCoupon.discount_type === "percent") {
      discount = Math.round(amount * (validatedCoupon.discount_value / 100));
    } else {
      discount = Math.round(validatedCoupon.discount_value * 100);
    }
  }
  const total = Math.max(0, amount - discount);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TreePine className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">Gestor <span className="text-primary">Plin</span></span>
          </div>
          <Button variant="ghost" onClick={() => navigate("/planos")}>Voltar</Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-6">Finalizar assinatura</h1>

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Pagamento</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Método</Label>
                <Select value={method} onValueChange={(v: any) => setMethod(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="card">Cartão de crédito</SelectItem>
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
                disabled={subscribe.isPending}
                onClick={() => subscribe.mutate()}
              >
                {subscribe.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar assinatura"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                A integração com gateway de pagamento será habilitada em breve.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
