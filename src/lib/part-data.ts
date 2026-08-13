export interface PartResource {
  ID: string;
  Resources: [string, string][];
  AmmoCapacity?: number;
  FuelCapacity?: number;
  InputResources?: [string, string][];
}

export interface ResourceCost {
  ID: string;
  BuyPrice: number;
  MaxStackSize: number;
}

export const partsResources: PartResource[] = [
  { ID: "cosmoteer.airlock", Resources: [["steel","8"],["coil","4"]] },
  { ID: "cosmoteer.armor", Resources: [["steel","8"]] },
  { ID: "cosmoteer.armor_1x2_wedge", Resources: [["steel","8"]] },
  { ID: "cosmoteer.armor_1x3_wedge", Resources: [["steel","12"]] },
  { ID: "cosmoteer.armor_2x1", Resources: [["steel","16"]] },
  { ID: "cosmoteer.armor_structure_hybrid_1x1", Resources: [["steel","5"]] },
  { ID: "cosmoteer.armor_structure_hybrid_1x2", Resources: [["steel","10"]] },
  { ID: "cosmoteer.armor_structure_hybrid_1x3", Resources: [["steel","15"]] },
  { ID: "cosmoteer.armor_structure_hybrid_tri", Resources: [["steel","3"]] },
  { ID: "cosmoteer.armor_tri", Resources: [["steel","2"]] },
  { ID: "cosmoteer.armor_wedge", Resources: [["steel","4"]] },
  { ID: "cosmoteer.cannon_deck", AmmoCapacity: 100, Resources: [["steel","200"],["coil2","30"],["tristeel","30"]] },
  { ID: "cosmoteer.cannon_large", AmmoCapacity: 64, Resources: [["steel","100"],["coil","10"],["coil2","5"]] },
  { ID: "cosmoteer.cannon_med", AmmoCapacity: 16, Resources: [["steel","48"],["coil","8"]] },
  { ID: "cosmoteer.chaingun", AmmoCapacity: 12, Resources: [["steel","144"],["coil2","38"],["tristeel","45"]] },
  { ID: "cosmoteer.chaingun_magazine", AmmoCapacity: 4, Resources: [["steel","20"],["coil","5"]] },
  { ID: "cosmoteer.control_room_large", Resources: [["steel","160"],["coil2","70"],["processor","10"]] },
  { ID: "cosmoteer.control_room_med", Resources: [["steel","80"],["coil2","35"],["processor","5"]] },
  { ID: "cosmoteer.control_room_small", Resources: [["steel","32"],["coil","42"],["processor","2"]] },
  { ID: "cosmoteer.conveyor", Resources: [["steel","4"],["coil","1"]] },
  { ID: "cosmoteer.corridor", Resources: [["steel","4"]] },
  { ID: "cosmoteer.crew_quarters_large", Resources: [["steel","144"]] },
  { ID: "cosmoteer.crew_quarters_med", Resources: [["steel","48"]] },
  { ID: "cosmoteer.crew_quarters_small", Resources: [["steel","24"]] },
  { ID: "cosmoteer.disruptor", Resources: [["steel","40"],["coil","8"],["coil2","4"]] },
  { ID: "cosmoteer.door", Resources: [["coil","1"]] },
  { ID: "cosmoteer.engine_room", Resources: [["steel","96"],["coil2","32"]] },
  { ID: "cosmoteer.explosive_charge", Resources: [["steel","12"],["coil","3"]] },
  { ID: "cosmoteer.factory_ammo", InputResources: [["sulfur","5"]], Resources: [["steel","32"],["coil","24"],["tristeel","4"]] },
  { ID: "cosmoteer.factory_coil", InputResources: [["copper","10"]], Resources: [["steel","80"],["coil","80"],["processor","8"]] },
  { ID: "cosmoteer.factory_coil2", InputResources: [["coil","80"],["copper","10"]], Resources: [["steel","104"],["coil2","58"],["processor","12"]] },
  { ID: "cosmoteer.factory_diamond", InputResources: [["carbon","20"]], Resources: [["steel","48"],["coil2","118"],["tristeel","67"]] },
  { ID: "cosmoteer.factory_emp", InputResources: [["iron","5"],["copper","5"]], Resources: [["steel","96"],["coil2","32"],["diamond","2"]] },
  { ID: "cosmoteer.factory_he", InputResources: [["iron","5"],["sulfur","5"]], Resources: [["steel","76"],["coil2","27"],["processor","2"]] },
  { ID: "cosmoteer.factory_mine", AmmoCapacity: 20, InputResources: [["iron","5"]], Resources: [["steel","96"],["coil2","50"],["tristeel","13"]] },
  { ID: "cosmoteer.factory_nuke", InputResources: [["iron","5"],["uranium","5"]], Resources: [["steel","120"],["coil2","60"],["enriched_uranium","2"]] },
  { ID: "cosmoteer.factory_processor", InputResources: [["coil","80"],["gold","10"]], Resources: [["steel","80"],["coil2","100"],["diamond","12"]] },
  { ID: "cosmoteer.factory_steel", InputResources: [["iron","20"]], Resources: [["steel","120"],["coil","90"],["coil2","60"]] },
  { ID: "cosmoteer.factory_thermal", InputResources: [["copper","5"],["sulfur","5"]], Resources: [["steel","80"],["coil2","46"],["tristeel","11"]] },
  { ID: "cosmoteer.factory_tristeel", InputResources: [["tritanium","20"]], Resources: [["steel","120"],["coil2","100"],["diamond","8"]] },
  { ID: "cosmoteer.factory_uranium", InputResources: [["uranium","20"]], Resources: [["steel","80"],["coil2","80"],["enriched_uranium","32"]] },
  { ID: "cosmoteer.fire_extinguisher", Resources: [["steel","8"],["coil","1"]] },
  { ID: "cosmoteer.flak_cannon_large", AmmoCapacity: 92, Resources: [["steel","200"],["coil2","30"]] },
  { ID: "cosmoteer.heat_exchanger", Resources: [["steel","8"],["coil","3"]] },
  { ID: "cosmoteer.heat_pipe_adaptive", Resources: [["steel","4"],["coil","2"]] },
  { ID: "cosmoteer.heat_pipe_adaptive_structure", Resources: [["steel","4"],["coil","2"]] },
  { ID: "cosmoteer.heat_pipe_crossing", Resources: [["steel","4"],["coil","2"]] },
  { ID: "cosmoteer.hyperdrive_beacon", Resources: [["steel","160"],["coil2","40"],["diamond","6"]] },
  { ID: "cosmoteer.hyperdrive_large", FuelCapacity: 80, Resources: [["steel","156"],["coil2","67"],["processor","4"]] },
  { ID: "cosmoteer.hyperdrive_med", FuelCapacity: 40, Resources: [["steel","76"],["coil2","52"],["processor","1"]] },
  { ID: "cosmoteer.hyperdrive_small", FuelCapacity: 20, Resources: [["steel","40"],["coil","90"]] },
  { ID: "cosmoteer.ion_beam_emitter", Resources: [["steel","60"],["coil2","15"],["diamond","1"]] },
  { ID: "cosmoteer.ion_beam_prism", Resources: [["steel","16"],["coil2","2"],["diamond","1"]] },
  { ID: "cosmoteer.laser_blaster_large", Resources: [["steel","96"],["coil","14"],["coil2","4"]] },
  { ID: "cosmoteer.laser_blaster_small", Resources: [["steel","32"],["coil","12"]] },
  { ID: "cosmoteer.manipulator_beam_emitter", Resources: [["steel","36"],["coil2","7"]] },
  { ID: "cosmoteer.mining_laser_small", Resources: [["steel","96"],["coil","15"],["coil2","7"]] },
  { ID: "cosmoteer.missile_launcher", Resources: [["steel","60"],["coil2","20"],["processor","1"]] },
  { ID: "cosmoteer.point_defense", Resources: [["steel","8"],["coil","8"]] },
  { ID: "cosmoteer.power_storage", Resources: [["steel","32"],["coil","22"]] },
  { ID: "cosmoteer.radiator", Resources: [["steel","48"],["coil","52"],["coil2","12"]] },
  { ID: "cosmoteer.railgun_accelerator", Resources: [["steel","76"],["coil2","12"],["tristeel","10"]] },
  { ID: "cosmoteer.railgun_launcher", Resources: [["steel","100"],["coil2","10"],["tristeel","10"]] },
  { ID: "cosmoteer.railgun_loader", AmmoCapacity: 46, Resources: [["steel","60"],["coil2","30"],["tristeel","10"]] },
  { ID: "cosmoteer.reactor_large", Resources: [["steel","120"],["coil2","80"],["enriched_uranium","24"]] },
  { ID: "cosmoteer.reactor_med", Resources: [["steel","72"],["coil2","54"],["enriched_uranium","16"]] },
  { ID: "cosmoteer.reactor_small", Resources: [["steel","32"],["coil","82"],["enriched_uranium","8"]] },
  { ID: "cosmoteer.resonance_beam_turret", Resources: [["steel","80"],["coil2","20"],["diamond","2"]] },
  { ID: "cosmoteer.resource_collector", Resources: [["steel","40"],["coil","20"]] },
  { ID: "cosmoteer.roof_headlight", Resources: [["steel","4"],["coil","2"]] },
  { ID: "cosmoteer.roof_light", Resources: [["steel","4"],["coil","1"]] },
  { ID: "cosmoteer.sensor_array", Resources: [["steel","76"],["coil2","27"],["processor","4"]] },
  { ID: "cosmoteer.shield_gen_large", Resources: [["steel","120"],["coil2","30"],["diamond","2"]] },
  { ID: "cosmoteer.shield_gen_small", Resources: [["steel","40"],["coil","40"]] },
  { ID: "cosmoteer.storage_2x2", Resources: [["steel","48"]] },
  { ID: "cosmoteer.storage_3x2", Resources: [["steel","72"]] },
  { ID: "cosmoteer.storage_3x3", Resources: [["steel","108"]] },
  { ID: "cosmoteer.storage_4x3", Resources: [["steel","144"]] },
  { ID: "cosmoteer.storage_4x4", Resources: [["steel","192"]] },
  { ID: "cosmoteer.structure", Resources: [["steel","2"]] },
  { ID: "cosmoteer.structure_1x2_wedge", Resources: [["steel","2"]] },
  { ID: "cosmoteer.structure_1x3_wedge", Resources: [["steel","3"]] },
  { ID: "cosmoteer.structure_tri", Resources: [["steel","1"]] },
  { ID: "cosmoteer.structure_wedge", Resources: [["steel","1"]] },
  { ID: "cosmoteer.thermal_amplification_pump", Resources: [["steel","8"],["coil2","1"],["diamond","1"]] },
  { ID: "cosmoteer.thermal_battery", Resources: [["steel","40"],["coil","15"]] },
  { ID: "cosmoteer.thermal_dilation_pump", Resources: [["steel","16"],["coil2","2"],["diamond","1"]] },
  { ID: "cosmoteer.thruster_boost", Resources: [["steel","56"],["coil2","10"],["tristeel","8"]] },
  { ID: "cosmoteer.thruster_huge", Resources: [["steel","124"],["coil2","23"]] },
  { ID: "cosmoteer.thruster_large", Resources: [["steel","40"],["coil","30"]] },
  { ID: "cosmoteer.thruster_med", Resources: [["steel","24"],["coil","9"]] },
  { ID: "cosmoteer.thruster_rocket_battery", Resources: [["steel","20"],["coil","10"]] },
  { ID: "cosmoteer.thruster_rocket_extender", Resources: [["steel","60"],["coil2","15"]] },
  { ID: "cosmoteer.thruster_rocket_nozzle", Resources: [["steel","120"],["coil2","30"],["tristeel","15"]] },
  { ID: "cosmoteer.thruster_small", Resources: [["steel","8"],["coil","3"]] },
  { ID: "cosmoteer.thruster_small_2way", Resources: [["steel","12"],["coil","7"]] },
  { ID: "cosmoteer.thruster_small_3way", Resources: [["steel","16"],["coil","11"]] },
  { ID: "cosmoteer.tractor_beam_emitter", Resources: [["steel","200"],["coil2","50"],["diamond","5"]] },
  { ID: "emp_missiles", Resources: [["missile_part_emp","9"]] },
  { ID: "he_missiles", Resources: [["missile_part_he","12"]] },
  { ID: "mines", Resources: [["mine_part","24"]] },
  { ID: "nukes", Resources: [["missile_part_nuke","12"]] },
  { ID: "thermal_missiles", Resources: [["missile_part_thermal","10"]] },
];

export const resourceCost: ResourceCost[] = [
  { ID: "bullet", BuyPrice: 4, MaxStackSize: 20 },
  { ID: "carbon", BuyPrice: 160, MaxStackSize: 5 },
  { ID: "coil", BuyPrice: 100, MaxStackSize: 40 },
  { ID: "coil2", BuyPrice: 300, MaxStackSize: 40 },
  { ID: "copper", BuyPrice: 80, MaxStackSize: 5 },
  { ID: "diamond", BuyPrice: 4000, MaxStackSize: 5 },
  { ID: "enriched_uranium", BuyPrice: 2000, MaxStackSize: 10 },
  { ID: "gold", BuyPrice: 500, MaxStackSize: 5 },
  { ID: "hyperium", BuyPrice: 50, MaxStackSize: 20 },
  { ID: "iron", BuyPrice: 20, MaxStackSize: 5 },
  { ID: "mine_part", BuyPrice: 52, MaxStackSize: 8 },
  { ID: "missile_part_emp", BuyPrice: 20, MaxStackSize: 10 },
  { ID: "missile_part_he", BuyPrice: 8, MaxStackSize: 10 },
  { ID: "missile_part_nuke", BuyPrice: 36, MaxStackSize: 10 },
  { ID: "missile_part_thermal", BuyPrice: 12, MaxStackSize: 10 },
  { ID: "processor", BuyPrice: 2500, MaxStackSize: 5 },
  { ID: "steel", BuyPrice: 25, MaxStackSize: 40 },
  { ID: "sulfur", BuyPrice: 20, MaxStackSize: 5 },
  { ID: "tristeel", BuyPrice: 200, MaxStackSize: 40 },
  { ID: "tritanium", BuyPrice: 160, MaxStackSize: 5 },
  { ID: "uranium", BuyPrice: 400, MaxStackSize: 5 },
];

export function computePartCost(part: PartResource): number {
  let cost = 0;
  for (const [resourceId, qty] of part.Resources) {
    const res = resourceCost.find((r) => r.ID === resourceId);
    if (res) cost += res.BuyPrice * (Number(qty) || 0);
  }
  if (part.AmmoCapacity) {
    const bullet = resourceCost.find((r) => r.ID === "bullet");
    if (bullet) cost += bullet.BuyPrice * part.AmmoCapacity;
  }
  if (part.FuelCapacity) {
    const hyperium = resourceCost.find((r) => r.ID === "hyperium");
    if (hyperium) cost += hyperium.BuyPrice * part.FuelCapacity;
  }
  if (part.InputResources) {
    for (const [resourceId, qty] of part.InputResources) {
      const res = resourceCost.find((r) => r.ID === resourceId);
      if (res) cost += res.BuyPrice * (Number(qty) || 0);
    }
  }
  return cost;
}
