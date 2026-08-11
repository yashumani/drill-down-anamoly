# Code Review Notes

## Review scope

Reviewed the current React/Vite dashboard architecture after the conversational analyst and external-news factor work. Focus areas:

- dashboard flow and non-technical usability
- public news integration reliability
- browser-only GitHub Pages constraints
- BYO-LLM configuration safety
- demo readiness without private data or paid API keys
- separation between observed anomaly evidence and external-context hypotheses

## Findings addressed in this pass

### 1. Public news demos depended too heavily on live APIs

The dashboard had live providers, but a public GitHub Pages demo can fail if a provider blocks browser CORS, if an API key is missing, or if a live news provider returns no relevant results. This would make the external-factor panel look broken during a demo.

**Fix:** Added a `demo` news provider and a seeded Verizon/competitor demo feed. Users can still select GDELT, NewsAPI, or Guardian, but the default demo path works without a key or network dependency.

### 2. External context existed but had no sample analyst notes

The analyst context box was useful, but an empty textarea does not teach a user what to enter.

**Fix:** Added sample business context covering western device inventory constraints, Promo B launch timing, fulfillment delays, and competitor device-switcher pressure. This lets a user immediately test the hypothesis narrative workflow.

### 3. Deterministic chat did not acknowledge external context

The LLM prompt received external context, but deterministic chat did not provide a useful answer when users asked about news or external factors.

**Fix:** Added external-context handling to the deterministic chat layer. It now explains that external signals are hypothesis material and recommends validation paths such as testing overlap by time, product, channel, or geography.

### 4. NewsAPI key handling used query parameters

Putting user-supplied keys in URLs is less clean because URLs can be logged or copied accidentally.

**Fix:** Updated the NewsAPI request to send the key through the `X-Api-Key` header. This is safer for user-entered keys, though production should still proxy all provider calls through a backend.

### 5. Demo affordances were not visually distinct

Sample context and demo news controls needed clear spacing and labeling.

**Fix:** Added lightweight demo helper CSS and visual demo tags for example articles.

## Known limitations after this pass

- The demo still runs entirely in the browser. API keys entered in the browser are not persisted, but production should use a backend proxy / LLM gateway.
- Browser-based live news calls can still fail because of CORS, rate limits, API plan restrictions, or provider availability.
- Public news is not causal evidence. The system treats it as external hypothesis context only.
- The anomaly engine remains client-side for the public demo. Enterprise-scale 100+ dimension analysis should move to a backend service.
- Demo article links point to `example.com` and are intentionally labeled as demo content.

## Demo data now available

- Main tabular sample dataset: `src/data/sampleData.ts`
- Demo public-news articles: `src/data/demoNews.ts`
- Demo business context: `src/data/demoNews.ts`
- Demo chat questions: `src/data/demoNews.ts`
- Demo styling helpers: `src/demo.css`

## Recommended next production tasks

1. Add a backend API for external factor ingestion and LLM calls.
2. Add a structured external-factor table upload path for campaigns, outages, inventory, pricing, and weather.
3. Score overlap between anomalies and external signals by date, geography, product, and channel.
4. Add exportable investigation summaries for analysts.
5. Add unit tests for query building, news normalization, and chat intent handling.
