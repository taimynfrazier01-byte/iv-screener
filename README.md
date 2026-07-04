# IV Screener

Options IV screening tool — IV Rank, IV Percentile, HV30, IV/HV Ratio, Term Structure.
Powered by Tradier live API. Deployed on Vercel.

## Deploy to Vercel

1. Push this repo to GitHub
2. Import repo in Vercel dashboard
3. Add environment variable:
   - `TRADIER_TOKEN` = your Tradier live account token
4. Deploy — Vercel auto-detects Vite + serverless function

## Local Development

```bash
npm install
vercel dev        # runs both Vite frontend + serverless function locally
```

If you don't have Vercel CLI:
```bash
npm install -g vercel
vercel login
vercel dev
```

## Project Structure

```
iv-screener/
├── api/
│   └── iv.js          ← Vercel serverless function (Tradier calls happen here)
├── src/
│   ├── App.jsx        ← React frontend
│   └── main.jsx       ← Entry point
├── index.html
├── package.json
├── vite.config.js
└── vercel.json
```

## How It Works

- Frontend sends POST /api/iv with list of tickers
- Serverless function calls Tradier API using TRADIER_TOKEN env var (never exposed to browser)
- Computes IV Rank, IV Percentile, HV30, IV/HV Ratio, Term Structure
- Returns results sorted by IV Rank (highest first)

## IV Rank Interpretation

- IVR ≥ 60: High IV — favorable for premium selling
- IVR 35-59: Moderate IV — neutral
- IVR < 35: Low IV — less favorable (current SPY/QQQ environment as of mid-2026)

## Notes

- IV Rank and IV Percentile are approximated using rolling 30-day HV scaled by 1.15x
  (Tradier does not store historical options chain snapshots on standard plans)
- For exact historical IV, Polygon Starter ($29/mo) provides full chain history
