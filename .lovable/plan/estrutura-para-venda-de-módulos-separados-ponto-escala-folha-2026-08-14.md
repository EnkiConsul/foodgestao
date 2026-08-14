# Estrutura para venda de módulos separados (Ponto, Escala, Folha)

Objetivo desta etapa: preparar a base técnica e o backoffice para vender partes do DP separadamente, **sem bloquear nenhuma tela ainda**. Nada muda para quem usa o sistema hoje.

## O que será criado

### 1. Novos módulos vendáveis
Além dos módulos atuais (Financeiro, DP, Pedidos), passam a existir três unidades comercializáveis dentro do DP:

- **Ponto** — marcações, espelho, ajustes, apuração, fechamento.
- **Escala** — turnos, jornadas, folgas, convocações, operação do dia, escala do mês.
- **Folha de pagamento** — folha, provisões, rescisão, holerite, relatórios da folha.

O **DP base** (colaboradores, cargos, unidades, documentos, comunicação) permanece obrigatório: é o pré-requisito dos três acima e não é vendido isolado dos dados cadastrais.

### 2. Catálogo e contratação
- Os três módulos entram no catálogo com nome, descrição, ícone, ordem e as flags já existentes de exibição na landing page e no Hub — inicialmente ocultos até a precificação ser definida.
- Cada empresa passa a poder ter status próprio por módulo (não contratado, trial, ativo, suspenso, cancelado, trial expirado), com as mesmas datas e retenção já usadas em Pedidos.
- Dependência declarada: contratar Ponto/Escala/Folha exige DP base ativo; Folha depende de Ponto para apuração automática (fica registrado como dependência, sem bloqueio nesta etapa).

### 3. Motor de direito de uso (entitlement)
Uma função de decisão no backend, no mesmo padrão de Pedidos, responde por empresa + módulo + operação: permitido, somente leitura, motivo, status efetivo e se o trial já foi usado. Fica disponível para uso, mas nenhuma tela consumirá o bloqueio nesta fase.

### 4. Backoffice (admin)
- Na gestão de módulos do admin: contratar, iniciar/encerrar trial, suspender, cancelar e reativar cada módulo por empresa, com histórico visível.
- Visão por empresa mostrando o que está contratado, vigências e trial usado.
- Precificação fica de fora agora (campo de valor mensal já existe e continua opcional).

## Detalhes técnicos

- Ampliar o enum `app_module` com `ponto`, `escala` e `folha`; manter `dp` como módulo base.
- `company_modules` já suporta o modelo (status, trial, retenção) — nenhuma mudança estrutural necessária além de linhas por novo módulo.
- Nova tabela leve de dependências entre módulos (`module_dependencies`) com GRANTs e leitura pública autenticada, para o motor validar pré-requisitos.
- Generalizar `can_use_orders_module` para uma função `can_use_module(p_company_id, p_module, p_operation)` (SECURITY DEFINER, fail-closed), mantendo a atual como wrapper para não quebrar Pedidos.
- Generalizar `start_orders_trial` para `start_module_trial(p_company_id, p_module)`, com wrapper de compatibilidade.
- Frontend: estender `src/lib/modules.ts` com as novas definições e um mapa rota → módulo; criar `useModuleEntitlement(module, operation)` genérico e reescrever `useOrdersEntitlement` como caso especial dele; criar `src/lib/dp/moduleMap.ts` mapeando as rotas do DP para `ponto` / `escala` / `folha`.
- Registrar em memória do projeto a regra de arquitetura: toda nova feature de DP deve declarar a qual módulo vendável pertence.
- Seed dos novos módulos no catálogo com `show_on_landing = false` e `show_on_hub = false`.
- Nenhum gate aplicado em rotas, sidebar ou hooks nesta fase; a ativação do bloqueio será uma etapa seguinte de uma linha por rota.
