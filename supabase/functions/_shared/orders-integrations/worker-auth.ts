// Autorização dos workers de fila do módulo Pedidos.
// Dois mecanismos aceitos:
//  1. Segredo estático `ORDERS_QUEUE_WORKER_SECRET` (header `x-worker-secret`),
//     usado por operadores/super admins em disparos manuais.
//  2. Nonce de uso único emitido pelo agendador no banco (header `x-worker-nonce`),
//     validado via RPC `ped_worker_nonce_consume`. Permite agendar no pg_cron
//     sem depender de nenhum segredo configurado manualmente.
// Fail closed: sem segredo válido e sem nonce válido, recusa.

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function consumeNonce(token: string, purpose: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/ped_worker_nonce_consume`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_token: token, p_purpose: purpose }),
    });
    if (!res.ok) {
      console.error(`worker-auth: nonce_consume falhou [${res.status}]`);
      return false;
    }
    return (await res.json()) === true;
  } catch (error) {
    console.error("worker-auth: erro ao validar nonce", (error as Error).message);
    return false;
  }
}

export async function authorizeWorker(
  req: Request,
  purpose: string,
): Promise<{ ok: boolean; status: number; code: string }> {
  const expected = Deno.env.get("ORDERS_QUEUE_WORKER_SECRET");
  const provided = req.headers.get("x-worker-secret") ?? "";
  if (expected && timingSafeEqual(provided, expected)) {
    return { ok: true, status: 200, code: "ok" };
  }

  const nonce = req.headers.get("x-worker-nonce") ?? "";
  if (nonce.length >= 32 && (await consumeNonce(nonce, purpose))) {
    return { ok: true, status: 200, code: "ok" };
  }

  if (!expected && !nonce) return { ok: false, status: 503, code: "worker_auth_missing" };
  return { ok: false, status: 401, code: "unauthorized" };
}
