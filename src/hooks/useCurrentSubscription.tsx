import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PlanFeatures {
  max_companies?: number;
  max_transactions_per_month?: number;
  max_users_per_company?: number;
  max_attachments_per_transaction?: number;
  ai_enabled?: boolean;
  reports_advanced?: boolean;
  export_pdf?: boolean;
  export_csv?: boolean;
  support?: string;
}

export function useCurrentSubscription() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["current-subscription", user?.id],
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, plan:plans(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const features = (data.plan?.features ?? {}) as PlanFeatures;
      const trialEndsAt = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
      const daysLeft = trialEndsAt
        ? Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;

      const isTrialing = data.status === "trialing";
      const trialEnded =
        isTrialing && trialEndsAt !== null && trialEndsAt.getTime() < Date.now();
      const isExpired =
        data.status === "expired" || data.status === "canceled" || trialEnded;

      return {
        ...data,
        features,
        trialDaysLeft: daysLeft,
        isTrialing,
        isActive: data.status === "active",
        isPastDue: data.status === "past_due",
        isExpired,
        isBlocked: isExpired,
      };
    },
  });
}

/** Returns true when feature flag is enabled in the current plan. */
export function useHasFeature(flag: keyof PlanFeatures) {
  const { data } = useCurrentSubscription();
  return Boolean(data?.features?.[flag]);
}
