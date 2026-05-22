-- Coverage analysis results per tenant (populated by the Analyse Policies feature)
CREATE TABLE IF NOT EXISTS coverage_analysis (
  tenant_id   text PRIMARY KEY,
  analysis    jsonb NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
