import { supabase } from "@/integrations/supabase/client";

// Chave pública (pode ficar no código). A privada fica só no servidor.
export const VAPID_PUBLIC_KEY =
  "BLnL-1u2FKWh2YVFvkM3h7hN0qJB7wBRp5x3RFDiG2f8cO_GBbRwIXIF_WjeER5UutaNXbT9ivNC-RWT17O1EFo";
const SW_URL = "/push/sw.js";
const SW_SCOPE = "/push/";

export type PushEstado =
  | "ativo" | "inativo" | "negado" | "nao_suportado" | "ios_instalar" | "abrir_nova_aba";

function urlB64ToUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;

export async function pushEstado(): Promise<PushEstado> {
  if (window.top !== window.self) return "abrir_nova_aba";
  if (isIOS() && !isStandalone()) return "ios_instalar";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "nao_suportado";
  if (Notification.permission === "denied") return "negado";
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "ativo" : "inativo";
}

function comPrazo<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("tempo_esgotado")), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

/** Espera o worker DESTE escopo ficar ativo (não usa serviceWorker.ready, que aguarda o escopo da página). */
function aguardarAtivo(reg: ServiceWorkerRegistration): Promise<void> {
  if (reg.active) return Promise.resolve();
  const sw = reg.installing || reg.waiting;
  if (!sw) return Promise.resolve();
  return new Promise((res) => {
    sw.addEventListener("statechange", () => { if (sw.state === "activated") res(); });
  });
}

/** Chamar a partir de um clique (o navegador exige gesto do usuário). */
export async function ativarPush(): Promise<PushEstado> {
  const est = await pushEstado();
  if (est !== "inativo" && est !== "ativo") return est;
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return "negado";
  const reg = await comPrazo(navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }), 8000);
  await comPrazo(aguardarAtivo(reg), 8000);
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await comPrazo(
      reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID_PUBLIC_KEY) }),
      10000,
    ));
  const j = sub.toJSON();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sessão expirada");
  const { error } = await supabase.from("dp_push_inscricoes").upsert(
    { user_id: u.user.id, endpoint: sub.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth, user_agent: navigator.userAgent.slice(0, 300) },
    { onConflict: "endpoint" },
  );
  if (error) throw error;
  return "ativo";
}

export async function desativarPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from("dp_push_inscricoes").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
}

export const PUSH_MENSAGEM: Record<PushEstado, string> = {
  ativo: "Avisos Ativos Neste Aparelho.",
  inativo: "Receba avisos na barra do celular mesmo com o app fechado.",
  negado: "As notificações foram bloqueadas. Libere nas configurações do navegador para este site.",
  nao_suportado: "Este navegador não permite notificações no celular.",
  ios_instalar: "No iPhone, adicione o AVETO 360 à Tela de Início e abra pelo ícone para ativar.",
  abrir_nova_aba: "Abra o app em uma aba própria (ou o site publicado) para ativar.",
};
