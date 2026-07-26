## Minha recomendação (crítica)

Concordo com você em manter um gesto de voltar, mas com uma correção importante de direção:

Em iOS (swipe back nativo) e Android (predictive back), **arrastar da borda ESQUERDA para a direita = Voltar**. É o gesto mais memorizado que existe no mobile. Hoje o app usa essa borda para abrir a sidebar — isso conflita com o instinto do usuário e é a raiz da confusão.

Já o menu não precisa de gesto privilegiado: ele tem botão dedicado ("Mais") na barra inferior. Gestos devem servir ações **sem** atalho visível óbvio.

Proposta final:

```text
Borda ESQUERDA  →  arrasta para a direita  =  VOLTAR (history back)
Borda DIREITA   →  arrasta para a esquerda =  Abrir "Mais" (menu completo)
```

O Hub deixa de ter gesto (já é o slot 1 da barra e continua acessível). A sidebar lateral também deixa de abrir por gesto no mobile — "Mais" já é o menu completo mobile.

## O que muda

**1. `src/hooks/useEdgeGestures.ts`**
- Borda esquerda → `navigate(-1)`. Guarda de segurança: se não houver histórico dentro do app (entrada direta), navega para a home do módulo ativo em vez de sair do site.
- Borda direita → navega para `config.moreTo` do módulo ativo (via `MODULE_NAV` + `useActiveModule`); se já estiver em `/mais`, o gesto vira "voltar" também (fecha).
- Mantém as travas atuais: ignora quando há dialog/sheet aberto, exige deslocamento mínimo, limita duração e desvio vertical.
- Adiciona: ignorar quando o toque começa sobre um elemento com scroll horizontal (carrossel/tabela), evitando gesto acidental.
- Só ativo em mobile (`isMobile`).

**2. Feedback tátil**
- `haptic(8)` no disparo de cada gesto, igual ao resto da barra inferior.

**3. Descoberta do gesto (uma vez só)**
- Na primeira visita mobile, um toast discreto: "Dica: arraste da borda esquerda para voltar e da direita para abrir o menu." Persistido em localStorage para não repetir.

## Detalhes técnicos

- Nenhuma mudança de backend, rotas ou lógica de negócio.
- `EdgeGestures` continua montado em `AppLayout` e `DpShell`, sem alteração de estrutura.
- `setOpenMobile` deixa de ser usado no hook; a sidebar mobile continua funcionando pelos botões existentes.
- Sem impacto no desktop.
