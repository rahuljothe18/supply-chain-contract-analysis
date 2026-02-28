"use client";

import {
  CostInputs,
  ContractDefinition,
  DemandSettings,
  OptionEvaluationMode
} from "@/types/contracts";
import Tooltip from "@/components/ui/Tooltip";

interface InputPanelProps {
  contract: ContractDefinition;
  optionEvaluationMode: OptionEvaluationMode;
  inputs: Record<string, string>;
  demandSettings: DemandSettings;
  toggles: {
    includeSalvage: boolean;
    includeHolding: boolean;
    includeShortage: boolean;
    includePenalty: boolean;
  };
  costInputs: CostInputs;
  errors: string[];
  onInputChange: (key: string, value: string) => void;
  onDemandSettingChange: (key: keyof DemandSettings, value: string) => void;
  onCostInputChange: (key: keyof CostInputs, value: string) => void;
  onCalculate: () => void;
}

const getSimpleTooltip = (label: string, fallback: string): string => {
  const normalized = label.toLowerCase();

  if (normalized.includes("salvage value")) {
    return "Salvage value is the amount you recover for each unsold unit at the end of the period.";
  }

  if (normalized.includes("holding cost")) {
    return "Holding cost is the carrying cost for each unit that remains in inventory.";
  }

  if (normalized.includes("shortage cost")) {
    return "Shortage cost captures the business impact when demand is not fully satisfied.";
  }

  if (normalized.includes("penalty cost")) {
    return "Penalty cost is an extra charge per unmet unit, often tied to service commitments.";
  }

  if (normalized.includes("revenue share ratio")) {
    return "Revenue share ratio is the portion of sales revenue paid to the supplier.";
  }

  if (normalized.includes("strike price")) {
    return "Strike price is the unit price paid when an option is exercised.";
  }

  if (normalized.includes("reservation price")) {
    return "Reservation price is the upfront premium paid for each option unit reserved.";
  }

  return fallback;
};

function FieldLabel({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
      <span>{label}</span>
      <Tooltip content={getSimpleTooltip(label, tooltip)} />
    </label>
  );
}

function NumberInput({
  value,
  min,
  max,
  step,
  onChange
}: {
  value: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="number"
      className="input-control"
      value={value}
      min={min}
      max={max}
      step={step ?? "any"}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export default function InputPanel({
  contract,
  optionEvaluationMode,
  inputs,
  demandSettings,
  toggles,
  costInputs,
  errors,
  onInputChange,
  onDemandSettingChange,
  onCostInputChange,
  onCalculate
}: InputPanelProps) {
  const isOptionOptimizationMode =
    contract.type === "optionContract" && optionEvaluationMode === "optimization";
  const displayedFields =
    isOptionOptimizationMode && contract.optionModes
      ? contract.optionModes.optimizationFields
      : contract.fields;

  return (
    <section className="panel-card p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2
            className="text-lg font-semibold text-slate-100 md:text-xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Dynamic Input Panel
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Adjust model assumptions, then run the decision analysis.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {displayedFields.map((field) => (
          <div key={field.key} className="space-y-2">
            <FieldLabel label={field.label} tooltip={field.tooltip} />

            {field.slider ? (
              <div className="space-y-2">
                <input
                  type="range"
                  value={inputs[field.key] ?? "0"}
                  min={field.min}
                  max={field.max}
                  step={field.step ?? 1}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-700 accent-sky-400"
                  onChange={(event) => onInputChange(field.key, event.target.value)}
                />
                <NumberInput
                  value={inputs[field.key] ?? ""}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  onChange={(value) => onInputChange(field.key, value)}
                />
              </div>
            ) : (
              <NumberInput
                value={inputs[field.key] ?? ""}
                min={field.min}
                max={field.max}
                step={field.step}
                onChange={(value) => onInputChange(field.key, value)}
              />
            )}
          </div>
        ))}
      </div>

      {!isOptionOptimizationMode ? (
        <>
          <div className="mt-6 space-y-4 rounded-xl border border-slate-700 bg-slate-900/45 p-4">
            <h3
              className="text-sm font-semibold uppercase tracking-wider text-slate-200"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Demand Inputs
            </h3>

            {demandSettings.demandType === "deterministic" ? (
              <div className="space-y-2">
                <FieldLabel
                  label="Demand"
                  tooltip="Single demand value used in deterministic analysis."
                />
                <NumberInput
                  value={demandSettings.demand}
                  min={0}
                  step={1}
                  onChange={(value) => onDemandSettingChange("demand", value)}
                />
              </div>
            ) : null}

            {demandSettings.demandType === "random" &&
            demandSettings.distributionType === "normal" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel label="Mean" tooltip="Expected demand mean for normal distribution." />
                  <NumberInput
                    value={demandSettings.mean}
                    min={0}
                    step={0.01}
                    onChange={(value) => onDemandSettingChange("mean", value)}
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel
                    label="Standard Deviation"
                    tooltip="Demand volatility; must be strictly positive."
                  />
                  <NumberInput
                    value={demandSettings.stdDev}
                    min={0.01}
                    step={0.01}
                    onChange={(value) => onDemandSettingChange("stdDev", value)}
                  />
                </div>
              </div>
            ) : null}

            {demandSettings.demandType === "random" &&
            demandSettings.distributionType === "uniform" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel
                    label="Lower Bound"
                    tooltip="Minimum demand for uniform distribution."
                  />
                  <NumberInput
                    value={demandSettings.lowerBound}
                    min={0}
                    step={0.01}
                    onChange={(value) => onDemandSettingChange("lowerBound", value)}
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel
                    label="Upper Bound"
                    tooltip="Maximum demand for uniform distribution."
                  />
                  <NumberInput
                    value={demandSettings.upperBound}
                    min={0}
                    step={0.01}
                    onChange={(value) => onDemandSettingChange("upperBound", value)}
                  />
                </div>
              </div>
            ) : null}

            {demandSettings.demandType === "random" &&
            demandSettings.distributionType === "discrete" ? (
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <FieldLabel
                    label="Demand Values"
                    tooltip="Comma-separated demand values, e.g. 80,100,120"
                  />
                  <input
                    type="text"
                    className="input-control"
                    placeholder="80, 100, 120"
                    value={demandSettings.discreteValues}
                    onChange={(event) =>
                      onDemandSettingChange("discreteValues", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel
                    label="Probabilities"
                    tooltip="Comma-separated probabilities with sum exactly 1."
                  />
                  <input
                    type="text"
                    className="input-control"
                    placeholder="0.25, 0.50, 0.25"
                    value={demandSettings.discreteProbabilities}
                    onChange={(event) =>
                      onDemandSettingChange("discreteProbabilities", event.target.value)
                    }
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-6 space-y-4 rounded-xl border border-slate-700 bg-slate-900/45 p-4">
            <h3
              className="text-sm font-semibold uppercase tracking-wider text-slate-200"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Advanced Cost Inputs
            </h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {toggles.includeSalvage ? (
                <div className="space-y-2">
                  <FieldLabel
                    label="Salvage Value"
                    tooltip="Residual value recovered per leftover unit."
                  />
                  <NumberInput
                    value={costInputs.salvageValue}
                    min={0}
                    step={0.01}
                    onChange={(value) => onCostInputChange("salvageValue", value)}
                  />
                </div>
              ) : null}

              {toggles.includeHolding ? (
                <div className="space-y-2">
                  <FieldLabel
                    label="Holding Cost"
                    tooltip="Carrying cost applied to leftover units."
                  />
                  <NumberInput
                    value={costInputs.holdingCost}
                    min={0}
                    step={0.01}
                    onChange={(value) => onCostInputChange("holdingCost", value)}
                  />
                </div>
              ) : null}

              {toggles.includeShortage ? (
                <div className="space-y-2">
                  <FieldLabel
                    label="Shortage Cost"
                    tooltip="Cost assigned to unmet demand units."
                  />
                  <NumberInput
                    value={costInputs.shortageCost}
                    min={0}
                    step={0.01}
                    onChange={(value) => onCostInputChange("shortageCost", value)}
                  />
                </div>
              ) : null}

              {toggles.includePenalty ? (
                <div className="space-y-2">
                  <FieldLabel
                    label="Penalty Cost"
                    tooltip="Penalty per unmet unit, typically service-level related."
                  />
                  <NumberInput
                    value={costInputs.penaltyCost}
                    min={0}
                    step={0.01}
                    onChange={(value) => onCostInputChange("penaltyCost", value)}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {errors.length > 0 ? (
        <div className="mt-5 rounded-xl border border-red-400/35 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-red-300">Please fix the following:</p>
          <ul className="mt-2 space-y-1 text-sm text-red-200">
            {errors.map((error, index) => (
              <li key={`${error}-${index}`}>- {error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onCalculate}
          className="rounded-xl bg-gradient-to-r from-teal-500 to-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-teal-900/35 transition hover:brightness-110"
        >
          Run Analysis
        </button>
      </div>
    </section>
  );
}
