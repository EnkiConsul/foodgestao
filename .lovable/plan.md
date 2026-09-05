# Regras de folgas: lista de unidades + cadastro em janela

Hoje a aba Folgas > Regras abre todos os campos de uma unidade de uma vez, empilhados na tela. A proposta é deixar no primeiro nível apenas a lista das unidades com suas regras, e mover o preenchimento para uma janela.

## Como fica a tela

```text
Folgas > Regras

[ Regras de folgas por unidade ]            [ + Nova regra ]

  Pakerê Garavelo        Regras configuradas
  Convenção coletiva · descanso sábado e domingo · 1 folga de fim de semana por semana
  Escolha das folgas: dia 10 a 20 · 3 particularidades
                                    [ Editar regras ]  [ Limpar ]

  Pakerê Centro          Ainda não configurada
  Segue o padrão da CLT
                                    [ Cadastrar regras ]

[ Datas bloqueadas ]   (igual está hoje)
[ Histórico de alterações ]  (igual está hoje)
```

- Cada unidade da empresa aparece como uma linha, com um resumo em linguagem simples: de onde vem a regra (CLT, convenção ou política própria), dias de descanso, frequência de folga, período mensal de escolha e quantas particularidades de folga existem.
- "Nova regra" abre a janela pedindo a unidade e, opcionalmente, "Copiar as regras de" outra unidade já cadastrada — os campos vêm preenchidos e podem ser alterados antes de salvar.
- "Editar regras" abre a mesma janela já com os valores da unidade.
- "Limpar" continua removendo as regras próprias da unidade (volta ao padrão).

## Dentro da janela

Mesmos campos de hoje, com o nome da unidade fixo no cabeçalho da janela (para não precisar rolar para lembrar qual unidade está sendo editada) e rodapé fixo ("Cancelar" / "Salvar regras"):

1. Base da regra de folgas (CLT, convenção/acordo, política própria) e dias de descanso negociados
2. Frequência da folga de descanso (DSR), com os rótulos que já se adaptam a sábado + domingo
3. Particularidade de Folgas (quantidade por dia, limite por cargo, quem não folga junto)
4. Troca de folga entre colaboradores
5. Período mensal para escolha das folgas, com o quadro das datas de corte dos vales

Comportamentos preservados: aviso de contexto sindical da unidade, alertas de ciência legal quando a regra é menos protetiva que a lei, e a opção de aplicar as mesmas regras a outras unidades no momento de salvar.

As particularidades fazem parte do mesmo fluxo, inclusive numa unidade nova: as regras criadas na janela ficam numa lista provisória e são gravadas junto com o resto quando você clica em "Salvar regras". Se copiar as regras de outra unidade, as particularidades dela também vêm copiadas e podem ser alteradas ou removidas antes de salvar.

## Detalhes técnicos

- `src/pages/dp/cadastros/DpConfiguracoesJornada.tsx` passa a ser a lista: usa `useDpConfigDp()` (já retorna `rows`, `configPadrao` e `unidadesConfiguradas`) para montar o resumo por unidade, sem seletor de unidade nem `localStorage`.
- O corpo do formulário atual (base da regra, DSR, troca, janela mensal, `FolgaRegrasPanel`) sai para `src/components/dp/folgas/FolgaRegrasFormDialog.tsx`, com props `unidadeId`, `modo: "criar" | "editar"`, `configInicial` e a lista de unidades para replicar/copiar. Mantém `alertasDeCiencia`, `saveMany`, o diálogo de replicação ao salvar e `removerExcecao`.
- Resumos da lista reaproveitam `resumoEscolhaFolgas`, `semanasDaConfig`, `MODO_FREQUENCIA_LABEL` e `DIA_SEMANA_LABEL` de `src/lib/dp/dsr-rules.ts`; a contagem de particularidades vem de uma consulta única a `dp_folga_limite_regras` por empresa, agrupada por unidade.
- `FolgaRegrasPanel` ganha um modo controlado (rascunho em memória) para o cadastro de unidade nova: as regras ficam em estado local no diálogo e, ao salvar, são gravadas em `dp_folga_limite_regras` com o `unidade_id` logo depois de `saveMany` — se a gravação das particularidades falhar, o usuário vê o erro com as regras ainda no formulário. No modo edição o painel continua gravando direto, como hoje.
- "Copiar as regras de" preenche o formulário em memória com a config da unidade escolhida (`rows`) e traz as particularidades dela como rascunho, sem gravar nada até salvar.

- `DpFolgasHub` segue igual: painel de regras, datas bloqueadas e histórico.
- Verificação: `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx vitest run src/test/unit/folgaLimites.test.ts src/test/unit/folgaJanela.test.ts`, lint nos arquivos alterados e uma passada no navegador na aba Regras.

## Fora do escopo

- Mudar o cadastro de datas bloqueadas e o histórico.
- Alterar regras de banco de dados ou o cálculo das folgas.
