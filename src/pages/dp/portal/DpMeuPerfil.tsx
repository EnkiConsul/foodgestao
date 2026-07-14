import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DpMeuPerfil() {
  const { user } = useAuth();
  const perfil = useQuery({
    queryKey: ["dp_meu_perfil", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("*, dp_unidades(nome), dp_cargos(nome)")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const p = perfil.data as any;

  return (
    <div className="space-y-4">
      <Helmet><title>Meus dados — Portal</title></Helmet>
      <h1 className="text-2xl font-bold">Meus dados</h1>
      {!p ? (
        <p className="text-muted-foreground">Perfil não encontrado.</p>
      ) : (
        <Card>
          <CardHeader><CardTitle>{p.nome}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
            <Field label="Matrícula" value={p.matricula} />
            <Field label="CPF" value={p.cpf} />
            <Field label="Cargo" value={p.dp_cargos?.nome ?? p.cargo} />
            <Field label="Unidade" value={p.dp_unidades?.nome} />
            <Field label="Regime" value={p.regime} />
            <Field label="Admissão" value={p.data_admissao} />
            <Field label="Nascimento" value={p.data_nascimento} />
            <Field label="E-mail" value={p.email ?? p.email_portal} />
            <Field label="Telefone" value={p.telefone} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value ?? "—"}</p>
    </div>
  );
}
