// Autorização dos workers de fila do módulo Pedidos.
// Os workers rodam com service role: só o agendador (ou um super admin com o
// segredo) pode dispará-los. Fail closed: sem segredo configurado, recusa.
export function authorizeWorker(req: Request): { ok: boolean; status: number; code: string } {
  const expected = Deno.env.get("ORDERS_QUEUE_WORKER_SECRET");
  if (!expected) return { ok: false, status: 503, code: "worker_secret_missing" };

  const provided = req.headers.get("x-worker-secret") ?? "";
  if (provided.length !== expected.length || provided.length === 0) {
    return { ok: false, status: 401, code: "unauthorized" };
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0
    ? { ok: true, status: 200, code: "ok" }
    : { ok: false, status: 401, code: "unauthorized" };
}
