"use client";

import { useMemo, useRef, useState } from "react";
import ContractDescription from "@/components/ContractDescription";
import GraphPanel from "@/components/GraphPanel";
import InputPanel from "@/components/InputPanel";
import ResultsPanel from "@/components/ResultsPanel";
import Sidebar from "@/components/Sidebar";
import { CONTRACT_DEFINITIONS } from "@/components/contracts";
import { calculateContract } from "@/lib/calculations";
import {
  AdvancedCostToggles,
  CalculationResult,
  ContractType,
  CostInputs,
  DemandSettings,
  DemandType,
  DistributionType,
  OptionEvaluationMode
} from "@/types/contracts";

const INITIAL_DEMAND_SETTINGS: DemandSettings = {
  demandType: "deterministic",
  distributionType: "normal",
  demand: "190",
  mean: "190",
  stdDev: "30",
  lowerBound: "140",
  upperBound: "240",
  discreteValues: "150, 190, 230",
  discreteProbabilities: "0.25, 0.5, 0.25"
};

const INITIAL_TOGGLES: AdvancedCostToggles = {
  includeSalvage: false,
  includeHolding: false,
  includeShortage: false,
  includePenalty: false
};

const INITIAL_COST_INPUTS: CostInputs = {
  salvageValue: "10",
  holdingCost: "4",
  shortageCost: "7",
  penaltyCost: "6"
};

export default function HomePage() {
  const [contractType, setContractType] = useState<ContractType>("wholesale");
  const [optionEvaluationMode, setOptionEvaluationMode] =
    useState<OptionEvaluationMode>("standard");
  const [inputs, setInputs] = useState<Record<string, string>>(
    CONTRACT_DEFINITIONS.wholesale.defaultInputs
  );
  const [demandSettings, setDemandSettings] =
    useState<DemandSettings>(INITIAL_DEMAND_SETTINGS);
  const [toggles, setToggles] = useState<AdvancedCostToggles>(INITIAL_TOGGLES);
  const [costInputs, setCostInputs] = useState<CostInputs>(INITIAL_COST_INPUTS);

  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [hasCalculated, setHasCalculated] = useState(false);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const activeContract = useMemo(
    () => CONTRACT_DEFINITIONS[contractType],
    [contractType]
  );

  const resetOutputs = () => {
    setErrors([]);
    setResult(null);
    setHasCalculated(false);
  };

  const handleContractTypeChange = (value: ContractType) => {
    setContractType(value);
    if (value === "optionContract") {
      setOptionEvaluationMode("standard");
    }
    setInputs({ ...CONTRACT_DEFINITIONS[value].defaultInputs });
    resetOutputs();
  };

  const handleOptionEvaluationModeChange = (value: OptionEvaluationMode) => {
    setOptionEvaluationMode(value);

    if (contractType === "optionContract") {
      const optionDefinition = CONTRACT_DEFINITIONS.optionContract;
      const optimizationDefaults = optionDefinition.optionModes?.defaultOptimizationInputs;

      if (value === "optimization" && optimizationDefaults) {
        setInputs((previous) => ({
          ...optimizationDefaults,
          ...previous
        }));
      } else {
        setInputs((previous) => ({
          ...optionDefinition.defaultInputs,
          ...previous
        }));
      }
    }

    resetOutputs();
  };

  const handleDemandTypeChange = (value: DemandType) => {
    setDemandSettings((previous) => ({ ...previous, demandType: value }));
    resetOutputs();
  };

  const handleDistributionTypeChange = (value: DistributionType) => {
    setDemandSettings((previous) => ({ ...previous, distributionType: value }));
    resetOutputs();
  };

  const handleToggleChange = (key: keyof AdvancedCostToggles, checked: boolean) => {
    setToggles((previous) => ({ ...previous, [key]: checked }));
    resetOutputs();
  };

  const handleInputChange = (key: string, value: string) => {
    setInputs((previous) => ({ ...previous, [key]: value }));
    resetOutputs();
  };

  const handleDemandSettingChange = (key: keyof DemandSettings, value: string) => {
    setDemandSettings((previous) => ({ ...previous, [key]: value }));
    resetOutputs();
  };

  const handleCostInputChange = (key: keyof CostInputs, value: string) => {
    setCostInputs((previous) => ({ ...previous, [key]: value }));
    resetOutputs();
  };

  const runAnalysis = () => {
    const response = calculateContract({
      contractType,
      optionEvaluationMode,
      inputs,
      demandSettings,
      toggles,
      costInputs
    });

    setHasCalculated(true);
    setErrors(response.errors);
    setResult(response.result);

    if (response.result) {
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }, 100);
    }
  };

  return (
    <div className="min-h-screen text-slate-100">
      <Sidebar
        contractType={contractType}
        optionEvaluationMode={optionEvaluationMode}
        demandSettings={demandSettings}
        toggles={toggles}
        onContractTypeChange={handleContractTypeChange}
        onOptionEvaluationModeChange={handleOptionEvaluationModeChange}
        onDemandTypeChange={handleDemandTypeChange}
        onDistributionTypeChange={handleDistributionTypeChange}
        onToggleChange={handleToggleChange}
      />

      <main className="px-4 pb-8 pt-6 md:ml-[250px] md:px-8">
        <header className="mb-6 rounded-2xl border border-slate-700/70 bg-slate-900/45 p-6 shadow-panel">
          <h1
            className="text-2xl font-semibold text-slate-100 md:text-3xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Supply Chain Contract Decision Lab
          </h1>
          <p className="mt-2 text-sm text-slate-300 md:text-base">
            Interactive Teaching Tool for Supply Chain Contracts &amp; Risk Analysis
          </p>
        </header>

        <div className="space-y-6">
          <ContractDescription contract={activeContract} />

          <InputPanel
            contract={activeContract}
            optionEvaluationMode={optionEvaluationMode}
            inputs={inputs}
            demandSettings={demandSettings}
            toggles={toggles}
            costInputs={costInputs}
            errors={errors}
            onInputChange={handleInputChange}
            onDemandSettingChange={handleDemandSettingChange}
            onCostInputChange={handleCostInputChange}
            onCalculate={runAnalysis}
          />

          {hasCalculated && result ? (
            <div ref={resultsRef} className="space-y-6">
              <ResultsPanel result={result} />
              <GraphPanel charts={result.charts} />
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
