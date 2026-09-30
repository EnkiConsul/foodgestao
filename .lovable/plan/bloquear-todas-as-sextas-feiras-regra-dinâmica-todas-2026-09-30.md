# Bloquear todas as sextas-feiras (regra dinâmica "Todas")

## O que muda para você
No cadastro de regra de bloqueio do tipo **Dinâmica**, o campo "Ordinal" ganha a opção **"Todas"**. Assim você escolhe "Todas" + "Sexta" e todas as sextas do mês (ou dos meses escolhidos) ficam bloqueadas para folga. A lista de regras mostra "Todas as Sextas".

## Onde vale
- Calendário de folgas do gestor e do colaborador (dias aparecem como bloqueados).
- Pedido de folga pelo portal e marcação pelo gestor: o servidor recusa sexta-feira da mesma forma que as demais datas bloqueadas (com a exceção ao gestor que já existe).
- Sorteio/atribuição automática de folgas evita as sextas.

## Detalhes técnicos
- Convenção: `ordinal = 0` em `regra_json` significa "todas as ocorrências do dia da semana".
- `RegraDialog.tsx`: opção "Todas" (valor 0) no select de ordinal; validação aceita 0.
- `RegraRow.tsx`: rótulo "Todas as {dia}".
- `src/lib/dp/bloqueio-rules.ts` e `gerarDatasParaRegra` em `src/lib/dp/bloqueios.ts`: quando ordinal = 0, percorrer o mês e incluir todo dia com `getDay() === dia_semana`.
- Migração: atualizar `public.dp_regra_bloqueia_data` (espelho SQL) para tratar ordinal 0 como "qualquer ocorrência"; conferir a função de sorteio (`dp-sorteio-folgas`) e ajustar se tiver lógica própria de ordinal.
- Testes unitários novos em `bloqueio-rules.test.ts` (todas as sextas de out/2026 = 2, 9, 16, 23, 30).
