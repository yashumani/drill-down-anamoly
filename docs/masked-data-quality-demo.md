# Masked data-quality demonstration

The built-in masked data-quality demonstration is a deterministic, synthetic fixture for reviewing the app's quality gates without loading customer data. It intentionally contains missing values, mixed types, invalid dates, outliers, ragged rows, and duplicate records. Every populated `customerEmail` value is the literal token `[MASKED_EMAIL]`.

## Run the demonstration

1. Start the app with `npm run dev` and open **Data quality**.
2. Select **Masked quality-issue demo**.
3. Confirm the dataset source reads **Masked data quality demonstration**.
4. Review the blockers, warnings, sensitive-field classification, and masked preview before opening any downstream investigation.

The automated contract can be rerun with:

```powershell
npm test -- src/data/qualityDemo.test.ts
```

It proves repeatability from fixture creation through dataset profiling, the latest 15-month scope, and deterministic investigation evidence.

## Production boundary

This fixture demonstrates product behavior; it is not a production anonymization pipeline or evidence that uploaded data is safe to disclose. Production data must be classified, minimized, and masked or tokenized before it reaches this application. Keep raw identifiers and sensitive values out of uploads, screenshots, exports, logs, model prompts, and support artifacts. Validate organizational privacy, retention, access-control, and re-identification requirements independently before using real data.
