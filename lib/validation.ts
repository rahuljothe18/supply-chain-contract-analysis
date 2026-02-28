import {
  CalculationPayload,
  ContractType,
  ParsedCalculationPayload,
  ParsedDemandContext,
  ParsedDistribution
} from "@/types/contracts";
import { expectedDemand, parseNumberArray } from "@/lib/demand";

const REQUIRED_FIELDS: Record<ContractType, string[]> = {
  wholesale: ["retailPrice", "wholesalePrice", "orderQuantity"],
  buyback: ["retailPrice", "wholesalePrice", "buybackPrice", "orderQuantity"],
  revenueSharing: [
    "retailPrice",
    "wholesalePrice",
    "revenueShareRatio",
    "orderQuantity"
  ],
  optionContract: ["optionQuantity", "strikePrice", "reservationPrice", "spotPrice"],
  quantityFlexibility: ["initialCommitment", "adjustmentRange", "wholesalePrice"]
};

const OPTION_OPTIMIZATION_FIELDS = [
  "reservationPrice",
  "exercisePrice",
  "spotPrice",
  "longTermContractPrice",
  "meanDemand",
  "stdDevDemand"
];

const LABELS: Record<string, string> = {
  retailPrice: "Retail price",
  wholesalePrice: "Wholesale price",
  orderQuantity: "Order quantity",
  buybackPrice: "Buyback price",
  revenueShareRatio: "Revenue share ratio",
  optionQuantity: "Option quantity",
  strikePrice: "Strike price",
  reservationPrice: "Reservation price",
  spotPrice: "Spot price",
  exercisePrice: "Exercise price",
  longTermContractPrice: "Long-term contract price",
  meanDemand: "Mean demand",
  stdDevDemand: "Standard deviation",
  initialCommitment: "Initial commitment",
  adjustmentRange: "Adjustment range",
  demand: "Demand",
  mean: "Mean demand",
  stdDev: "Standard deviation",
  lowerBound: "Lower bound",
  upperBound: "Upper bound",
  salvageValue: "Salvage value",
  holdingCost: "Holding cost",
  shortageCost: "Shortage cost",
  penaltyCost: "Penalty cost"
};

const requiredFieldsForPayload = (payload: CalculationPayload): string[] => {
  if (
    payload.contractType === "optionContract" &&
    payload.optionEvaluationMode === "optimization"
  ) {
    return OPTION_OPTIMIZATION_FIELDS;
  }

  return REQUIRED_FIELDS[payload.contractType];
};

const parseNumber = (
  raw: string,
  label: string,
  errors: string[],
  options?: { allowZero?: boolean; min?: number; max?: number }
): number => {
  const value = Number(raw);

  if (!Number.isFinite(value)) {
    errors.push(`${label} must be a valid number.`);
    return NaN;
  }

  if (options?.allowZero === false && value <= 0) {
    errors.push(`${label} must be greater than 0.`);
    return NaN;
  }

  if (options?.allowZero !== false && value < 0) {
    errors.push(`${label} cannot be negative.`);
    return NaN;
  }

  if (typeof options?.min === "number" && value < options.min) {
    errors.push(`${label} must be at least ${options.min}.`);
    return NaN;
  }

  if (typeof options?.max === "number" && value > options.max) {
    errors.push(`${label} must be at most ${options.max}.`);
    return NaN;
  }

  return value;
};

const validateDiscreteDistribution = (
  valuesRaw: string,
  probabilitiesRaw: string,
  errors: string[]
): ParsedDistribution | null => {
  const values = parseNumberArray(valuesRaw);
  const probabilities = parseNumberArray(probabilitiesRaw);

  if (values.length === 0 || probabilities.length === 0) {
    errors.push("Discrete demand values and probabilities cannot be empty.");
    return null;
  }

  if (values.length !== probabilities.length) {
    errors.push("Discrete demand values and probabilities must have the same length.");
    return null;
  }

  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    errors.push("Discrete demand values must be non-negative numbers.");
    return null;
  }

  if (probabilities.some((value) => !Number.isFinite(value) || value < 0)) {
    errors.push("Discrete probabilities must be non-negative numbers.");
    return null;
  }

  const sum = probabilities.reduce((total, value) => total + value, 0);

  if (Math.abs(sum - 1) > 1e-3) {
    errors.push("Discrete probabilities must sum to 1.");
    return null;
  }

  return {
    type: "discrete",
    values,
    probabilities
  };
};

const parseDemandContext = (
  payload: CalculationPayload,
  errors: string[]
): ParsedDemandContext | null => {
  const settings = payload.demandSettings;

  if (settings.demandType === "deterministic") {
    const demand = parseNumber(settings.demand, LABELS.demand, errors);

    if (!Number.isFinite(demand)) {
      return null;
    }

    return {
      demandType: "deterministic",
      demand
    };
  }

  let distribution: ParsedDistribution | null = null;

  if (settings.distributionType === "normal") {
    const mean = parseNumber(settings.mean, LABELS.mean, errors);
    const stdDev = parseNumber(settings.stdDev, LABELS.stdDev, errors, {
      allowZero: false
    });

    if (Number.isFinite(mean) && Number.isFinite(stdDev)) {
      distribution = {
        type: "normal",
        mean,
        stdDev
      };
    }
  }

  if (settings.distributionType === "uniform") {
    const lowerBound = parseNumber(settings.lowerBound, LABELS.lowerBound, errors);
    const upperBound = parseNumber(settings.upperBound, LABELS.upperBound, errors);

    if (Number.isFinite(lowerBound) && Number.isFinite(upperBound)) {
      if (upperBound <= lowerBound) {
        errors.push("Upper bound must be greater than lower bound for uniform demand.");
      } else {
        distribution = {
          type: "uniform",
          lowerBound,
          upperBound
        };
      }
    }
  }

  if (settings.distributionType === "discrete") {
    distribution = validateDiscreteDistribution(
      settings.discreteValues,
      settings.discreteProbabilities,
      errors
    );
  }

  if (!distribution) {
    return null;
  }

  return {
    demandType: "random",
    distribution,
    expectedDemand: expectedDemand(distribution)
  };
};

const parseCost = (
  raw: string,
  label: string,
  enabled: boolean,
  errors: string[]
): number => {
  if (!enabled) {
    return 0;
  }

  return parseNumber(raw, label, errors);
};

export const validateAndParsePayload = (
  payload: CalculationPayload
): { parsed: ParsedCalculationPayload | null; errors: string[] } => {
  const errors: string[] = [];
  const fields = requiredFieldsForPayload(payload);
  const parsedInputs: Record<string, number> = {};

  fields.forEach((field) => {
    const label = LABELS[field] ?? field;
    const requiresPositive =
      payload.contractType === "optionContract" &&
      payload.optionEvaluationMode === "optimization" &&
      field === "stdDevDemand";
    const parsedValue = parseNumber(
      payload.inputs[field],
      label,
      errors,
      requiresPositive ? { allowZero: false } : undefined
    );

    if (Number.isFinite(parsedValue)) {
      parsedInputs[field] = parsedValue;
    }
  });

  if (payload.contractType === "revenueSharing") {
    const alpha = parsedInputs.revenueShareRatio;
    if (Number.isFinite(alpha) && (alpha < 0 || alpha > 1)) {
      errors.push("Revenue share ratio must be between 0 and 1.");
    }
  }

  if (payload.contractType === "quantityFlexibility") {
    const adjustmentRange = parsedInputs.adjustmentRange;
    if (Number.isFinite(adjustmentRange) && (adjustmentRange < 0 || adjustmentRange > 100)) {
      errors.push("Adjustment range must be between 0 and 100.");
    }
  }

  if (payload.contractType === "buyback") {
    const buybackPrice = parsedInputs.buybackPrice;
    const wholesalePrice = parsedInputs.wholesalePrice;

    if (
      Number.isFinite(buybackPrice) &&
      Number.isFinite(wholesalePrice) &&
      buybackPrice > wholesalePrice
    ) {
      errors.push("Buyback price should not exceed wholesale price in a standard buyback contract.");
    }
  }

  const demandContext =
    payload.contractType === "optionContract" &&
    payload.optionEvaluationMode === "optimization"
      ? {
          demandType: "deterministic" as const,
          demand: parsedInputs.meanDemand ?? 0
        }
      : parseDemandContext(payload, errors);

  const costs = {
    salvageValue: parseCost(
      payload.costInputs.salvageValue,
      LABELS.salvageValue,
      payload.toggles.includeSalvage,
      errors
    ),
    holdingCost: parseCost(
      payload.costInputs.holdingCost,
      LABELS.holdingCost,
      payload.toggles.includeHolding,
      errors
    ),
    shortageCost: parseCost(
      payload.costInputs.shortageCost,
      LABELS.shortageCost,
      payload.toggles.includeShortage,
      errors
    ),
    penaltyCost: parseCost(
      payload.costInputs.penaltyCost,
      LABELS.penaltyCost,
      payload.toggles.includePenalty,
      errors
    )
  };

  if (errors.length > 0 || !demandContext) {
    return {
      parsed: null,
      errors
    };
  }

  return {
    parsed: {
      contractType: payload.contractType,
      optionEvaluationMode: payload.optionEvaluationMode,
      inputs: parsedInputs,
      demandContext,
      toggles: payload.toggles,
      costs
    },
    errors
  };
};
