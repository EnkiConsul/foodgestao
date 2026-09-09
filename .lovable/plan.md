# Importar documentos: aviso fixo do atalho e duplicidade visível na conferência

## 1. Por que existe o aviso "Importando: Contracheque Mensal · junho/2026 · Pakerê T-63"

Não é uma notificação do sistema: é a "lembrança" do atalho que você usou. Ao clicar em **Resolver** numa pendência (ou em **Importar este** na Conferência), a tela de Importar abre já com o tipo, a competência e a unidade escolhidos, e esse aviso mostra o que está sendo importado, além de pré-preencher o formulário.

O detalhe é que essa informação fica gravada no endereço da tela. Então fechar no "x" só esconde naquele momento — ao voltar para Importar, recarregar ou navegar de novo, o aviso reaparece; e depois de concluir a importação ele continua lá, parecendo pendência.

Correções:

- Fechar no "x" apaga de verdade o contexto do atalho: o aviso não volta e o formulário fica limpo para um novo envio.
- Ao concluir a importação daquele tipo/competência, o aviso desaparece sozinho.
- Texto mais claro ("Você veio da pendência X — o formulário abaixo já está preenchido") com botão **Limpar**.

## 2. Duplicidade só aparece na hora de aprovar

Hoje a conferência só marca duplicidade quando a mesma página se repete dentro do próprio PDF. A checagem contra documentos já salvos (mesmo colaborador, mesmo tipo, mesma competência) só acontece quando você clica em **Aprovar** — por isso a surpresa do "já existe, quer substituir?".

Correções:

- A conferência passa a checar, assim que o lote é carregado, se cada página já tem documento salvo daquela competência.
- Cada página duplicada recebe um selo laranja "Já existe documento desta competência" com o resumo do documento existente, e o cartão traz duas ações diretas: **Ignorar esta página** ou **Substituir o existente**.
- No topo da conferência aparece um resumo: "N de M páginas já existem no sistema", com atalho para ir à primeira duplicada.
- O diálogo atual de aprovação continua existindo como rede de segurança, mas quando você já decidiu página por página ele não precisa mais perguntar.
- Nada é apagado sem confirmação; substituir continua registrando o histórico como hoje.

## Detalhes técnicos

- `src/pages/dp/DpDocumentosImportar.tsx`: usar a forma de escrita de `useSearchParams` para remover `tipo`, `competencia`, `unidade`, `lote` (com `replace: true`) ao fechar/limpar o aviso, em vez do estado local `avisoAberto`; guardar o pré-preenchimento em estado inicializado da URL para sobreviver à limpeza; limpar também quando o lote correspondente conclui.
- `src/components/dp/documentos/BulkReviewInline.tsx`:
  - novo `useQuery` chamando `detectDuplicates` (já existente em `src/lib/dp/bulk-duplicates.ts`) para todas as páginas pendentes vinculadas, com chave `["dp_bulk_dups", batchId, rowsSignature]`, revalidando quando colaborador/competência de alguma página muda;
  - mapa `item_id -> DuplicateHit` alimentando selo no cartão da página (ao lado do badge de `duplicate_of`) e o resumo no topo;
  - estado local `decisoesDup: Record<string, "skip" | "replace">`; `proceedApprove` respeita essas decisões — envia os "replace" com `on_duplicate: "replace"`, marca os "skip" como ignorados (reaproveitando `ignorarDuplicados`) e só abre `ConfirmarSubstituicaoDialog` para colisões ainda sem decisão.
- `src/lib/dp/bulk-duplicates.ts`: expor também `referencia_data`/`tipo` do documento existente no `DuplicateHit` para o texto do selo.
- Testes: casos puros para a resolução das decisões (quais ids vão para aprovar, substituir e ignorar) em `src/lib/dp/__tests__`.
- Sem migrations, sem alteração de edge functions, RLS, permissões ou multiempresa.

## Verificação

- Typecheck e suíte de testes de `src/lib/dp` e `src/hooks`.
- Playwright em 360 px e 1280 px: abrir a tela com atalho de pendência (fechar o aviso e recarregar) e conferir os selos de duplicidade num lote com competência já importada.

## Rollback

- Reverter os arquivos citados; nenhum dado envolvido.
