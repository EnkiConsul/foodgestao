/**
 * Painel flutuante de métricas de performance (dev-only).
 * - TTR por rota
 * - Tempo médio/p95/max de render por componente
 * - Contagem de re-renders
 *
 * Atalho para abrir/fechar: Ctrl+Shift+P.
 * Não renderiza nada em produção, a menos que ?perf=1 esteja na URL.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getRenderStats,
  getRouteTimings,
  isPerfEnabled,
  subscribePerf,
} from "@/lib/perf";

function useStore() {
  return useSyncExternalStore(
    (cb) => subscribePerf(cb),
    () => Date.now(),
    () => 0
  );
}

export function PerfOverlay() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"routes" | "renders">("routes");
  useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!isPerfEnabled()) return null;

  const routes = getRouteTimings().slice(0, 8);
  const renders = getRenderStats().slice(0, 15);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 9999,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        color: "#e5e7eb",
      }}
    >
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            background: "rgba(15,23,42,0.85)",
            color: "#e5e7eb",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: "6px 10px",
            cursor: "pointer",
          }}
          title="Ctrl+Shift+P"
        >
          perf
        </button>
      ) : (
        <div
          style={{
            width: 380,
            maxHeight: 420,
            background: "rgba(15,23,42,0.95)",
            border: "1px solid #334155",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 10px",
              borderBottom: "1px solid #1e293b",
            }}
          >
            <strong>Perf metrics</strong>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setTab("routes")}
                style={tabBtn(tab === "routes")}
              >
                Rotas
              </button>
              <button
                onClick={() => setTab("renders")}
                style={tabBtn(tab === "renders")}
              >
                Renders
              </button>
              <button
                onClick={() => (window as any).__PERF_RESET__?.()}
                style={tabBtn(false)}
                title="Limpar métricas"
              >
                Reset
              </button>
              <button onClick={() => setOpen(false)} style={tabBtn(false)}>
                ×
              </button>
            </div>
          </div>

          <div style={{ overflow: "auto", padding: 8 }}>
            {tab === "routes" ? (
              routes.length === 0 ? (
                <Empty text="Sem navegação registrada ainda." />
              ) : (
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={th}>Rota</th>
                      <th style={th}>TTR</th>
                      <th style={th}>Início</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routes.map((r, i) => (
                      <tr key={i}>
                        <td style={td}>{r.route}</td>
                        <td style={{ ...td, color: ttrColor(r.ttrMs) }}>
                          {r.ttrMs !== undefined ? `${r.ttrMs.toFixed(0)}ms` : "…"}
                        </td>
                        <td style={td}>
                          {new Date(performance.timeOrigin + r.startedAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : renders.length === 0 ? (
              <Empty text="Envolva páginas/componentes em <Profiler> ou use useRenderCount." />
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>Componente</th>
                    <th style={th}>x</th>
                    <th style={th}>avg</th>
                    <th style={th}>p95</th>
                    <th style={th}>max</th>
                  </tr>
                </thead>
                <tbody>
                  {renders.map((r) => (
                    <tr key={r.name}>
                      <td style={td}>{r.name}</td>
                      <td style={td}>{r.count}</td>
                      <td style={{ ...td, color: avgColor(r.avgMs) }}>
                        {r.avgMs.toFixed(1)}
                      </td>
                      <td style={td}>{r.p95Ms.toFixed(1)}</td>
                      <td style={td}>{r.maxMs.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div
            style={{
              padding: "4px 10px",
              borderTop: "1px solid #1e293b",
              color: "#94a3b8",
            }}
          >
            Ctrl+Shift+P • window.__PERF__ no console
          </div>
        </div>
      )}
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};
const th: React.CSSProperties = {
  textAlign: "left",
  color: "#94a3b8",
  fontWeight: 500,
  padding: "2px 6px",
  borderBottom: "1px solid #1e293b",
};
const td: React.CSSProperties = {
  padding: "2px 6px",
  borderBottom: "1px solid #1e293b",
  whiteSpace: "nowrap",
};
function tabBtn(active: boolean): React.CSSProperties {
  return {
    background: active ? "#1e40af" : "transparent",
    color: "#e5e7eb",
    border: "1px solid #334155",
    borderRadius: 6,
    padding: "2px 6px",
    cursor: "pointer",
    fontSize: 11,
  };
}
function ttrColor(ms?: number) {
  if (ms === undefined) return "#94a3b8";
  if (ms < 500) return "#34d399";
  if (ms < 1500) return "#fbbf24";
  return "#f87171";
}
function avgColor(ms: number) {
  if (ms < 4) return "#34d399";
  if (ms < 16) return "#fbbf24";
  return "#f87171";
}
function Empty({ text }: { text: string }) {
  return <div style={{ color: "#94a3b8", padding: 12 }}>{text}</div>;
}
