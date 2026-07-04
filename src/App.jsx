import { useState, useCallback } from "react";

// ─────────────────────────────────────────────────────────────
//  IV SCREENER  —  Vercel-deployed React frontend
//  Calls /api/iv serverless function (Tradier token server-side)
// ─────────────────────────────────────────────────────────────

const C = {
  bg:      "#0b0e14",
  panel:   "#111620",
  border:  "#1e2535",
  accent:  "#3b82f6",
  green:   "#22c55e",
  red:     "#ef4444",
  amber:   "#f59e0b",
  muted:   "#64748b",
  text:    "#e2e8f0",
  sub:     "#94a3b8",
};

const DEFAULT_TICKERS = "SPY, QQQ, IWM, NVDA, AMD, ASML, ARM";

function ivrColor(v) {
  if (v == null) return C.muted;
  if (v >= 60) return C.red;
  if (v >= 35) return C.amber;
  return C.green;
}

function ratioColor(v) {
  if (v == null) return C.muted;
  if (v >= 1.3) return C.green;
  if (v >= 1.0) return C.amber;
  return C.red;
}

function fmt(v, dec = 1, suffix = "%") {
  if (v == null || isNaN(v)) return "—";
  return `${(+v).toFixed(dec)}${suffix}`;
}

function IVRBar({ ivr }) {
  if (ivr == null) return null;
  const w = Math.max(0, Math.min(100, ivr));
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        {["0", "25", "50", "75", "100"].map(l => (
          <span key={l} style={{ fontSize: 9, color: C.muted }}>{l}</span>
        ))}
      </div>
      <div style={{ height: 6, background: C.border, borderRadius: 3, position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%",
                      width: `${w}%`, background: ivrColor(ivr), borderRadius: 3,
                      transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

function Metric({ label, value, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || C.text,
                    fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 9, color: C.muted, marginTop: 2,
                    textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
    </div>
  );
}

function TermRow({ label, dte, iv }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
      <div>
        <span style={{ fontSize: 11, color: C.muted, textTransform: "uppercase",
                       letterSpacing: "0.05em" }}>{label}</span>
        {dte != null && (
          <span style={{ fontSize: 10, color: C.muted, marginLeft: 4 }}>({dte}d)</span>
        )}
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.text,
                     fontVariantNumeric: "tabular-nums" }}>{fmt(iv)}</span>
    </div>
  );
}

function SignalPill({ ivr, ratio }) {
  const good = ivr >= 50 && ratio >= 1.1;
  const mid  = ivr >= 30;
  const color = good ? C.green : mid ? C.amber : C.muted;
  const bg    = good ? "rgba(34,197,94,0.1)" : mid ? "rgba(245,158,11,0.1)" : "rgba(100,116,139,0.08)";
  const border= good ? "rgba(34,197,94,0.25)" : mid ? "rgba(245,158,11,0.25)" : "rgba(100,116,139,0.15)";
  const text  = good ? "✓ Elevated — favorable for premium selling"
              : mid  ? "~ Moderate — neutral for premium selling"
                     : "↓ Low IV — less favorable";
  return (
    <div style={{ padding: "7px 11px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: bg, color, border: `1px solid ${border}` }}>
      {text}
    </div>
  );
}

function Card({ d }) {
  if (d.error) {
    return (
      <div style={{ background: C.panel, border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>{d.ticker}</div>
        <div style={{ color: C.red, fontSize: 12, marginTop: 6 }}>{d.error}</div>
      </div>
    );
  }
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: 18, display: "flex",
                  flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, color: C.text,
                        letterSpacing: "-0.03em" }}>{d.ticker}</div>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
            ${fmt(d.current_price, 2, "")}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: ivrColor(d.iv_rank),
                        fontVariantNumeric: "tabular-nums" }}>
            {fmt(d.iv_rank, 0, "")}
            <span style={{ fontSize: 11, fontWeight: 400, color: C.muted }}> IVR</span>
          </div>
        </div>
      </div>

      <IVRBar ivr={d.iv_rank} />

      {/* Core metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <Metric label="Current IV" value={fmt(d.current_iv)} />
        <Metric label="HV 30d"     value={fmt(d.hv_30d)}     color={C.sub} />
        <Metric label="IV / HV"    value={fmt(d.iv_hv_ratio, 2, "x")} color={ratioColor(d.iv_hv_ratio)} />
      </div>

      {/* Secondary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
                    background: C.bg, borderRadius: 6, padding: "10px 12px" }}>
        <div>
          <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase",
                        letterSpacing: "0.06em" }}>IV Percentile</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: ivrColor(d.iv_rank), marginTop: 3 }}>
            {fmt(d.iv_percentile, 0)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase",
                        letterSpacing: "0.06em" }}>52W Range</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: C.sub, marginTop: 3 }}>
            {fmt(d.iv_52w_low, 0)} – {fmt(d.iv_52w_high, 0)}
          </div>
        </div>
      </div>

      {/* Term structure */}
      {d.term_structure && (
        <div>
          <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase",
                        letterSpacing: "0.06em", marginBottom: 4 }}>Term Structure</div>
          <TermRow label="Near"   dte={d.term_structure.near_dte} iv={d.term_structure.near} />
          <TermRow label="Mid"    dte={d.term_structure.mid_dte}  iv={d.term_structure.mid} />
          <TermRow label="Far"    dte={d.term_structure.far_dte}  iv={d.term_structure.far} />
        </div>
      )}

      <SignalPill ivr={d.iv_rank} ratio={d.iv_hv_ratio} />
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: 18, height: 320 }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
      {[80, 50, "100%", 60, 100].map((w, i) => (
        <div key={i} style={{ background: C.border, borderRadius: 4,
                              height: i === 2 ? 6 : 14,
                              width: typeof w === "string" ? w : `${w}%`,
                              marginBottom: 14,
                              animation: "pulse 1.6s ease-in-out infinite" }} />
      ))}
    </div>
  );
}

// ─── main ────────────────────────────────────────────────────

export default function App() {
  const [input, setInput]       = useState(DEFAULT_TICKERS);
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [updated, setUpdated]   = useState(null);
  const [tickerCount, setTickerCount] = useState(0);

  const scan = useCallback(async () => {
    const tickers = input.split(/[,\s]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
    if (!tickers.length) { setError("Enter at least one ticker."); return; }

    setLoading(true);
    setError(null);
    setResults([]);
    setTickerCount(tickers.length);

    try {
      const res = await fetch("/api/iv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const sorted = [...data].sort((a, b) => (b.iv_rank ?? -1) - (a.iv_rank ?? -1));
      setResults(sorted);
      setUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [input]);

  const elevated = results.filter(d => d.iv_rank >= 50 && d.iv_hv_ratio >= 1.1).length;
  const moderate = results.filter(d => d.iv_rank >= 30 && (d.iv_rank < 50 || d.iv_hv_ratio < 1.1)).length;
  const low      = results.filter(d => d.iv_rank != null && d.iv_rank < 30).length;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text,
                  fontFamily: "'Inter', system-ui, sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%",
                          background: C.accent, boxShadow: `0 0 6px ${C.accent}` }} />
            <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase",
                           letterSpacing: "0.1em" }}>Options Intelligence</span>
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 800, margin: 0,
                       letterSpacing: "-0.03em", color: C.text }}>
            IV Screener
          </h1>
          <p style={{ color: C.sub, fontSize: 13, margin: "5px 0 0" }}>
            IV Rank · IV Percentile · HV30 · IV/HV Ratio · Term Structure — powered by Tradier
          </p>
        </div>

        {/* Controls */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`,
                      borderRadius: 10, padding: 16, marginBottom: 20,
                      display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ fontSize: 10, color: C.muted, textTransform: "uppercase",
                            letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>
              Tickers (comma or space separated)
            </label>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && scan()}
              placeholder="SPY, QQQ, NVDA, AMD, ASML..."
              style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`,
                       borderRadius: 6, padding: "9px 12px", color: C.text, fontSize: 14,
                       outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={scan}
              disabled={loading}
              style={{ background: loading ? C.border : C.accent, border: "none",
                       borderRadius: 7, padding: "10px 22px", color: "#fff",
                       fontWeight: 700, fontSize: 14,
                       cursor: loading ? "not-allowed" : "pointer", transition: "background 0.2s" }}>
              {loading ? "Scanning…" : "Scan IV"}
            </button>
            {updated && !loading && (
              <span style={{ fontSize: 11, color: C.muted }}>
                Updated {updated} · sorted by IV Rank
              </span>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
                        borderRadius: 8, padding: "10px 14px", color: C.red,
                        fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Summary bar */}
        {results.length > 0 && !loading && (
          <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { label: "Elevated IV (IVR ≥ 50 + IV/HV ≥ 1.1)", count: elevated, color: C.green },
              { label: "Moderate (IVR 30-49)",                   count: moderate, color: C.amber },
              { label: "Low IV (IVR < 30)",                      count: low,      color: C.muted },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ fontSize: 12, color: C.sub }}>
                <span style={{ color, fontWeight: 700 }}>{count}</span> {label}
              </div>
            ))}
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div style={{ display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
            {Array.from({ length: tickerCount || 6 }).map((_, i) => <Skeleton key={i} />)}
          </div>
        )}

        {/* Results */}
        {!loading && results.length > 0 && (
          <div style={{ display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
            {results.map(d => <Card key={d.ticker} d={d} />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && !results.length && !error && (
          <div style={{ textAlign: "center", padding: "64px 20px", color: C.muted }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.sub }}>
              Enter tickers and hit Scan IV
            </div>
            <div style={{ fontSize: 12, marginTop: 6 }}>
              Results sorted by IV Rank — highest first
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
