import { ContractDefinition } from "@/types/contracts";

const buybackContract: ContractDefinition = {
  type: "buyback",
  name: "Buyback Contract",
  description:
    "Supplier agrees to repurchase unsold units from the retailer at a buyback price, reducing overstock risk for the retailer.",
  teachingNote:
    "Compare retailer and manufacturer incentives, then evaluate whether buyback terms improve channel coordination.",
  keyOutcomeLabel: "Total Supply Chain Profit",
  fields: [
    {
      key: "retailPrice",
      label: "Retail Price (p)",
      tooltip: "Unit selling price charged to customers.",
      min: 0,
      step: 0.01
    },
    {
      key: "wholesalePrice",
      label: "Wholesale Price (w)",
      tooltip: "Unit transfer price from supplier to retailer.",
      min: 0,
      step: 0.01
    },
    {
      key: "buybackPrice",
      label: "Buyback Price (b)",
      tooltip: "Supplier repurchase amount for each unsold unit.",
      min: 0,
      step: 0.01
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
    wholesalePrice: "70",
    buybackPrice: "30",
    orderQuantity: "200"
  }
};

export default buybackContract;
