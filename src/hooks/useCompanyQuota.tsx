import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentSubscription } from "@/hooks/useCurrentSubscription";

export interface CompanyQuota {
  total: number;
  included: number;
  /** -1 = unlimited */
  max: number;
  pricePerExtraCents: number;
  /** companies above the included threshold currently being charged */
  extraBilled: number;
  /** can add another company without confirmation */
  canAddFree: boolean;
  /** would require paying extra */
  requiresPaidExtra: boolean;
  /** absolute limit reached and no extra pricing available */
  blocked: boolean;
}

export function useCompanyQuota() {
  const { user } = useAuth();
  const { data: subscription } = useCurrentSubscription();

  return useQuery({
    queryKey: ["company-quota", user?.id, subscription?.id, subscription?.extra_companies],
    enabled: !!user && !!subscription,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<CompanyQuota> => {
      const { count } = await supabase
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id);

      const features: any = subscription?.features ?? {};
      const included = Number(features.included_companies ?? features.max_companies ?? 1);
      const max = Number(features.max_companies ?? included);
      const pricePerExtraCents = Number(features.price_per_extra_company_cents ?? 0);
      const total = count ?? 0;
      const extraBilled = Number((subscription as any)?.extra_companies ?? 0);

      const reachedMax = max >= 0 && total >= max;
      const reachedIncluded = total >= included;

      return {
        total,
        included,
        max,
        pricePerExtraCents,
        extraBilled,
        canAddFree: !reachedIncluded,
        requiresPaidExtra: reachedIncluded && pricePerExtraCents > 0 && (max < 0 || total < max || pricePerExtraCents > 0),
        blocked: reachedMax && pricePerExtraCents <= 0,
      };
    },
  });
}
