# F01 — isolamento da origem financeira
## Estado
Correção aplicada somente à homologação `utjhzpdbqzajrhnzcher`, em 22/09/2026 UTC (21/09 no Brasil). Produção não foi alterada. Base do código: `9b81971a84716bfef48968320cf59163288f9b3a`.
Migração: `supabase/migrations/20260922024535_f01_transaction_source_scope.sql`.

## Comportamento
Antes, um lançamento PJ da empresa A podia referenciar a conta da empresa B e o motor privilegiado afetava B. Agora INSERT e UPDATE validam contexto, empresa, conta/cartão e destino de transferência antes dos efeitos. Em PF, o proprietário também precisa coincidir; em PJ, user_id é autoria e pode diferir entre membros autorizados.
O motor apply_tx_balance repete a validação para chamadas privilegiadas com registro composto. As funções de validação não ficam disponíveis aos clientes. Empresa/contexto das contas e cartões, e proprietário PF, ficam imutáveis, impedindo reassociação concorrente após a validação. Mudanças legítimas de nome, banco e limite continuam sujeitas às permissões existentes.

## Evidências
- REST antes: 3/4, com o teste negativo entre empresas aceito indevidamente (201). Lançamento sintético removido.
- REST depois: 39/40. Os casos de origem cruzada, cartão cruzado, PF/PJ, INSERT, UPDATE, lote atômico, transferência e membro de duas empresas com edição em A e consulta em B passaram.
- A única falha é `account_name_edit`: a homologação não concede UPDATE(name) a authenticated. Produção concede esse privilégio (consulta somente leitura em production-preflight.json). É uma divergência de ambiente, não uma alteração de ACL introduzida por F01. O teste permanece registrado como falha; não foi artificialmente convertido em aprovação.
- Sete verificações SQL adicionais passaram com rollback integral: motor privilegiado rejeita origem cruzada sem mudar saldo; troca de empresa/contexto/proprietário de conta rejeitada; edição de nome e autoria PJ permitidas; funções internas inacessíveis ao cliente. Os testes de imutabilidade SQL chegam ao trigger, independentemente da ausência de UPDATE nas contas em homologação.
- Saldos sintéticos voltaram a zero e todos os lançamentos criados pelo teste foram removidos.
- Preflight de produção: 138 lançamentos, zero divergências em contexto, origem de conta/cartão ou destino de transferência. Isso não comprova ausência de ocorrências passadas.
- Advisors de segurança e desempenho executados. Nenhum achado menciona as funções adicionadas ou apply_tx_balance; permanecem alertas gerais do ambiente (funções antigas expostas, índices, políticas e proteção de senha). Não equivale a aprovação geral do sistema.

## Ajuste exclusivo das fixtures
A primeira tentativa de migração abortou corretamente diante de duas fixtures L01 antigas com contexto PF e empresa preenchida. A transação foi revertida, sem instalação parcial. Somente essas duas fixtures e suas contas foram normalizadas para PJ, com identificação exata e nomes sintéticos verificados, conforme repair-old-staging-fixtures.sql. Esse arquivo não pertence ao conjunto de migrações de produção. A segunda aplicação passou.
setup-staging.sql e fixture.json descrevem as empresas/contas/cartões sintéticos usados. Nenhuma senha ou token faz parte destes arquivos.

## Reexecução e entrega
`node docs/security/f01/test-rest.mjs post` requer as credenciais sintéticas locais em LOCALAPPDATA/Aveto360/homologacao/credentials.json e a conexão indicada por F01_CONNECTION_FILE (ou o caminho local padrão no script). O runner verifica referência e URL exatas de homologação; nunca apontar estes testes a produção.
test-privileged.sql requer as fixtures existentes, executa somente na homologação e reverte suas alterações. preflight-readonly.sql é apenas leitura.

Para implantação, conferir o preflight novamente e aplicar somente esta migração em uma transação, após revisão. Ela bloqueia escrita nas três tabelas durante a instalação, com espera máxima de 5 segundos para obter locks, e aborta se encontrar inconsistências. Não executar todo o histórico local indiscriminadamente; reconciliar o registro da migração aplicada via ferramenta com a versão do arquivo antes de futuros db push.
A proteção torna a identidade financeira imutável inclusive em rotinas administrativas; transferência de cadastro entre empresas exige um novo cadastro. Não remover os triggers como correção operacional: isso reabre F01.
Fórmulas de saldo/pagamento parcial (F02), outras referências como faturas/categorias, desempenho para 50 empresas e demais achados não são certificados por esta entrega. A alteração não contém mudanças de frontend; os testes são SQL e HTTP, sem alegação de build/CI completo.

Referência dos advisors: https://supabase.com/docs/guides/database/database-linter
