"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ClientScorecard as ScorecardType } from "@/lib/types";

interface Props {
  clientId: string;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export default function ClientScorecard({ clientId }: Props) {
  const [data, setData] = useState<ScorecardType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ScorecardType>(`/admin/clients/${clientId}/scorecard`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return <div className="card mb-6 animate-pulse h-32" />;
  if (!data || !data.has_data) return null;

  const trendIcon = data.trend_direction === "up" ? "\u2191" : data.trend_direction === "down" ? "\u2193" : "\u2192";
  const trendColor = data.trend_direction === "up" ? "text-success" : data.trend_direction === "down" ? "text-destructive" : "text-muted-foreground";
  const trendLabel = data.trend_direction === "up" ? "Improving" : data.trend_direction === "down" ? "Declining" : "Stable";

  const sparkPoints = data.match_rate_trend
    .filter((p) => p.match_rate !== null)
    .map((p, i, arr) => {
      const x = arr.length > 1 ? (i / (arr.length - 1)) * 100 : 50;
      const y = 100 - (p.match_rate! || 0);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">3-Month Scorecard</h3>
        <span className={`text-sm font-medium ${trendColor}`}>
          {trendIcon} {trendLabel}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Avg Match Rate</p>
          <p className="text-xl font-bold text-foreground">{data.avg_match_rate ?? "\u2014"}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Row Accuracy</p>
          <p className="text-xl font-bold text-foreground">{data.avg_exact_match_rate ?? "\u2014"}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Revenue Tracked</p>
          <p className="text-xl font-bold text-foreground">{formatCurrency(data.total_backend_value)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Discrepancy</p>
          <p className="text-xl font-bold text-destructive">{formatCurrency(data.total_discrepancy)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Jobs (3mo)</p>
          <p className="text-xl font-bold text-foreground">
            {data.jobs_completed}
            {data.jobs_failed > 0 && <span className="text-sm text-destructive ml-1">({data.jobs_failed} failed)</span>}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Trend</p>
          {sparkPoints ? (
            <svg className="w-full h-8" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline
                points={sparkPoints}
                fill="none"
                stroke="#dd3333"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ) : (
            <p className="text-muted-foreground">{"\u2014"}</p>
          )}
        </div>
      </div>
    </div>
  );
}
