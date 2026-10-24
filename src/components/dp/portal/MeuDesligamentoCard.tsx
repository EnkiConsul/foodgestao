import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DatasDesligamento } from "@/components/dp/ColaboradorDesligamentoAvisoPanel";

/**
 * "Meu desligamento" no portal: só aparece depois da comunicação formal e lê
 * exatamente as datas gravadas no processo (sem recalcular). Sem sugestão
 * interna de pagamento, notas, motivo ou valores.
 */
type Meu = {
  status: "em_aviso" | "em_revisao" | "desligado";
  ultimo_comparecimento: string | null; dispensado_desde: string | null; data_efetiva: string;
  base_quitacao: string; prazo_10_dias: string; pagamento_previsto: string | null;
  pagamento_status: "pendente" | "programado" | "pago"; pagamento_em: string | null;
  alterado: boolean; atualizado_em: string | null;
};
const br = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const PAG = { pendente: "Pendente", programado: "Programado", pago: "Pago" } as const;

export function MeuDesligamentoCard() {
  const q = useQuery({
    queryKey: ["dp_meu_desligamento"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dp_meu_desligamento" as never);
      if (error) throw error;
      return (data ?? null) as Meu | null;
    },
  });
  const d = q.data;
  if (!d) return null;
  return (
    <section className="dp-content-card space-y-3 rounded-2xl border bg-card p-4 sm:p-5" aria-labelledby="meu-desl-titulo">
      <div>
        <h2 id="meu-desl-titulo" className="text-base font-semibold">Meu desligamento</h2>
        <p className="text-sm text-muted-foreground">
          {d.status === "desligado" ? `Seu vínculo foi encerrado em ${br(d.data_efetiva)}.`
            : d.status === "em_revisao" ? "Seu aviso prévio está em revisão pela empresa. As datas podem mudar."
            : `Você continua ativo até ${br(d.data_efetiva)}.`}
        </p>
      </div>
      <DatasDesligamento r={d} gestor={false} />
      {d.status !== "desligado" && <p className="text-xs text-muted-foreground">O comparecimento com compensação é uma previsão e pode mudar após trocas de folga ou atualização do saldo pela empresa. Confira as datas com o gestor.</p>}
      <div className="text-sm">
        Pagamento da rescisão: <strong>{PAG[d.pagamento_status]}</strong>
        {d.pagamento_status === "pago" && d.pagamento_em && <> em {br(d.pagamento_em)}</>}
        {d.pagamento_status !== "pago" && d.pagamento_previsto && <> · previsto para {br(d.pagamento_previsto)}</>}
      </div>
      {d.atualizado_em && (
        <p className="text-xs text-muted-foreground">
          {d.alterado ? "Datas atualizadas pela empresa em " : "Atualizado em "}{new Date(d.atualizado_em).toLocaleDateString("pt-BR")}.
        </p>
      )}
    </section>
  );
}
