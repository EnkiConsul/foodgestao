# Próxima etapa — Fase 5: Financeiro (aparência e uso no celular)

## Situação

- Fase 2 (calendários no celular) concluída.
- Fase 3 (Pessoas 360° e Portal do Gestor) concluída.
- Fase 4 (Portal do Colaborador) concluída: as 13 telas do portal já usam o mesmo cabeçalho e estrutura padrão, com abas roláveis no celular.
- Falta a Fase 5 (Financeiro) e a Fase 6 (revisão final de consistência).

## O que a Fase 5 vai cobrir

Somente apresentação: nada de regra de cálculo, permissão, integração ou banco.

Telas incluídas:
- Painel e Fluxo de Caixa
- Lançamentos (contas a pagar/receber) e seus filtros e formulários
- Contas bancárias, Cartões de crédito e Faturas
- Categorias, Contas contábeis, Centros de custo, Formas de pagamento
- Contatos (clientes/fornecedores)
- Orçamento
- Extrato e conciliação, Conexões e Categorização automática
- Relatórios
- Empresas, Gestão de usuários, Configurações, Mais e Buscar
- Planos, Checkout e primeiro acesso (apenas leitura visual, sem tocar em cobrança)

Entregas por tela:
1. Cabeçalho padronizado: título e descrição em uma coluna, filtros e ações em linha própria que quebra no celular.
2. Filtros: agrupados, sem estourar a largura; barra rolável ou painel recolhível no celular.
3. Tabelas: rolagem interna quando largas, nunca rolagem lateral da página; cartões onde já existirem.
4. Janelas e formulários: largura adequada, duas colunas viram uma no celular, botões finais sempre alcançáveis.
5. Textos: títulos de página, janelas e abas com Iniciais Maiúsculas; sem texto todo em caixa alta.
6. Valores e datas sem quebra estranha; modo de privacidade preservado.

## Como será validado

- Testes de tela em 360, 390 e 412 px e em 1280, 1366 e 1440 px.
- Sem rolagem lateral, sem sobreposição, sem novo erro no console.
- Verificação de tipos e a suíte de testes ao final da fase.

## Detalhes técnicos

Reutilizar `DpPage`/`DpPageHeader` (ou equivalente do financeiro), `ResponsiveDataTable` com scroll interno, `min-w-0` em contêineres flex, `flex-wrap` nas barras de filtro e `max-w` coerente nos `Dialog`/`Sheet`. Sem alteração em hooks de dados, RPCs, RLS ou schema.

## Fora do escopo

Novas funcionalidades, mudanças de banco, integrações, regras financeiras e refatoração de lógica de estado.

## Depois desta fase

Fase 6 — varredura final de consistência entre Pessoas 360°, Financeiro e os dois portais (espaçamentos, ícones, microcopy e estados vazios).
