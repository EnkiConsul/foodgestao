import { Helmet } from "react-helmet-async";
import { AlertOctagon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { HistoricoDisciplinar, type RegistroDisciplinar } from "@/components/dp/HistoricoDisciplinar";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";

export default function DpMeuDisciplinar() {
  const { user } = useAuth();

  const list = useQuery({
    queryKey: ["dp_meu_disciplinar", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: cid } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (!cid) return [] as RegistroDisciplinar[];
      const { data, error } = await supabase
        .from("dp_registros_disciplinares").select("*")
        .eq("colaborador_id", cid as string)
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RegistroDisciplinar[];
    },
  });

  return (
    <DpPage>
      <Helmet><title>Meus registros disciplinares — Portal</title></Helmet>
      <DpPageHeader icon={AlertOctagon} title="Registros disciplinares" />
      <HistoricoDisciplinar registros={list.data ?? []} />
    </DpPage>
  );
}
