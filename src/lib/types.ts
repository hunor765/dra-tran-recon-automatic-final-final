export interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: "admin" | "client";
  client_id?: string | null;
}

export interface ClientResponse {
  id: string;
  user_id?: string | null;
  name: string;
  slug: string;
  platform?: string | null;
  timezone: string;
  vat_rate: number;
  ga4_includes_vat: boolean;
  backend_includes_vat: boolean;
  is_active: boolean;
  created_at: string;
}

export interface ReportJobResponse {
  id: string;
  client_id: string;
  client_name?: string | null;
  period_type: string;
  date_from: string;
  date_to: string;
  status: "pending" | "running" | "completed" | "failed";
  source_type: "api" | "csv";
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}

export interface ReportResultResponse {
  id: string;
  job_id: string;
  client_id: string;
  result_json: AnalysisResult;
  specialist_notes?: string | null;
  row_count_backend?: number | null;
  row_count_ga4?: number | null;
  match_rate?: number | null;
  created_at: string;
  job?: ReportJobResponse | null;
}

// Analysis types (matches backend AnalysisResult)
export interface AnalysisResult {
  summary: {
    ga4_total: number;
    backend_total: number;
    common: number;
    backend_only: number;
    ga4_only: number;
    match_rate: number;
    ga4_total_value: number;
    backend_total_value: number;
  };
  value_comparison: {
    matched_backend_value: number;
    matched_ga4_value: number;
    value_difference: number;
    exact_matches: number;
    exact_match_rate: number;
  };
  payment_analysis: PaymentAnalysis[];
  shipping_analysis: ShippingAnalysis[];
  status_analysis: StatusAnalysis[];
  tech_analysis: {
    browser: TechItem[];
    device: TechItem[];
  };
  temporal_analysis: TemporalPoint[];
  source_medium_analysis: SourceMediumItem[];
  recommendations: Recommendation[];
}

export interface PaymentAnalysis {
  method: string;
  total: number;
  in_ga4: number;
  missing: number;
  rate: number;
  value_total: number;
  value_missing: number;
}

export interface ShippingAnalysis {
  method: string;
  total: number;
  in_ga4: number;
  rate: number;
}

export interface StatusAnalysis {
  status: string;
  total: number;
  in_ga4: number;
  rate: number;
}

export interface TechItem {
  name: string;
  count: number;
  percentage: number;
}

export interface TemporalPoint {
  date: string;
  backend_total: number;
  matched: number;
  match_rate: number;
}

export interface SourceMediumItem {
  source_medium: string;
  total: number;
  matched: number;
  value_total: number;
  value_matched: number;
}

export interface Recommendation {
  priority: "critical" | "high" | "medium";
  title: string;
  description: string;
  impact: number;
}

export interface CredentialResponse {
  id: string;
  client_id: string;
  platform: string;
  wc_site_url?: string | null;
  wc_consumer_key_masked?: string | null;
  shopify_store_domain?: string | null;
  ga4_property_id?: string | null;
  created_at: string;
}
