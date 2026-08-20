# Aplicar o padrão de remuneração a colaboradores escolhidos

Hoje, ao salvar um colaborador, o diálogo "Onde salvar este padrão de remuneração?" oferece só dois alcances: **Somente novos cadastros** ou **Todos os colaboradores deste alcance**. Falta o meio: escolher na mão quem recebe o padrão.

## O que muda

Uma terceira opção no bloco "Aplicar a quem?":

- Somente novos cadastros
- Todos os colaboradores deste alcance (N)
- **Colaboradores escolhidos** — abre a lista de ativos do alcance com caixas de seleção

Na lista de seleção:

- Nome, cargo e unidade de cada colaborador ativo do escopo (empresa / unidade / cargo), sem o colaborador aberto na tela.
- Selo "fora do padrão" em quem hoje difere dos itens marcados em "O que replicar?".
- Campo de busca por nome e atalhos "Selecionar todos" / "Limpar" / "Só os fora do padrão".
- Contador do tipo "3 de 12 selecionados"; confirmar fica bloqueado com zero selecionados.
- Aviso de impacto de desligamento de benefício passa a contar apenas os selecionados.

Comportamento ao confirmar: grava o padrão do escopo escolhido e sobrescreve os grupos marcados apenas nos colaboradores selecionados. O toast informa quantos foram atualizados. Os padrões mais específicos (cargo dentro da unidade) só são apagados no alcance "todos" — na seleção manual eles são preservados, porque a intenção ali é pontual.

## Detalhes técnicos

- `src/lib/dp/beneficiosPadrao.ts`: incluir `"selecionados"` no tipo `PadraoAlcance`.
- `src/hooks/useDpBeneficiosPadrao.tsx` (`useSalvarDpBeneficiosPadrao`): aceitar `colaboradorIds?: string[]`. Em `aplicarAosColaboradores`, propagar quando `alcance === "todos"` ou `"selecionados"`; no segundo caso, restringir os ids ao array recebido (interseção com os ativos do escopo, ainda excluindo `ignorarColaboradorId`). Nenhuma mudança de schema.
- `src/components/dp/ColaboradorFormDialog.tsx`: novo estado `selecionadosPadrao: string[]`, resetado ao abrir o diálogo (pré-selecionando os divergentes); novo `RadioGroupItem value="selecionados"` com a lista rolável (`ScrollArea` + `Checkbox`) alimentada por `colaboradoresDoAlcance`; `responderPadrao` envia `colaboradorIds` quando o alcance for "selecionados"; `quemPerdeBeneficio` recebe só os selecionados nesse modo; desabilitar Confirmar sem seleção.
- Testes em `src/lib/dp/__tests__/padraoRemuneracao.test.ts` para o filtro de ids selecionados.
