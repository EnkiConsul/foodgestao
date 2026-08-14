# Menu lateral personalizável (começando pelo DP)

Boa ideia — e dá para fazer sem tornar o menu confuso. A proposta: o usuário entra num "modo organizar", arrasta grupos e itens para a ordem que preferir, e salva. Nada é escondido e nenhuma rota muda; apenas a ordem de exibição.

## Como o usuário usa

1. No rodapé da sidebar do DP aparece a ação "Organizar menu".
2. Abre um painel de organização com a lista de grupos (Rotina do Dia, Folgas e Férias, Ponto, Folha, Documentos, ...) e, dentro de cada grupo, seus itens. Tudo arrastável por uma alça (ícone de grip), com teclado suportado.
3. Botões: "Salvar", "Cancelar" e "Restaurar padrão".
4. "Restaurar padrão" volta para o padrão da empresa se existir; caso contrário, para o padrão de fábrica do sistema.

Se o admin da empresa criar um padrão, todo mundo passa a ver aquele padrão como base. Quem já tinha personalizado mantém a sua ordem; a base da empresa vale para quem nunca mexeu ou para quem clicar em restaurar.

## Regras de comportamento

- A ordem é sempre um "overlay" sobre o menu de fábrica: itens novos criados em versões futuras aparecem automaticamente no fim do grupo a que pertencem, nunca desaparecem.
- Itens removidos do sistema são ignorados silenciosamente na ordem salva.
- A ordem vale para a sidebar desktop e para o menu "Mais" do mobile (mesma fonte de dados), mantendo a paridade atual.
- Início continua fixo no topo e Configurações do DP fixo no fim, para não quebrar a orientação.
- Itens marcados como "Em breve" (Ponto e Folha) continuam com o selo e podem ser reordenados normalmente.
- O admin acessa "Definir como padrão da empresa" dentro do mesmo painel (visível só para admin/gestor de DP), aplicando a ordem que está montada na tela.

## Detalhes técnicos

Modelo de dados da ordem (JSON, versionado):

```text
{ v: 1, groups: ["rotina-dia", "folgas-ferias", ...],
  items: { "rotina-dia": ["/dp/operacao", "/dp/escalas/mes", ...] } }
```

- `src/config/dpNavigation.tsx`: adicionar `id` estável a cada `DpNavGroup` (slug fixo, independente do rótulo). Itens usam o `to` como chave.
- `src/lib/dp/menuLayout.ts` (novo): tipos do layout, merge do overlay com o menu de fábrica (`applyMenuLayout`), extração da ordem atual e validação/limpeza de chaves obsoletas. Testes unitários cobrindo item novo, item removido e layout vazio.
- Preferência do usuário: gravar em `dp_user_prefs.extras.menu_layout.dp` — já existe hook `useDpUserPrefs` com merge de `extras`, sem migração de schema.
- Padrão da empresa: nova tabela `public.dp_menu_defaults (id, company_id, surface text, layout jsonb, updated_by, updated_at)` com GRANTs (`select` para `authenticated`, `all` para `service_role`), RLS de leitura para membros da empresa e escrita apenas para admin/gestor de DP via as funções de autorização já usadas no DP.
- `src/hooks/useDpMenuLayout.tsx` (novo): resolve a ordem efetiva (usuário > padrão da empresa > fábrica), expõe `salvar`, `restaurarPadrao` e `definirPadraoDaEmpresa` com invalidação de cache.
- `src/components/dp/OrganizarMenuDialog.tsx` (novo): dialog com `@dnd-kit/core` + `@dnd-kit/sortable` (já instalados), listas aninhadas grupo/itens, alça de arraste com `aria-label` e suporte a teclado.
- `src/components/dp/DpSidebar.tsx` e `src/config/mobileNav.tsx`: passar a derivar as listas do hook em vez do array estático, e adicionar a ação "Organizar menu" no rodapé da sidebar.
- Validação: teste de paridade existente (`mobileNav.parity.test.ts`) atualizado para a ordem resolvida, mais checagem no preview arrastando um grupo, salvando e recarregando.

A mesma infra fica pronta para reaproveitar depois em Financeiro, Pedidos e Portal apenas informando outra `surface`.
