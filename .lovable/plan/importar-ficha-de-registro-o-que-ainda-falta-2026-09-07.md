# Importar ficha de registro — o que ainda falta

A leitura do PDF, a separação por pessoa, a revisão e a criação/atualização do cadastro já funcionam. Sobraram quatro pontos do plano aprovado.

## 1. Mostrar os campos novos na ficha do colaborador
Hoje a importação já grava RG, CTPS, título de eleitor, reservista, filiação (pai/mãe), nacionalidade, naturalidade, raça/cor, grau de instrução e deficiência, mas esses dados não aparecem nem podem ser editados na tela do colaborador — ficam invisíveis.
- Novo bloco "Documentos e filiação" na aba Dados do cadastro do colaborador, com esses campos editáveis.
- Todos opcionais: nenhum deles impede salvar o cadastro nem gera pendência obrigatória.
- Os mesmos dados visíveis na ficha de consulta do colaborador.

## 2. Comparar antes de atualizar quem já existe
Quando o CPF já está cadastrado, hoje a atualização preenche só o que está vazio, sem você ver o que muda.
- Tela de comparação lado a lado (o que está no sistema × o que veio na ficha), campo a campo, com marcação do que deseja atualizar.

## 3. Cargo e turno lidos de cada ficha
Nada de aplicar cargo, turno ou horário igual para todo mundo: cada ficha é lida individualmente.
- Cargo: usa o cargo e o CBO daquela ficha; se não houver cargo igual cadastrado, aparece a confirmação para criar o cargo com o nome e o CBO da própria ficha.
- Turno/jornada: o horário lido da ficha é comparado com os turnos cadastrados; havendo turno equivalente ele é sugerido, senão fica a jornada da ficha por dia da semana.
- Unidade e setor continuam sendo escolhidos por você quando a ficha não indicar — nunca adivinhados.
- A revisão continua pessoa por pessoa, mostrando o que foi lido em cada ficha.

## 4. Guardar a ficha original no colaborador
- O PDF enviado fica anexado ao colaborador criado, com a indicação da página de origem, junto com os demais documentos dele.
- Na revisão, o trecho de texto lido da ficha fica visível quando a confiança do campo for baixa.

## Detalhes técnicos
- `ColaboradorFormDialog.tsx` e `ColaboradorFichaDialog.tsx`: seção nova com as colunas já criadas em `dp_colaboradores` (rg_*, ctps_*, titulo_eleitor*, reservista*, nome_pai/nome_mae, nacionalidade, naturalidade, raca_cor, grau_instrucao, deficiencia); no Zod de `src/lib/validations.ts` todos entram como `.optional()`/nullable, sem obrigatoriedade.
- Novos componentes em `src/components/dp/ficha-registro/`: `FichaComparacaoDialog.tsx` e `CargoCorrespondenciaDialog.tsx` (usa `matchCargo` de `src/lib/dp/ficha-registro/cargo-match.ts` por item); `FichaRevisaoCard.tsx` ganha o painel de `texto_origem` e a sugestão de turno.
- Sugestão de turno: comparar `jornadaDaFicha` (de `useDpFichaImportacao.tsx`) com os turnos da empresa por entrada/saída/intervalo; sem equivalente, grava os dias em `dp_colaborador_config_dias` sem `turno_id`.
- `useDpFichaImportacao.tsx`: mapa de campos escolhidos no update e vínculo do PDF (`arquivo_path` no bucket `dp-bulk-import`) em `dp_colaborador_documentos` com a página de origem.
- Sem novas tabelas nem novas edge functions.
