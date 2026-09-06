# Convocação em cima da hora não pode travar a publicação

## O que acontece hoje

Ao incluir o dia 06/09 (hoje), a convocação entra como "abaixo da antecedência". A regra do sistema já permite publicar assim mesmo, mas exige uma justificativa da exceção. O problema: o campo de justificativa só existe na tela de montagem da convocação; na tela "Revisar e publicar" ele não aparece, e o botão "Confirmar e publicar" fica desativado enquanto a justificativa estiver vazia. Na prática, quem chega direto na revisão fica sem caminho para publicar — parece um bloqueio.

Também colabora para a confusão o aviso em vermelho ("Abaixo da antecedência"), que dá aparência de erro impeditivo.

## O que muda

1. Na tela "Revisar e publicar", quando houver dias em cima da hora:
   - Um bloco de ciência: "Você está convocando com menos de X dias de antecedência. A pessoa pode aceitar normalmente." com os dias listados.
   - Uma caixa de confirmação ("Estou ciente e quero publicar") e o campo de justificativa ali mesmo, já preenchido se a pessoa tiver escrito antes.
2. O botão "Confirmar e publicar" fica liberado assim que a ciência for marcada (e a justificativa preenchida, quando a empresa exigir). Nunca mais fica desativado sem um caminho visível para resolver.
3. O selo "Abaixo da antecedência" passa a ter aparência de aviso (âmbar), com o texto "Em cima da hora · X dia(s) de antecedência", e não de erro.
4. Mensagens de recusa da publicação relacionadas à antecedência passam a dizer exatamente o que fazer ("marque a ciência" / "escreva a justificativa").

Nada muda na regra de negócio: já hoje o sistema não bloqueia por antecedência — apenas registra a exceção. Continua sendo impossível publicar um horário que já começou (isso é outro impedimento, legítimo).

## Detalhes técnicos

- `src/components/dp/convocacoes/RevisaoConvocacao.tsx`: novas props `foraDaAntecedencia` (lista de dias), `antecedenciaMinima`, `exigeJustificativa`, `justificativa`, `onJustificativaChange`, `ciente`, `onCienteChange`; bloco de aviso/ciência acima de "Como o colaborador vai receber"; badge trocada de `variant="destructive"` para estilo de aviso (tokens âmbar já usados em `STATUS_META`), com os dias de antecedência.
- `src/components/dp/convocacoes/NovaConvocacaoPlanner.tsx`: novo estado `cienteAntecedencia`; o `disabled` do botão publicar passa a exigir `cienteAntecedencia` (e justificativa somente quando `exigeJustificativa`); estado repassado à revisão; `publicarGrupo` continua enviando `confirmacoes` com `confirmado: true` e a justificativa.
- `src/lib/dp/convocacoes-motivos.ts`: textos de `ANTECEDENCE_CONFIRMATION_REQUIRED` e `ANTECEDENCE_JUSTIFICATION_REQUIRED` orientando a ação.
- Sem migração de banco: `dp_convocacao_publicar_grupo` já aceita confirmação + justificativa e o comentário da coluna `antecedencia_minima_dias` documenta a invariante de não bloquear.
- Verificação: `bunx tsgo --noEmit -p tsconfig.app.json` e `bunx vitest run src/lib/dp`.

## Fora do escopo

Alterar a antecedência mínima configurada, publicar horário que já começou e mudanças no portal do colaborador.
