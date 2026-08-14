# Máscara "Módulo em desenvolvimento" para Ponto e Folha

Pausar a entrega de Ponto e Folha de Pagamento sem apagar nada do que já foi construído. As telas continuam no código, nas rotas e no menu — só deixam de ser utilizáveis, exibindo um aviso claro de que o módulo está em desenvolvimento.

## Como fica para o usuário

- Os itens de **Ponto** e **Folha de Pagamento** continuam visíveis no menu do DP e no portal do colaborador, agora com um selo **"Em breve"**.
- Ao clicar em qualquer tela desses módulos, aparece uma página de aviso: título "Módulo em desenvolvimento", explicação de que a funcionalidade está sendo finalizada e será liberada em breve, e botões para voltar ao DP 360° (ou ao portal, no caso do colaborador).
- O aviso vale para todos, inclusive administradores — não há atalho para ver a tela real.
- Nenhum dado é apagado: tudo que já foi lançado em ponto e folha permanece no banco.

## Telas cobertas pela máscara

Ponto: espelho de ponto, ponto do time, apuração para folha, registrar ponto (portal).
Folha: folha de pagamento e período, provisões de férias/13º, rescisões, relatórios da folha, contracheque do colaborador.

Continuam funcionando normalmente: escalas, operação do dia, folgas, férias, convocações, colaboradores, documentos, comunicação e todo o financeiro.

## Detalhes técnicos

1. **Novo componente `src/components/dp/ModuloEmDesenvolvimentoScreen.tsx`**
   - Tela de aviso usando os tokens do design system (card centralizado, ícone de construção, texto e ações de voltar).
   - Props: `titulo` do módulo e destino do botão voltar (`/dp` ou `/dp/meu`).

2. **Novo wrapper `src/components/dp/ModuloEmDesenvolvimentoGate.tsx`**
   - Recebe `module: AppModule` e `children`; se o módulo estiver na lista de pausados, renderiza a tela de aviso; caso contrário, renderiza `children`.
   - Lista de pausados em `src/lib/dp/moduleMap.ts` como `MODULOS_EM_DESENVOLVIMENTO: AppModule[] = ["ponto", "folha"]` + helper `isModuleEmDesenvolvimento(module)`. Reativar depois é remover o item dessa lista.

3. **`src/App.tsx`**
   - Envolver os elementos das rotas de ponto/folha (`ponto`, `ponto/time`, `ponto/apuracao`, `folha`, `folha/provisoes`, `folha/relatorios`, `folha/:id`, `rescisoes`, e no portal `meu/ponto`, `meu/contracheque`) com o gate.
   - Imports das páginas permanecem intactos (lazy) — nada é removido.

4. **`src/config/dpNavigation.tsx`**
   - Adicionar campo opcional `badge?: string` em `DpNavItem` e marcar os itens de Ponto e Folha (admin e portal) com `badge: "Em breve"`.
   - Renderizar o badge em `src/components/dp/DpSidebar.tsx` e no menu "Mais" (`src/config/mobileNav.tsx` / página `Mais`), com estilo discreto (`variant="secondary"`, texto pequeno).
   - Remover esses itens de `shortcut: true` para não ocuparem espaço na BottomNav mobile.

5. **Pendências do DP**
   - Em `src/hooks/useDpPendencias.tsx`, deixar de contabilizar pendências originadas de ponto e folha enquanto os módulos estiverem pausados, evitando alertas que levam a telas mascaradas.

6. **Sem mudanças no banco**: nenhuma tabela, RLS ou função é alterada; o catálogo de módulos (`ponto`/`folha`) segue como está.
