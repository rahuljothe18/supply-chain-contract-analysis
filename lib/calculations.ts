import {
  CalculationPayload,
  CalculationResponse,
  CalculationResult,
  ChartConfig,
  ContractType,
  MetricCard,
  ParsedCalculationPayload,
  ParsedDemandContext
} from "@/types/contracts";
import {
  clamp,
  expectedSales,
  inverseNormalCdf,
  quantileForDistribution,
  serviceLevel
} from "@/lib/demand";
import { validateAndParsePayload } from "@/lib/validation";

interface OrderStats {
  sales: number;
  leftover: number;
  unmet: number;
  serviceLevel: number;
  demandReference: number;
}

const LINE_COLORS = {
  teal: "#14b8a6",
  blue: "#38bdf8",
  cyan: "#22d3ee",
  slate: "#94a3b8",
  amber: "#f59e0b",
  red: "#f87171"
} as const;

const toFixedNumber = (value: number): number => {
  return Math.round(value * 100) / 100;
};

const createRange = (start: number, end: number, points: number): number[] => {
  if (points <= 1 || start === end) {
    return [start];
  }

  const step = (end - start) / (points - 1);
  return Array.from({ length: points }, (_, index) => start + index * step);
};

const deterministicOrderStats = (orderQuantity: number, demand: number): OrderStats => {
  const q = Math.max(0, orderQuantity);
  const d = Math.max(0, demand);
  const sales = Math.min(q, d);
  const leftover = Math.max(q - d, 0);
  const unmet = Math.max(d - q, 0);
  const level = d > 0 ? sales / d : 1;

  return {
    sales,
    leftover,
    unmet,
    serviceLevel: clamp(level, 0, 1),
    demandReference: d
  };
};

const orderStats = (orderQuantity: number, context: ParsedDemandContext): OrderStats => {
  if (context.demandType === "deterministic") {
    return deterministicOrderStats(orderQuantity, context.demand);
  }

  const q = Math.max(0, orderQuantity);
  const sales = expectedSales(q, context.distribution);
  const expectedDemand = context.expectedDemand;

  return {
    sales,
    leftover: Math.max(q - sales, 0),
    unmet: Math.max(expectedDemand - sales, 0),
    serviceLevel: serviceLevel(q, context.distribution),
    demandReference: expectedDemand
  };
};

const applyMismatchProfitAdjustments = (
  baseProfit: number,
  leftover: number,
  unmet: number,
  parsed: ParsedCalculationPayload
): number => {
  let adjusted = baseProfit;

  adjusted -= parsed.costs.holdingCost * leftover;
  adjusted -= parsed.costs.shortageCost * unmet;
  adjusted -= parsed.costs.penaltyCost * unmet;

  return adjusted;
};

const applyMismatchCostAdjustments = (
  baseCost: number,
  overstock: number,
  understock: number,
  parsed: ParsedCalculationPayload
): number => {
  let adjusted = baseCost;

  adjusted += parsed.costs.holdingCost * overstock;
  adjusted += parsed.costs.shortageCost * understock;
  adjusted += parsed.costs.penaltyCost * understock;
  adjusted -= parsed.costs.salvageValue * overstock;

  return adjusted;
};

const demandRange = (anchor: number): number[] => {
  const max = Math.max(anchor * 2, 40);
  return createRange(0, max, 32);
};

const quantityRange = (anchor: number): number[] => {
  const max = Math.max(anchor * 2, 40);
  return createRange(0, max, 32);
};

const roundChart = (value: number): number => Math.round(value * 100) / 100;

const evaluateWholesale = (parsed: ParsedCalculationPayload): CalculationResult => {
  const retailPrice = parsed.inputs.retailPrice;
  const wholesalePrice = parsed.inputs.wholesalePrice;
  const orderQuantity = parsed.inputs.orderQuantity;
  const salvage = parsed.toggles.includeSalvage ? parsed.costs.salvageValue : 0;

  const stats = orderStats(orderQuantity, parsed.demandContext);
  const baseProfit =
    retailPrice * stats.sales + salvage * stats.leftover - wholesalePrice * orderQuantity;
  const profit = applyMismatchProfitAdjustments(
    baseProfit,
    stats.leftover,
    stats.unmet,
    parsed
  );

  const denominator = retailPrice - salvage;
  const rawFractile = denominator > 0 ? (retailPrice - wholesalePrice) / denominator : 0;
  const criticalFractile = clamp(rawFractile, 0, 1);

  const optimalQ =
    parsed.demandContext.demandType === "random"
      ? quantileForDistribution(criticalFractile, parsed.demandContext.distribution)
      : parsed.demandContext.demand;

  const gap = orderQuantity - optimalQ;
  const keyDecision =
    Math.abs(gap) <= 1
      ? "Current order quantity is near the model-optimal level."
      : gap < 0
        ? `Increase order quantity toward ${toFixedNumber(optimalQ)} units to improve service performance.`
        : `Reduce order quantity toward ${toFixedNumber(optimalQ)} units to limit overstock risk.`;

  const qSeries = quantityRange(Math.max(orderQuantity, optimalQ, stats.demandReference));
  const profitVsOrder = qSeries.map((quantity) => {
    const pointStats = orderStats(quantity, parsed.demandContext);
    const pointProfit = applyMismatchProfitAdjustments(
      retailPrice * pointStats.sales + salvage * pointStats.leftover - wholesalePrice * quantity,
      pointStats.leftover,
      pointStats.unmet,
      parsed
    );

    return {
      quantity: roundChart(quantity),
      profit: roundChart(pointProfit)
    };
  });

  const dSeries = demandRange(Math.max(stats.demandReference, orderQuantity));
  const profitVsDemand = dSeries.map((demand) => {
    const pointStats = deterministicOrderStats(orderQuantity, demand);
    const pointProfit = applyMismatchProfitAdjustments(
      retailPrice * pointStats.sales + salvage * pointStats.leftover - wholesalePrice * orderQuantity,
      pointStats.leftover,
      pointStats.unmet,
      parsed
    );

    return {
      demand: roundChart(demand),
      profit: roundChart(pointProfit)
    };
  });

  const charts: ChartConfig[] = [
    {
      title: "Profit vs Order Quantity",
      subtitle: "Order quantity sensitivity",
      xKey: "quantity",
      xLabel: "Order Quantity",
      yLabel: "Profit",
      data: profitVsOrder,
      lines: [{ dataKey: "profit", name: "Profit", color: LINE_COLORS.teal }]
    },
    {
      title: "Profit vs Demand",
      subtitle: "Demand sensitivity at current order quantity",
      xKey: "demand",
      xLabel: "Demand",
      yLabel: "Profit",
      data: profitVsDemand,
      lines: [{ dataKey: "profit", name: "Profit", color: LINE_COLORS.blue }]
    }
  ];

  const metrics: MetricCard[] = [
    {
      label: parsed.demandContext.demandType === "random" ? "Expected Profit" : "Profit",
      value: toFixedNumber(profit),
      emphasize: true,
      tone: profit >= 0 ? "positive" : "negative"
    },
    {
      label: "Service Level",
      value: toFixedNumber(stats.serviceLevel * 100),
      tone: "info"
    },
    {
      label: "Leftover Inventory",
      value: toFixedNumber(stats.leftover)
    },
    {
      label: "Optimal Q",
      value: toFixedNumber(optimalQ),
      tone: "info"
    },
    {
      label: "Critical Fractile",
      value: toFixedNumber(criticalFractile)
    }
  ];

  const notes =
    parsed.demandContext.demandType === "random"
      ? [
          "Service level is the probability demand is fully satisfied.",
          "Optimal Q is computed from the critical fractile and selected demand distribution."
        ]
      : ["Service level is fulfilled demand divided by realized demand."];

  return {
    keyDecision,
    metrics,
    charts,
    notes
  };
};

const evaluateBuyback = (parsed: ParsedCalculationPayload): CalculationResult => {
  const retailPrice = parsed.inputs.retailPrice;
  const wholesalePrice = parsed.inputs.wholesalePrice;
  const buybackPrice = parsed.inputs.buybackPrice;
  const orderQuantity = parsed.inputs.orderQuantity;

  const stats = orderStats(orderQuantity, parsed.demandContext);
  let retailerProfit =
    retailPrice * stats.sales + buybackPrice * stats.leftover - wholesalePrice * orderQuantity;
  retailerProfit = applyMismatchProfitAdjustments(
    retailerProfit,
    stats.leftover,
    stats.unmet,
    parsed
  );

  const manufacturerProfit =
    wholesalePrice * orderQuantity - buybackPrice * stats.leftover;
  const totalProfit = retailerProfit + manufacturerProfit;

  const buybackRatio = wholesalePrice > 0 ? buybackPrice / wholesalePrice : 0;
  const coordinationIndicator =
    buybackRatio >= 0.3 && buybackRatio <= 0.8 && stats.serviceLevel >= 0.85
      ? "Strong"
      : buybackRatio >= 0.2 && stats.serviceLevel >= 0.7
        ? "Moderate"
        : "Weak";

  const keyDecision =
    coordinationIndicator === "Strong"
      ? "Current buyback terms create strong coordination incentives."
      : coordinationIndicator === "Moderate"
        ? "Contract partially aligns incentives; tune buyback price for tighter coordination."
        : "Coordination is weak; revise buyback terms or order quantity.";

  const qSeries = quantityRange(Math.max(orderQuantity, stats.demandReference));
  const profitVsOrder = qSeries.map((quantity) => {
    const pointStats = orderStats(quantity, parsed.demandContext);
    const pointRetailer = applyMismatchProfitAdjustments(
      retailPrice * pointStats.sales + buybackPrice * pointStats.leftover - wholesalePrice * quantity,
      pointStats.leftover,
      pointStats.unmet,
      parsed
    );
    const pointManufacturer =
      wholesalePrice * quantity - buybackPrice * pointStats.leftover;

    return {
      quantity: roundChart(quantity),
      retailer: roundChart(pointRetailer),
      manufacturer: roundChart(pointManufacturer),
      total: roundChart(pointRetailer + pointManufacturer)
    };
  });

  const dSeries = demandRange(Math.max(stats.demandReference, orderQuantity));
  const profitVsDemand = dSeries.map((demand) => {
    const pointStats = deterministicOrderStats(orderQuantity, demand);
    const pointRetailer = applyMismatchProfitAdjustments(
      retailPrice * pointStats.sales + buybackPrice * pointStats.leftover - wholesalePrice * orderQuantity,
      pointStats.leftover,
      pointStats.unmet,
      parsed
    );
    const pointManufacturer =
      wholesalePrice * orderQuantity - buybackPrice * pointStats.leftover;

    return {
      demand: roundChart(demand),
      retailer: roundChart(pointRetailer),
      manufacturer: roundChart(pointManufacturer),
      total: roundChart(pointRetailer + pointManufacturer)
    };
  });

  const charts: ChartConfig[] = [
    {
      title: "Profit vs Order Quantity",
      subtitle: "Role-level impact of order decision",
      xKey: "quantity",
      xLabel: "Order Quantity",
      yLabel: "Profit",
      data: profitVsOrder,
      lines: [
        { dataKey: "retailer", name: "Retailer", color: LINE_COLORS.teal },
        { dataKey: "manufacturer", name: "Manufacturer", color: LINE_COLORS.blue },
        { dataKey: "total", name: "Total", color: LINE_COLORS.cyan }
      ]
    },
    {
      title: "Profit vs Demand",
      subtitle: "Demand sensitivity at current order quantity",
      xKey: "demand",
      xLabel: "Demand",
      yLabel: "Profit",
      data: profitVsDemand,
      lines: [
        { dataKey: "retailer", name: "Retailer", color: LINE_COLORS.teal },
        { dataKey: "manufacturer", name: "Manufacturer", color: LINE_COLORS.blue },
        { dataKey: "total", name: "Total", color: LINE_COLORS.cyan }
      ]
    }
  ];

  return {
    keyDecision,
    metrics: [
      {
        label:
          parsed.demandContext.demandType === "random"
            ? "Expected Retailer Profit"
            : "Retailer Profit",
        value: toFixedNumber(retailerProfit),
        tone: retailerProfit >= 0 ? "positive" : "negative"
      },
      {
        label:
          parsed.demandContext.demandType === "random"
            ? "Expected Manufacturer Profit"
            : "Manufacturer Profit",
        value: toFixedNumber(manufacturerProfit),
        tone: manufacturerProfit >= 0 ? "positive" : "negative"
      },
      {
        label: "Total Profit",
        value: toFixedNumber(totalProfit),
        emphasize: true,
        tone: totalProfit >= 0 ? "positive" : "negative"
      },
      {
        label: "Coordination Indicator",
        value: coordinationIndicator,
        tone: coordinationIndicator === "Strong" ? "positive" : "info"
      }
    ],
    charts,
    notes: ["Coordination indicator reflects buyback ratio and achieved service level."]
  };
};

const evaluateRevenueSharing = (parsed: ParsedCalculationPayload): CalculationResult => {
  const retailPrice = parsed.inputs.retailPrice;
  const wholesalePrice = parsed.inputs.wholesalePrice;
  const alpha = parsed.inputs.revenueShareRatio;
  const orderQuantity = parsed.inputs.orderQuantity;

  const stats = orderStats(orderQuantity, parsed.demandContext);

  let retailerProfit =
    (1 - alpha) * retailPrice * stats.sales - wholesalePrice * orderQuantity;
  retailerProfit = applyMismatchProfitAdjustments(
    retailerProfit,
    stats.leftover,
    stats.unmet,
    parsed
  );

  const supplierProfit = alpha * retailPrice * stats.sales + wholesalePrice * orderQuantity;
  const totalProfit = retailerProfit + supplierProfit;

  const coordinationIndicator =
    alpha >= 0.2 && alpha <= 0.45 && stats.serviceLevel >= 0.85
      ? "Strong"
      : alpha >= 0.1 && alpha <= 0.6
        ? "Moderate"
        : "Weak";

  const keyDecision =
    coordinationIndicator === "Strong"
      ? "Current revenue share terms produce balanced incentive alignment."
      : coordinationIndicator === "Moderate"
        ? "Incentive alignment is moderate; tune alpha and quantity to improve coordination."
        : "Revenue split is poorly aligned for this demand profile.";

  const qSeries = quantityRange(Math.max(orderQuantity, stats.demandReference));
  const profitVsOrder = qSeries.map((quantity) => {
    const pointStats = orderStats(quantity, parsed.demandContext);
    const pointRetailer = applyMismatchProfitAdjustments(
      (1 - alpha) * retailPrice * pointStats.sales - wholesalePrice * quantity,
      pointStats.leftover,
      pointStats.unmet,
      parsed
    );
    const pointSupplier = alpha * retailPrice * pointStats.sales + wholesalePrice * quantity;

    return {
      quantity: roundChart(quantity),
      retailer: roundChart(pointRetailer),
      supplier: roundChart(pointSupplier),
      total: roundChart(pointRetailer + pointSupplier)
    };
  });

  const dSeries = demandRange(Math.max(stats.demandReference, orderQuantity));
  const profitVsDemand = dSeries.map((demand) => {
    const pointStats = deterministicOrderStats(orderQuantity, demand);
    const pointRetailer = applyMismatchProfitAdjustments(
      (1 - alpha) * retailPrice * pointStats.sales - wholesalePrice * orderQuantity,
      pointStats.leftover,
      pointStats.unmet,
      parsed
    );
    const pointSupplier = alpha * retailPrice * pointStats.sales + wholesalePrice * orderQuantity;

    return {
      demand: roundChart(demand),
      retailer: roundChart(pointRetailer),
      supplier: roundChart(pointSupplier),
      total: roundChart(pointRetailer + pointSupplier)
    };
  });

  const charts: ChartConfig[] = [
    {
      title: "Profit vs Order Quantity",
      subtitle: "Profit split under quantity changes",
      xKey: "quantity",
      xLabel: "Order Quantity",
      yLabel: "Profit",
      data: profitVsOrder,
      lines: [
        { dataKey: "retailer", name: "Retailer", color: LINE_COLORS.teal },
        { dataKey: "supplier", name: "Supplier", color: LINE_COLORS.blue },
        { dataKey: "total", name: "Total", color: LINE_COLORS.cyan }
      ]
    },
    {
      title: "Profit vs Demand",
      subtitle: "Demand sensitivity at current quantity",
      xKey: "demand",
      xLabel: "Demand",
      yLabel: "Profit",
      data: profitVsDemand,
      lines: [
        { dataKey: "retailer", name: "Retailer", color: LINE_COLORS.teal },
        { dataKey: "supplier", name: "Supplier", color: LINE_COLORS.blue },
        { dataKey: "total", name: "Total", color: LINE_COLORS.cyan }
      ]
    }
  ];

  return {
    keyDecision,
    metrics: [
      {
        label:
          parsed.demandContext.demandType === "random"
            ? "Expected Retailer Profit"
            : "Retailer Profit",
        value: toFixedNumber(retailerProfit),
        tone: retailerProfit >= 0 ? "positive" : "negative"
      },
      {
        label:
          parsed.demandContext.demandType === "random"
            ? "Expected Supplier Profit"
            : "Supplier Profit",
        value: toFixedNumber(supplierProfit),
        tone: supplierProfit >= 0 ? "positive" : "negative"
      },
      {
        label: "Total Supply Chain Profit",
        value: toFixedNumber(totalProfit),
        emphasize: true,
        tone: totalProfit >= 0 ? "positive" : "negative"
      },
      {
        label: "Coordination Indicator",
        value: coordinationIndicator,
        tone: coordinationIndicator === "Strong" ? "positive" : "info"
      }
    ],
    charts,
    notes: ["Revenue share ratio controls profit transfer between retailer and supplier."]
  };
};

const optionScenarioCost = (
  optionQuantity: number,
  strikePrice: number,
  reservationPrice: number,
  spotPrice: number,
  demand: number
): {
  shouldExercise: boolean;
  exercised: number;
  totalCost: number;
  spotOnlyCost: number;
} => {
  const shouldExercise = spotPrice > strikePrice;
  const exercised = shouldExercise ? Math.min(demand, optionQuantity) : 0;
  const premiumCost = optionQuantity * reservationPrice;
  const exerciseCost = exercised * strikePrice;
  const remaining = Math.max(demand - exercised, 0);
  const remainingCost = remaining * spotPrice;
  const totalCost = premiumCost + exerciseCost + remainingCost;

  return {
    shouldExercise,
    exercised,
    totalCost,
    spotOnlyCost: demand * spotPrice
  };
};

const expectedOptionStrategyCost = (
  optionQuantity: number,
  reservationPrice: number,
  exercisePrice: number,
  spotPrice: number,
  meanDemand: number,
  stdDevDemand: number
): {
  expectedExercised: number;
  expectedSpotPurchase: number;
  totalCost: number;
} => {
  const expectedExercised = expectedSales(optionQuantity, {
    type: "normal",
    mean: meanDemand,
    stdDev: stdDevDemand
  });
  const expectedSpotPurchase = Math.max(meanDemand - expectedExercised, 0);
  const premiumCost = optionQuantity * reservationPrice;
  const exerciseCost = expectedExercised * exercisePrice;
  const spotCost = expectedSpotPurchase * spotPrice;

  return {
    expectedExercised,
    expectedSpotPurchase,
    totalCost: premiumCost + exerciseCost + spotCost
  };
};

const evaluateOptionOptimization = (parsed: ParsedCalculationPayload): CalculationResult => {
  const reservationPrice = parsed.inputs.reservationPrice;
  const exercisePrice = parsed.inputs.exercisePrice;
  const spotPrice = parsed.inputs.spotPrice;
  const longTermContractPrice = parsed.inputs.longTermContractPrice;
  const meanDemand = parsed.inputs.meanDemand;
  const stdDevDemand = parsed.inputs.stdDevDemand;

  const costUnderstocking = spotPrice - exercisePrice;
  const costOverstocking = reservationPrice;
  const rawServiceLevel =
    costUnderstocking + costOverstocking > 0
      ? costUnderstocking / (costUnderstocking + costOverstocking)
      : 0;
  const optimalServiceLevel = clamp(rawServiceLevel, 0, 1);
  const zScore = inverseNormalCdf(optimalServiceLevel);
  const optimalOptionQuantity = Math.max(0, meanDemand + zScore * stdDevDemand);

  const expectedOption = expectedOptionStrategyCost(
    optimalOptionQuantity,
    reservationPrice,
    exercisePrice,
    spotPrice,
    meanDemand,
    stdDevDemand
  );

  const optionStrategyCost = expectedOption.totalCost;
  const longTermContractCost = meanDemand * longTermContractPrice;
  const costDifference = longTermContractCost - optionStrategyCost;
  const recommendedStrategy =
    optionStrategyCost < longTermContractCost
      ? "Use Option Contract"
      : "Use Long-Term Contract";

  const qSeries = quantityRange(Math.max(optimalOptionQuantity, meanDemand));
  const costVsOptionQuantity = qSeries.map((quantity) => {
    const point = expectedOptionStrategyCost(
      quantity,
      reservationPrice,
      exercisePrice,
      spotPrice,
      meanDemand,
      stdDevDemand
    );

    return {
      optionQuantity: roundChart(quantity),
      expectedCost: roundChart(point.totalCost)
    };
  });

  const comparisonBars = [
    {
      category: "Expected Cost",
      optionStrategy: roundChart(optionStrategyCost),
      longTermContract: roundChart(longTermContractCost)
    }
  ];

  const warnings =
    costUnderstocking <= 0
      ? ["Option contract has no understock advantage."]
      : undefined;

  const keyDecision =
    recommendedStrategy === "Use Option Contract"
      ? "Optimization favors options as the lower expected-cost strategy."
      : "Optimization favors long-term contracting under current parameters.";

  return {
    keyDecision,
    metricsSectionTitle: "Optimization Results",
    metrics: [
      {
        label: "Cost of Understocking (Cu)",
        value: toFixedNumber(costUnderstocking),
        tone: costUnderstocking > 0 ? "info" : "negative"
      },
      {
        label: "Cost of Overstocking (Co)",
        value: toFixedNumber(costOverstocking),
        tone: "info"
      },
      {
        label: "Optimal Service Level",
        value: toFixedNumber(optimalServiceLevel * 100),
        tone: "info"
      },
      {
        label: "Z-score",
        value: toFixedNumber(zScore),
        tone: "info"
      },
      {
        label: "Optimal Option Quantity (Q*)",
        value: toFixedNumber(optimalOptionQuantity),
        emphasize: true,
        tone: "positive"
      },
      {
        label: "Expected Cost (Option Strategy)",
        value: toFixedNumber(optionStrategyCost),
        tone: "negative"
      },
      {
        label: "Expected Cost (Long-Term Contract)",
        value: toFixedNumber(longTermContractCost),
        tone: "negative"
      },
      {
        label: "Cost Difference (Long-Term - Option)",
        value: toFixedNumber(costDifference),
        tone: costDifference >= 0 ? "positive" : "negative"
      },
      {
        label: "Recommended Strategy",
        value: recommendedStrategy,
        emphasize: true,
        tone: recommendedStrategy === "Use Option Contract" ? "positive" : "info"
      }
    ],
    charts: [
      {
        title: "Expected Cost vs Option Quantity",
        subtitle: "Newsvendor optimization cost curve",
        chartType: "line",
        xKey: "optionQuantity",
        xLabel: "Option Quantity",
        yLabel: "Expected Cost",
        data: costVsOptionQuantity,
        lines: [{ dataKey: "expectedCost", name: "Expected Cost", color: LINE_COLORS.teal }],
        referenceX: {
          value: roundChart(optimalOptionQuantity),
          label: "Optimal Q*",
          color: LINE_COLORS.amber
        }
      },
      {
        title: "Cost Comparison Bar Chart",
        subtitle: "Option strategy versus long-term contracting",
        chartType: "bar",
        xKey: "category",
        xLabel: "Comparison",
        yLabel: "Expected Cost",
        data: comparisonBars,
        bars: [
          {
            dataKey: "optionStrategy",
            name: "Option Strategy Cost",
            color: LINE_COLORS.teal
          },
          {
            dataKey: "longTermContract",
            name: "Long-Term Contract Cost",
            color: LINE_COLORS.blue
          }
        ]
      }
    ],
    warnings,
    notes: [
      "Optimization assumes normally distributed demand and computes expected exercised units with E[min(Q*, D)]."
    ]
  };
};

const evaluateOptionContract = (parsed: ParsedCalculationPayload): CalculationResult => {
  if (parsed.optionEvaluationMode === "optimization") {
    return evaluateOptionOptimization(parsed);
  }

  const optionQuantity = parsed.inputs.optionQuantity;
  const strikePrice = parsed.inputs.strikePrice;
  const reservationPrice = parsed.inputs.reservationPrice;
  const spotPrice = parsed.inputs.spotPrice;

  const demandReference =
    parsed.demandContext.demandType === "deterministic"
      ? parsed.demandContext.demand
      : parsed.demandContext.expectedDemand;

  let shouldExercise = false;
  let exercised = 0;
  let totalCost = 0;
  let spotOnlyCost = 0;

  if (parsed.demandContext.demandType === "deterministic") {
    const scenario = optionScenarioCost(
      optionQuantity,
      strikePrice,
      reservationPrice,
      spotPrice,
      parsed.demandContext.demand
    );

    shouldExercise = scenario.shouldExercise;
    exercised = scenario.exercised;
    totalCost = scenario.totalCost;
    spotOnlyCost = scenario.spotOnlyCost;
  } else {
    shouldExercise = spotPrice > strikePrice;

    const expectedExercised = shouldExercise
      ? expectedSales(optionQuantity, parsed.demandContext.distribution)
      : 0;

    const premiumCost = optionQuantity * reservationPrice;
    const exerciseCost = expectedExercised * strikePrice;
    const remaining = Math.max(demandReference - expectedExercised, 0);

    exercised = expectedExercised;
    totalCost = premiumCost + exerciseCost + remaining * spotPrice;
    spotOnlyCost = demandReference * spotPrice;
  }

  const costSavings = spotOnlyCost - totalCost;
  const breakEvenSpotPrice = strikePrice + reservationPrice;

  const keyDecision = shouldExercise
    ? costSavings >= 0
      ? "Exercise options under current spot market conditions."
      : "Model indicates exercise by rule (Spot > Strike), but premium burden reduces savings."
    : "Do not exercise options; buying from spot market is cheaper than strike execution.";

  const spotStart = Math.max(0, Math.min(spotPrice * 0.4, strikePrice * 0.4));
  const spotEnd = Math.max(spotPrice * 1.8, strikePrice * 2, 20);
  const spotSeries = createRange(spotStart, spotEnd, 32);
  const costVsSpot = spotSeries.map((spot) => {
    if (parsed.demandContext.demandType === "deterministic") {
      const scenario = optionScenarioCost(
        optionQuantity,
        strikePrice,
        reservationPrice,
        spot,
        parsed.demandContext.demand
      );

      return {
        spotPrice: roundChart(spot),
        optionStrategy: roundChart(scenario.totalCost),
        spotOnly: roundChart(scenario.spotOnlyCost)
      };
    }

    const exerciseNow = spot > strikePrice;
    const expectedExercised = exerciseNow
      ? expectedSales(optionQuantity, parsed.demandContext.distribution)
      : 0;
    const premiumCost = optionQuantity * reservationPrice;
    const exerciseCost = expectedExercised * strikePrice;
    const remaining = Math.max(demandReference - expectedExercised, 0);

    return {
      spotPrice: roundChart(spot),
      optionStrategy: roundChart(premiumCost + exerciseCost + remaining * spot),
      spotOnly: roundChart(demandReference * spot)
    };
  });

  const demandSeries = demandRange(Math.max(demandReference, optionQuantity));
  const costVsDemand = demandSeries.map((demand) => {
    const scenario = optionScenarioCost(
      optionQuantity,
      strikePrice,
      reservationPrice,
      spotPrice,
      demand
    );

    return {
      demand: roundChart(demand),
      optionStrategy: roundChart(scenario.totalCost),
      spotOnly: roundChart(scenario.spotOnlyCost)
    };
  });

  const charts: ChartConfig[] = [
    {
      title: "Cost vs Spot Price",
      subtitle: "Option strategy versus pure spot purchasing",
      xKey: "spotPrice",
      xLabel: "Spot Price",
      yLabel: "Total Cost",
      data: costVsSpot,
      lines: [
        {
          dataKey: "optionStrategy",
          name: "Option Strategy Cost",
          color: LINE_COLORS.teal
        },
        {
          dataKey: "spotOnly",
          name: "Spot-Only Cost",
          color: LINE_COLORS.blue
        }
      ]
    },
    {
      title: "Cost vs Demand",
      subtitle: "Demand sensitivity at current spot price",
      xKey: "demand",
      xLabel: "Demand",
      yLabel: "Total Cost",
      data: costVsDemand,
      lines: [
        {
          dataKey: "optionStrategy",
          name: "Option Strategy Cost",
          color: LINE_COLORS.teal
        },
        {
          dataKey: "spotOnly",
          name: "Spot-Only Cost",
          color: LINE_COLORS.blue
        }
      ]
    }
  ];

  return {
    keyDecision,
    metrics: [
      {
        label: "Should Exercise?",
        value: shouldExercise ? "YES" : "NO",
        emphasize: true,
        tone: shouldExercise ? "positive" : "info"
      },
      {
        label:
          parsed.demandContext.demandType === "random"
            ? "Expected Quantity Exercised"
            : "Quantity Exercised",
        value: toFixedNumber(exercised)
      },
      {
        label: parsed.demandContext.demandType === "random" ? "Expected Total Cost" : "Total Cost",
        value: toFixedNumber(totalCost),
        tone: "negative"
      },
      {
        label: parsed.demandContext.demandType === "random" ? "Expected Spot-Only Cost" : "Spot-Only Cost",
        value: toFixedNumber(spotOnlyCost)
      },
      {
        label: "Cost Savings vs Spot",
        value: toFixedNumber(costSavings),
        tone: costSavings >= 0 ? "positive" : "negative"
      },
      {
        label: "Break-Even Spot Price",
        value: toFixedNumber(breakEvenSpotPrice),
        tone: "info"
      }
    ],
    charts,
    notes: ["Break-even spot price is strike plus reservation price."]
  };
};

const evaluateQuantityFlexibility = (parsed: ParsedCalculationPayload): CalculationResult => {
  const initialCommitment = parsed.inputs.initialCommitment;
  const adjustmentRange = parsed.inputs.adjustmentRange;
  const wholesalePrice = parsed.inputs.wholesalePrice;

  const demandReference =
    parsed.demandContext.demandType === "deterministic"
      ? parsed.demandContext.demand
      : parsed.demandContext.expectedDemand;

  const lowerBound = initialCommitment * (1 - adjustmentRange / 100);
  const upperBound = initialCommitment * (1 + adjustmentRange / 100);
  const finalOrder = clamp(demandReference, lowerBound, upperBound);

  const overstock = Math.max(finalOrder - demandReference, 0);
  const understock = Math.max(demandReference - finalOrder, 0);

  const totalCost = applyMismatchCostAdjustments(
    finalOrder * wholesalePrice,
    overstock,
    understock,
    parsed
  );

  const keyDecision =
    understock > overstock
      ? "Increase baseline commitment or flexibility range to reduce understock risk."
      : overstock > understock
        ? "Reduce baseline commitment to limit overstock carrying cost."
        : "Current commitment and flexibility band are well balanced.";

  const commitmentSeries = quantityRange(Math.max(initialCommitment, demandReference));
  const costVsCommitment = commitmentSeries.map((commitment) => {
    const lb = commitment * (1 - adjustmentRange / 100);
    const ub = commitment * (1 + adjustmentRange / 100);
    const adjustedOrder = clamp(demandReference, lb, ub);
    const adjustedOverstock = Math.max(adjustedOrder - demandReference, 0);
    const adjustedUnderstock = Math.max(demandReference - adjustedOrder, 0);

    return {
      commitment: roundChart(commitment),
      totalCost: roundChart(
        applyMismatchCostAdjustments(
          adjustedOrder * wholesalePrice,
          adjustedOverstock,
          adjustedUnderstock,
          parsed
        )
      )
    };
  });

  const demandSeries = demandRange(Math.max(demandReference, initialCommitment));
  const costVsDemand = demandSeries.map((demand) => {
    const adjustedOrder = clamp(demand, lowerBound, upperBound);
    const adjustedOverstock = Math.max(adjustedOrder - demand, 0);
    const adjustedUnderstock = Math.max(demand - adjustedOrder, 0);

    return {
      demand: roundChart(demand),
      totalCost: roundChart(
        applyMismatchCostAdjustments(
          adjustedOrder * wholesalePrice,
          adjustedOverstock,
          adjustedUnderstock,
          parsed
        )
      )
    };
  });

  const charts: ChartConfig[] = [
    {
      title: "Cost vs Order Commitment",
      subtitle: "Cost sensitivity to initial commitment",
      xKey: "commitment",
      xLabel: "Initial Commitment",
      yLabel: "Total Cost",
      data: costVsCommitment,
      lines: [{ dataKey: "totalCost", name: "Total Cost", color: LINE_COLORS.teal }]
    },
    {
      title: "Cost vs Demand",
      subtitle: "Demand sensitivity under flexibility band",
      xKey: "demand",
      xLabel: "Demand",
      yLabel: "Total Cost",
      data: costVsDemand,
      lines: [{ dataKey: "totalCost", name: "Total Cost", color: LINE_COLORS.blue }]
    }
  ];

  return {
    keyDecision,
    metrics: [
      {
        label: "Final Order",
        value: toFixedNumber(finalOrder),
        emphasize: true,
        tone: "info"
      },
      {
        label: "Overstock",
        value: toFixedNumber(overstock),
        tone: overstock > 0 ? "negative" : "neutral"
      },
      {
        label: "Understock",
        value: toFixedNumber(understock),
        tone: understock > 0 ? "negative" : "neutral"
      },
      {
        label: parsed.demandContext.demandType === "random" ? "Expected Total Cost" : "Total Cost",
        value: toFixedNumber(totalCost),
        tone: "negative"
      }
    ],
    charts,
    notes: [
      "Final order is optimally adjusted toward demand while respecting the contract flexibility range."
    ]
  };
};

const evaluators: Record<
  ContractType,
  (parsed: ParsedCalculationPayload) => CalculationResult
> = {
  wholesale: evaluateWholesale,
  buyback: evaluateBuyback,
  revenueSharing: evaluateRevenueSharing,
  optionContract: evaluateOptionContract,
  quantityFlexibility: evaluateQuantityFlexibility
};

export const calculateContract = (payload: CalculationPayload): CalculationResponse => {
  const validation = validateAndParsePayload(payload);

  if (!validation.parsed || validation.errors.length > 0) {
    return {
      result: null,
      errors: validation.errors
    };
  }

  const evaluator = evaluators[validation.parsed.contractType];

  return {
    result: evaluator(validation.parsed),
    errors: []
  };
};
