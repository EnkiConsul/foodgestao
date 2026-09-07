# Importar ficha de registro — o que ainda falta

A leitura do PDF, a separação por pessoa, a revisão e a criação/atualização do cadastro já funcionam. Sobraram quatro pontos do plano aprovado.

## 1. Mostrar os campos novos na ficha do colaborador
Hoje a importação já grava RG, CTPS, título de eleitor, reservista, filiação (pai/mãe), nacionalidade, naturalidade, raça/cor, grau de instrução e deficiência, mas esses dados não aparecem nem podem ser editados na tela do colaborador — ficam invisíveis.
- Novo bloco "Documentos e filiação" na aba Dados do cadastro do colaborador, com esses campos editáveis.
- Os mesmos dados visíveis na ficha de consulta do colaborador.

## 2. Comparar antes de atualizar quem já existe
Quando o CPF já está cadastrado, hoje a atualização preenche só o que está vazio, sem você ver o que muda.
- Tela de comparação lado a lado (o que está no sistema × o que veio na ficha), campo a campo, com marcação do que deseja atualizar.

## 3. Aplicar unidade, setor e cargo em vários de uma vez
Com 44 fichas num arquivo só, definir pessoa por pessoa é lento.
- Seleção múltipla na lista e barra de ação para aplicar a mesma unidade/setor a todos os selecionados e criar em lote.
- Cargo sem correspondência: confirmação explícita para criar o cargo novo, com o nome e o CBO lidos da ficha.

## 4. Guardar a ficha original no colaborador
- O PDF enviado fica anexado ao colaborador criado, com a indicação da página de origem, junto com os demais documentos dele.
- Na revisão, o trecho de texto lido da ficha fica visível quando a confiança do campo for baixa.

## Detalhes técnicos
- `ColaboradorFormDialog.tsx` e `ColaboradorFichaDialog.tsx`: seção nova com as colunas já criadas em `dp_colaboradores` (rg_*, ctps_*, titulo_eleitor*, reservista*, nome_pai/nome_mae, nacionalidade, naturalidade, raca_cor, grau_instrucao, deficiencia); validação Zod em `src/lib/validations.ts`.
- Novos componentes em `src/components/dp/ficha-registro/`: `FichaComparacaoDialog.tsx`, `CargoCorrespondenciaDialog.tsx`, `AplicarEmLoteBar.tsx`; `FichaRevisaoCard.tsx` ganha checkbox de seleção e o painel de `texto_origem`.
- `useDpFichaImportacao.tsx`: mapa de campos escolhidos no update, aplicação em lote sequencial com erro isolado por item, e vínculo do PDF (`arquivo_path` no bucket `dp-bulk-import`) em `dp_colaborador_documentos` com a página de origem.
- Sem novas tabelas nem novas edge functions.
