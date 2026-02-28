"use client";

import { CONTRACT_OPTIONS } from "@/components/contracts";
import {
  AdvancedCostToggles,
  ContractType,
  DemandSettings,
  DemandType,
  DistributionType,
  OptionEvaluationMode
} from "@/types/contracts";

interface SidebarProps {
  contractType: ContractType;
  optionEvaluationMode: OptionEvaluationMode;
  demandSettings: DemandSettings;
  toggles: AdvancedCostToggles;
  onContractTypeChange: (value: ContractType) => void;
  onOptionEvaluationModeChange: (value: OptionEvaluationMode) => void;
  onDemandTypeChange: (value: DemandType) => void;
  onDistributionTypeChange: (value: DistributionType) => void;
  onToggleChange: (key: keyof AdvancedCostToggles, checked: boolean) => void;
}

const distributionOptions: Array<{ value: DistributionType; label: string }> = [
  { value: "normal", label: "Normal" },
  { value: "uniform", label: "Uniform" },
  { value: "discrete", label: "Discrete" }
];

const toggleLabels: Array<{ key: keyof AdvancedCostToggles; label: string }> = [
  { key: "includeSalvage", label: "Include Salvage Value" },
  { key: "includeHolding", label: "Include Holding Cost" },
  { key: "includeShortage", label: "Include Shortage Cost" },
  { key: "includePenalty", label: "Include Penalty Cost" }
];

export default function Sidebar({
  contractType,
  optionEvaluationMode,
  demandSettings,
  toggles,
  onContractTypeChange,
  onOptionEvaluationModeChange,
  onDemandTypeChange,
  onDistributionTypeChange,
  onToggleChange
}: SidebarProps) {
  const hideDemandControls =
    contractType === "optionContract" && optionEvaluationMode === "optimization";

  return (
    <aside className="z-30 w-full border-b border-slate-700/60 bg-slate-950/95 px-5 py-6 backdrop-blur-md md:fixed md:inset-y-0 md:left-0 md:w-[250px] md:border-b-0 md:border-r">
      <div className="space-y-6 md:h-full md:overflow-y-auto">
        <div>
          <h2
            className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-300"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Controls
          </h2>
          <p className="mt-2 text-xs text-slate-400">
            Configure contract mechanics and uncertainty assumptions.
          </p>
        </div>

        <section className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-300">
            Contract Type
          </label>
          <select
            value={contractType}
            className="input-control"
            onChange={(event) => onContractTypeChange(event.target.value as ContractType)}
          >
            {CONTRACT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </section>

        {contractType === "optionContract" ? (
          <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/45 p-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Option Mode
            </span>
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm text-slate-200">
                <input
                  type="radio"
                  name="optionMode"
                  checked={optionEvaluationMode === "standard"}
                  onChange={() => onOptionEvaluationModeChange("standard")}
                  className="mt-0.5 h-4 w-4 accent-teal-400"
                />
                <span>Standard Evaluation Mode</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-200">
                <input
                  type="radio"
                  name="optionMode"
                  checked={optionEvaluationMode === "optimization"}
                  onChange={() => onOptionEvaluationModeChange("optimization")}
                  className="mt-0.5 h-4 w-4 accent-teal-400"
                />
                <span>Optimal Option Quantity Mode (Newsvendor Optimization)</span>
              </label>
            </div>
          </section>
        ) : null}

        {!hideDemandControls ? (
          <section className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Demand Type
            </span>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="radio"
                  name="demandType"
                  checked={demandSettings.demandType === "deterministic"}
                  onChange={() => onDemandTypeChange("deterministic")}
                  className="h-4 w-4 accent-teal-400"
                />
                Deterministic
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="radio"
                  name="demandType"
                  checked={demandSettings.demandType === "random"}
                  onChange={() => onDemandTypeChange("random")}
                  className="h-4 w-4 accent-teal-400"
                />
                Random
              </label>
            </div>

            {demandSettings.demandType === "random" ? (
              <div className="space-y-2 pt-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                  Distribution
                </label>
                <select
                  value={demandSettings.distributionType}
                  className="input-control"
                  onChange={(event) =>
                    onDistributionTypeChange(event.target.value as DistributionType)
                  }
                >
                  {distributionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="space-y-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
            Advanced Cost Toggles
          </span>
          <div className="space-y-2">
            {toggleLabels.map((toggle) => (
              <label key={toggle.key} className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={toggles[toggle.key]}
                  onChange={(event) => onToggleChange(toggle.key, event.target.checked)}
                  className="h-4 w-4 rounded accent-sky-400"
                />
                {toggle.label}
              </label>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
