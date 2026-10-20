# Inventário técnico (SHA 84593beb)

## Frontend
- Páginas: `src/pages/recrutamento/RecrutamentoVagas.tsx`, `CandidatoAcesso.tsx`, `CandidatoPerfil.tsx`, `CandidatoAvaliacao.tsx`, `PortalCarreiras.tsx`, `PortalTalentos.tsx`; `src/pages/VagaPublica.tsx`
- Componente: `src/components/recrutamento/PortalCarreirasCard.tsx`
- Lógica: `src/lib/recrutamento/{vagas,candidato,avaliacao,portal}.ts` + testes `*.test.ts`
- Rotas (`src/App.tsx`): `/recrutamento` (gestor), `/vagas/:codigo`, `/carreiras/:slug`, `/carreiras/:slug/talentos`, `/candidato`, `/candidato/acesso`, `/candidato/avaliacao`, `/candidato/entrar` (redireciona).

## Migrations (`drizzle/migrations/`)
`0104_recrutamento_entrega1.sql`, `0105_recrutamento_candidatos_etapa_a.sql`, `0106_recrutamento_avaliacao_etapa_b.sql`, `0107_recrutamento_portal_talentos_c11.sql`, `0108_recrutamento_menor_privilegio.sql`.

## Tabelas (schema public)
recrutamento_liberacoes, recrutamento_vagas, recrutamento_candidatos, recrutamento_auth_desafios, recrutamento_questoes, recrutamento_aval_config, recrutamento_avaliacoes, recrutamento_avaliacao_itens, recrutamento_portais, recrutamento_talentos, recrutamento_consentimentos.

## Funções/RPCs
- Gestão: recrutamento_pode_gerir, recrutamento_vaga_acao, recrutamento_vagas_guard
- Público: recrutamento_vaga_publica, recrutamento_portal_publico
- Candidato: recrutamento_candidatos_guard, recrutamento_candidatos_visibilidade_guard, recrutamento_candidatos_banco_geral_guard
- Avaliação: recrutamento_aval_iniciar, recrutamento_aval_responder, recrutamento_aval_atual, recrutamento_aval_status
- Portal/talentos: recrutamento_portais_guard, recrutamento_talento_entrar, recrutamento_talento_retirar, recrutamento_talento_status, recrutamento_banco_geral_definir, recrutamento_minhas_empresas, recrutamento_minhas_participacoes

## Edge Function
`supabase/functions/recrutamento-candidato-auth` (cadastro, login, OTP WhatsApp, recuperação, captcha).

## Contagens agregadas (Fase 1, sem dados pessoais)
1 candidato; 0 vagas; 5 avaliações concluídas; 20 itens; 6 desafios OTP; 1 participação; 3 eventos de consentimento; 1 empresa liberada; 1 portal.
