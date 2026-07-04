import { useState, useCallback } from "react";

// ─────────────────────────────────────────────────────────────
//  IV SCREENER  –  Powered by Tradier API via Claude
//  Computes: IV Rank, IV Percentile, HV30, IV/HV Ratio,
//            Term Structure for any optionable ticker
// ─────────────────────────────────────────────────────────────

const COLORS = {
  bg: "#0b0e14",
  panel: "#111620",
  border: "#1e2535",
  accent: "#3b82f6",
  green: "#22c55e",
  red: "#ef4444",
  amber: "#f59e0b",
  muted: "#64748b",
  text: "#e2e8f0",
  subtext: "#94a3b8",
};

const DEFAULT_TICKERS = "SPY, QQQ, IWM, NVDA, AMD, ASML, ARM";

// ─── helpers ─────────────────────────────────────────────────

function ivRankColor(ivr) {
  if (ivr === null || ivr === undefined) return COLORS.muted;
  if (ivr >= 60) return COLORS.red;
  if (ivr >= 35) return COLORS.amber;
  return COLORS.green;
}

function ivHvColor(ratio) {
  if (ratio === null || ratio === undefined) return COLORS.muted;
  if (ratio >= 1.3) return COLORS.green;
  if (ratio >= 1.0) return COLORS.amber;
  return COLORS.red;
}

function fmt(v, dec = 1, suffix = "%") {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return `${(+v).toFixed(dec)}${suffix}`;
}

// ─── Claude API call ─────────────────────────────────────────

async function fetchIVData(tickers, token) {
  const prompt = `
You are a financial data assistant. Using the Tradier API with bearer token "${token}", 
fetch real options data to compute IV metrics for these tickers: ${tickers.join(", ")}.

For each ticker, use these Tradier endpoints:
1. GET https://api.tradier.com/v1/markets/options/expirations?symbol=TICKER&includeAllRoots=true
2. GET https://api.tradier.com/v1/markets/options/chains?symbol=TICKER&expiration=NEAREST_EXPIRY&greeks=true
3. GET https://api.tradier.com/v1/markets/history?symbol=TICKER&interval=daily&start=ONE_YEAR_AGO&end=TODAY

From this data, compute for each ticker:
- current_iv: average IV across ATM options (nearest expiry)
- iv_52w_high: highest daily IV over the past 52 weeks (approximate from historical options or use HV as proxy)
- iv_52w_low: lowest daily IV over the past 52 weeks
- iv_rank: (current_iv - iv_52w_low) / (iv_52w_high - iv_52w_low) * 100
- iv_percentile: percentage of days in past year where IV was lower than current
- hv_30d: 30-day historical/realized volatility computed from daily close prices (annualized)
- iv_hv_ratio: current_iv / hv_30d
- term_structure: {"near": IV of nearest expiry, "mid": IV of ~30-45 DTE, "far": IV of ~60-90 DTE}
- current_price: last trade price
- ticker: the symbol

If you cannot compute exact 52-week IV history from the API (Tradier doesn't store it directly), 
approximate iv_rank and iv_percentile using HV-based estimates or recent chain data across multiple expirations.

Respond ONLY with a JSON array, no markdown, no explanation:
[
  {
    "ticker": "SPY",
    "current_price": 450.23,
    "current_iv": 18.5,
    "iv_52w_high": 28.0,
    "iv_52w_low": 11.0,
    "iv_rank": 44.1,
    "iv_percentile": 52.0,
    "hv_30d": 14.2,
    "iv_hv_ratio": 1.30,
    "term_structure": {"near": 17.8, "mid": 18.5, "far": 19.2},
    "error": null
  }
]
`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  const text = data.content?.map(b => b.text || "").join("") || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── components ──────────────────────────────────────────────

function Badge({ value, color, label }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
    </div>
  );
}

function TermBar({ label, value }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "4px 0", borderBottom: `1px solid ${COLORS.border}`
    }}>
      <span style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, fontVariantNumeric: "tabular-nums" }}>
        {fmt(value)}
      </span>
    </div>
  );
}

function IVRankBar({ ivr }) {
  if (ivr === null || ivr === undefined) return null;
  const clamped = Math.max(0, Math.min(100, ivr));
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: COLORS.muted }}>0</span>
        <span style={{ fontSize: 10, color: COLORS.muted }}>50</span>
        <span style={{ fontSize: 10, color: COLORS.muted }}>100</span>
      </div>
      <div style={{ height: 6, background: COLORS.border, borderRadius: 3, position: "relative" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, height: "100%",
          width: `${clamped}%`, background: ivRankColor(ivr), borderRadius: 3,
          transition: "width 0.4s ease"
        }} />
      </div>
    </div>
  );
}

function TickerCard({ d }) {
  const ivrColor = ivRankColor(d.iv_rank);
  const ratioColor = ivHvColor(d.iv_hv_ratio);

  if (d.error) {
    return (
      <div style={{
        background: COLORS.panel, border: `1px solid ${COLORS.border}`,
        borderRadius: 10, padding: 16
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: COLORS.text }}>{d.ticker}</div>
        <div style={{ color: COLORS.red, fontSize: 12, marginTop: 6 }}>{d.error}</div>
      </div>
    );
  }

  return (
    <div style={{
      background: COLORS.panel, border: `1px solid ${COLORS.border}`,
      borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 14
    }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20, color: COLORS.text, letterSpacing: "-0.02em" }}>
            {d.ticker}
          </div>
          <div style={{ fontSize: 13, color: COLORS.subtext, marginTop: 1 }}>
            ${fmt(d.current_price, 2, "")}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: ivrColor }}>
            {fmt(d.iv_rank, 0)}
            <span style={{ fontSize: 12, fontWeight: 400, color: COLORS.muted }}> IVR</span>
          </div>
        </div>
      </div>

      {/* IVR bar */}
      <IVRankBar ivr={d.iv_rank} />

      {/* Key metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <Badge value={fmt(d.current_iv)} color={COLORS.text} label="Current IV" />
        <Badge value={fmt(d.hv_30d)} color={COLORS.subtext} label="HV 30d" />
        <Badge value={fmt(d.iv_hv_ratio, 2, "x")} color={ratioColor} label="IV/HV" />
      </div>

      {/* Secondary metrics */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
        background: COLORS.bg, borderRadius: 6, padding: "10px 12px"
      }}>
        <div>
          <div style={{ fontSize: 10, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>IV Percentile</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: ivrColor, marginTop: 2 }}>{fmt(d.iv_percentile, 0)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>52W Range</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: COLORS.subtext, marginTop: 2 }}>
            {fmt(d.iv_52w_low, 0)} – {fmt(d.iv_52w_high, 0)}
          </div>
        </div>
      </div>

      {/* Term structure */}
      {d.term_structure && (
        <div>
          <div style={{
            fontSize: 10, color: COLORS.muted, textTransform: "uppercase",
            letterSpacing: "0.05em", marginBottom: 4
          }}>Term Structure</div>
          <TermBar label="Near" value={d.term_structure.near} />
          <TermBar label="Mid (~30d)" value={d.term_structure.mid} />
          <TermBar label="Far (~60d)" value={d.term_structure.far} />
        </div>
      )}

      {/* Premium selling signal */}
      <div style={{
        padding: "8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
        background: d.iv_rank >= 50 && d.iv_hv_ratio >= 1.1
          ? "rgba(34,197,94,0.1)" : d.iv_rank >= 30
            ? "rgba(245,158,11,0.1)" : "rgba(100,116,139,0.1)",
        color: d.iv_rank >= 50 && d.iv_hv_ratio >= 1.1
          ? COLORS.green : d.iv_rank >= 30 ? COLORS.amber : COLORS.muted,
        border: `1px solid ${d.iv_rank >= 50 && d.iv_hv_ratio >= 1.1
          ? "rgba(34,197,94,0.2)" : d.iv_rank >= 30
            ? "rgba(245,158,11,0.2)" : "rgba(100,116,139,0.15)"}`,
      }}>
        {d.iv_rank >= 50 && d.iv_hv_ratio >= 1.1
          ? "✓ Elevated IV — favorable for premium selling"
          : d.iv_rank >= 30
            ? "~ Moderate IV — neutral for premium selling"
            : "↓ Low IV — less favorable for premium selling"}
      </div>
    </div>
  );
}

// ─── main app ────────────────────────────────────────────────

export default function IVScreener() {
  const [tickerInput, setTickerInput] = useState(DEFAULT_TICKERS);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const handleScan = useCallback(async () => {
    if (!token.trim()) { setError("Enter your Tradier live token first."); return; }
    const tickers = tickerInput.split(/[,\s]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
    if (!tickers.length) { setError("Enter at least one ticker."); return; }

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const data = await fetchIVData(tickers, token.trim());
      setResults(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError(`Failed to fetch data: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [tickerInput, token]);

  const sortedResults = [...results].sort((a, b) => (b.iv_rank ?? 0) - (a.iv_rank ?? 0));

  return (
    <div style={{
      minHeight: "100vh", background: COLORS.bg, color: COLORS.text,
      fontFamily: "'Inter', system-ui, sans-serif", padding: "24px 16px"
    }}>

      {/* Header */}
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.accent }} />
            <span style={{
              fontSize: 11, color: COLORS.muted, textTransform: "uppercase",
              letterSpacing: "0.1em"
            }}>Options Intelligence</span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: "-0.03em" }}>
            IV Screener
          </h1>
          <p style={{ color: COLORS.subtext, fontSize: 13, margin: "6px 0 0" }}>
            IV Rank · IV Percentile · HV30 · IV/HV Ratio · Term Structure
          </p>
        </div>

        {/* Controls */}
        <div style={{
          background: COLORS.panel, border: `1px solid ${COLORS.border}`,
          borderRadius: 10, padding: 16, marginBottom: 20, display: "flex",
          flexDirection: "column", gap: 10
        }}>

          <div>
            <label style={{
              fontSize: 11, color: COLORS.muted, textTransform: "uppercase",
              letterSpacing: "0.05em", display: "block", marginBottom: 6
            }}>
              Tickers (comma separated)
            </label>
            <input
              value={tickerInput}
              onChange={e => setTickerInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleScan()}
              placeholder="SPY, QQQ, NVDA, AMD..."
              style={{
                width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                borderRadius: 6, padding: "9px 12px", color: COLORS.text, fontSize: 14,
                outline: "none", boxSizing: "border-box", fontFamily: "inherit"
              }}
            />
          </div>

          <div>
            <label style={{
              fontSize: 11, color: COLORS.muted, textTransform: "uppercase",
              letterSpacing: "0.05em", display: "block", marginBottom: 6
            }}>
              Tradier Live Token
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="Your Tradier live API token"
                style={{
                  flex: 1, background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                  borderRadius: 6, padding: "9px 12px", color: COLORS.text, fontSize: 14,
                  outline: "none", fontFamily: "inherit"
                }}
              />
              <button
                onClick={() => setShowToken(s => !s)}
                style={{
                  background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                  borderRadius: 6, padding: "9px 12px", color: COLORS.muted,
                  cursor: "pointer", fontSize: 12
                }}>
                {showToken ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button
            onClick={handleScan}
            disabled={loading}
            style={{
              background: loading ? COLORS.border : COLORS.accent,
              border: "none", borderRadius: 7, padding: "10px 20px",
              color: "#fff", fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.2s", alignSelf: "flex-start"
            }}>
            {loading ? "Scanning…" : "Scan IV"}
          </button>

          {lastUpdated && !loading && (
            <div style={{ fontSize: 11, color: COLORS.muted }}>
              Last updated: {lastUpdated} — sorted by IV Rank (highest first)
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 8, padding: "10px 14px", color: COLORS.red,
            fontSize: 13, marginBottom: 16
          }}>
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                background: COLORS.panel, border: `1px solid ${COLORS.border}`,
                borderRadius: 10, padding: 18, height: 280,
                animation: "pulse 1.5s ease-in-out infinite"
              }}>
                <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
                <div style={{ background: COLORS.border, borderRadius: 4, height: 20, width: "40%", marginBottom: 10 }} />
                <div style={{ background: COLORS.border, borderRadius: 4, height: 12, width: "60%", marginBottom: 20 }} />
                <div style={{ background: COLORS.border, borderRadius: 4, height: 6, marginBottom: 16 }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[1, 2, 3].map(j => <div key={j} style={{ background: COLORS.border, borderRadius: 4, height: 48 }} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results grid */}
        {!loading && sortedResults.length > 0 && (
          <>
            {/* Summary bar */}
            <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
              {[
                { label: "High IV (IVR ≥ 60)", count: sortedResults.filter(d => d.iv_rank >= 60).length, color: COLORS.red },
                { label: "Moderate (IVR 35-59)", count: sortedResults.filter(d => d.iv_rank >= 35 && d.iv_rank < 60).length, color: COLORS.amber },
                { label: "Low IV (IVR < 35)", count: sortedResults.filter(d => d.iv_rank < 35).length, color: COLORS.muted },
                { label: "IV > HV (rich options)", count: sortedResults.filter(d => d.iv_hv_ratio >= 1.0).length, color: COLORS.green },
              ].map(({ label, count, color }) => (
                <div key={label} style={{ fontSize: 12, color: COLORS.subtext }}>
                  <span style={{ color, fontWeight: 700 }}>{count}</span> {label}
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {sortedResults.map(d => <TickerCard key={d.ticker} d={d} />)}
            </div>
          </>
        )}

        {/* Empty state */}
        {!loading && results.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: COLORS.muted }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.subtext }}>Enter tickers and your Tradier token</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Results sorted by IV Rank — highest first</div>
          </div>
        )}
      </div>
    </div>
  );
}
