# Guia para o novo projeto

- Projeto Lovable novo com backend próprio (Lovable Cloud); autenticação independente do AVETO.
- Copiar do SHA preservado: `src/lib/recrutamento/*`, páginas de `src/pages/recrutamento/*`, `VagaPublica.tsx`, migrations 0104–0108 e a Edge Function — adaptando nomes (remover "360food").
- Remover dependências de `dp_unidades`/`dp_colaboradores`; criar cadastro próprio de empresa/unidade ou integração via API.
- Corrigir o consumo atômico de OTP antes de abrir ao público.
- Manter regras de segurança: gabarito/prazo só no servidor, consentimentos versionados, RLS em todas as tabelas, menor privilégio.
- Migração de dados só com base legal/consentimento e por exportação controlada, nunca via GitHub.
