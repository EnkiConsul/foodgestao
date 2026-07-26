> Todos os dados abaixo foram confirmados por leitura de código e consulta direta ao banco (não por suposição).

# PARTE 1 — Diagnóstico do que existe hoje

## 1.1 Superfície do módulo
- **34 telas admin** em `/dp/*` + **7 telas** do portal do colaborador em `/dp/meu/*` (`src/App.tsx:277-386`), mais 9 rotas de redirecionamento legado.
- **~40 componentes** em `src/components/dp/**` (shell, home/KPIs, colaboradores, documentos/bulk, bloqueios, comunicação, kit mobile).
- **11 hooks** `useDp*` em `src/hooks/`.
- **6 utilitários de negócio** em `src/lib/dp/**` (`bloqueio-rules`, `bloqueios`, `bulk-coverage`, `bulk-duplicates`, `desligamento`, `folga-rules`) com testes.
- **11 Edge Functions** `dp-*` (acesso/senha do colaborador, convite, sorteio de folgas, bulk-ingest com OCR+IA, bulk-approve/discard, PDF disciplinar, notificação de atestado, broadcast).

## 1.2 Camada de dados
- **35 tabelas** `dp_*` + view `dp_colaboradores_public`; **81 policies** RLS (todas `authenticated`), multi-tenant por `company_id`.
- **25 funções SQL** `dp_*` e **~37 triggers** (validação de folga, notificações, desligamento, pipeline de folha).
- **24 enums** de domínio; **3 buckets** privados (`dp-documentos`, `dp-disciplinar`, `dp-bulk-import`) com políticas por `company_id` no path.
- Integração real DP↔Financeiro: `dp_folha_lancamentos` → `accounts` / `categories` / `transactions`.

## 1.3 Cobertura funcional atual (forte)
Cadastro organizacional (unidades/cargos/sindicatos/CCT-ACT), colaboradores com fluxo formal de desligamento e reintegração, escala de folgas com sorteio + motor de bloqueios (inclusive feriados móveis), trocas entre colegas, solicitações, documentos com importação em massa por OCR/IA e cobertura por unidade/competência, disciplinar com PDF, folha de pagamento até virar lançamento financeiro, comunicação (avisos, mensagens, modelos, broadcast, notificações) e portal do colaborador.

## 1.4 Lacunas confirmadas (0 tabelas no banco)
| Domínio | Situação |
|---|---|
| Férias formais (aquisitivo, saldo, aviso) | Só existe como *tipo* de folga/solicitação/documento |
| ASO / exames ocupacionais | Inexistente |
| EPIs | Inexistente |
| Treinamentos | Inexistente |
| Benefícios (VT/VA/VR) | Só como linha de folha, sem cadastro/gestão |
| Feed/mural com interação | Comunicação é unidirecional admin→colaborador |
| Analytics de RH | Inexistente |

> Ponto eletrônico e banco de horas também não existem no banco, mas foram **deliberadamente deixados fora deste roadmap** — exigem conformidade com a Portaria MTP 671/2021 (REP-A ou REP-P) e serão tratados como projeto separado no futuro.

## 1.5 Dívidas técnicas identificadas
1. `src/pages/dp/DpLogin.tsx` é arquivo órfão (não roteado; `/dp/login` redireciona para `/auth`).
2. Páginas pesadas (`DpFolgas`, `DpTrocas`, `DpDocumentos`, `DpAprovacoes`, `DpBloqueios`) fazem queries/mutations Supabase inline, fora do padrão `useDp*` do restante do módulo.
3. Nenhuma tabela `dp_*` usa `FORCE ROW LEVEL SECURITY`.
4. Duplicidade de rotas para a mesma página (`/dp/meu/perfil` e `/dp/meu/cadastro`).

---

# PARTE 2 — Benchmark e posicionamento
Referências analisadas: Sólides, Pontomais, Convenia, Flash, Rippling, BambooHR, Deel, Employment Hero.

**Onde o 360°FOOD já compete de igual para igual:** escala/folgas com regras de bloqueio e sorteio (mais sofisticado que a média do mercado brasileiro para food service), portal do colaborador, importação de documentos com OCR/IA, integração nativa DP↔Financeiro (diferencial real — os concorrentes exigem integração externa).

**Onde há distância clara (dentro do escopo atual):**
- *Conformidade*: férias formais, ASO/exames, EPIs e treinamentos são obrigações legais cobertas por Convenia/Sólides.
- *Engajamento*: Flash e Employment Hero exploram benefícios e feed social; aqui a comunicação é unidirecional.
- *Estratégico*: BambooHR/Rippling entregam analytics de RH (turnover, headcount, absenteísmo).

---

# PARTE 3 — Roadmap proposto

### Fase A — Higienização (baixo esforço, sem novas tabelas)
- Remover `DpLogin.tsx` órfão e a rota duplicada `/dp/meu/cadastro`.
- Extrair a lógica de dados das 5 páginas pesadas para hooks `useDpFolgas`, `useDpTrocas`, `useDpDocumentos`, `useDpAprovacoes`, `useDpBloqueios`.
- Avaliar `FORCE ROW LEVEL SECURITY` nas tabelas com PII (`dp_colaboradores`, `dp_documentos`, `dp_mensagens`).

### Fase B — Férias formais (maior ganho de conformidade por esforço)
- Tabelas `dp_ferias_periodos` (aquisitivo/concessivo, saldo, dias vendidos) e `dp_ferias_solicitacoes`, ligadas a `dp_colaboradores` e ao fluxo existente de `dp_solicitacoes`/`dp_folgas`.
- Cálculo automático de saldo a partir da data de admissão, alerta de período vencendo no quadro de pendências, aviso de férias em PDF e integração com `dp_folha_lancamentos` (tipo `ferias`).

### Fase C — Conformidade e saúde ocupacional
- `dp_exames_aso` (admissional, periódico, demissional, com vencimento), `dp_epis_entregas` (ficha de EPI com assinatura), `dp_treinamentos`.
- Todos alimentando o quadro de pendências existente com alertas de vencimento por unidade.

### Fase D — Benefícios
- Cadastro de benefícios por colaborador (VT/VA/VR e descontos), gerando automaticamente as linhas correspondentes em `dp_folha_lancamentos`.

### Fase E — Engajamento
- Evolução de `dp_avisos` para mural com confirmação de leitura obrigatória, reações e comentários moderados.

### Fase F — Analytics de RH
- Painel com turnover, headcount, absenteísmo, custo por unidade e distribuição de folgas, reaproveitando o padrão de relatórios do financeiro (incluindo exportação PDF/CSV).

## Detalhes técnicos
Toda tabela nova segue o padrão do projeto: `company_id` com FK `ON DELETE CASCADE`, `GRANT` explícito a `authenticated`/`service_role`, RLS habilitado com policies admin-write/self-read via `dp_colaborador_of` e `dp_colaborador_ativo_of`, `updated_at` com trigger `dp_set_updated_at()`. Novas telas herdam `DpLayout`/`DpPage`, o kit mobile (`MobileCardKit`, `BottomNav`) e os tokens da identidade 360°FOOD.

## Escopo desta aprovação
Aprovar este plano registra a auditoria e o roadmap. A implementação começa pela **Fase A**; cada fase seguinte será proposta como um plano próprio antes de codificar.
