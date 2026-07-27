## Problema

O menu **Mais** (mobile) é alimentado por `src/config/mobileNav.tsx`, que ficou desatualizado em relação às sidebars de desktop. Comparando com `src/components/dp/DpSidebar.tsx`, faltam no mobile as telas criadas nas últimas fases:

**Grupo Cadastro (DP)**
- Jornadas e Escalas (`/dp/cadastros/jornadas`)

**Grupo Folgas (DP)**
- Férias (`/dp/ferias`)
- Gerador de Escala (`/dp/escalas`)
- Conformidade DSR (`/dp/conformidade-dsr`)
- Regras de Folgas (`/dp/folgas/configuracoes/regras`)
- Prefixos de destaque (`matchPrefixes`) sem `/dp/ferias`, `/dp/escalas`, `/dp/conformidade-dsr`

**Itens de topo do DP (hoje inexistentes no Mais)**
- Conformidade (`/dp/conformidade`)
- Benefícios (`/dp/beneficios`)
- Analytics de RH (`/dp/analytics`)

**Portal do colaborador**
- Mural (`/dp/meu/mural`) está nos atalhos, mas confirmar presença como item no Mais

## O que será feito

1. **Atualizar `src/config/mobileNav.tsx`**
   - Adicionar os itens faltantes nos subgrupos Cadastro e Folgas do módulo `dp`, na mesma ordem da sidebar.
   - Criar um bloco de links diretos (Conformidade, Benefícios, Analytics de RH) dentro do grupo "DP 360°".
   - Completar `matchPrefixes` para que os grupos fiquem destacados ao navegar nessas rotas.
   - Revisar o grupo do portal do colaborador para paridade com `PORTAL_ITEMS`.

2. **Atalhos da barra inferior**
   - Ampliar `dpShortcuts` com as novas telas (Férias, Escalas, Analytics, Benefícios), para que fiquem disponíveis ao personalizar os slots A/B da barra e como favoritos.

3. **Guarda contra novas divergências**
   - Adicionar um teste unitário que compara as rotas de `DpSidebar` com as de `MODULE_NAV.dp`, falhando quando um item existir no desktop e não no mobile.

## Detalhes técnicos

- Nenhuma mudança de backend, rota ou lógica de negócio; apenas configuração de navegação e um teste.
- Os ícones seguirão os já usados na sidebar (`Palmtree`, `CalendarRange`, `Clock`, `ShieldCheck`, `Gift`, `BarChart3`, `Settings`).
- Favoritos existentes continuam válidos (são salvos por `to`, que não muda).
- Validação: `tsgo` + suíte de testes.
