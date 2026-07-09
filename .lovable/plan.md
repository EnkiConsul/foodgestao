# Modelo Padrão de Contas Contábeis (PJ)

## Objetivo
Ao criar uma nova empresa (Perfil de Acesso Empresa), o sistema gera automaticamente um Plano de Contas Contábil completo baseado no documento anexado, vinculado a essa empresa. O usuário pode livremente **editar, excluir, adicionar ou reorganizar** qualquer conta depois.

## Análise de impacto
- `chart_accounts` hoje **não é referenciada** por `transactions`, DRE, `accounts` ou qualquer outro módulo. Portanto, popular o modelo é seguro e não quebra nada.
- O módulo já tem trigger de auto-código hierárquico (`1`, `1.1`, `1.1.1`), então basta inserir na ordem correta com `parent_id` — os códigos são gerados automaticamente.
- Categorias, DRE (`dre_rubricas`, `dre_categoria_mapeamento`) e transactions permanecem **inalterados**. O plano de contas é uma camada contábil paralela.
- RLS de `chart_accounts` já está por `user_id` — inserir via trigger `SECURITY DEFINER` na criação da empresa funciona normalmente.

## Estrutura do modelo padrão (do documento)
9 grupos raiz sintéticos, ~90 contas no total:

```text
1  ATIVO (S)
  1.1 ATIVO CIRCULANTE (S) → Caixa, Bancos, Aplicações, Clientes a Receber, Cartões a Receber, Empréstimos Concedidos, Adiantamentos, Estoques
  1.2 ATIVO NÃO CIRCULANTE (S) → Investimentos LP, Veículos, Máq/Equip, Informática, Móveis, Imóveis, Softwares/Intangíveis
2  PASSIVO (S)
  2.1 CIRCULANTE (S) → Fornecedores, Empr/Fin CP, Cartões a Pagar, Salários, Encargos, Impostos, Aluguéis, Outras
  2.2 NÃO CIRCULANTE (S) → Empr LP, Fin LP, Parc. Tributários
3  PATRIMÔNIO LÍQUIDO (S) → Capital Social, Aportes, Lucros Ac., Prejuízos Ac., Distribuição
4  RECEITAS (S) → Vendas, Serviços, Assinaturas, Comissões, Rec. Financeiras, Outras
5  CUSTOS (S) → CMV, CPV, CSP, Matéria-Prima, Terceirização
6  DESPESAS OPERACIONAIS (S)
  6.1 ADMINISTRATIVAS (S) → Aluguel, Condomínio, Energia, Água, Internet, Softwares, Material, Contábil, Jurídico, Consultoria
  6.2 COMERCIAIS/MARKETING (S) → Publicidade, Tráfego Pago, Comissões Vendas, Ferramentas, Eventos
  6.3 PESSOAL (S) → Salários, Pró-Labore, FGTS, INSS Patronal, Benefícios, Treinamentos
  6.4 VEÍCULOS (S) → Combustível, Manutenção, Estac/Pedágio, Apps Transporte, Viagens
7  DESPESAS FINANCEIRAS (S) → Tarifas, Juros Empr., Juros/Multas, Taxas Cartão, IOF (analítica, is_tax=true)
8  IMPOSTOS E TRIBUTOS (S) → Simples, ISS, ICMS, PIS/COFINS, IRPJ/CSLL, Taxas/Licenças (todas is_tax=true)
9  CONTAS DE CONTROLE (S) → Transferências Próprias, Aporte a Classificar, Retirada a Classificar, Transação Pendente
```

Regras aplicadas:
- Todas as sintéticas: `allow_transactions=false`
- Folhas: `allow_transactions=true`
- Contas do grupo 8 e "IOF"/"Taxas Cartão": `is_tax=true`
- Todas: `is_active=true`, `visible_pf=false` (modelo é PJ), `description` preenchida com o texto explicativo do documento.

## Backend (migration única)

1. **Função `chart_accounts_seed_default(_user_id uuid, _company_id uuid)`** (`SECURITY DEFINER`):
   - Insere as ~90 contas em ordem hierárquica (pais antes de filhos), deixando o trigger existente gerar os códigos.
   - Cria linhas em `chart_account_companies` vinculando cada conta à `_company_id`.
   - Idempotente: se a empresa já tem contas vinculadas, não faz nada.
   - `GRANT EXECUTE` apenas para `authenticated` e `service_role`.

2. **Trigger `chart_accounts_seed_on_company_insert` em `public.companies` AFTER INSERT**:
   - Chama `chart_accounts_seed_default(NEW.user_id, NEW.id)` automaticamente.
   - Só dispara para empresas novas (contexto PJ é implícito na tabela `companies`).

## Frontend (ajustes pequenos)

- **`src/pages/ContasContabeis.tsx`**: adicionar botão secundário **"Restaurar Modelo Padrão"** no header (só aparece no contexto PJ com empresa selecionada). Chama a mesma RPC `chart_accounts_seed_default` — usuário pode reimportar caso tenha apagado tudo. Confirmação: "Isto irá adicionar as contas padrão que ainda não existirem. Contas atuais serão mantidas."
- Nenhuma outra tela precisa mudar.

## O que NÃO faremos
- Não vamos alterar `categories`, DRE, `transactions` ou qualquer outro módulo.
- Não vamos criar contas para empresas já existentes automaticamente (evita surpresa em dados atuais); o botão "Restaurar Modelo Padrão" cobre esse caso manualmente.
- Não vamos seed em PF.

## Detalhes técnicos
- A migration terá um array PL/pgSQL com tuplas `(caminho, nome, descrição, allow_transactions, is_tax)` e um loop que resolve `parent_id` por nome+caminho antes de inserir.
- Descrições são as do documento (parágrafos "Utilizar para…"/"Exemplos…" concatenados), truncadas se ultrapassarem o limite atual do campo.
- Nomes exatos conforme o documento (ex.: "Bancos Conta Corrente", "Publicidade e Propaganda").
