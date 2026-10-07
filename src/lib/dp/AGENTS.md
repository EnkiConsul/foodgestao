# Regras de src/lib/dp

- Atas de Reunião: rascunho em `dp_atas`/`dp_ata_participantes`; ao enviar, cada participante recebe um `dp_documentos` tipo `ata_reuniao` (anexos PDF/imagem incorporados ao PDF) e assina pelo fluxo oficial `dp-documento-aceitar` — reaproveita hash, certificado e portal.
- Atas: condutores ficam em `dp_atas.condutores` (colaborador ou nome livre); participantes sem cadastro usam `avulso_*` em `dp_ata_participantes` e assinam no PDF impresso, sem gerar `dp_documentos`; mural só publica se `publicar_mural` (desligado por padrão) via `salvarAviso`.
