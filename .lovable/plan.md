# Rotina do dia: cards de folguista/teste, dia destacado no calendário e horário sugerido

## 1. Cards de "Em teste" e "Folguista" no dia

Na aba Rotina do Dia (e na janela que abre ao clicar num dia do calendário), incluir dois novos cards ao lado dos existentes:

- **Em teste** — quantas pessoas avulsas do tipo teste estão no dia selecionado.
- **Folguista** — quantas do tipo folguista estão no dia.

Comportamento igual aos outros cards: clicar abre a lista das pessoas daquele tipo no dia; card apagado quando é zero. Os cards entram na mesma grade que já pode ser reordenada, no fim da ordem padrão (quem já tem ordem salva recebe os novos no final, sem perder a ordem atual).

## 2. Número do dia em destaque no calendário

Hoje o número do dia se confunde com "confirmados", "aguardando" e os contadores F/I/FG. Ajuste visual:

- Número do dia maior, em negrito e na cor de destaque da marca, dentro de um selo redondo no canto do quadradinho.
- Demais números do dia continuam menores e em cinza, com o rótulo antes do valor, para não competir com o número da data.
- Dia selecionado mantém o realce atual (anel), com o selo preenchido.

Somente aparência — nenhuma regra de contagem muda.

## 3. Entrada e saída pré-preenchidas no cadastro de folguista/teste

Ao escolher unidade + cargo + data no cadastro de pessoa avulsa, os campos Entrada e Saída passam a vir sugeridos com o horário mais usado naquela unidade, para aquele cargo, naquele dia da semana. A regra:

1. Olha as pessoas previstas naquele cargo/unidade no mesmo dia da semana dentro do mês carregado.
2. Escolhe o par entrada/saída que mais se repete (empate: o mais recente).
3. Se não houver histórico do cargo, usa o horário mais usado da unidade naquele dia da semana.
4. Se nada existir, os campos ficam vazios como hoje.

Também traz o "termina no dia seguinte" junto quando o horário sugerido atravessa a meia-noite. Uma linha discreta abaixo dos campos explica: "Sugerido pelo horário mais usado neste cargo/unidade". Se o gestor digitar um horário, a sugestão não sobrescreve mais.

## Detalhes técnicos

- `src/lib/dp/operacao-panorama.ts`: expor contagens de avulsos por tipo em cada dia (`contagens_avulsos: { teste, folguista }`) sem alterar `contagens.fixo` (o avulso continua contando no quadro como hoje); nova função pura `horarioMaisUsado({ dias, unidadeId, cargoId, dow })` retornando `{ entrada, saida, termina_no_dia_seguinte } | null`, com fallback por unidade.
- `src/pages/dp/DpOperacaoPanorama.tsx`: novos `CardKey` `avulso_teste` e `avulso_folguista` acrescentados a `CARDS_DIA` (a função `ordenar` já anexa chaves novas ao fim); ícone/tone próprios; clique abre um detalhe listando os avulsos do tipo. Ajuste de classes no botão do calendário para o selo do número do dia (tokens semânticos, sem cores fixas).
- `src/components/dp/DpPessoaAvulsaDialog.tsx`: recebe `sugerirHorario(unidadeId, cargoId, data)` como prop; efeito aplica a sugestão quando entrada/saída ainda não foram tocadas pelo usuário (flag local `horarioTocado`). Sem `as any`.
- Testes: novos casos em `src/lib/dp/__tests__/operacao-panorama.test.ts` para `contagens_avulsos` e para `horarioMaisUsado` (moda, empate pelo mais recente, fallback por unidade, ausência de histórico).
- Sem migração de banco; nenhuma mudança em RLS ou nas regras de folga/convocação.
