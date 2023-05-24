import uvicorn
from fastapi import (
    FastAPI,
    Request,
    File,
    UploadFile,
)
from fastapi.responses import (
    FileResponse,
    RedirectResponse,
    HTMLResponse,
)
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request
from starlette.responses import RedirectResponse, JSONResponse
from starlette_discord.client import DiscordOAuthClient
import sqlite3
import base64
import os
from dotenv import load_dotenv

import json

load_dotenv()

# Discord OAuth2 settings
client_id = os.getenv('discord_id')
client_secret = os.getenv('discord_secret')
redirect_uri = os.getenv('discord_redirect')
print(redirect_uri)

client = DiscordOAuthClient(client_id, client_secret, redirect_uri, ("identify", "guilds"))

# Create a table in the database if it doesn't exist
def create_table():
    file_path = "example.db"
    if not os.path.exists(file_path):
        # Create an empty file
        open(file_path, 'w').close()
        print("File created successfully.")
    else:
        print("File already exists.")
    conn = sqlite3.connect('example.db')
    cursor = conn.cursor()
    cursor.execute('CREATE TABLE IF NOT EXISTS images (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, data TEXT, submitted_by TEXT, description TEXT, ship_name TEXT, author TEXT, price INT, cannon INT, deck_cannon INT, emp_missiles INT, flak_battery INT, he_missiles INT, large_cannon INT, mines INT, nukes INT, railgun INT, ammo_factory INT, emp_factory INT, he_factory INT, mine_factory INT, nuke_factory INT, disruptors INT, heavy_Laser INT, ion_Beam INT, ion_Prism INT, laser INT, mining_Laser INT, point_Defense INT, boost_thruster INT, airlock INT, campaign_factories INT, explosive_charges INT, fire_extinguisher INT, no_fire_extinguishers INT, large_reactor INT, large_shield INT, medium_reactor INT, sensor INT, small_hyperdrive INT, small_reactor INT, small_shield INT, tractor_beams INT, hyperdrive_relay INT, bidirectional_thrust INT, mono_thrust INT, multi_thrust INT, omni_thrust INT, armor_defenses INT, mixed_defenses INT, shield_defenses INT, Corvette INT, diagonal INT, flanker INT, mixed_weapons INT, painted INT, unpainted INT, splitter INT, utility_weapons INT, transformer INT)')
    conn.commit()
    conn.close()
    
app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key=os.getenv('secret_session'))
templates = Jinja2Templates(directory="templates")

@app.on_event("startup")
async def startup_event():
    create_table()

@app.get('/login')
async def start_login():
    return client.redirect()

@app.get('/callback')
async def finish_login(code: str, request: Request):
    async with client.session(code) as session:
        user = await session.identify()
        guilds = await session.guilds()
        if not user:
            return RedirectResponse("/login")
        # get guilds and parse them
        # Access the parsed data
        desired_id = int(os.getenv('guild_id')) #Excelsior server
        for guild in guilds:
            if guild.id == desired_id:
                path = 'templates/upload.html'
                return FileResponse(path)
    # redirect to join the server before uploading
    path = 'templates/auth.html'
    return FileResponse(path)

# Endpoint for displaying the file upload page
@app.get("/upload", response_class=FileResponse)
async def upload_page(request: Request):
    user = request.session.get("discord_user")
    if not user:
        print("DEBUG not a user upload")
        path = 'templates/upload.html'
        #return FileResponse(path)
        return RedirectResponse("/login")
    print(user)
    path = 'templates/upload.html'
    return FileResponse(path)

# Endpoint for uploading files
@app.post("/upload/")
async def upload(request: Request, file: UploadFile = File(...)):
    # Read the image file
    contents = await file.read()
    # Encode the contents as base64
    encoded_data = base64.b64encode(contents).decode("utf-8")
    # Store the image data in the database
    #user = request.session.get("discord_user")
    # get input box
    conn = sqlite3.connect('example.db')
    cursor = conn.cursor()
    form_data = await request.form()
    cursor.execute("INSERT INTO images (name, data, submitted_by, description, ship_name, author, price, cannon, deck_cannon, emp_missiles, flak_battery, he_missiles, large_cannon, mines, nukes, railgun, ammo_factory, emp_factory, he_factory, mine_factory, nuke_factory, disruptors, heavy_Laser, ion_Beam, ion_Prism, laser, mining_Laser, point_Defense, boost_thruster, airlock, campaign_factories, explosive_charges, fire_extinguisher, no_fire_extinguishers, large_reactor, large_shield, medium_reactor, sensor, small_hyperdrive, small_reactor, small_shield, tractor_beams, hyperdrive_relay, bidirectional_thrust, mono_thrust, multi_thrust, omni_thrust, armor_defenses, mixed_defenses, shield_defenses, Corvette, diagonal, flanker, mixed_weapons, painted, unpainted, splitter, utility_weapons, transformer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
               (file.filename, 
                encoded_data, 
                form_data["submitted_by"],
                form_data["description"],
                form_data["ship_name"],
                form_data["author"],
                int(form_data["price"]), 
                1 if 'cannon' in form_data else 0,
                1 if 'deck_cannon' in form_data else 0,
                1 if 'emp_missiles' in form_data else 0,
                1 if 'flak_battery' in form_data else 0,
                1 if 'he_missiles' in form_data else 0,
                1 if 'large_cannon' in form_data else 0,
                1 if 'mines' in form_data else 0,
                1 if 'nukes' in form_data else 0,
                1 if 'railgun' in form_data else 0,
                1 if 'ammo_factory' in form_data else 0,
                1 if 'emp_factory' in form_data else 0,
                1 if 'he_factory' in form_data else 0,
                1 if 'mine_factory' in form_data else 0,
                1 if 'nuke_factory' in form_data else 0,
                1 if 'disruptors' in form_data else 0,
                1 if 'heavy_Laser' in form_data else 0,
                1 if 'ion_Beam' in form_data else 0,
                1 if 'ion_Prism' in form_data else 0,
                1 if 'laser' in form_data else 0,
                1 if 'mining_Laser' in form_data else 0,
                1 if 'point_Defense' in form_data else 0,
                1 if 'boost_thruster' in form_data else 0,
                1 if 'airlock' in form_data else 0,
                1 if 'campaign_factories' in form_data else 0,
                1 if 'explosive_charges' in form_data else 0,
                1 if 'fire_extinguisher' in form_data else 0,
                1 if 'no_fire_extinguishers' in form_data else 0,
                1 if 'large_reactor' in form_data else 0,
                1 if 'large_shield' in form_data else 0,
                1 if 'medium_reactor' in form_data else 0,
                1 if 'sensor' in form_data else 0,
                1 if 'small_hyperdrive' in form_data else 0,
                1 if 'small_reactor' in form_data else 0,
                1 if 'small_shield' in form_data else 0,
                1 if 'tractor_beams' in form_data else 0,
                1 if 'hyperdrive_relay' in form_data else 0,
                1 if 'bidirectional_thrust' in form_data else 0,
                1 if 'mono_thrust' in form_data else 0,
                1 if 'multi_thrust' in form_data else 0,
                1 if 'omni_thrust' in form_data else 0,
                1 if 'armor_defenses' in form_data else 0,
                1 if 'mixed_defenses' in form_data else 0,
                1 if 'shield_defenses' in form_data else 0,
                1 if 'Corvette' in form_data else 0,
                1 if 'diagonal' in form_data else 0,
                1 if 'flanker' in form_data else 0,
                1 if 'mixed_weapons' in form_data else 0,
                1 if 'painted' in form_data else 0,
                1 if 'unpainted' in form_data else 0,
                1 if 'splitter' in form_data else 0,
                1 if 'utility_weapons' in form_data else 0,
                1 if 'transformer' in form_data else 0))
    conn.commit()
    conn.close()
    # Redirect to the index page
    return RedirectResponse(url="/", status_code=303)

@app.route("/", methods=["GET", "POST"])
async def home(request: Request):
    if request.method == "POST":
        form_data = await request.form()
        cannon_value = form_data.get("cannon")
        deck_cannon_value = form_data.get("deck_cannon")
        emp_missiles_value = form_data.get("emp_missiles")
        flak_battery_value = form_data.get("flak_battery")
        he_missiles_value = form_data.get("he_missiles")
        large_cannon_value = form_data.get("large_cannon")
        mines_value = form_data.get("mines")
        nukes_value = form_data.get("nukes")
        railgun_value = form_data.get("railgun")
        ammo_factory_value = form_data.get("ammo_factory")
        emp_factory_value = form_data.get("emp_factory")
        he_factory_value = form_data.get("he_factory")
        mine_factory_value = form_data.get("mine_factory")
        nuke_factory_value = form_data.get("nuke_factory")
        disruptors_value = form_data.get("disruptors")
        heavy_laser_value = form_data.get("heavy_laser")
        ion_beam_value = form_data.get("ion_beam")
        ion_prism_value = form_data.get("ion_prism")
        laser_value = form_data.get("laser")
        mining_laser_value = form_data.get("mining_laser")
        point_defense_value = form_data.get("point_defense")
        boost_thruster_value = form_data.get("boost_thruster")
        airlock_value = form_data.get("airlock")
        campaign_factories_value = form_data.get("campaign_factories")
        explosive_charges_value = form_data.get("explosive_charges")
        fire_extinguisher_value = form_data.get("fire_extinguisher")
        no_fire_extinguishers_value = form_data.get("no_fire_extinguishers")
        large_reactor_value = form_data.get("large_reactor")
        large_shield_value = form_data.get("large_shield")
        medium_reactor_value = form_data.get("medium_reactor")
        sensor_value = form_data.get("sensor")
        small_hyperdrive_value = form_data.get("small_hyperdrive")
        small_reactor_value = form_data.get("small_reactor")
        small_shield_value = form_data.get("small_shield")
        tractor_beams_value = form_data.get("tractor_beams")
        hyperdrive_relay_value = form_data.get("hyperdrive_relay")
        bidirectional_thrust_value = form_data.get("bidirectional_thrust")
        mono_thrust_value = form_data.get("mono_thrust")
        multi_thrust_value = form_data.get("multi_thrust")
        omni_thrust_value = form_data.get("omni_thrust")
        armor_defenses_value = form_data.get("armor_defenses")
        mixed_defenses_value = form_data.get("mixed_defenses")
        shield_defenses_value = form_data.get("shield_defenses")
        corvette_value = form_data.get("Corvette")
        diagonal_value = form_data.get("diagonal")
        flanker_value = form_data.get("flanker")
        mixed_weapons_value = form_data.get("mixed_weapons")
        painted_value = form_data.get("painted")
        unpainted_value = form_data.get("unpainted")
        splitter_value = form_data.get("splitter")
        utility_weapons_value = form_data.get("utility_weapons")
        transformer_value = form_data.get("transformer")

        conn = sqlite3.connect('example.db')
        cursor = conn.cursor()

        # Build the SQL query based on the form data
        query = "SELECT * FROM images"
        conditions = []
        if cannon_value == "must_have":
            conditions.append("cannon = 1")
        elif cannon_value == "must_not_have":
            conditions.append("cannon = 0")
        # Add conditions for other items
        if deck_cannon_value == "must_have":
            conditions.append("deck_cannon = 1")
        elif deck_cannon_value == "must_not_have":
            conditions.append("deck_cannon = 0")
        if emp_missiles_value == "must_have":
            conditions.append("emp_missiles = 1")
        elif emp_missiles_value == "must_not_have":
            conditions.append("emp_missiles = 0")
        if flak_battery_value == "must_have":
            conditions.append("flak_battery = 1")
        elif flak_battery_value == "must_not_have":
            conditions.append("flak_battery = 0")
        if he_missiles_value == "must_have":
            conditions.append("he_missiles = 1")
        elif he_missiles_value == "must_not_have":
            conditions.append("he_missiles = 0")
        # Add conditions for the remaining items
        if large_cannon_value == "must_have":
            conditions.append("large_cannon = 1")
        elif large_cannon_value == "must_not_have":
            conditions.append("large_cannon = 0")
        if mines_value == "must_have":
            conditions.append("mines = 1")
        elif mines_value == "must_not_have":
            conditions.append("mines = 0")
        if nukes_value == "must_have":
            conditions.append("nukes = 1")
        elif nukes_value == "must_not_have":
            conditions.append("nukes = 0")
        if railgun_value == "must_have":
            conditions.append("railgun = 1")
        elif railgun_value == "must_not_have":
            conditions.append("railgun = 0")
        if ammo_factory_value == "must_have":
            conditions.append("ammo_factory = 1")
        elif ammo_factory_value == "must_not_have":
            conditions.append("ammo_factory = 0")
        if emp_factory_value == "must_have":
            conditions.append("emp_factory = 1")
        elif emp_factory_value == "must_not_have":
            conditions.append("emp_factory = 0")
        if he_factory_value == "must_have":
            conditions.append("he_factory = 1")
        elif he_factory_value == "must_not_have":
            conditions.append("he_factory = 0")
        if mine_factory_value == "must_have":
            conditions.append("mine_factory = 1")
        elif mine_factory_value == "must_not_have":
            conditions.append("mine_factory = 0")
        if nuke_factory_value == "must_have":
            conditions.append("nuke_factory = 1")
        elif nuke_factory_value == "must_not_have":
            conditions.append("nuke_factory = 0")
        if disruptors_value == "must_have":
            conditions.append("disruptors = 1")
        elif disruptors_value == "must_not_have":
            conditions.append("disruptors = 0")
        if heavy_laser_value == "must_have":
            conditions.append("heavy_laser = 1")
        elif heavy_laser_value == "must_not_have":
            conditions.append("heavy_laser = 0")
        if ion_beam_value == "must_have":
            conditions.append("ion_beam = 1")
        elif ion_beam_value == "must_not_have":
            conditions.append("ion_beam = 0")
        if ion_prism_value == "must_have":
            conditions.append("ion_prism = 1")
        elif ion_prism_value == "must_not_have":
            conditions.append("ion_prism = 0")
        if laser_value == "must_have":
            conditions.append("laser = 1")
        elif laser_value == "must_not_have":
            conditions.append("laser = 0")
        if mining_laser_value == "must_have":
            conditions.append("mining_laser = 1")
        elif mining_laser_value == "must_not_have":
            conditions.append("mining_laser = 0")
        if point_defense_value == "must_have":
            conditions.append("point_defense = 1")
        elif point_defense_value == "must_not_have":
            conditions.append("point_defense = 0")
        if boost_thruster_value == "must_have":
            conditions.append("boost_thruster = 1")
        elif boost_thruster_value == "must_not_have":
            conditions.append("boost_thruster = 0")
        if airlock_value == "must_have":
            conditions.append("airlock = 1")
        elif airlock_value == "must_not_have":
            conditions.append("airlock = 0")
        if campaign_factories_value == "must_have":
            conditions.append("campaign_factories = 1")
        elif campaign_factories_value == "must_not_have":
            conditions.append("campaign_factories = 0")
        if explosive_charges_value == "must_have":
            conditions.append("explosive_charges = 1")
        elif explosive_charges_value == "must_not_have":
            conditions.append("explosive_charges = 0")
        if fire_extinguisher_value == "must_have":
            conditions.append("fire_extinguisher = 1")
        elif fire_extinguisher_value == "must_not_have":
            conditions.append("fire_extinguisher = 0")
        if no_fire_extinguishers_value == "must_have":
            conditions.append("no_fire_extinguishers = 1")
        elif no_fire_extinguishers_value == "must_not_have":
            conditions.append("no_fire_extinguishers = 0")
        if large_reactor_value == "must_have":
            conditions.append("large_reactor = 1")
        elif large_reactor_value == "must_not_have":
            conditions.append("large_reactor = 0")
        if large_shield_value == "must_have":
            conditions.append("large_shield = 1")
        elif large_shield_value == "must_not_have":
            conditions.append("large_shield = 0")
        if medium_reactor_value == "must_have":
            conditions.append("medium_reactor = 1")
        elif medium_reactor_value == "must_not_have":
            conditions.append("medium_reactor = 0")
        if sensor_value == "must_have":
            conditions.append("sensor = 1")
        elif sensor_value == "must_not_have":
            conditions.append("sensor = 0")
        if small_hyperdrive_value == "must_have":
            conditions.append("small_hyperdrive = 1")
        elif small_hyperdrive_value == "must_not_have":
            conditions.append("small_hyperdrive = 0")
        if small_reactor_value == "must_have":
            conditions.append("small_reactor = 1")
        elif small_reactor_value == "must_not_have":
            conditions.append("small_reactor = 0")
        if small_shield_value == "must_have":
            conditions.append("small_shield = 1")
        elif small_shield_value == "must_not_have":
            conditions.append("small_shield = 0")
        if tractor_beams_value == "must_have":
            conditions.append("tractor_beams = 1")
        elif tractor_beams_value == "must_not_have":
            conditions.append("tractor_beams = 0")
        if hyperdrive_relay_value == "must_have":
            conditions.append("hyperdrive_relay = 1")
        elif hyperdrive_relay_value == "must_not_have":
            conditions.append("hyperdrive_relay = 0")
        if bidirectional_thrust_value == "must_have":
            conditions.append("bidirectional_thrust = 1")
        elif bidirectional_thrust_value == "must_not_have":
            conditions.append("bidirectional_thrust = 0")
        if mono_thrust_value == "must_have":
            conditions.append("mono_thrust = 1")
        elif mono_thrust_value == "must_not_have":
            conditions.append("mono_thrust = 0")
        if multi_thrust_value == "must_have":
            conditions.append("multi_thrust = 1")
        elif multi_thrust_value == "must_not_have":
            conditions.append("multi_thrust = 0")
        if omni_thrust_value == "must_have":
            conditions.append("omni_thrust = 1")
        elif omni_thrust_value == "must_not_have":
            conditions.append("omni_thrust = 0")
        if armor_defenses_value == "must_have":
            conditions.append("armor_defenses = 1")
        elif armor_defenses_value == "must_not_have":
            conditions.append("armor_defenses = 0")
        if mixed_defenses_value == "must_have":
            conditions.append("mixed_defenses = 1")
        elif mixed_defenses_value == "must_not_have":
            conditions.append("mixed_defenses = 0")
        if shield_defenses_value == "must_have":
            conditions.append("shield_defenses = 1")
        elif shield_defenses_value == "must_not_have":
            conditions.append("shield_defenses = 0")
        if corvette_value == "must_have":
            conditions.append("corvette = 1")
        elif corvette_value == "must_not_have":
            conditions.append("corvette = 0")
        if diagonal_value == "must_have":
            conditions.append("diagonal = 1")
        elif diagonal_value == "must_not_have":
            conditions.append("diagonal = 0")
        if flanker_value == "must_have":
            conditions.append("flanker = 1")
        elif flanker_value == "must_not_have":
            conditions.append("flanker = 0")
        if mixed_weapons_value == "must_have":
            conditions.append("mixed_weapons = 1")
        elif mixed_weapons_value == "must_not_have":
            conditions.append("mixed_weapons = 0")
        if painted_value == "must_have":
            conditions.append("painted = 1")
        elif painted_value == "must_not_have":
            conditions.append("painted = 0")
        if unpainted_value == "must_have":
            conditions.append("unpainted = 1")
        elif unpainted_value == "must_not_have":
            conditions.append("unpainted = 0")
        if splitter_value == "must_have":
            conditions.append("splitter = 1")
        elif splitter_value == "must_not_have":
            conditions.append("splitter = 0")
        if utility_weapons_value == "must_have":
            conditions.append("utility_weapons = 1")
        elif utility_weapons_value == "must_not_have":
            conditions.append("utility_weapons = 0")
        if transformer_value == "must_have":
            conditions.append("transformer = 1")
        elif transformer_value == "must_not_have":
            conditions.append("transformer = 0")

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        cursor.execute(query)
        images = cursor.fetchall()
        conn.close()

        return templates.TemplateResponse("index.html", {"request": request, "images": images})


    else:
        conn = sqlite3.connect('example.db')
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM images')
        images = cursor.fetchall()
        conn.close()

        return templates.TemplateResponse("index.html", {"request": request, "images": images})

# Catch-all endpoint for serving static files or the index page
@app.get("/{catchall:path}", response_class=FileResponse)
def serve_files(request: Request):
    # Check if the requested file exists
    path = request.path_params["catchall"]
    file = 'templates/' + path
    if os.path.exists(file):
        return FileResponse(file)
    # Otherwise, return the index file
    index = 'templates/index.html'
    return FileResponse(index)

if __name__ == '__main__':
    uvicorn.run(app)
