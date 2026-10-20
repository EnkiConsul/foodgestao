# Regras de negócio

Legenda: [I] implementado · [P] parcial · [N] não implementado

## Vagas
- [I] Acesso: empresa liberada em `recrutamento_liberacoes` + dono/admin.
- [I] Máximo 3 vagas ativas por empresa, validado no servidor com lock.
- [I] Expiração automática em 30 dias; status só por `recrutamento_vaga_acao`.
- [I] Página pública sem login, link/QR.
- [N] Candidatura efetiva a uma vaga (Etapa C2) e lista de inscritos/etapas (Inscrito, Em análise, Entrevista, Contratado, Não selecionado).
- [N] PDF cadastral / contratação.

## Candidatos
- [I] Conta própria via `recrutamento-candidato-auth`, e-mail técnico interno, OTP WhatsApp com limite de tentativas, captcha.
- [I] Conta existente só vira candidato após login; login do Pessoas intocado.
- [P] Perfil progressivo (básico pronto).

## Avaliação Food Service
- [I] 12 questões (6 gerais + 6 da área), sorteio/embaralhamento, gabarito e prazo no servidor.
- [I] Não eliminatória; validade 12 meses; nova tentativa após 90 dias; complemento por área.
- [I] 22 questões cadastradas (banco ainda reduzido).

## Portal e Banco de Talentos
- [I] Portal permanente por `slug` (`/carreiras/:slug`), resolvido no servidor.
- [I] Entrada no banco da empresa exige avaliação válida e consentimento explícito, versionado e com histórico.
- [I] Banco Geral com consentimento independente.
- [P] Visualização pelo gestor (C1.2) não iniciada.
- [N] Busca geral, cobrança (R$ 39,90/mês, grátis para assinantes do Pessoas).
