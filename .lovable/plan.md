# Remover as telas em desenvolvimento (SESMT, Ponto, Folha, Rescisões)

Objetivo: tirar do sistema, de vez, as telas que estavam marcadas como "em desenvolvimento" e nunca serão usadas — com os dados que elas guardavam.

Benefícios continua como está, em Cadastros › Benefícios. Só o endereço antigo `/dp/beneficios` deixa de existir.

## O que sai

- **SESMT** (exames/ASO, EPIs e entregas, treinamentos e participações) — é a única dessas telas que ainda existe de fato.
- **Ponto** (tela principal, Ponto do time, Apuração) e **Folha** (tela principal, Provisões, Relatórios, período) e **Rescisões** — hoje já são apenas desvios para o início do módulo; os arquivos ficaram parados no projeto e serão apagados.
- O item "SESMT — Em breve" desaparece do menu e a lista de telas escondidas fica vazia.
- Endereços antigos (`/dp/conformidade`, `/dp/ponto`, `/dp/folha`, `/dp/rescisoes`, `/dp/beneficios`, etc.) passam a cair no início de Pessoas 360°, para ninguém receber "página não encontrada" em link salvo ou favorito.

## Ajustes em telas que ficam

- **Pendências**: deixam de existir os avisos de folha de ponto, exame/ASO vencido, troca de EPI e treinamento a vencer. Os demais avisos (documentos, férias, folgas, aniversários) continuam iguais.
- **Benefícios (vale-alimentação/transporte)**: o cálculo de dias deixa de olhar as marcações de ponto e passa a usar apenas escala publicada, folgas, férias, convocações e a jornada habitual — que é o que já valia na prática, já que ponto não era usado.
- Nada muda no que o colaborador vê no portal, e a importação de documentos de folha e ponto (arquivos vindos da contabilidade) continua funcionando normalmente.

## Dados apagados

Depois de conferir que não sobrou nada em uso, apago as tabelas dessas telas: exames/ASO, EPIs e entregas, treinamentos e participações, marcações de ponto, ajustes e fechamentos de ponto, períodos e lançamentos de folha. Isso não tem como desfazer.

## Detalhes técnicos

Frontend
- Apagar páginas: `DpConformidade.tsx`, `DpPonto.tsx`, `DpPontoConsolidado.tsx`, `DpPontoApuracao.tsx`, `DpFolha.tsx`, `DpFolhaPeriodo.tsx`, `DpFolhaProvisoes.tsx`, `DpFolhaRelatorios.tsx`, `DpRescisoes.tsx`.
- Apagar hooks/componentes exclusivos: `useDpConformidade.tsx`, `components/dp/conformidade/*`, `useDpPonto.tsx`, `useDpPontoAjustes.tsx`, `useDpPontoFechamento.tsx`, `useDpPontoMes.tsx`, `useDpFolha.tsx`, `useDpFolhaApuracao.tsx`, `useDpFolhaRelatorios.tsx`, `useDpProvisoes.tsx`, `useDpRescisao.tsx`, `ModuloEmDesenvolvimentoGate.tsx` (e componentes de folha/ponto/rescisão sem outro uso — confirmar por busca antes de remover).
- `App.tsx`: remover imports e rotas dessas telas; manter um redirecionamento único para `/dp` nesses caminhos, incluindo `/dp/beneficios` → `/dp/cadastros/beneficios`.
- `dpNavigation.tsx`: remover `ADMIN_DIRECT` (item SESMT) e o campo `direct` se ficar sem uso.
- `useDpPendencias.tsx`: remover as fontes `dp_pontos`, `dp_exames_aso`, `dp_epis_entregas`, `dp_treinamentos_participacoes` e os tipos/filtros correspondentes; ajustar `useDpPendenciasColaborador.tsx` e testes de pendências afetados.
- `useDpValeCalculadora.tsx`: remover a consulta a `dp_pontos` e o parâmetro `pontos` do cálculo; ajustar testes de VA/VT.
- Manter `possui_folha_ponto`, `documentos-requisitos.ts`, `DpConformidadeDsr.tsx` (usado em Folgas) e `DpDisciplinar.tsx`.

Banco (uma migração, após checagem)
- `DROP TABLE` em: `dp_exames_aso`, `dp_epis_entregas`, `dp_epis`, `dp_treinamentos_participacoes`, `dp_treinamentos`, `dp_ponto_ajustes`, `dp_ponto_fechamentos`, `dp_pontos`, `dp_folha_lancamentos`, `dp_folha_periodos`.
- Remover objetos dependentes: funções/triggers `dp_conformidade_autofill`, `dp_ponto_*`, `dp_folha_*`, `dp_beneficios_gerar_lancamentos` e enums só usados por elas (`dp_exame_tipo`, `dp_exame_resultado`, `dp_treinamento_status`, `dp_ponto_tipo`, `dp_ponto_origem`, `dp_ponto_ajuste_acao`, `dp_folha_*`), mais políticas/grants e qualquer cron ligado a ponto/folha. Levantar a lista exata com consulta de dependências antes de escrever a migração.
- `app_hidden_screens`: limpar as rotas removidas.
- Rever `src/test/rls/security_regressions.rls.test.ts` e outros testes que citem essas tabelas.

Validação: `bunx tsgo --noEmit`, `bunx vitest run` e abertura das telas de Pendências, Benefícios e Folgas.
