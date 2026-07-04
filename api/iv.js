// api/iv.js — Vercel Serverless Function (CommonJS)
// Calls Tradier API server-side. Token stored in TRADIER_TOKEN env var.

const TRADIER_BASE = "https://api.tradier.com/v1";

async function tradierGet(endpoint, params, token) {
  const url = new URL(`${TRADIER_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Tradier ${endpoint} HTTP ${res.status}`);
  return res.json();
}

function calcHV(closes, period = 30) {
  if (closes.length < period + 1) return null;
  const slice = closes.slice(-(period + 1));
  const logReturns = [];
  for (let i = 1; i < slice.length; i++) {
    logReturns.push(Math.log(slice[i] / slice[i - 1]));
  }
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

async function getChainIv(ticker, expDate, currentPrice, token) {
  try {
    const data = await tradierGet(
      "/markets/options/chains",
      { symbol: ticker, expiration: expDate, greeks: "true" },
      token
    );
    const options = data?.options?.option || [];
    const arr = Array.isArray(options) ? options : [options];
    const strikeMap = {};
    arr.forEach((o) => {
      if (!strikeMap[o.strike]) strikeMap[o.strike] = {};
      strikeMap[o.strike][o.option_type] = o;
    });
    const atmStrikes = Object.keys(strikeMap)
      .map(Number)
      .sort((a, b) => Math.abs(a - currentPrice) - Math.abs(b - currentPrice))
      .slice(0, 6);
    const ivs = [];
    atmStrikes.forEach((s) => {
      const c = strikeMap[s]?.call?.greeks?.mid_iv;
      const p = strikeMap[s]?.put?.greeks?.mid_iv;
      if (c > 0) ivs.push(c * 100);
      if (p > 0) ivs.push(p * 100);
    });
    return ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null;
  } catch {
    return null;
  }
}

async function processOneTicker(ticker, token) {
  try {
    // Quote
    const quoteData = await tradierGet("/markets/quotes", { symbols: ticker, greeks: "false" }, token);
    const quote = quoteData?.quotes?.quote;
    if (!quote) throw new Error("No quote");
    const currentPrice = quote.last || quote.close || 0;

    // Expirations
    const expData = await tradierGet(
      "/markets/options/expirations",
      { symbol: ticker, includeAllRoots: "true", strikes: "false" },
      token
    );
    const expirations = expData?.expirations?.date || [];
    const today = new Date();
    const parsed = (Array.isArray(expirations) ? expirations : [expirations])
      .map((d) => ({ date: d, dte: Math.round((new Date(d) - today) / 86400000) }))
      .filter((e) => e.dte >= 1 && e.dte <= 90)
      .sort((a, b) => a.dte - b.dte);

    if (!parsed.length) throw new Error("No expirations");
    const nearExp = parsed[0];
    const midExp  = parsed.find((e) => e.dte >= 25) || parsed[Math.floor(parsed.length / 2)];
    const farExp  = parsed.find((e) => e.dte >= 55) || parsed[parsed.length - 1];

    // IV from chains
    const [nearIv, midIv, farIv] = await Promise.all([
      getChainIv(ticker, nearExp.date, currentPrice, token),
      getChainIv(ticker, midExp.date,  currentPrice, token),
      getChainIv(ticker, farExp.date,  currentPrice, token),
    ]);

    // Historical prices for HV
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const histData = await tradierGet("/markets/history", {
      symbol: ticker, interval: "daily",
      start: oneYearAgo.toISOString().split("T")[0],
      end:   today.toISOString().split("T")[0],
    }, token);
    const days = histData?.history?.day || [];
    const closes = (Array.isArray(days) ? days : [days]).map((d) => d.close).filter(Boolean);

    const hv30 = calcHV(closes, 30);

    // IV Rank approximation via rolling HV
    let ivRank = null, ivPercentile = null, iv52wHigh = null, iv52wLow = null;
    if (closes.length >= 50) {
      const rollingHVs = [];
      for (let i = 31; i <= closes.length; i++) {
        const hv = calcHV(closes.slice(i - 31, i), 30);
        if (hv) rollingHVs.push(hv * 1.15);
      }
      if (rollingHVs.length) {
        iv52wHigh = Math.max(...rollingHVs);
        iv52wLow  = Math.min(...rollingHVs);
        const cur = nearIv || (hv30 ? hv30 * 1.15 : null);
        if (cur && iv52wHigh !== iv52wLow) {
          ivRank = Math.max(0, Math.min(100, ((cur - iv52wLow) / (iv52wHigh - iv52wLow)) * 100));
          ivPercentile = (rollingHVs.filter((v) => v < cur).length / rollingHVs.length) * 100;
        }
      }
    }

    const r = (v, d = 1) => v != null ? Math.round(v * 10 ** d) / 10 ** d : null;
    return {
      ticker,
      current_price:  r(currentPrice, 2),
      current_iv:     r(nearIv),
      iv_52w_high:    r(iv52wHigh),
      iv_52w_low:     r(iv52wLow),
      iv_rank:        r(ivRank),
      iv_percentile:  r(ivPercentile),
      hv_30d:         r(hv30),
      iv_hv_ratio:    nearIv && hv30 ? r(nearIv / hv30, 2) : null,
      term_structure: {
        near: r(nearIv), near_dte: nearExp.dte,
        mid:  r(midIv),  mid_dte:  midExp.dte,
        far:  r(farIv),  far_dte:  farExp.dte,
      },
      error: null,
    };
  } catch (err) {
    return { ticker, error: err.message };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.TRADIER_TOKEN;
  if (!token) return res.status(500).json({ error: "TRADIER_TOKEN not set in Vercel env vars" });

  const { tickers } = req.body || {};
  if (!Array.isArray(tickers) || !tickers.length)
    return res.status(400).json({ error: "tickers array required" });

  const results = [];
  for (let i = 0; i < tickers.length; i += 6) {
    const chunk = await Promise.all(
      tickers.slice(i, i + 6).map((t) => processOneTicker(t.toUpperCase(), token))
    );
    results.push(...chunk);
  }
  return res.status(200).json(results);
};
