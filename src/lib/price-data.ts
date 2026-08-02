import { resourceCost } from "./part-data";
export { partsResources, resourceCost } from "./part-data";
export type { PartResource as PartResources, ResourceCost } from "./part-data";

const resourceCostMap = new Map(resourceCost.map((r) => [r.ID, r]));

export function lookupResourcePrice(resourceId: string): number {
  return resourceCostMap.get(resourceId)?.BuyPrice ?? 0;
}

export function lookupResourceStackSize(resourceId: string): number {
  return resourceCostMap.get(resourceId)?.MaxStackSize ?? 1;
}
