# take an input png and output a list of tags

from cosmoteer_save_tools import decode_ship_data
import json

json_data = decode_ship_data("all.png")
data = json.loads(json_data)

# Extract the values for "Author" and "Parts"
author = data["Author"]
parts = data["Parts"]
toggle = data["PartUIToggleStates"]

missile_types = []
for item in toggle:
    if '__bytes__' in item['Key'][1] and item['Key'][1]['__bytes__'] == '\x0cmissile_type':
        missile_types.append(item['Value'])

ids = [item['ID'] for item in parts]

mapping = {
    'cosmoteer.cannon_med': 'cannon',
    'cosmoteer.cannon_deck': 'deck_cannon',
    'cosmoteer.flak_cannon_large': 'flak_battery',
    'cosmoteer.cannon_large': 'large_cannon',
    'cosmoteer.railgun_launcher': 'railgun',
    'cosmoteer.factory_emp': 'factories',
    'cosmoteer.factory_he': 'factories',
    'cosmoteer.factory_mine': 'factories',
    'cosmoteer.factory_nuke': 'factories',
    'cosmoteer.disruptor': 'disruptors',
    'cosmoteer.laser_blaster_large': 'heavy_Laser',
    'cosmoteer.ion_beam_emitter': 'ion_Beam',
    'cosmoteer.ion_beam_prism': 'ion_Prism',
    'cosmoteer.laser_blaster_small': 'laser',
    'cosmoteer.mining_laser_small': 'mining_Laser',
    'cosmoteer.point_defense': 'point_Defense',
    'cosmoteer.thruster_boost': 'boost_thruster',
    'cosmoteer.airlock': 'airlock',
    'cosmoteer.factory_coil': 'campaign_factories',
    'cosmoteer.factory_coil2': 'campaign_factories',
    'cosmoteer.factory_diamond': 'campaign_factories',
    'cosmoteer.factory_processor': 'campaign_factories',
    'cosmoteer.factory_steel': 'campaign_factories',
    'cosmoteer.factory_tristeel': 'campaign_factories',
    'cosmoteer.factory_uranium': 'campaign_factories',
    'cosmoteer.explosive_charge': 'explosive_charges',
    'cosmoteer.fire_extinguisher': 'fire_extinguisher',
    'cosmoteer.reactor_large': 'large_reactor',
    'cosmoteer.shield_gen_large': 'large_shield',
    'cosmoteer.reactor_med': 'medium_reactor',
    'cosmoteer.sensor_array': 'sensor',
    'cosmoteer.hyperdrive_small': 'small_hyperdrive',
    'cosmoteer.reactor_small': 'small_reactor',
    'cosmoteer.shield_gen_small': 'small_shield',
    'cosmoteer.tractor_beam_emitter': 'tractor_beams',
    'cosmoteer.hyperdrive_beacon': 'hyperdrive_relay'
}

missile_mapping = {
    0: 'he_missiles',
    1: 'emp_missiles',
    2: 'nukes',
    3: 'mines'
}

mapped_output = set()

for item in ids:
    if item in mapping:
        mapped_output.add(mapping[item])


for item in missile_types:
    print(item)
    if item in missile_mapping:
        mapped_output.add(missile_mapping[item])

mapped_output = list(mapped_output)
print(mapped_output)

