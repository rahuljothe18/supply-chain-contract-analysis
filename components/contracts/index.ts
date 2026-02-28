import buybackContract from "./buyback";
import optionContract from "./optionContract";
import quantityFlexibilityContract from "./quantityFlexibility";
import revenueSharingContract from "./revenueSharing";
import wholesaleContract from "./wholesale";
import { ContractDefinition, ContractType } from "@/types/contracts";

export const CONTRACT_DEFINITIONS: Record<ContractType, ContractDefinition> = {
  wholesale: wholesaleContract,
  buyback: buybackContract,
  revenueSharing: revenueSharingContract,
  optionContract,
  quantityFlexibility: quantityFlexibilityContract
};

export const CONTRACT_OPTIONS: Array<{ value: ContractType; label: string }> = [
  { value: "wholesale", label: "Wholesale Price Contract" },
  { value: "buyback", label: "Buyback Contract" },
  { value: "revenueSharing", label: "Revenue Sharing Contract" },
  { value: "optionContract", label: "Option Contract" },
  { value: "quantityFlexibility", label: "Quantity Flexibility Contract" }
];
