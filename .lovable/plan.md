# Corrigir nomes dos módulos no Onboarding

## Por que ainda aparece "DP 360°"

A tela de seleção de módulos do onboarding não usa a lista de módulos do código (onde o nome já é "Pessoas 360°"). Ela lê a tabela do banco `modulos_catalogo`, e nessa tabela os registros seguem com os nomes antigos. Conferi os dados atuais:

- `dp` → "DP 360°" (deveria ser "Pessoas 360°")
- `crm` → "CRM 360°" (módulo removido do produto, mas ainda ativo aqui)
- `rh` → "RH 360°" (módulo removido do produto, mas ainda ativo aqui)
- `bi` → "BI 360°" (não existe implementação)
- `ponto` e `folha` → ainda ativos no catálogo, embora estejam desativados no produto
- `financeiro_pessoal` → "Financeiro Pessoal" (sub-módulo do Financeiro)

Ou seja: além do nome do DP, o onboarding está oferecendo módulos que não existem mais.

## O que fazer

1. Atualizar no catálogo o registro `dp`:
   - nome: "Pessoas 360°"
   - descrição: focada no que o módulo realmente entrega (colaboradores, admissão, férias, folgas, documentos e escala) — sem citar folha de pagamento, que não é gerada pelo sistema.
2. Desativar no catálogo (`ativo = false`) os módulos que não existem/não são vendidos hoje: `crm`, `rh`, `bi`, `ponto`, `folha`. Assim eles deixam de aparecer no onboarding e no hub, sem apagar histórico.
3. Manter visíveis no onboarding apenas: Financeiro 360°, Pessoas 360°, Escala 360° (se desejado como opcional) e Financeiro Pessoal.
4. Verificar a tela depois da mudança para confirmar que os cards refletem os nomes corretos.

## Decisão necessária

Escala 360° hoje está com `show_on_hub = false` e não aparece no onboarding. Posso deixá-la como está (contratada depois, dentro de Pessoas) ou incluí-la como card opcional no onboarding. Se não houver preferência, mantenho como está.

## Detalhes técnicos

- Migração SQL de UPDATE em `public.modulos_catalogo` (sem mudança de schema): ajuste de `nome`/`descricao_curta` do slug `dp` e `ativo = false` para `crm`, `rh`, `bi`, `ponto`, `folha`.
- Nenhuma alteração em `StepModulos.tsx` ou `useModulosCatalogo.tsx` é necessária — eles apenas renderizam o catálogo.
- O cache do React Query desse catálogo é de 1 hora (`staleTime`), portanto pode ser necessário recarregar a página para ver a mudança.
