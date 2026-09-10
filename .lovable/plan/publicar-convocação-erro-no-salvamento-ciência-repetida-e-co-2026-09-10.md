# Publicar convocação: erro no salvamento, ciência repetida e corte no celular

## 1. Erro ao publicar (causa confirmada)

A mensagem `column "regime_snapshot" is of type dp_regime_trabalho but expression is of type text` vem da própria rotina de publicação no banco: ela grava o regime da pessoa (intermitente, CLT etc.) como texto simples num campo que só aceita a lista fixa de regimes. Por isso a publicação é recusada e nada é gravado — não é problema do seu preenchimento.

Correção: converter o valor para o tipo correto nos dois pontos de gravação da oferta (convocação individual e convocação por cargo), tratando valor vazio como "sem regime informado". Nenhuma regra muda.

## 2. Justificativa/ciência pedida duas vezes

Hoje o aviso de "em cima da hora" com o campo de justificativa aparece na tela de montagem **e** de novo na tela "Revisar e publicar", com uma caixa de ciência que sempre começa desmarcada. Quem já justificou antes é obrigado a marcar tudo outra vez.

O que muda:

- A justificativa e a ciência passam a existir em um único lugar: a tela "Revisar e publicar". Na montagem fica apenas o aviso, sem campo repetido.
- Ao abrir um rascunho que já tem justificativa gravada, a ciência já vem marcada, com a data em que foi registrada. Você pode desmarcar/editar se quiser.
- O botão "Confirmar e publicar" segue exigindo ciência apenas quando ela ainda não existe.

## 3. Corte no celular

Na janela de convocação, o rodapé coloca o texto de resumo e os botões na mesma linha, então "Confirmar e publicar" e "Revisar e publicar" ficam cortados na borda direita.

- No celular o rodapé passa a empilhar: resumo em cima, botões em baixo, cada um ocupando metade da largura, sem corte. No computador continua como está.
- Na linha "Vagas / Termina no dia seguinte" e na barra de atalhos ("Aplicar a todos os dias", "Ver rotina do dia", "Horários por pessoa"), o conteúdo passa a quebrar em várias linhas no celular em vez de vazar para o lado.
- O aviso de erro deixa de cobrir o topo da janela por muito tempo: mensagem mais curta e posicionada sem tapar o título.

## Detalhes técnicos

- Migração nova (não editar migrações antigas): `CREATE OR REPLACE FUNCTION public.dp_convocacao_publicar_grupo(...)` idêntica à atual, trocando `v_aval->>'regime_snapshot'` por `NULLIF(v_aval->>'regime_snapshot','')::public.dp_regime_trabalho` nos dois `INSERT INTO public.dp_convocacoes` (ramo individual e ramo do loop de candidatos). Mesmas assinatura, `SECURITY DEFINER`, `search_path` e permissões.
- `NovaConvocacaoPlanner.tsx`: remover o bloco `Alert variant="destructive"` com `Textarea` de justificativa da etapa de montagem (mantendo o texto do aviso); inicializar `cienteAntecedencia` como `true` quando o rascunho carregado já traz `justificativa_fora_prazo`/`confirmado_fora_prazo_em` em alguma ocorrência; `DialogFooter` com `flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between` e botões `flex-1 sm:flex-none`.
- `RevisaoConvocacao.tsx`: exibir, quando houver registro anterior, "Exceção já justificada em <data>" acima do campo; sem mudança de props além disso.
- `DiasSelecionadosLista.tsx`: linha de vagas/virada com `flex-wrap gap-2 min-w-0`; barra de atalhos com `flex-wrap`.
- Verificação: `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx vitest run src/lib/dp`, teste SQL do fluxo de publicação em `supabase/tests/` (publicação de rascunho individual gravando `regime_snapshot`) dentro de `BEGIN … ROLLBACK`, e captura Playwright em 407×748 confirmando rodapé sem corte.

## Fora do escopo

Regras de antecedência, elegibilidade, vagas, prazos de resposta e o portal do colaborador.
