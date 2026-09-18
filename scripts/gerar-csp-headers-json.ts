/**
 * Gera docs/security/csp-headers-phase1.json com os valores LITERAIS dos
 * cabeçalhos da fase 1, a partir da fonte única src/lib/security/csp.ts.
 *
 * Uso: bun scripts/gerar-csp-headers-json.ts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CSP_FRAME_ANCESTORS,
  cspFrameAncestorsHeaderValue,
  cspHeadersFase1,
  cspReportOnlyHeaderValue,
} from "../src/lib/security/csp";

const headers = cspHeadersFase1();

const saida = {
  gerado_por: "scripts/gerar-csp-headers-json.ts (fonte: src/lib/security/csp.ts)",
  fase: "1 — observação (Report-Only) + anticlickjacking (frame-ancestors)",
  observacao:
    "Valores literais para colar na camada de CDN/proxy reverso. Nada aqui ativa CSP por si só: sem cabeçalho na resposta HTTP, não há política em vigor.",
  frame_ancestors_origens: CSP_FRAME_ANCESTORS,
  headers,
  valores: {
    csp_report_only: cspReportOnlyHeaderValue(),
    csp_frame_ancestors: cspFrameAncestorsHeaderValue(),
  },
  verificacao:
    "curl -sS -D- -o /dev/null https://aveto360.com/ | grep -i content-security-policy (repetir em /auth e /dp)",
};

const destino = resolve(import.meta.dir, "../docs/security/csp-headers-phase1.json");
writeFileSync(destino, `${JSON.stringify(saida, null, 2)}\n`, "utf8");
console.log(`Gerado: ${destino}`);
