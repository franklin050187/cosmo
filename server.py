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

client = DiscordOAuthClient(
    client_id, client_secret, redirect_uri, ("identify", "guilds"))


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
        desired_id = int(os.getenv('guild_id'))  # Excelsior server
        for guild in guilds:
            if guild.id == desired_id:
                path = 'templates/upload.html'
                print(user)
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
        # return FileResponse(path)
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
    # user = request.session.get("discord_user")
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


# def levenshteinDistance(s1, s2):
#     if len(s1) > len(s2):
#         s1, s2 = s2, s1

#     distances = range(len(s1) + 1)
#     for i2, c2 in enumerate(s2):
#         distances_ = [i2+1]
#         for i1, c1 in enumerate(s1):
#             if c1 == c2:
#                 distances_.append(distances[i1])
#             else:
#                 distances_.append(
#                     1 + min((distances[i1], distances[i1 + 1], distances_[-1])))
#         distances = distances_
#     return distances[-1]


@app.route("/", methods=["GET", "POST"])
async def home(request: Request):
    if request.method == "POST":
        # searching ships
        TAGS = ['cannon', 'deck_cannon', 'emp_missiles', 'flak_battery', 'he_missiles', 'large_cannon', 'mines', 'nukes', 'railgun', 'ammo_factory', 'emp_factory', 'he_factory', 'mine_factory', 'nuke_factory', 'disruptors', 'heavy_laser', 'ion_beam', 'ion_prism', 'laser', 'mining_laser', 'point_defense', 'boost_thruster', 'airlock', 'campaign_factories', 'explosive_charges', 'fire_extinguisher', 'no_fire_extinguishers',
                'large_reactor', 'large_shield', 'medium_reactor', 'sensor', 'small_hyperdrive', 'small_reactor', 'small_shield', 'tractor_beams', 'hyperdrive_relay', 'bidirectional_thrust', 'mono_thrust', 'multi_thrust', 'omni_thrust', 'armor_defenses', 'mixed_defenses', 'shield_defenses', 'corvette', 'diagonal', 'flanker', 'mixed_weapons', 'painted', 'unpainted', 'splitter', 'utility_weapons', 'transformer']

        form_input = await request.form()
        query: str = form_input.get("query").strip()
        words = query.lower().split(" ")
        # all combinations of a word and the one after
        word_pairs = [words[i] + '_' + words[i+1]
                      for i in range(len(words) - 1)]
        # the actual tags found in the query
        # [tag for tag in TAGS if any(levenshteinDistance(tag, word) <= 3 for word in words + word_pairs)]
        # edit distance doesn't work for things like "unpainted" vs "painted"
        query_tags = []
        for tag in TAGS:
            for word in words + word_pairs:
                pure_word = word.removeprefix('-')
                if tag == pure_word \
                        or tag.removesuffix('s') == pure_word \
                        or pure_word.removesuffix('s') == tag:
                    if word.startswith('-'):
                        query_tags.append('-' + tag)
                    else:
                        query_tags.append(tag)
                    break

        print(query_tags)  # DEBUG

        conn = sqlite3.connect('example.db')
        cursor = conn.cursor()

        # Build the SQL query based on the search criteria
        query = "SELECT * FROM images"

        SQL_KEYWORDS = ['\\', ',', '\'', '"', '--', ';', '%', '&', '+', '*', '!', '?',
                        '=', '>', '<', '(', ')', '[', ']', '{', '}', '|', 'like', 'and',
                        'or', 'not', 'from', 'where', 'table', 'select']

        # check name, author, and description
        other_conditions = []
        for word in [word for word in words if word not in query_tags]:
            # to lessen the risk of SQL injection
            if word == "" or any(keyword in word for keyword in SQL_KEYWORDS):
                continue
            if word[0] != '-':
                other_conditions.append(
                    f"(name LIKE '%{word}%' OR author LIKE '%{word}%' OR description LIKE '%{word}%')")
            else:
                other_conditions.append(
                    f"(name NOT LIKE '%{word[1:]}%' AND author NOT LIKE '%{word[1:]}%')")

        # check tags
        pos_tag_conditions = []
        for tag in query_tags:
            if tag[0] != '-':
                pos_tag_conditions.append(f"{tag} = 1")
        neg_tag_conditions = []
        for tag in query_tags:
            if tag[0] == '-':
                neg_tag_conditions.append(f"{tag[1:]} = 0")

        # build query
        if pos_tag_conditions or neg_tag_conditions or other_conditions:
            query += " WHERE "

        if pos_tag_conditions or neg_tag_conditions:
            query += "("
            if pos_tag_conditions:
                query += " AND ".join(pos_tag_conditions)
            if pos_tag_conditions and neg_tag_conditions:
                query += " AND "
            if neg_tag_conditions:
                query += " AND ".join(neg_tag_conditions)
            query += ")"

        if other_conditions:
            if pos_tag_conditions or neg_tag_conditions:
                query += " AND "
            query += "(" + " OR ".join(other_conditions) + ")"

        print(query)  # DEBUG

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
