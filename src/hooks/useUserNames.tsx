import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type UserNameInfo = { full_name: string | null; email?: string | null };

/** Fetches a map of user_id → display info for ALL profiles (super admin only). */
export function useUserNames() {
  const query = useQuery({
    queryKey: ["admin-user-names"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name");
      if (error) throw error;
      const map = new Map<string, UserNameInfo>();
      (data ?? []).forEach((p: any) => {
        map.set(p.user_id, { full_name: p.full_name });
      });
      return map;
    },
    staleTime: 60_000,
  });

  const displayName = (userId?: string | null) => {
    if (!userId) return "—";
    const info = query.data?.get(userId);
    return info?.full_name || `${userId.slice(0, 8)}…`;
  };

  /** True when a profile row exists for this user id. */
  const hasProfile = (userId?: string | null) => {
    if (!userId) return false;
    return Boolean(query.data?.has(userId));
  };

  /** Real name when available, otherwise null (no id fallback). */
  const realName = (userId?: string | null) => {
    if (!userId) return null;
    return query.data?.get(userId)?.full_name || null;
  };

  return { ...query, displayName, hasProfile, realName };
}
