# Calculadora de benefícios: dias a trabalhar editáveis

## O problema

Na calculadora do vale-alimentação e do vale-transporte, os "dias a trabalhar" do ciclo atual vêm sempre da escala, da jornada ou das convocações. Quando o gestor ainda não lançou todas as folgas e férias, esse número fica errado e não há como corrigir na tela.

Os dias do ciclo anterior também começam vazios: o gestor precisa digitar tudo mesmo quando já existe sugestão pela escala.

## O que muda

Cada colaborador passa a ter os três números editáveis e já preenchidos:

- **Dias trabalhados (ciclo anterior)** — preenchido com o que estiver salvo ou, na falta, com a sugestão da escala.
- **Dias pagos (ciclo anterior)** — como hoje, vindo do ciclo anterior fechado quando existir.
- **Dias a trabalhar (ciclo atual)** — novo campo editável, preenchido com o número calculado (escala, convocações ou jornada habitual).

Regras da edição:

- Ao alterar os dias a trabalhar, o total de dias, o desconto e o valor a depositar recalculam na hora, e o número informado fica salvo naquele mês para aquele colaborador.
- Abaixo do campo aparece o valor calculado pelo sistema e um botão "Usar o calculado" para desfazer o ajuste manual.
- Enquanto houver ajuste manual, a linha mostra a marca "Dias informados pelo gestor", e o ajuste continua valendo mesmo que a escala mude depois — até o gestor voltar ao calculado.
- Ciclo já fechado continua somente leitura.
- O arquivo exportado e a memória de cálculo passam a indicar quando os dias a trabalhar foram informados pelo gestor.

Limites: número inteiro de 0 a 31; valores fora disso são recusados com aviso claro.

## Detalhes técnicos

Banco (migration reversível, sem apagar dados):

- `public.dp_va_apuracoes`: nova coluna `dias_previstos_manual boolean NOT NULL DEFAULT false` e `dias_previstos_calculado integer` (guarda o número que o sistema apurou, para comparação e histórico). `CHECK (dias_previstos BETWEEN 0 AND 31)` se ainda não existir.
- Sem mudança de permissões: a tabela mantém as políticas atuais; a gravação segue pelo mesmo caminho já usado pela tela.

Frontend:

- `src/hooks/useDpValeApuracoes.tsx`: `ApuracaoVale`, `FecharLinha`, `salvarDias` e `fecharCiclo` passam a carregar `dias_previstos_manual` e `dias_previstos_calculado`.
- `src/components/dp/beneficios/ValeCalculadora.tsx`: `LinhaCalculo` ganha `previstos: string` e `previstosManual: boolean`; `edits` aceita o terceiro campo; o cálculo (`calcularVaDeposito`) usa os dias previstos efetivos; `editar`/`persistir` gravam o novo campo com o mesmo atraso de digitação; novo campo no grid com o texto do calculado e o botão "Usar o calculado"; padrão dos dias trabalhados passa a ser `sugestaoTrabalhadosAnterior`; linha explicativa e cabeçalho do CSV atualizados.
- `src/components/dp/beneficios/ValeMemoriaDialog.tsx`: mostrar os dias previstos informados pelo gestor quando houver ajuste.
- Testes em `src/lib/dp/__tests__` (ou arquivo novo dedicado) para o total com dias informados manualmente, limite 0–31 e volta ao calculado; rodar `bunx vitest run` e a verificação de tipos.

Nada publicado ao final.
