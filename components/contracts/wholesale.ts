import { ContractDefinition } from "@/types/contracts";

const wholesaleContract: ContractDefinition = {
  type: "wholesale",
  name: "Wholesale Price Contract",
  description:
    "Retailer commits to an order quantity at a fixed wholesale price. The core decision is balancing stockout risk versus overstock exposure.",
  teachingNote:
    "Use this module to teach newsvendor logic, critical fractiles, and expected-value decisions under uncertain demand.",
  keyOutcomeLabel: "Expected Profit",
  fields: [
    {
      key: "retailPrice",
      label: "Retail Price (p)",
      tooltip: "Unit selling price charged to the market.",
      min: 0,
      step: 0.01
    },
    {
      key: "wholesalePrice",
      label: "Wholesale Price (w)",
      tooltip: "Unit purchase price paid by the retailer.",
      min: 0,
      step: 0.01
    },
    {
      key: "orderQuantity",
      label: "Order Quantity (Q)",
      tooltip: "Initial committed inventory quantity.",
      min: 0,
      step: 1
    }
  ],
  defaultInputs: {
    retailPrice: "120",
    wholesalePrice: "70",
    orderQuantity: "200"
  }
};

export default wholesaleContract;
