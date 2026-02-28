"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ChartConfig } from "@/types/contracts";

interface GraphPanelProps {
  charts: ChartConfig[];
}

const CHART_MARGIN = { top: 12, right: 16, left: 8, bottom: 40 } as const;
const X_AXIS_TICK = { fill: "#94a3b8", fontSize: 11 } as const;
const Y_AXIS_TICK = { fill: "#94a3b8", fontSize: 12 } as const;
const X_AXIS_LABEL = {
  fill: "#cbd5e1",
  position: "insideBottom",
  offset: -20,
  fontSize: 12
} as const;
const Y_AXIS_LABEL = {
  angle: -90,
  fill: "#cbd5e1",
  position: "insideLeft",
  fontSize: 12
} as const;
const LEGEND_STYLE = { color: "#e2e8f0", fontSize: "12px" } as const;

function ChartTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number | string }>;
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-600 bg-slate-900/95 p-3 shadow-xl">
      <p className="text-xs text-slate-300">{label}</p>
      <div className="mt-1 space-y-1">
        {payload.map((entry) => (
          <p key={entry.name} className="text-xs text-slate-100">
            {entry.name}:{" "}
            {typeof entry.value === "number"
              ? Number(entry.value).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })
              : entry.value}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function GraphPanel({ charts }: GraphPanelProps) {
  return (
    <section className="panel-card p-6">
      <div className="mb-5">
        <h2
          className="text-lg font-semibold text-slate-100 md:text-xl"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Graph Panel
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Dynamic charting of quantity, demand, profit, and cost sensitivities.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {charts.map((chart) => (
          <article
            key={chart.title}
            className="rounded-xl border border-slate-700 bg-slate-900/45 p-4"
          >
            <h3
              className="text-sm font-semibold text-slate-100"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {chart.title}
            </h3>
            {chart.subtitle ? (
              <p className="mt-1 text-xs text-slate-400">{chart.subtitle}</p>
            ) : null}

            <div className="mt-4 h-[320px] w-full">
              {chart.chartType === "bar" ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart.data} margin={CHART_MARGIN}>
                    <CartesianGrid strokeDasharray="4 4" stroke="#334155" />
                    <XAxis
                      dataKey={chart.xKey}
                      interval="preserveStartEnd"
                      minTickGap={30}
                      angle={-30}
                      textAnchor="end"
                      stroke="#94a3b8"
                      tick={X_AXIS_TICK}
                      label={{
                        ...X_AXIS_LABEL,
                        value: chart.xLabel,
                      }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tick={Y_AXIS_TICK}
                      label={{
                        ...Y_AXIS_LABEL,
                        value: chart.yLabel,
                      }}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={LEGEND_STYLE} />
                    {(chart.bars ?? []).map((bar) => (
                      <Bar
                        key={bar.dataKey}
                        dataKey={bar.dataKey}
                        name={bar.name}
                        fill={bar.color}
                        radius={[6, 6, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart.data} margin={CHART_MARGIN}>
                    <CartesianGrid strokeDasharray="4 4" stroke="#334155" />
                    <XAxis
                      dataKey={chart.xKey}
                      interval="preserveStartEnd"
                      minTickGap={30}
                      angle={-30}
                      textAnchor="end"
                      stroke="#94a3b8"
                      tick={X_AXIS_TICK}
                      label={{
                        ...X_AXIS_LABEL,
                        value: chart.xLabel,
                      }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tick={Y_AXIS_TICK}
                      label={{
                        ...Y_AXIS_LABEL,
                        value: chart.yLabel,
                      }}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={LEGEND_STYLE} />
                    {chart.referenceX ? (
                      <ReferenceLine
                        x={chart.referenceX.value}
                        stroke={chart.referenceX.color ?? "#f59e0b"}
                        strokeDasharray="5 5"
                        label={{
                          value: chart.referenceX.label,
                          fill: "#fbbf24",
                          position: "insideTopRight",
                          fontSize: 11
                        }}
                      />
                    ) : null}
                    {(chart.lines ?? []).map((line) => (
                      <Line
                        key={line.dataKey}
                        type="monotone"
                        dataKey={line.dataKey}
                        name={line.name}
                        stroke={line.color}
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
