import { ParsedDistribution } from "@/types/contracts";

const EPSILON = 1e-9;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const erf = (x: number): number => {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * absX);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t *
      Math.exp(-absX * absX));

  return sign * y;
};

export const normalPdf = (x: number, mean: number, stdDev: number): number => {
  const variance = stdDev * stdDev;
  const denominator = Math.sqrt(2 * Math.PI * variance);
  const exponent = -((x - mean) ** 2) / (2 * variance);
  return Math.exp(exponent) / denominator;
};

export const normalCdf = (x: number, mean: number, stdDev: number): number => {
  return 0.5 * (1 + erf((x - mean) / (stdDev * Math.sqrt(2))));
};

// Peter J. Acklam's approximation for inverse standard normal CDF.
export const inverseStandardNormalCdf = (pInput: number): number => {
  const p = clamp(pInput, EPSILON, 1 - EPSILON);

  const a = [
    -3.969683028665376e1,
    2.209460984245205e2,
    -2.759285104469687e2,
    1.38357751867269e2,
    -3.066479806614716e1,
    2.506628277459239
  ];

  const b = [
    -5.447609879822406e1,
    1.615858368580409e2,
    -1.556989798598866e2,
    6.680131188771972e1,
    -1.328068155288572e1
  ];

  const c = [
    -7.784894002430293e-3,
    -3.223964580411365e-1,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783
  ];

  const d = [
    7.784695709041462e-3,
    3.224671290700398e-1,
    2.445134137142996,
    3.754408661907416
  ];

  const low = 0.02425;
  const high = 1 - low;

  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  if (p > high) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  const q = p - 0.5;
  const r = q * q;

  return (
    (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
};

export const inverseNormalCdf = (
  probability: number,
  mean = 0,
  stdDev = 1
): number => {
  return mean + stdDev * inverseStandardNormalCdf(probability);
};

export const parseNumberArray = (raw: string): number[] => {
  return raw
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => Number(token));
};

export const estimateExpectedSalesNormal = (
  orderQuantity: number,
  mean: number,
  stdDev: number,
  steps = 1400
): number => {
  if (orderQuantity <= 0) {
    return 0;
  }

  const upper = Math.max(mean + 6 * stdDev, orderQuantity + 4 * stdDev, 0);
  const lower = 0;
  const width = (upper - lower) / steps;
  let integral = 0;

  for (let i = 0; i < steps; i += 1) {
    const demand = lower + (i + 0.5) * width;
    integral += Math.min(orderQuantity, demand) * normalPdf(demand, mean, stdDev);
  }

  const upperTail = Math.max(0, 1 - normalCdf(upper, mean, stdDev));
  return integral * width + orderQuantity * upperTail;
};

const expectedDemandNormalClamped = (mean: number, stdDev: number): number => {
  const z = mean / stdDev;
  return mean * normalCdf(z, 0, 1) + stdDev * normalPdf(z, 0, 1);
};

const sortedDiscrete = (distribution: ParsedDistribution): Array<[number, number]> => {
  const values = distribution.values ?? [];
  const probabilities = distribution.probabilities ?? [];
  return values
    .map((value, index) => [value, probabilities[index] ?? 0] as [number, number])
    .sort((left, right) => left[0] - right[0]);
};

export const expectedDemand = (distribution: ParsedDistribution): number => {
  if (distribution.type === "normal") {
    return expectedDemandNormalClamped(distribution.mean ?? 0, distribution.stdDev ?? 1);
  }

  if (distribution.type === "uniform") {
    const lower = distribution.lowerBound ?? 0;
    const upper = distribution.upperBound ?? lower;
    return (lower + upper) / 2;
  }

  return sortedDiscrete(distribution).reduce(
    (sum, [value, probability]) => sum + value * probability,
    0
  );
};

export const expectedSales = (
  orderQuantity: number,
  distribution: ParsedDistribution
): number => {
  const q = Math.max(0, orderQuantity);

  if (distribution.type === "normal") {
    return estimateExpectedSalesNormal(
      q,
      distribution.mean ?? 0,
      distribution.stdDev ?? 1
    );
  }

  if (distribution.type === "uniform") {
    const lower = distribution.lowerBound ?? 0;
    const upper = distribution.upperBound ?? lower;

    if (upper - lower <= EPSILON) {
      return Math.min(q, lower);
    }

    if (q <= lower) {
      return q;
    }

    if (q >= upper) {
      return (lower + upper) / 2;
    }

    const first = (q * q - lower * lower) / 2;
    const second = q * (upper - q);
    return (first + second) / (upper - lower);
  }

  return sortedDiscrete(distribution).reduce(
    (sum, [value, probability]) => sum + Math.min(q, value) * probability,
    0
  );
};

export const serviceLevel = (
  orderQuantity: number,
  distribution: ParsedDistribution
): number => {
  const q = Math.max(0, orderQuantity);

  if (distribution.type === "normal") {
    return clamp(normalCdf(q, distribution.mean ?? 0, distribution.stdDev ?? 1), 0, 1);
  }

  if (distribution.type === "uniform") {
    const lower = distribution.lowerBound ?? 0;
    const upper = distribution.upperBound ?? lower;

    if (q <= lower) {
      return 0;
    }

    if (q >= upper) {
      return 1;
    }

    return clamp((q - lower) / (upper - lower), 0, 1);
  }

  return clamp(
    sortedDiscrete(distribution)
      .filter(([value]) => value <= q)
      .reduce((sum, [, probability]) => sum + probability, 0),
    0,
    1
  );
};

export const quantileForDistribution = (
  probabilityInput: number,
  distribution: ParsedDistribution
): number => {
  const probability = clamp(probabilityInput, 0, 1);

  if (distribution.type === "normal") {
    const mean = distribution.mean ?? 0;
    const stdDev = distribution.stdDev ?? 1;

    if (probability <= normalCdf(0, mean, stdDev)) {
      return 0;
    }

    return Math.max(0, mean + stdDev * inverseStandardNormalCdf(probability));
  }

  if (distribution.type === "uniform") {
    const lower = distribution.lowerBound ?? 0;
    const upper = distribution.upperBound ?? lower;
    return lower + probability * (upper - lower);
  }

  const points = sortedDiscrete(distribution);
  let cumulative = 0;

  for (const [value, weight] of points) {
    cumulative += weight;
    if (cumulative + EPSILON >= probability) {
      return value;
    }
  }

  return points.length > 0 ? points[points.length - 1][0] : 0;
};
