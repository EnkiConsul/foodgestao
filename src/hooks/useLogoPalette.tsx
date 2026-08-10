import { useQuery } from "@tanstack/react-query";
import { extractLogoPalette } from "@/lib/orders/logoPalette";

/** Cores predominantes da logo da loja, para sugerir a cor principal. */
export function useLogoPalette(url: string | null) {
  return useQuery({
    queryKey: ["logo-palette", url],
    enabled: !!url,
    staleTime: 30 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<string[]> => {
      try {
        return await extractLogoPalette(url!);
      } catch {
        return [];
      }
    },
  });
}
