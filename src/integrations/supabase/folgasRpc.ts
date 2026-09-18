import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import type { Database } from "./types";

type Functions = Database["public"]["Functions"];
type FolgaFunction = "dp_folga_autoatribuicao_plano" | "dp_folga_autoatribuir_aplicar";
type NullableUnit<F extends FolgaFunction> = Omit<Functions[F], "Args"> & {
  Args: Omit<Functions[F]["Args"], "_unidade"> & { _unidade: string | null };
};
type FolgasDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Omit<Functions, FolgaFunction> & {
      [F in FolgaFunction]: NullableUnit<F>;
    };
  };
};

// Verified against pg_get_functiondef on 2026-09-18: these required arguments
// accept explicit SQL NULL to select all units. Do not omit them. PostgreSQL
// argument types alone do not describe this nullability; keep the override
// separate from generated types and preserve the existing authenticated client.
const client = supabase as SupabaseClient<FolgasDatabase>;
export const planejarFolgas = (args: NullableUnit<"dp_folga_autoatribuicao_plano">["Args"]) =>
  client.rpc("dp_folga_autoatribuicao_plano", args);
export const aplicarFolgas = (args: NullableUnit<"dp_folga_autoatribuir_aplicar">["Args"]) =>
  client.rpc("dp_folga_autoatribuir_aplicar", args);
