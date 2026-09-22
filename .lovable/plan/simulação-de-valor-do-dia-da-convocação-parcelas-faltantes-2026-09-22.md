# Simulação de valor do dia da convocação — parcelas faltantes

## O que eu conferi no cadastro da Alessandra

- Vínculo intermitente, pago por hora a R$ 7,95.
- Prêmio de assiduidade ativo, tipo **percentual, 12%**, e o campo de salário base está **vazio** (natural para quem é horista).
- Vale-alimentação ativo, **R$ 24,00 por dia**.
- As convocações dela foram criadas em **13/09**; o resumo de valores gravado naquela data só guardou valor por hora e horas previstas — nenhuma linha de vale-alimentação ou prêmio, porque esses itens passaram a ser gravados só a partir de 14/09.

## Por que cada item não apareceu

1. **Assiduidade**: o cálculo multiplica o percentual pelo salário base. Como ela é horista e não tem salário base, o resultado é zero.
2. **Vale-alimentação**: o valor existe no cadastro, mas o resumo dessas convocações é anterior à versão que passou a incluir o vale — então a tela não tem de onde ler.
3. **DSR**: não existe no cálculo. Nenhuma parcela de descanso semanal remunerado é somada hoje.
4. **Reflexo do adicional noturno**: o noturno entra no 13º e nas férias, mas não há DSR para refletir — o reflexo aparece junto com o item 3.
5. **INSS do 13º**: hoje o 13º entra na mesma base do INSS do dia; não há linha própria. Por lei o 13º é tributado separadamente.

## O que vou fazer

### Fase 1 — Cálculo do dia completo (servidor + telas)

- **DSR do intermitente**: nova parcela proporcional às horas do dia, calculada sobre a remuneração das horas somada ao adicional noturno e à insalubridade/periculosidade (1/6, padrão legal), exibida com a memória do cálculo.
- **Reflexo do noturno**: o adicional noturno passa a compor a base do DSR, do 13º e das férias proporcionais — a tela mostra a base usada.
- **INSS do 13º em linha própria**: o 13º sai da base do INSS do dia e ganha seu próprio desconto, como na folha. Férias proporcionais e 1/3, sendo indenizadas ao intermitente, deixam de compor a base de INSS.
- **Assiduidade de quem é horista**: quando o prêmio é percentual e não há salário base, o percentual passa a incidir sobre a remuneração das horas do próprio dia; quem tem salário base continua como está.

### Fase 2 — Convocações antigas voltam a mostrar vale e prêmio

- O resumo gravado passa a ter marca de versão. Quando a convocação ainda está pendente ou aceita e o resumo é de versão anterior, a tela recalcula a partir do cadastro atual e sinaliza "estimativa pelo cadastro atual".
- Convocações já encerradas continuam exibindo exatamente o resumo histórico — nada é reescrito.

### Fase 3 — Provas e fechamento

- Provas no banco em transação desfeita, com a Alessandra e um caso por diária, conferindo cada parcela.
- Testes automatizados das novas parcelas (DSR, reflexo, INSS do 13º, prêmio percentual sem salário base, vale antigo recalculado).
- Relatório de fechamento com os números antes e depois.

## Detalhes técnicos

- `supabase/migrations/...`: recriar `public.dp_convocacao_remuneracao_snapshot` — base do prêmio percentual por forma de pagamento, `dsr_divisor`, e `versao: 2` no JSON. Migration reversível, sem tocar em dados existentes.
- `src/lib/dp/convocacao-remuneracao.ts`: novas saídas `dsr`, `baseDsr`, `inssDecimoTerceiro`; base de INSS do dia sem 13º/férias; parcelas e descontos novos em `proventos`/`descontosLista`.
- `remuneracaoDoSnapshot`: aceita cadastro atual como complemento quando `versao` é ausente/1 e devolve `estimada: true`.
- `src/components/dp/convocacoes/CustoGrupoPanel.tsx`, `RemuneracaoDiaDetalhe.tsx` e `src/pages/dp/portal/DpMinhasConvocacoes.tsx`: passar o cadastro atual e exibir o aviso de estimativa.
- Testes em `src/lib/dp/__tests__/convocacao-remuneracao.test.ts`.
