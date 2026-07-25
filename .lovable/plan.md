## Objetivo

Criar uma tela dedicada em **Cadastro → Pendências** onde o admin da empresa configura os prazos usados pelo quadro de pendências. Hoje o form vive em `/dp/configuracoes`; ele será movido para o novo caminho, evitando duplicação.

## O que vai ser feito

1. **Nova página** `src/pages/dp/cadastros/DpCadastroPendencias.tsx`
   - Header padrão `DpPageHeader` (ícone `BellRing`, título "Prazos de pendências", descrição curta).
   - Card com o mesmo formulário já existente (`PrazosLembretesCard`) — 6 campos:
     - Solicitações (dias para responder)
     - Trocas (dias para aprovação do gestor)
     - Contracheque (dia limite do mês)
     - Adiantamento (dias após o dia de pagamento)
     - Folha de ponto (dia limite do mês)
     - Negociação coletiva (dias antes do vencimento)
   - Usa `useDpPendenciasConfig` (já criado). Salvar invalida `["dp_pendencias"]` e mostra toast.
   - Bloco de ajuda explicando que os prazos se aplicam **por empresa** (respeitando o contexto ativo PF/PJ) e afetam o quadro de pendências da home do DP.

2. **Rota** em `src/App.tsx`
   - Adicionar `<Route path="cadastros/pendencias" element={<DpCadastroPendencias />} />` dentro do bloco DP.

3. **Hub de Cadastro** (`src/pages/dp/DpCadastrosHub.tsx`)
   - Adicionar card **"Pendências"** com ícone `BellRing`, descrição "Prazos e lembretes do quadro de pendências.", `url: /dp/cadastros/pendencias`.

4. **Sidebar do módulo DP** (`src/config/dpNav.ts` ou equivalente)
   - Adicionar item "Pendências" como filho de "Cadastro", apontando para a nova rota.

5. **Atalho a partir do quadro de pendências**
   - No `PendenciasCard` (home do DP), adicionar um pequeno botão de engrenagem no header linkando para `/dp/cadastros/pendencias` (visível apenas para admins).

6. **Remoção da duplicação em `/dp/configuracoes`**
   - Excluir o card `PrazosLembretesCard` de `src/pages/dp/DpConfiguracoes.tsx` e todos os imports órfãos (`useDpPendenciasConfig`, `BellRing`, `useEffect`, `PRAZO_FIELDS`).
   - Deixar em Configurações apenas os módulos que já existiam antes (regras de bloqueio, limites, etc.), preservando o resto da tela.

## Detalhes técnicos

- A tabela `dp_pendencias_config` e o hook `useDpPendenciasConfig` já existem — nenhuma migration nova é necessária.
- A permissão de acesso segue o mesmo padrão das demais páginas de Cadastro (admin/gestor da empresa). Colaborador comum não vê o item na sidebar nem no hub.
- Validação client-side reutiliza a lista `PRAZO_FIELDS` (mín/máx por campo) já presente em `DpConfiguracoes.tsx`; ela é movida para dentro da nova página.

## Fora de escopo

- Nenhuma alteração de schema, RLS ou lógica do `useDpPendencias`.
- Sem novos tipos de prazo — apenas UI/rota/organização.
