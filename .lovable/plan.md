# Reconhecer a unidade pelo CNPJ da ficha

## O que acontece hoje

A leitura da ficha é instruída a ignorar tudo do empregador (nome da empresa, CNPJ, endereço) e devolver só os dados do empregado. Por isso o CNPJ da Garavelo que aparece na ficha da Thais nunca chega à tela. Na conferência, a unidade vem sempre pré-selecionada na primeira unidade da empresa e precisa ser trocada à mão.

O cadastro de unidades já guarda CNPJ, então dá para casar automaticamente.

## O que muda

1. A leitura passa a devolver também o nome e o CNPJ do empregador que constam na ficha (sem misturar com os dados da pessoa).
2. Na conferência, a unidade já vem escolhida quando o CNPJ da ficha bate com o CNPJ de uma unidade cadastrada, com a indicação "Unidade reconhecida pelo CNPJ da ficha".
3. Se o CNPJ não bater com nenhuma unidade, o sistema tenta pelo nome da unidade; não achando, mostra um aviso curto com o CNPJ lido e a unidade continua para escolha manual — nada é aplicado sozinho.
4. Quando o CNPJ lido não existe em nenhuma unidade, o aviso oferece um atalho para abrir o cadastro de Unidades e completar o CNPJ, para as próximas importações já reconhecerem.
5. A unidade escolhida continua sendo o que grava no colaborador; nada muda no resto da importação.

Fichas já lidas antes desta mudança não têm o CNPJ guardado — para a ficha da Thais aparecer com a Garavelo já reconhecida, basta enviar o PDF de novo depois da mudança.

## Detalhes técnicos

- `supabase/functions/dp-ficha-registro-parse/index.ts`: acrescentar `empregador_nome` e `empregador_cnpj` ao JSON do prompt (mantendo a regra de não confundir com o empregado); esses campos seguem dentro de `dados_extraidos`, sem coluna nova, e o agrupamento de páginas já completa campos vazios.
- Novo `src/lib/dp/ficha-registro/unidade-match.ts`: `matchUnidade(dados, unidades)` comparando CNPJ por dígitos e, em fallback, nome normalizado; retorna `{ unidade_id, motivo: "cnpj" | "nome" | null, cnpj_lido }`.
- `src/hooks/useDpCadastros.tsx`: garantir que `useDpUnidades` traga `cnpj` no select.
- `src/components/dp/ficha-registro/FichaRevisaoCard.tsx`: usar `matchUnidade` como valor inicial do estado `unidadeId` (prioridade sobre `unidadePadraoId`), legenda de origem e aviso âmbar quando não houver correspondência, com link para `/dp/unidades`.
- `src/pages/dp/DpFichaRegistroImportar.tsx`: passar a lista de unidades com CNPJ (já passa `unidades`).
- Sem migração, sem RLS, sem função nova. Verificação: `bunx tsgo --noEmit -p tsconfig.json` e uma reimportação da ficha da Thais na tela de importação.
