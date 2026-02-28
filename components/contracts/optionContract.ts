import { ContractDefinition } from "@/types/contracts";

const optionContract: ContractDefinition = {
  type: "optionContract",
  name: "Option Contract",
  description:
    "Buyer pays a reservation premium for optional units, then exercises at strike price if market conditions justify it.",
  teachingNote:
    "Evaluate hedge value versus flexibility by comparing option strategy cost with pure spot purchasing.",
  keyOutcomeLabel: "Total Cost",
  fields: [
    {
      key: "optionQuantity",
      label: "Option Quantity",
      tooltip: "Reserved quantity covered by options.",
      min: 0,
      step: 1
    },
    {
      key: "strikePrice",
      label: "Strike Price",
      tooltip: "Unit price paid when an option is exercised.",
      min: 0,
      step: 0.01
    },
    {
      key: "reservationPrice",
      label: "Reservation Price",
      tooltip: "Premium paid per option unit purchased upfront.",
      min: 0,
      step: 0.01
    },
    {
      key: "spotPrice",
      label: "Spot Price",
      tooltip: "Unit market purchase price at fulfillment time.",
      min: 0,
      step: 0.01
    }
  ],
  defaultInputs: {
    optionQuantity: "160",
    strikePrice: "65",
    reservationPrice: "8",
    spotPrice: "90"
  },
  optionModes: {
    defaultMode: "standard",
    standardLabel: "Standard Evaluation Mode",
    optimizationLabel: "Optimal Option Quantity Mode (Newsvendor Optimization)",
    optimizationFields: [
      {
        key: "reservationPrice",
        label: "Reservation Price (Premium)",
        tooltip: "Option premium paid per reserved unit.",
        min: 0,
        step: 0.01
      },
      {
        key: "exercisePrice",
        label: "Exercise Price",
        tooltip: "Unit cost to exercise reserved option quantity.",
        min: 0,
        step: 0.01
      },
      {
        key: "spotPrice",
        label: "Spot Market Price",
        tooltip: "Unit market purchase price for uncovered demand.",
        min: 0,
        step: 0.01
      },
      {
        key: "longTermContractPrice",
        label: "Long-Term Contract Price",
        tooltip: "Unit price under long-term baseline contracting.",
        min: 0,
        step: 0.01
      },
      {
        key: "meanDemand",
        label: "Mean Demand",
        tooltip: "Expected demand (mu) for newsvendor optimization.",
        min: 0,
        step: 0.01
      },
      {
        key: "stdDevDemand",
        label: "Standard Deviation",
        tooltip: "Demand uncertainty (sigma), must be greater than 0.",
        min: 0.01,
        step: 0.01
      }
    ],
    defaultOptimizationInputs: {
      reservationPrice: "8",
      exercisePrice: "65",
      spotPrice: "90",
      longTermContractPrice: "76",
      meanDemand: "190",
      stdDevDemand: "30"
    }
  }
};

export default optionContract;
