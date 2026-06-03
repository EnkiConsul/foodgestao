import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { createElement } from "react";
import { markFresh } from "@/hooks/useBillingFreshness";

/**
 * Global listener: detects when one of the user's invoices is marked as paid
 * or their subscription becomes active, and surfaces a confirmation in the UI.
 */
export function useBillingRealtime() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const notified = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`billing-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "invoices",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const next = payload.new as any;
          const prev = payload.old as any;
          if (next?.status === "paid" && prev?.status !== "paid") {
            const key = `inv-${next.id}`;
            if (notified.current.has(key)) return;
            notified.current.add(key);
            toast.success("Pagamento confirmado!", {
              description: "Sua fatura foi quitada e a assinatura está ativa.",
              icon: createElement(CheckCircle2, { className: "h-4 w-4" }),
              duration: 8000,
            });
            qc.invalidateQueries({ queryKey: ["my-invoices"] });
            qc.invalidateQueries({ queryKey: ["current-subscription"] });
            qc.invalidateQueries({ queryKey: ["company-quota"] });
            qc.invalidateQueries({ queryKey: ["checkout-invoice", next.id] });
          }
          // Always refresh invoice list on any change (recurring invoice created, value updated, etc.)
          qc.invalidateQueries({ queryKey: ["my-invoices"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "invoices",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["my-invoices"] });
          qc.invalidateQueries({ queryKey: ["current-subscription"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const next = payload.new as any;
          const prev = payload.old as any;
          if (next?.status === "active" && prev?.status !== "active") {
            const key = `sub-${next.id}-active`;
            if (notified.current.has(key)) return;
            notified.current.add(key);
            toast.success("Assinatura ativada", {
              description: "Bem-vindo! Seu plano já está liberado.",
              duration: 8000,
            });
          }
          qc.invalidateQueries({ queryKey: ["current-subscription"] });
          qc.invalidateQueries({ queryKey: ["company-quota"] });
        },
      )
      .subscribe();


    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);
}
