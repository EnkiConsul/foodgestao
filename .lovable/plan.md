

# FinControl — Plataforma de Gestão Financeira

## Visão Geral
Plataforma SaaS de gestão financeira para MEIs, Pequenas Empresas e Pessoas Físicas no Brasil, com modo híbrido PF + PJ. Design mobile-first, em português (PT-BR), com identidade visual em azul escuro (#1B3A5C) e fonte Inter.

---

## Fase 1 — Fundação

### 1. Autenticação e Onboarding
- Login com e-mail/senha e Google OAuth via Supabase Auth
- Cadastro com validação em tempo real (Zod)
- Fluxo de onboarding guiado em 4 etapas:
  - Tipo de perfil (PF, MEI, Microempresa, Híbrido)
  - Dados do perfil/empresa
  - Criação da primeira conta financeira
  - Seleção de categorias sugeridas
- Barra de progresso e opção de pular

### 2. Layout e Navegação
- Sidebar fixa no desktop (240px) com menu de navegação
- Bottom navigation bar no mobile (5 ícones principais)
- Header com perfil ativo (PF/PJ), toggle de privacidade e notificações
- Toggle PF/PJ para modo híbrido
- Busca global (Ctrl+K)
- Tema claro/escuro

### 3. Dashboard
- Card de saldo consolidado com variação mensal
- Gráfico receitas vs despesas (barras)
- Top 5 categorias de despesa (donut)
- Contas próximas do vencimento
- KPIs: taxa de poupança, gasto médio diário (PF) / margem, ticket médio (PJ)
- Seletor de período (Mês, Trimestre, Ano, Custom)
- Modo privacidade (ocultar valores)

### 4. Lançamentos e Transações
- Lista de transações com scroll infinito
- Filtros por período, categoria, conta, tipo e status
- Busca textual
- Formulário de novo lançamento (Receita/Despesa/Transferência)
- Input monetário com máscara R$
- Categorias hierárquicas, tags, centro de custo
- Recorrência e parcelamento
- Upload de anexos
- Ações em lote (categorizar, excluir)
- Botão FAB no mobile

### 5. Categorias e Tags
- Árvore hierárquica de categorias com ícones e cores
- CRUD de categorias, subcategorias e tags
- Separação por contexto (PF/PJ)
- Merge de categorias

### 6. Configurações Essenciais
- Edição de perfil e foto
- Gerenciamento de empresas
- Tema e aparência
- Alterar senha
- Configurações regionais (moeda, fuso)

---

## Fase 2 — Core Financeiro

### 7. Contas a Pagar e a Receber
- Lista com filtros e badges de status (em dia, vence em breve, atrasado, pago)
- Visão calendário com indicadores de cor
- Registro de pagamentos parciais
- Totalizadores (a pagar, a receber, saldo previsto)
- Relatório de aging (faixas de atraso)

### 8. Fluxo de Caixa
- Gráfico de área/linha com entradas, saídas e saldo acumulado
- Toggle diário/semanal/mensal
- Tabela detalhada com drill-down
- Cards de saldo atual, projetado e mínimo
- Filtros por conta, categoria, contexto
- Comparação entre períodos
- Exportação PDF/Excel/CSV

### 9. Orçamento e Planejamento
- Grid de cards por categoria com barra de progresso
- Criar/editar orçamento mensal ou anual
- Alertas configuráveis (70%, 90%, 100%)
- Comparativo orçado vs realizado (gráfico de barras)
- Drill-down em transações por categoria

### 10. Relatórios
- Central de relatórios (hub com cards)
- DRE — Demonstrativo de Resultados
- Relatório de receitas e despesas (por categoria, por período)
- Relatório orçado vs realizado
- KPIs com sparklines e tendências
- Exportação em PDF e Excel formatados

### 11. Gestão de Clientes e Fornecedores
- Lista de contatos (clientes/fornecedores) com busca e filtros
- Perfil do contato com histórico de transações
- Saldo devedor/credor
- Rankings (top clientes/fornecedores)

---

## Banco de Dados (Lovable Cloud / Supabase)
- ~16 tabelas conforme modelagem do documento
- RLS (Row Level Security) em todas as tabelas
- Trigger de criação automática de perfil no cadastro
- Categorias pré-configuradas por tipo de perfil

## Design System
- Cores: Azul escuro (#1B3A5C), Verde (#27AE60) para receitas, Vermelho (#E74C3C) para despesas
- Fonte Inter, border-radius 8px, sombras sutis
- Mobile-first, responsivo em 3 breakpoints
- Componentes shadcn/ui + Recharts para gráficos

