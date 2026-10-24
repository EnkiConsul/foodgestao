export type ExtratoAvisoDados = {
  inicio_aviso: string; ultimo_sem_banco: string | null;
  periodo_reducao: { inicio: string; fim: string } | null;
  folgas_compensatorias: string[]; dias_sem_expediente: string[]; dias_art488: string[];
};
const br = (d: string) => d.split("-").reverse().join("/");
export function ExtratoAviso({ extrato, comunicacao, ultimo }: { extrato?: ExtratoAvisoDados | null; comunicacao?: string; ultimo?: string | null }) {
  if (!extrato) return null;
  const reducao = extrato.periodo_reducao;
  const descansos = extrato.dias_sem_expediente.filter((d) => !reducao || d < reducao.inicio || d > reducao.fim);
  return <section className="space-y-2 border-t border-border pt-3 text-sm" aria-label="Como as datas do aviso foram calculadas">
    <h3 className="font-semibold">Como chegamos ao último dia de trabalho</h3>
    {comunicacao && <p>Comunicação em <strong>{br(comunicacao)}</strong>. Contagem do aviso a partir de <strong>{br(extrato.inicio_aviso)}</strong>.</p>}
    {extrato.ultimo_sem_banco && <p>Sem compensação de horas: <strong>{br(extrato.ultimo_sem_banco)}</strong>.</p>}
    <p>Folgas compensatórias: <strong>{extrato.folgas_compensatorias.length} dia(s)</strong>{extrato.folgas_compensatorias.length > 0 && ` · ${extrato.folgas_compensatorias.map(br).join(", ")}`}.</p>
    <p>Folgas semanais e outros dias sem expediente, fora da redução legal: <strong>{descansos.length} dia(s)</strong>{descansos.length > 0 && ` · ${descansos.map(br).join(", ")}`}.</p>
    {reducao && <p>Dispensa de <strong>7 dias corridos</strong>: {br(reducao.inicio)} a {br(reducao.fim)} (Art. 488, parágrafo único, CLT). Inclui os descansos desse intervalo; não são dias adicionais.</p>}
    {ultimo && <p>Último comparecimento previsto: <strong>{br(ultimo)}</strong>. O contrato continua até a data de término informada acima.</p>}
  </section>;
}