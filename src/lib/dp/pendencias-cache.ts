/**
 * Retrato local da última apuração de pendências.
 *
 * O card da tela inicial guarda o último quadro confirmado no navegador para que,
 * ao abrir o sistema, a lista anterior apareça imediatamente enquanto a nova
 * apuração roda — sem tela vazia e sem "Carregando…" para quem já tem histórico.
 */
import {
  Bell,
  ClipboardList,
  Clock,
  Coins,
  FileCheck2,
  FileMinus,
  FileText,
  GraduationCap,
  HardHat,
  Palmtree,
  Scale,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Pendencia } from "@/hooks/useDpPendencias";

const VERSAO = 1;
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

/** Ícones que as pendências podem usar, com chave estável para serialização. */
const ICONES: Record<string, LucideIcon> = {
  Bell,
  ClipboardList,
  Clock,
  Coins,
  FileCheck2,
  FileMinus,
  FileText,
  GraduationCap,
  HardHat,
  Palmtree,
  Scale,
  ShieldCheck,
  UserCog,
  Users,
};

const CHAVE_POR_ICONE = new Map<LucideIcon, string>(
  Object.entries(ICONES).map(([chave, icone]) => [icone, chave]),
);

export function iconKeyDe(icon: LucideIcon | undefined): string {
  if (!icon) return "Bell";
  return CHAVE_POR_ICONE.get(icon) ?? "Bell";
}

export function iconDe(chave: string | undefined): LucideIcon {
  return (chave && ICONES[chave]) || Bell;
}

type PendenciaSerializada = Omit<Pendencia, "icon"> & { iconKey: string };

export type PendenciasSnapshot = {
  data: Pendencia[];
  dataUpdatedAt: number;
  lastCalculatedAt: string | null;
};

type SnapshotArmazenado = {
  versao: number;
  savedAt: number;
  dataUpdatedAt: number;
  lastCalculatedAt: string | null;
  itens: PendenciaSerializada[];
};

function chaveDe(companyId: string) {
  return `dp_pendencias_snapshot:${companyId}`;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function lerPendenciasSnapshot(companyId: string | null): PendenciasSnapshot | null {
  if (!companyId) return null;
  const store = storage();
  if (!store) return null;
  let bruto: string | null = null;
  try {
    bruto = store.getItem(chaveDe(companyId));
  } catch {
    return null;
  }
  if (!bruto) return null;
  try {
    const parsed = JSON.parse(bruto) as SnapshotArmazenado;
    if (!parsed || parsed.versao !== VERSAO || !Array.isArray(parsed.itens)) return null;
    if (!Number.isFinite(parsed.savedAt) || Date.now() - parsed.savedAt > VALIDADE_MS) {
      limparPendenciasSnapshot(companyId);
      return null;
    }
    return {
      data: parsed.itens.map(({ iconKey, ...resto }) => ({
        ...(resto as Omit<Pendencia, "icon">),
        icon: iconDe(iconKey),
      })),
      dataUpdatedAt: Number.isFinite(parsed.dataUpdatedAt) ? parsed.dataUpdatedAt : 0,
      lastCalculatedAt: parsed.lastCalculatedAt ?? null,
    };
  } catch {
    limparPendenciasSnapshot(companyId);
    return null;
  }
}

export function salvarPendenciasSnapshot(
  companyId: string | null,
  snapshot: PendenciasSnapshot,
): void {
  if (!companyId) return;
  const store = storage();
  if (!store) return;
  const payload: SnapshotArmazenado = {
    versao: VERSAO,
    savedAt: Date.now(),
    dataUpdatedAt: snapshot.dataUpdatedAt,
    lastCalculatedAt: snapshot.lastCalculatedAt,
    itens: snapshot.data.map(({ icon, ...resto }) => ({
      ...(resto as Omit<Pendencia, "icon">),
      iconKey: iconKeyDe(icon),
    })),
  };
  try {
    store.setItem(chaveDe(companyId), JSON.stringify(payload));
  } catch {
    // Sem espaço ou storage bloqueado: o card segue funcionando sem retrato.
  }
}

export function limparPendenciasSnapshot(companyId: string | null): void {
  if (!companyId) return;
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(chaveDe(companyId));
  } catch {
    // ignorado
  }
}
