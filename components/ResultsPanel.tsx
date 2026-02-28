import { CalculationResult, MetricCard } from "@/types/contracts";

interface ResultsPanelProps {
  result: CalculationResult;
}

const toneStyles: Record<NonNullable<MetricCard["tone"]>, string> = {
  neutral: "text-slate-100",
  positive: "text-emerald-300",
  negative: "text-rose-300",
  info: "text-sky-300"
};

const formatValue = (label: string, value: number | string): string => {
  if (typeof value === "string") {
    return value;
  }

  const rounded = Math.round(value * 100) / 100;
  const numeric = rounded.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  if (label.toLowerCase().includes("service level")) {
    return `${numeric}%`;
  }

  if (
    label.toLowerCase().includes("profit") ||
    label.toLowerCase().includes("cost") ||
    label.toLowerCase().includes("price") ||
    label.toLowerCase().includes("savings")
  ) {
    return `$${numeric}`;
  }

  return numeric;
};

export default function ResultsPanel({ result }: ResultsPanelProps) {
  return (
    <section className="panel-card p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            className="text-lg font-semibold text-slate-100 md:text-xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Results Panel
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Decision metrics generated from the current contract and demand assumptions.
          </p>
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-sky-500/30 bg-sky-500/10 p-4">
        <p className="text-xs uppercase tracking-wider text-sky-300">Key Decision</p>
        <p className="mt-1 text-lg font-semibold text-slate-100 md:text-xl">{result.keyDecision}</p>
      </div>

      {result.metricsSectionTitle ? (
        <div className="mb-4">
          <p
            className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-300"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {result.metricsSectionTitle}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {result.metrics.map((metric) => {
          const tone = metric.tone ?? "neutral";

          return (
            <article key={metric.label} className="metric-card p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">{metric.label}</p>
              <p
                className={`mt-2 break-words ${
                  metric.emphasize ? "text-2xl font-semibold" : "text-xl font-semibold"
                } ${toneStyles[tone]}`}
              >
                {formatValue(metric.label, metric.value)}
              </p>
            </article>
          );
        })}
      </div>

      {result.warnings && result.warnings.length > 0 ? (
        <div className="mt-5 rounded-xl border border-amber-400/35 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-200">Model Warning</p>
          {result.warnings.map((warning, index) => (
            <p key={`${warning}-${index}`} className="mt-1 text-sm text-amber-100">
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      {result.notes && result.notes.length > 0 ? (
        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900/45 p-4 text-sm text-slate-300">
          {result.notes.map((note, index) => (
            <p key={`${note}-${index}`} className="leading-6">
              {note}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
