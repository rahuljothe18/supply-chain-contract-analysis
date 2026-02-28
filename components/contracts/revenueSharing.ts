import { ContractDefinition } from "@/types/contracts";

const revenueSharingContract: ContractDefinition = {
  type: "revenueSharing",
  name: "Revenue Sharing Contract",
  description:
    "Retailer pays a wholesale price and shares a fraction of sales revenue with the supplier. Profit split shifts with alpha.",
  teachingNote:
    "Use this contract to discuss incentive alignment and risk transfer by tuning the revenue share ratio.",
  keyOutcomeLabel: "Total Supply Chain Profit",
  fields: [
    {
      key: "retailPrice",
      label: "Retail Price (p)",
      tooltip: "Unit selling price charged in the market.",
      min: 0,
      step: 0.01
    },
    {
      key: "wholesalePrice",
      label: "Wholesale Price (w)",
      tooltip: "Per-unit transfer payment to supplier.",
      min: 0,
      step: 0.01
    },
    {
      key: "revenueShareRatio",
      label: "Revenue Share Ratio (alpha)",
      tooltip: "Portion of sales revenue sent to supplier (0 to 1).",
      min: 0,
      max: 1,
      step: 0.01,
      slider: true
    },
    {
      key: "orderQuantity",
      label: "Order Quantity (Q)",
      tooltip: "Retailer committed order quantity.",
      min: 0,
      step: 1
    }
  ],
  defaultInputs: {
    retailPrice: "120",
    wholesalePrice: "60",
    revenueShareRatio: "0.25",
    orderQuantity: "220"
  }
};

export default revenueSharingContract;
