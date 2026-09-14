# Fase 10 — Experiência de uso e celular do Pessoas 360°

Diagnóstico feito lendo as telas administrativas e do Portal. Nada foi alterado ainda.
Regras de negócio, segurança, acesso, documentos e desligamento permanecem intactos.

## O que já está bom (será reaproveitado, não recriado)

Já existem os componentes certos, só não estão usados em todas as telas:
alternância tabela/cartão (`DpDataList` + `DpListCard`), filtros com busca sempre
visível e gaveta no celular (`DpFilters`), rodapé de formulário fixo com botões
grandes (`DpFormFooter`), janelas em tela cheia no celular (`DpDialogShell`),
estados vazios (`DpEmptyState`), erro com "Tentar novamente" (`DpErrorState`),
selos de situação em português (`MobileCardKit`).

## Problemas encontrados

### P1 — impede ou confunde o uso

1. Exclusões sem pedir confirmação: documento de férias, comentário do mural,
   dia da convocação, regra de férias, folga (tela de Folgas), pendência de
   cadastro, benefício e item do panorama da operação. Um toque errado apaga.
2. Escala do mês, Programação de férias e Histórico do Portal só existem como
   tabela larga: no celular exigem arrastar para o lado e a ação principal fica
   fora da tela.
3. Ações minúsculas (botões de 24 a 28 px) em Pendências, Mural, Férias,
   Ocorrências e Meus Documentos: difíceis de acertar com o dedo.

### P2 — dificulta o uso, principalmente no celular

4. Cada tela repete seus próprios filtros; em várias delas os filtros ocupam
   meia tela no celular em vez de ficarem na gaveta padrão.
5. Textos de botão inconsistentes para a mesma ação (Salvar/Gravar/Confirmar,
   Cancelar/Voltar/Fechar, Excluir/Remover/Apagar).
6. Estados vazios sem orientação: dizem "nenhum registro" sem indicar o próximo
   passo nem oferecer o botão da ação principal.
7. Formulários longos do colaborador com muitos campos visíveis de uma vez.
8. Ação principal de algumas telas fica no topo, longe do alcance do polegar.

### P3 — acabamento

9. Espaçamentos e tamanhos de cartão diferentes entre telas irmãs.
10. Alguns títulos e legendas com linguagem interna ("lote", "processamento").

## O que será feito

Prioridade P1 e P2; P3 só quando for o mesmo arquivo já em edição.

1. Confirmação clara em toda ação que apaga, com o nome do item na pergunta,
   usando o diálogo de confirmação já existente do módulo.
2. Escala do mês, Programação de férias e Histórico do Portal passam a mostrar
   cartões no celular e tabela no computador, com as mesmas informações e a ação
   principal sempre visível.
3. Área de toque mínima de 44 px em todas as ações dessas telas no celular.
4. Filtros dessas telas migram para o padrão único com busca visível e gaveta.
5. Padronização dos textos: Salvar, Cancelar, Excluir, Confirmar.
6. Estados vazios com uma frase de orientação e o botão da ação principal.
7. Linguagem simples: nenhum termo interno visível ao usuário.

Fora de escopo: redesenho, mudança de identidade visual, telas de outros módulos,
regras de negócio, banco de dados e migrations.

## Detalhes técnicos

- Telas/arquivos previstos: `DpEscalas.tsx`, `FeriasProgramacaoPanel.tsx`,
  `portal/DpMeuHistorico.tsx`, `portal/DpMeuDocumentos.tsx`, `DpFolgas.tsx`,
  `DpOcorrencias.tsx`, `DpConvocacoes.tsx` + `convocacoes/DiasSelecionadosLista.tsx`
  e `NovaConvocacaoPlanner.tsx`, `ferias/FeriasDocumentosCard.tsx` e
  `FeriasRegrasSection.tsx`, `comunicacao/MuralFeed.tsx`, `pendencias/PendenciaAcoes.tsx`,
  `DpBeneficios.tsx`, `DpOperacaoPanorama.tsx`, `DpAvisos.tsx`, `DpMensagens.tsx`.
- Reuso obrigatório de `DpDataList`/`DpListCard`, `DpFilters`, `DpDialogShell`,
  `DpFormFooter`, `DpEmptyState`, `ConfirmarAcaoDialog`; nenhum componente novo
  salvo um pequeno auxiliar de rótulos padronizados, se necessário.
- Sem migration, sem alteração de hooks de dados, RPCs, políticas ou permissões.
- Testes: confirmação obrigatória antes de excluir, alternância tabela/cartão nos
  breakpoints do projeto, formulário sem transbordo, janela utilizável em tela
  pequena, estado vazio com ação, navegação do Portal e modo pós-desligamento
  (somente documentos) inalterado.
- Validações: tipos, lint, suíte completa, build, `migrations-check`,
  isolamento multiempresa e security-lint mantendo a linha de base 63.
- Rollback: reverter o commit da fase (mudanças só de apresentação).
