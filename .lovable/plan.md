# Documentos de Admissão na Ficha do Colaborador

Objetivo: cada colaborador passa a ter um **checklist de documentos** na própria ficha, com upload pelo colaborador no portal, aprovação pelo DP, controle de validade (renovação anual) e pendências para os dois lados. Nada trava o cadastro — o que falta vira pendência.

## 1. Respostas às suas dúvidas

- **Comprovante de residência**: o endereço digitado já serve para o cadastro e para a ficha de registro. O comprovante em PDF só é útil em fiscalização/benefício de transporte. Decisão: entra no catálogo como **opcional por padrão** (a empresa pode marcar como obrigatório).
- **CTPS Digital / PIS-NIT automático pelo CPF**: não existe API pública para isso. Os dados vivem no CNIS/eSocial e o acesso exige certificado digital e-CNPJ + procuração eletrônica, o que não se resolve dentro do app. Decisão: **PIS-NIT digitado no cadastro** (com validação do dígito verificador) e o print do CTPS Digital como documento **opcional**, apenas para conferência.
- **Foto 3x4, dados bancários, título de eleitor, reservista, escolaridade**: todos entram como **opcionais por padrão**, ligáveis pela empresa.
- **ASO admissional**: não duplica. O requisito aponta para o registro já existente de exames (SESMT) e fica satisfeito quando existir ASO admissional com resultado apto.
- **Contrato de trabalho e ficha de registro gerados pelo sistema**: sim, e é o melhor caminho. O sistema gera o documento a partir dos dados já cadastrados (dados pessoais, cargo, salário, jornada, unidade, sindicato), envia para o colaborador no portal e registra **aceite eletrônico com trilha de auditoria** — data/hora, IP, user agent, hash SHA-256 do arquivo e versão do modelo. Isso substitui o upload assinado nesses dois itens; o upload continua disponível como alternativa (empresa que prefere papel assinado).

## 2. Documentos mínimos (semeados por padrão)

### Obrigatórios para todos
- Documento de identidade com foto (RG ou CNH)
- CPF (quando não constar na identidade)
- Contrato de trabalho / termo de vínculo — gerado pelo sistema, com aceite eletrônico
- Ficha de registro de empregado — gerada pelo sistema, com aceite eletrônico
- ASO admissional — satisfeito pelo módulo SESMT

### Opcionais por padrão (a empresa pode exigir)
- Comprovante de residência
- Print do CTPS Digital
- Foto 3x4 / selfie de cadastro
- Comprovante de dados bancários
- Título de eleitor
- Certificado de reservista
- Comprovante de escolaridade

### Condicionais por situação
- Certidão de casamento/união estável — estado civil casado
- Termo de responsabilidade de EPI — cargo que exige EPI
- Autorização judicial e comprovante escolar — menor aprendiz
- Contrato social / CNPJ ativo / nota fiscal — regime PJ ou MEI
- Termo de ciência de jornada e banco de horas — regimes com controle de ponto

### Condicionais por cargo que dirige (motoqueiro, entregador, motorista)
- CNH válida na categoria exigida — renovação no vencimento
- Veículo próprio do colaborador:
  - CRLV / licenciamento do ano vigente — renovação anual
  - Apólice de seguro do veículo — renovação anual, **obrigatório ou opcional conforme configuração da empresa**
  - Comprovante de propriedade ou autorização do proprietário
- Veículo da empresa: termo de responsabilidade do veículo
- Declaração de CNH sem suspensão

### Dependentes (salário-família e IRRF)
- Certidão de nascimento — todo dependente
- CPF do dependente
- Caderneta de vacinação — até 7 anos, renovação anual
- Comprovante de frequência escolar — a partir de 7 anos, semestral
- Laudo médico de invalidez — com validade
- Termo de guarda/tutela/curatela — quando aplicável

## 3. Telas e comportamento

**Nova tela: Documentos obrigatórios da empresa** (`/dp/cadastros/documentos-exigidos`, dentro do hub Cadastro)
- Lista o catálogo semeado, agrupado por categoria (admissão, cargo que dirige, veículo, dependentes, regime).
- Por item: obrigatório / opcional / desativado, a quem se aplica, periodicidade (única, anual, semestral, pelo vencimento do documento), dias de aviso antes do vencimento.
- Permite criar requisitos próprios da empresa.
- Nada aqui trava telas: mudar para obrigatório apenas gera pendências.

**Ficha do colaborador — nova aba "Documentos"**
- Checklist resolvido para aquele colaborador, com status: pendente, enviado (aguardando aprovação), aprovado, recusado, vencendo, vencido, dispensado.
- Ações por linha: anexar, visualizar, baixar, aprovar/recusar com motivo, informar validade, dispensar com justificativa.
- Contrato e ficha de registro: botões "Gerar e enviar para aceite" e visualização do histórico de aceite.
- Campos novos no colaborador: PIS-NIT, veículo próprio, categoria e validade da CNH.

**Aba Dependentes**
- Cada dependente ganha seus requisitos, reaproveitando as datas já existentes (`vacinacao_em`, `frequencia_escolar_em`, `laudo_validade`) para calcular vencimento.

**Portal do colaborador**
- Bloco "Documentos pendentes" em Meus documentos: o que falta, o que está vencendo, o que foi recusado.
- Envio direto pelo colaborador; aprovação é exclusiva do DP.
- Contrato e ficha de registro aparecem para leitura e aceite eletrônico.

**Pendências nas duas pontas**
- Colaborador: enviar documento X, reenviar documento recusado, aceitar contrato/ficha, CNH/CRLV/seguro vencendo em N dias.
- Administrador: aprovar documento enviado, colaborador com obrigatório faltando, renovação anual vencida, dependente sem vacinação/frequência escolar, contrato pendente de aceite.

## 4. Detalhes técnicos

Banco (migração, com GRANT + RLS por empresa):
- `dp_documento_requisitos`: catálogo por empresa (codigo, nome, categoria, obrigatoriedade `obrigatorio|opcional|desativado`, aplica_a, exige_veiculo_proprio, regimes, periodicidade, meses_validade, dias_aviso, ordem). Seed idempotente por empresa no padrão de `dp_config_dp_seed_on_company`.
- `dp_colaborador_documentos`: requisito × colaborador (ou dependente) × documento em `dp_documentos`, com `status`, `validade`, `dispensado`, `motivo_dispensa`.
- `dp_documento_aceites`: aceite eletrônico (documento, colaborador, versão do modelo, hash sha256, aceito_em, ip, user_agent) — imutável, sem UPDATE/DELETE.
- Novos valores no enum `dp_documento_tipo`: `admissao`, `identidade`, `residencia`, `bancario`, `cnh`, `crlv`, `seguro_veiculo`, `dependente`, `ficha_registro`.
- Colunas em `dp_colaboradores`: `pis_nit`, `veiculo_proprio`, `cnh_categoria`, `cnh_validade`. Em `dp_cargos`: `exige_cnh`, `cnh_categoria_minima`, `exige_epi`.
- RPC `dp_documentos_pendentes(_company_id, _colaborador_id)` (SECURITY DEFINER) resolvendo requisitos aplicáveis × enviados; usada pela ficha, portal e pendências.

Front-end:
- `src/lib/dp/documentos-requisitos.ts` — resolução das regras (cargo que dirige, veículo próprio, regime, idade do dependente) e cálculo de validade, com testes em `src/lib/dp/__tests__/`.
- `src/components/dp/documentos/ColaboradorDocumentosPanel.tsx` e `DocumentoRequisitoRow.tsx` — checklist reutilizado na ficha e no portal.
- `src/hooks/useDpColaboradorDocumentos.tsx` — queries/mutations e upload no bucket `dp-documentos` via `sanitizeStorageFilename`.
- `src/lib/dp/contratoTemplate.ts` + `ContratoAceiteDialog.tsx` — geração em HTML imprimível do contrato e da ficha de registro (mesmo padrão do holerite) e fluxo de aceite.
- `src/pages/dp/cadastros/DpDocumentosExigidos.tsx` + rota, item no `DpCadastrosHub` e em `dpNavigation.tsx`.
- Pendências: novos itens em `useDpPendencias.tsx` e `useDpPendenciasColaborador.tsx`.

Escopo comercial: parte do DP base, sem novo módulo vendável.

## 5. Entrega em etapas
1. Migração (tabelas, enum, colunas, seed, RPC) + regras e testes em `documentos-requisitos.ts`.
2. Tela de documentos obrigatórios da empresa.
3. Aba Documentos na ficha, com upload, aprovação e validade.
4. Dependentes ligados aos requisitos e às datas já existentes.
5. Portal do colaborador: envio e acompanhamento.
6. Contrato e ficha de registro gerados pelo sistema com aceite eletrônico e log.
7. Pendências admin + colaborador.
