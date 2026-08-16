# Nova estrutura de planos 360° Food + Fidelidade 360

Reestrutura a landing page, o catálogo de planos e o motor de cobrança para a metodologia Fidelidade 360, com trilhas separadas por solução (Financeiro e DP).

## 1. Catálogo de planos

Substituir os planos atuais (Free, Starter, Pro, Business) por três planos do módulo Financeiro:

| Plano | Mensal flexível | Fidelidade 360 | CNPJs | Usuários | Contador | Open Finance |
| --- | --- | --- | --- | --- | --- | --- |
| 360° Food Essencial | R$ 149,90 | 9x R$ 149,90 | 1 | 2 | 1 | 2 |
| 360° Food Gestão | R$ 299,90 | 9x R$ 299,90 | 1 | 5 | 1 | 5 |
| 360° Food Multiempresa | R$ 549,90 | 9x R$ 549,90 | 3 | 15 | 3 | 12 |

Comuns a todos: lançamentos ilimitados, contas a pagar/receber, lançamentos bancários automáticos, conciliação automática, fluxo de caixa, DRE gerencial, categorias com código contábil, exportação para contabilidade, relatórios, 50 alertas WhatsApp/mês por empresa, agente de IA e suporte.

Cada plano ganha duas variantes de cobrança (mensal flexível e anual Fidelidade 360), com o mesmo conjunto de limites. Planos antigos ficam inativos e privados (nunca excluídos) para não quebrar assinaturas existentes.

O módulo DP entra como trilha separada, sem preço publicado ainda: cards com "Preços em breve" e CTA de contato pelo WhatsApp.

## 2. Landing page

- **Hero**: reposiciona a promessa em torno do benefício "primeiro mês grátis e 1 mês grátis a cada 3 pagos".
- **Seletor de solução** na seção de planos: abas "Financeiro" e "Departamento Pessoal". Financeiro mostra os 3 planos; DP mostra os cards de interesse.
- **Cards de plano**: destaque no anual Fidelidade 360 (9x de R$ X), com o total em 12 meses, a economia e o preço mensal flexível como alternativa. Selo "Mais popular" no Gestão.
- **Faixa Fidelidade 360**: explica o programa em 4 passos (cartão validado no cadastro, primeira cobrança em 30 dias, meses 5 e 9 gratuitos, benefício mantido com pagamentos em dia) e a linha do tempo de 12 meses.
- **Comparativo completo de planos**: nova tabela com todas as linhas informadas (perfil indicado, limites e funcionalidades), responsiva com scroll horizontal no mobile.
- **FAQ**: novas perguntas sobre meses gratuitos, cancelamento, migração entre mensal e fidelidade, uso do limite do cartão, upgrade e reajuste.
- **Regras comerciais** resumidas em texto legal curto abaixo dos planos (vigência 12 meses, um benefício por CNPJ/grupo, não cumulativo, apenas novos clientes).
- Todo o texto novo entra em `landing-defaults.ts` para permanecer editável pelo painel de conteúdo.

## 3. Motor Fidelidade 360

Ciclo controlado pelo 360° Food, com o gateway (Asaas) apenas processando cobranças de cartão tokenizado.

- Novos campos na assinatura: variante de cobrança, mês do ciclo, mensalidades pagas, próxima data de cobrança, próximo mês gratuito, status do último pagamento, token/máscara do cartão (bandeira e 4 últimos dígitos) e id do cliente no gateway.
- Regra de cobrança: mês 1 gratuito; meses 2-4 cobrados; 5 gratuito; 6-8 cobrados; 9 gratuito; 10-12 cobrados. Mês gratuito só é concedido se as três mensalidades anteriores foram pagas em dia.
- Nos meses gratuitos é gerada fatura de valor zero com a linha "desconto Fidelidade 360", para o benefício ficar visível no histórico.
- Rotina diária decide o que cobrar, concede benefício e aplica a régua de inadimplência: nova tentativa em D+1 (com aviso), D+3, aviso de risco em D+5, suspensão parcial em D+7 e reativação automática após regularização.
- Liberação de acesso passa a depender da confirmação do webhook (aprovado, recusado, vencido, estorno, chargeback, cartão expirado, cancelamento) — nunca da simples criação da cobrança.
- Nenhum dado sensível de cartão é armazenado: apenas token e dados mascarados.

## 4. Checkout

- Seleção do plano e da variante (mensal ou Fidelidade 360).
- Dados da empresa (CNPJ) e do responsável.
- Cartão tokenizado no gateway, aceite dos termos e autorização explícita da cobrança recorrente.
- Resumo: mensalidade, primeiro mês grátis, data da primeira cobrança, meses gratuitos previstos, total em 12 meses e economia.
- Ativação imediata do acesso após validação do cartão.

## 5. Backoffice

- Editor de planos atualizado com os novos limites (CNPJs, usuários, acessos de contador, conexões Open Finance, alertas WhatsApp) e variantes de cobrança.
- Painel da assinatura mostrando mês do ciclo, mensalidades pagas, próximo mês gratuito e próxima cobrança.

## Detalhes técnicos

- Migração: colunas de ciclo em `subscriptions`, tabela de eventos de cobrança do ciclo, seeds dos novos planos com `features` estendido, desativação dos antigos, GRANTs e políticas RLS por dono/super admin.
- Frontend: `PricingSection` reescrito com abas por solução e variantes; nova `Fidelidade360Section`; `ComparisonSection` substituída pela matriz de planos; `landing-defaults.ts`, `Planos.tsx`, `Checkout.tsx`, `CheckoutPagamento.tsx`, `AdminPlans`/`PlanEditorDialog` e `useCurrentSubscription` atualizados.
- Backend: nova função agendada de ciclo de cobrança, extensão de `asaas-create-checkout` para cartão tokenizado recorrente e de `asaas-webhook` para os eventos da régua; `expire-trials` alinhado ao novo ciclo.
- Entitlements: limites de Open Finance, usuários, contador e alertas WhatsApp passam a ser lidos das `features` do plano.

## Fora do escopo

- Preços e planos do módulo DP (aguardando definição).
- Downgrade automático com proração.
