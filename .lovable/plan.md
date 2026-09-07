# Ler os dados da empresa/unidade da ficha e reconhecer a unidade

## O que acontece hoje

A leitura da ficha é instruída a ignorar tudo do empregador (nome da empresa, CNPJ, endereço) e devolver só os dados do empregado. Por isso o CNPJ da Garavelo que aparece na ficha da Thais nunca chega à tela, e não há nenhuma checagem de que a ficha pertence mesmo à empresa em uso.

O cadastro de Unidades já guarda CNPJ e a empresa também, então dá para casar e validar automaticamente.

## O que muda

1. A leitura passa a devolver também o nome e o CNPJ do empregador que constam na ficha (sem misturar com os dados da pessoa).
2. Na conferência, a unidade já vem escolhida quando o CNPJ da ficha bate com uma unidade cadastrada, com a indicação "Unidade reconhecida pelo CNPJ da ficha".
3. Validação de empresa: se o CNPJ lido não corresponder à empresa em uso nem a nenhuma de suas unidades, a ficha aparece marcada como "Ficha de outra empresa" com o CNPJ e o nome lidos, e o botão de cadastrar fica bloqueado até alguém marcar "Confirmo que esta ficha é desta empresa". Nada é aplicado sozinho.
4. Se o CNPJ não bater com nenhuma unidade mas for da empresa, o sistema tenta pelo nome da unidade; não achando, mostra aviso curto e a unidade fica para escolha manual, com atalho para o cadastro de Unidades (completar o CNPJ ali faz as próximas importações reconhecerem).
5. Ficha sem CNPJ legível segue como hoje, apenas com um aviso de que não foi possível confirmar a empresa.
6. A unidade escolhida continua sendo o que grava no colaborador; o resto da importação não muda.

Fichas já lidas antes desta mudança não têm o CNPJ guardado — para a ficha da Thais aparecer com a Garavelo já reconhecida, basta enviar o PDF novamente depois da mudança.

## Detalhes técnicos

- `supabase/functions/dp-ficha-registro-parse/index.ts`: acrescentar `empregador_nome` e `empregador_cnpj` ao JSON do prompt (mantendo a regra de não confundir com o empregado); os campos seguem dentro de `dados_extraidos`, sem coluna nova, e o agrupamento de páginas já completa campos vazios em páginas de continuação.
- Novo `src/lib/dp/ficha-registro/unidade-match.ts`: `matchUnidade(dados, unidades, companyCnpj)` → `{ unidade_id, motivo: "cnpj" | "nome" | null, cnpj_lido, empresaConfere: "sim" | "nao" | "indefinido" }`, comparando por dígitos e nome normalizado.
- `src/hooks/useDpCadastros.tsx`: garantir `cnpj` no select de `useDpUnidades`.
- `src/components/dp/ficha-registro/FichaRevisaoCard.tsx`: usar `matchUnidade` como valor inicial de `unidadeId` (prioridade sobre `unidadePadraoId`), legenda de origem, aviso âmbar sem correspondência de unidade e bloco de bloqueio + checkbox de confirmação quando `empresaConfere === "nao"` (desabilita o botão de cadastrar/atualizar).
- `src/pages/dp/DpFichaRegistroImportar.tsx`: passar unidades com CNPJ e o CNPJ da empresa selecionada (de `companies`) ao card.
- Sem migração, sem RLS, sem função nova. Verificação: `bunx tsgo --noEmit -p tsconfig.json` e uma reimportação da ficha da Thais na tela de importação.
