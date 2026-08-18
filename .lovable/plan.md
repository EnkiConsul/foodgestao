# Documentos de Admissão na Ficha do Colaborador

Objetivo: cada colaborador passa a ter um **checklist de documentos** na própria ficha, com upload pelo colaborador no portal, aprovação pelo DP, controle de validade (renovação anual) e pendências para os dois lados.

## 1. Documentos mínimos propostos

### Obrigatórios para todos (admissão)
- Documento de identidade com foto (RG ou CNH)
- CPF (se não constar no documento de identidade)
- Comprovante de residência (até 90 dias)
- Carteira de Trabalho digital (print do CTPS Digital) / número PIS-NIT
- Foto 3x4 ou selfie de cadastro
- Comprovante de dados bancários (para pagamento)
- Título de eleitor (quando aplicável)
- Certificado de reservista (homens até 45 anos)
- Comprovante de escolaridade (quando exigido pelo cargo)
- Exame médico admissional (ASO) — já existe módulo SESMT, apenas vincular
- Contrato de trabalho assinado / termo de vínculo (PJ, MEI, freelancer conforme regime)
- Ficha de registro de empregado assinada

### Condicionais por situação
- Certidão de casamento/união estável — se estado civil casado
- Termo de responsabilidade de EPI — se cargo exige EPI
- Autorização judicial e comprovante escolar — menor aprendiz
- Contrato social / CNPJ ativo / nota fiscal — regime PJ ou MEI
- Termo de ciência de jornada e banco de horas — regimes com controle de ponto

### Condicionais por cargo que dirige (motoqueiro, entregador, motorista, motociclista)
- CNH válida na categoria exigida (A/AB/B/C/D) — **renovar no vencimento**
- Se veículo próprio do colaborador:
  - CRLV / licenciamento do ano vigente — **renovação anual**
  - Apólice de seguro do veículo — **renovação anual**, configurável como obrigatório ou opcional por empresa
  - Comprovante de propriedade ou autorização do proprietário
- Se veículo da empresa: termo de responsabilidade do veículo
- Consulta de pontuação/CNH sem suspensão (declaração assinada)

### Documentos de dependentes (salário-família e IRRF)
- Certidão de nascimento (todo dependente)
- CPF do dependente
- Caderneta de vacinação — até 7 anos, **comprovação semestral/anual**
- Comprovante de frequência escolar — a partir de 7 anos, **semestral**
- Laudo médico de invalidez — dependente inválido, com validade
- Termo de guarda/tutela/curatela — quando aplicável

## 2. Como fica no sistema

**Catálogo de requisitos (por empresa)**
- Nova tela em Cadastros: "Documentos exigidos", com a lista acima já semeada.
- Cada requisito tem: nome, categoria, se é obrigatório, a quem se aplica (todos / cargo que dirige / veículo próprio / menor / PJ / dependente), periodicidade (única, anual, semestral, por vencimento do próprio documento) e dias de antecedência do aviso.
- A empresa pode ligar/desligar itens (ex.: apólice de seguro obrigatória ou opcional) e criar requisitos próprios.

**Ficha do colaborador**
- Nova aba "Documentos" no cadastro do colaborador, com o checklist resolvido para aquele colaborador: pendente, enviado (aguardando aprovação), aprovado, recusado, vencendo, vencido.
- Cada linha permite anexar, visualizar, baixar, aprovar/recusar (DP) e registrar data de validade.
- Campo novo no colaborador: "veículo próprio" e "categoria da CNH exigida" para resolver as regras do cargo.

**Aba Dependentes**
- Cada dependente ganha os seus próprios requisitos (nascimento, CPF, vacinação, escolaridade, laudo), reaproveitando as datas que já existem hoje (vacinacao_em, frequencia_escolar_em, laudo_validade) para calcular vencimento.

**Portal do colaborador**
- Em "Meus documentos", um bloco "Documentos pendentes" listando exatamente o que falta e o que está vencendo, com envio direto.
- O colaborador só envia; nunca aprova. Envio entra como pendente de aprovação do DP.

**Pendências (as duas pontas)**
- Colaborador: "Enviar documento X", "Documento recusado — reenviar", "CNH/licenciamento/seguro vencendo em N dias".
- Administrador: "Aprovar documento enviado por X", "Colaborador Y com documento obrigatório faltando", "Renovação anual vencida", "Dependentes sem comprovação de vacinação/escola".
- Bloqueio suave configurável: sinalizar na ficha e nos relatórios quando faltar documento obrigatório (sem impedir o cadastro).

## 3. Detalhes técnicos

Banco (migração):
- `dp_documento_requisitos`: catálogo por empresa (codigo, nome, categoria, obrigatorio, aplica_a, cargo_dirige, exige_veiculo_proprio, regime, periodicidade, meses_validade, dias_aviso, ativo, ordem). GRANT + RLS por company.
- `dp_colaborador_documentos`: vínculo colaborador/dependente × requisito × documento enviado (`documento_id` → `dp_documentos`), `status`, `validade`, `dispensado`, `motivo_dispensa`. GRANT + RLS: admin/owner da empresa full; colaborador lê e insere só o seu.
- Novos valores no enum `dp_documento_tipo`: `admissao`, `cnh`, `crlv`, `seguro_veiculo`, `dependente`, `identidade`, `residencia`, `bancario`.
- Colunas em `dp_colaboradores`: `veiculo_proprio boolean`, `cnh_categoria text`, `cnh_validade date`.
- Coluna em `dp_cargos`: `exige_cnh boolean` + `cnh_categoria_minima`.
- Função `dp_documentos_pendentes(_company_id, _colaborador_id)` (SECURITY DEFINER) resolvendo requisitos aplicáveis × enviados, usada pela ficha, portal e pendências.
- Seed idempotente do catálogo por empresa (mesmo padrão de `dp_config_dp_seed_on_company`).

Front-end:
- `src/lib/dp/documentos-requisitos.ts`: resolução das regras (cargo que dirige, veículo próprio, regime, idade do dependente) e cálculo de vencimento.
- `src/components/dp/documentos/ColaboradorDocumentosPanel.tsx`: checklist da ficha (nova aba em `ColaboradorFormDialog.tsx`).
- `src/components/dp/documentos/DocumentoRequisitoRow.tsx`: linha com upload/preview/aprovação, reutilizada no portal.
- `src/hooks/useDpColaboradorDocumentos.tsx`: queries/mutations, upload no bucket `dp-documentos` com `sanitizeStorageFilename`.
- Portal: bloco de pendências em `DpMeuDocumentos.tsx`.
- Pendências: novos itens em `useDpPendencias.tsx` (admin) e `useDpPendenciasColaborador.tsx` (colaborador).
- Nova tela `src/pages/dp/cadastros/DpDocumentosExigidos.tsx` + rota e entrada em `dpNavigation.tsx`.
- Testes unitários da resolução de requisitos e do cálculo de validade em `src/lib/dp/__tests__/`.

Módulo comercial: parte do DP base (não cria módulo novo).

## 4. Entrega em etapas
1. Migração (tabelas, enum, colunas, seed, RPC) + regras em `documentos-requisitos.ts` com testes.
2. Aba Documentos na ficha do colaborador com upload e aprovação.
3. Dependentes: requisitos por dependente ligados às datas já existentes.
4. Portal do colaborador: envio e acompanhamento.
5. Pendências admin + colaborador e tela de configuração dos documentos exigidos.
