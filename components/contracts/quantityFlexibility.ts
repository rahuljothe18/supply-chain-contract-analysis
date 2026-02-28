import { ContractDefinition } from "@/types/contracts";

const quantityFlexibilityContract: ContractDefinition = {
  type: "quantityFlexibility",
  name: "Quantity Flexibility Contract",
  description:
    "Buyer commits to a baseline volume, then adjusts within an agreed percentage band as demand updates arrive.",
  teachingNote:
    "This module demonstrates how flexibility windows reduce mismatch cost while preserving supplier planning stability.",
  keyOutcomeLabel: "Total Cost",
  fields: [
    {
      key: "initialCommitment",
      label: "Initial Commitment",
      tooltip: "Baseline committed quantity before demand updates.",
      min: 0,
      step: 1
    },
    {
      key: "adjustmentRange",
      label: "Adjustment Range (%)",
      tooltip: "Allowed upward/downward adjustment from baseline commitment.",
      min: 0,
      max: 100,
      step: 1,
      slider: true
    },
    {
      key: "wholesalePrice",
      label: "Wholesale Price",
      tooltip: "Per-unit procurement cost.",
      min: 0,
      step: 0.01
    }
  ],
  defaultInputs: {
    initialCommitment: "200",
    adjustmentRange: "20",
    wholesalePrice: "68"
  }
};

export default quantityFlexibilityContract;
