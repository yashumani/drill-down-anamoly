# Multi-Industry Data Blueprint

Prepared October 14, 2026

## Purpose and boundaries

This blueprint supports Multi-Tier Reporting Assurance: Tier 1 validation, Tier 2 mathematical and statistical checks, and Tier 3 AI-assisted interpretation. Data layers are called transaction, grouped, and reporting; assurance tiers are separate concepts.

Public annual reports contain financial statements and selected operational KPIs. They do **not** contain all internal operational data, customer transactions, production records, or patient encounters. The sources below establish reporting structures and selected definitions, not the existence or values of the proposed detailed records.

All generated entities, identifiers, transactions and values should be explicitly labeled **synthetic**. Company names identify public reporting-structure references only. The detailed table designs and checks below are recommendations, not descriptions of those companies' internal systems.

Telecom, retail, manufacturing and SaaS are the four sectors planned for the initial fixture pack. Banking, insurance and healthcare are blueprint-only extensions, not included fixtures at this stage.

## Shared architecture without a universal wide table

Maintain independent domain tables at declared grains. A shared catalog links them through conformed entity, calendar, currency, geography, product and reporting-scope dimensions where those dimensions genuinely apply. Do not join facts directly at incompatible grains or populate one universal table with unrelated industry fields.

Common financial domains:

- Income statement: entity × non-overlapping period × financial account × currency × accounting basis; revenues and expenses are flows
- Balance sheet: entity × as-of date × financial account × currency; assets, liabilities and equity are stocks
- Cash flow: entity × period × cash-flow category × currency; retain reported classification and reconciliation to cash balances
- Consolidation adjustments: entity/segment relationships, elimination amounts, period and accounting basis; do not simply sum consolidated and segment rows

Other reusable domains, only where appropriate:

- Sales: sales line or service event, with returns and recognition timing distinguished
- Billing and collections: invoice lines, payment events, receivable snapshots; billing is not automatically revenue
- Workforce: employee or role-day/month exposure, payroll events, hours and headcount snapshots; all identities invented
- Inventory and procurement: purchase-order lines, receipts, stock snapshots and consumption movements; services businesses need not have retail-style inventory
- Operational events and exposures: separate sector-specific facts supplying counts and denominator weights
- Reporting metrics: metric × scope × period/as-of date × definition version, with explicit numerator and denominator references
- Provenance and definitions: source URL, report period, page/section, unit, scale, aggregation behavior, population scope, formula, synthetic assumption and definition version

Flow amounts may be summed over disjoint populations and non-overlapping periods, subject to eliminations. Snapshot balances must not be summed over dates. Ratios, growth rates and averages are non-additive and should generally be recomputed from compatible components. Store actual period boundaries rather than assuming the same fiscal year-end across companies. Preserve zero, missing, not-applicable and suppressed values as distinct states.

## 1. Telecom: Verizon reference

**Initial fixture sector.**

Source: [Verizon 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/732712/000073271226000015/a2025_aronform10-k.pdf), year ended December 31, 2025; printed pages 27–29.

### What the public report establishes

The report separates service, equipment and other revenues; connection and account counts; net additions; churn; ARPA; and Consumer and Business segments. Churn uses relevant disconnects and average connections, while ARPA uses eligible retail postpaid service revenue and average accounts. Accounts and connections are different populations. Reclassifications and scope adjustments affect comparability.

### Proposed synthetic design

- connection_events: one activation, disconnection or adjustment per connection and timestamp; counts
- connection_snapshot: one connection per month-end; account, segment, plan and geography
- account_month: one account-month; eligible service revenue in USD and account exposure
- Optional network_service_day: invented site-day availability, outages and traffic; this is additional synthetic operational scope, not Verizon-disclosed transaction data

Events and eligible revenue are additive; closing counts are not additive across time. ARPA and churn need explicit exposure weighting and monthly versus annual normalization. Define precisely which revenue categories are eligible; do not use all wireless revenue indiscriminately.

Checks:

1. Tier 1: unique event IDs, valid account/connection mappings and documented adjustment types
2. Tier 2: closing connections = opening + additions − disconnects + adjustments; weighted churn and ARPA recalculation
3. Tier 3: flag explanations attributing revenue growth to connection growth when price or mix drives it

## 2. Retail: Walmart reference

**Initial fixture sector.**

Source: [Walmart FY2025 annual report](https://corporate.walmart.com/content/dam/corporate/documents/newsroom/2025/04/24/walmart-releases-2025-annual-report-and-proxy-statement/walmart-inc-2025-annual-report.pdf), fiscal year ended January 31, 2025.

### What the public report establishes

The report presents segment sales and operating income, comparable sales, transaction/ticket commentary and e-commerce contribution. Comparable sales including fuel and fuel effects are separately identified. Comparisons require consistent populations and scope.

### Proposed synthetic design

- sale_line: transaction × line; store, channel, SKU, quantity, net USD sales and cost
- transaction_header: one transaction; store/date and transaction count
- inventory_snapshot: store × SKU × date; units and valuation
- comparable_store_cohort: store × comparison period; eligibility and fuel scope

Average ticket = eligible net sales / eligible transactions. Comparable growth = same-cohort current sales / prior sales − 1. Line quantities and sales are additive, but transaction counts must not be repeated and summed across lines. Inventory snapshots and rates are not time-additive.

Checks:

1. Tier 1: transaction-line uniqueness, required product/store keys and return-sign conventions
2. Tier 2: line-to-header reconciliation; compounded transaction and ticket growth explains sales growth only with identical populations
3. Tier 3: detect confusion between total and comparable-store growth, or fuel-inclusive and ex-fuel measures

## 3. Manufacturing: Caterpillar reference

**Initial fixture sector.**

Sources: [Caterpillar 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/18230/000001823026000008/cat-20251231.htm), year ended December 31, 2025; [Q3 2025 retail statistics exhibit](https://www.sec.gov/Archives/edgar/data/18230/000001823025000043/ex992toformcat3q2025retail.htm); [official retail statistics limitations](https://investors.caterpillar.com/financials/retail-statistics/default.aspx).

### What the public reports establish

Caterpillar reports manufacturing segment financials and separate dealer retail-sales indicators. Retail statistics convey approximate trends and are not a substitute for audited financial statements. Historical segment classifications may not be directly comparable after recasting.

### Proposed synthetic design

- production_batch: plant × batch × product × completion date; input, good and scrap units
- shipment_line: shipment × line; dealer, product, units, USD revenue and cost
- order_backlog_snapshot: order line × date; remaining units and value
- dealer_retail_period: region × product family × period; distinct sell-through measures

Synthetic yield = good output / defined input units. Backlog closes from opening backlog plus orders less fulfilled/cancelled quantities, with explicit adjustments. These are scenario definitions, not formulas attributed to Caterpillar. Units are additive only within compatible units of measure; backlog is a snapshot; percentages need weighted recomputation.

Checks:

1. Tier 1: valid units of measure, product/plant mappings and order keys
2. Tier 2: production unit balance and backlog roll-forward
3. Tier 3: identify confusion among manufacturer shipments, dealer retail demand and recognized revenue

## 4. SaaS: Salesforce reference

**Initial fixture sector.**

Source: [Salesforce FY2025 annual report](https://www.sec.gov/Archives/edgar/data/1108524/000110852425000019/salesforce_fy25annualreport.pdf), fiscal year ended January 31, 2025.

### What the public report establishes

The report separates subscription/support and professional-service revenue and discloses unearned revenue, remaining performance obligations (RPO), and attrition. RPO represents contracted future revenue not yet recognized. It is not necessarily predictive of revenue growth and varies with contract timing, terms and currency.

### Proposed synthetic design

- contract_line: contract × product; service dates, currency and recurring fee
- revenue_schedule: contract line × recognition month; USD revenue
- billing_event: invoice × line; billed USD
- subscription_snapshot: subscription × month-end; normalized recurring value and status
- obligation_snapshot: contract line × date; remaining contracted revenue

Synthetic net revenue retention (NRR) = ending recurring revenue from the opening customer cohort / opening cohort recurring revenue. New customers are excluded. This scenario NRR definition is not a claim that Salesforce reports this metric on this basis. RPO and recurring-revenue snapshots are not summed across dates. Billings, cash collections and recognized revenue are distinct.

Checks:

1. Tier 1: valid service dates, contract references and currency basis
2. Tier 2: revenue schedule reconciliation, RPO bridge and cohort-based NRR recalculation
3. Tier 3: flag narratives equating RPO or billings growth with recognized revenue growth

## 5. Banking: JPMorgan Chase reference

**Blueprint-only extension; not an initial fixture.**

Source: [JPMorgan Chase 2025 annual report](https://www.jpmorganchase.com/content/dam/jpmc/jpmorgan-chase-and-co/investor-relations/documents/annualreport-2025.pdf), year ended December 31, 2025.

### What the public report establishes

The report distinguishes interest and noninterest revenue, average earning assets, loans, deposits, credit losses and reported/managed measures. Managed net interest income, taxable-equivalent adjustments, Markets exclusions and net yield have distinct scopes.

### Proposed synthetic design

- loan_daily_balance: loan × date; principal USD, product, portfolio and delinquency band
- interest_accrual: instrument × day; earned/paid interest USD
- credit_loss_event: loan × event; charge-off/recovery USD
- allowance_rollforward: portfolio × month; provision and allowance movements

Annualized net yield = compatible net interest income / time-weighted average earning assets × documented annualization factor. Daily balances are not summed as period balances; balance-days support weighted averages. Keep reported and managed accounting bases separate.

Checks:

1. Tier 1: currency, temporal coverage and accounting-basis consistency
2. Tier 2: recompute net yield and allowance roll-forward
3. Tier 3: flag narratives conflating higher interest income with higher yield despite asset-base growth

## 6. Insurance: Travelers reference

**Blueprint-only extension; not an initial fixture.**

Source: [Travelers Q4 and full-year 2025 results](https://investor.travelers.com/newsroom/press-releases/news-details/2026/Travelers-Reports-Excellent-Fourth-Quarter-and-Full-Year-Results/default.aspx), periods ended December 31, 2025.

### What the public report establishes

The release presents written/earned premiums, claims, underwriting expenses, combined ratios, catastrophe losses and prior-year reserve development. It specifies fee adjustments and distinguishes its earned-premium-based expense ratio from statutory written-premium treatment. Similarly named ratios across companies may differ.

### Proposed synthetic design

- premium_earning: policy × coverage × month; written and earned USD premiums
- claim_payment: claim × payment event; paid USD
- claim_reserve_snapshot: claim × valuation date; reserve USD
- underwriting_period: business line × accounting period; adjusted numerator components

Company-style combined ratio = adjusted loss numerator / earned premium + adjusted expense numerator / earned premium. Claim payments alone are not incurred losses. Separate accident period, payment period and valuation date. Premium flows are additive over non-overlapping coverage-period allocations; reserves are snapshots; ratios are non-additive.

Checks:

1. Tier 1: policy/claim links and accident/report/payment chronology
2. Tier 2: denominator-correct ratio calculations and reserve roll-forward
3. Tier 3: distinguish underlying improvement from catastrophe or prior-year reserve-development effects

## 7. Healthcare operations: HCA reference

**Blueprint-only extension; not an initial fixture.**

Source: [HCA Q4 and full-year 2025 results](https://investor.hcahealthcare.com/news/news-details/2026/HCA-Healthcare-Reports-Fourth-Quarter-2025-Results-and-Provides-2026-Guidance/default.aspx), periods ended December 31, 2025.

### What the public report establishes

The release reports admissions, equivalent admissions, patient days, surgeries, emergency visits, revenue per equivalent admission, length of stay and occupancy. It distinguishes total from same-facility populations.

### Proposed synthetic design

- encounter: invented encounter ID, facility, service line, admission/discharge dates; no real patient data
- facility_day: facility × date; staffed bed-days and occupied bed-days
- procedure_event: encounter × procedure
- service_revenue_month: facility × service × month; USD revenue

Synthetic occupancy = occupied bed-days / staffed bed-days. Synthetic length of stay = completed-encounter stay days / discharges. These are explicitly chosen scenario definitions, not asserted HCA denominator definitions. Equivalent admissions require a separate documented adjustment method before generation. Patient/bed-days are exposure quantities; ratios need compatible weighting. Encounters and procedures must not be counted interchangeably.

Checks:

1. Tier 1: encounter chronology and non-overlapping facility-day records
2. Tier 2: weighted occupancy and length of stay; revenue-volume-rate reconciliation on identical scopes
3. Tier 3: flag revenue explanations mixing same-facility and total populations

## Assurance controls across every example

- Record each fact's grain, unit and scale, temporal basis, source/synthetic status, population scope and aggregation rule
- Keep reporting subtotals and their underlying detail distinguishable to prevent double counting
- Include clean baseline records and separately labeled fault-injected copies; preserve expected findings outside the evidence being tested
- Test missing values, duplicates, invalid references, unit scaling, fiscal-calendar mismatches, population shifts, arithmetic inconsistencies and plausible but unsupported narratives
- Tier 3 must cite deterministic evidence and propose reviewable interpretations; it must not silently repair source facts or override Tier 1/2 failures
- Operational completeness, causality and company-specific definitions must not be inferred from selected public KPIs
