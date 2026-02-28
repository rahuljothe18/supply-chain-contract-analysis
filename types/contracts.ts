export type ContractType =
  | "wholesale"
  | "buyback"
  | "revenueSharing"
  | "optionContract"
  | "quantityFlexibility";

export type OptionEvaluationMode = "standard" | "optimization";

export type DemandType = "deterministic" | "random";

export type DistributionType = "normal" | "uniform" | "discrete";

export interface AdvancedCostToggles {
  includeSalvage: boolean;
  includeHolding: boolean;
  includeShortage: boolean;
  includePenalty: boolean;
}

export interface CostInputs {
  salvageValue: string;
  holdingCost: string;
  shortageCost: string;
  penaltyCost: string;
}

export interface DemandSettings {
  demandType: DemandType;
  distributionType: DistributionType;
  demand: string;
  mean: string;
  stdDev: string;
  lowerBound: string;
  upperBound: string;
  discreteValues: string;
  discreteProbabilities: string;
}

export interface FieldConfig {
  key: string;
  label: string;
  tooltip: string;
  min?: number;
  max?: number;
  step?: number;
  slider?: boolean;
}

export interface ContractDefinition {
  type: ContractType;
  name: string;
  description: string;
  teachingNote: string;
  fields: FieldConfig[];
  defaultInputs: Record<string, string>;
  keyOutcomeLabel: string;
  optionModes?: {
    defaultMode: OptionEvaluationMode;
    standardLabel: string;
    optimizationLabel: string;
    optimizationFields: FieldConfig[];
    defaultOptimizationInputs: Record<string, string>;
  };
}

export interface CalculationPayload {
  contractType: ContractType;
  optionEvaluationMode: OptionEvaluationMode;
  inputs: Record<string, string>;
  demandSettings: DemandSettings;
  toggles: AdvancedCostToggles;
  costInputs: CostInputs;
}

export interface ParsedDistribution {
  type: DistributionType;
  mean?: number;
  stdDev?: number;
  lowerBound?: number;
  upperBound?: number;
  values?: number[];
  probabilities?: number[];
}

export interface ParsedDemandDeterministic {
  demandType: "deterministic";
  demand: number;
}

export interface ParsedDemandRandom {
  demandType: "random";
  distribution: ParsedDistribution;
  expectedDemand: number;
}

export type ParsedDemandContext = ParsedDemandDeterministic | ParsedDemandRandom;

export interface ParsedCalculationPayload {
  contractType: ContractType;
  optionEvaluationMode: OptionEvaluationMode;
  inputs: Record<string, number>;
  demandContext: ParsedDemandContext;
  toggles: AdvancedCostToggles;
  costs: {
    salvageValue: number;
    holdingCost: number;
    shortageCost: number;
    penaltyCost: number;
  };
}

export interface MetricCard {
  label: string;
  value: number | string;
  emphasize?: boolean;
  tone?: "neutral" | "positive" | "negative" | "info";
}

export interface ChartLineConfig {
  dataKey: string;
  name: string;
  color: string;
}

export interface ChartBarConfig {
  dataKey: string;
  name: string;
  color: string;
}

export interface ChartConfig {
  title: string;
  subtitle?: string;
  chartType?: "line" | "bar";
  xKey: string;
  xLabel: string;
  yLabel: string;
  data: Array<Record<string, number | string>>;
  lines?: ChartLineConfig[];
  bars?: ChartBarConfig[];
  referenceX?: {
    value: number;
    label?: string;
    color?: string;
  };
}

export interface CalculationResult {
  keyDecision: string;
  metrics: MetricCard[];
  metricsSectionTitle?: string;
  charts: ChartConfig[];
  warnings?: string[];
  notes?: string[];
}

export interface CalculationResponse {
  result: CalculationResult | null;
  errors: string[];
}
