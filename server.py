# Copyright 2023 Poney!

# Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated 
# documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use,  
# copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software
# is furnished to do so, subject to the following conditions:

# The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

# THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF 
# MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE 
# FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION 
# WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import os
import sqlite3
import base64
from dotenv import load_dotenv

import psycopg2
import uvicorn
import urllib
import re
from fastapi import FastAPI, Request, File, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request
from starlette_discord.client import DiscordOAuthClient
from urllib.parse import unquote, quote

load_dotenv()

# Discord OAuth2 settings
client_id = os.getenv('discord_id')
client_secret = os.getenv('discord_secret')
redirect_uri = os.getenv('discord_redirect')

client = DiscordOAuthClient(
    client_id, client_secret, redirect_uri, ("identify", "guilds"))


# Create a table in the database if it doesn't exist
# def create_table():
#     file_path = "example.db"
#     if not os.path.exists(file_path):
#         # Create an empty file
#         open(file_path, 'w').close()
#         print("File created successfully.")
#     else:
#         print("File already exists.")
#     # conn = sqlite3.connect('example.db')
#     cursor = conn.cursor()
#     cursor.execute('CREATE TABLE IF NOT EXISTS images (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, data TEXT, submitted_by TEXT, description TEXT, ship_name TEXT, author TEXT, price INT, cannon INT, deck_cannon INT, emp_missiles INT, flak_battery INT, he_missiles INT, large_cannon INT, mines INT, nukes INT, railgun INT, ammo_factory INT, emp_factory INT, he_factory INT, mine_factory INT, nuke_factory INT, disruptors INT, heavy_Laser INT, ion_Beam INT, ion_Prism INT, laser INT, mining_Laser INT, point_Defense INT, boost_thruster INT, airlock INT, campaign_factories INT, explosive_charges INT, fire_extinguisher INT, no_fire_extinguishers INT, large_reactor INT, large_shield INT, medium_reactor INT, sensor INT, small_hyperdrive INT, small_reactor INT, small_shield INT, tractor_beams INT, hyperdrive_relay INT, bidirectional_thrust INT, mono_thrust INT, multi_thrust INT, omni_thrust INT, armor_defenses INT, mixed_defenses INT, shield_defenses INT, Corvette INT, diagonal INT, flanker INT, mixed_weapons INT, painted INT, unpainted INT, splitter INT, utility_weapons INT, transformer INT)')
#     conn.commit()
#     conn.close()


app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
#app.mount("/tmp", StaticFiles(directory="tmp"), name="tmp")
templates = Jinja2Templates(directory="templates")


# @app.on_event("startup")
# async def startup_event():
#     create_table()

def connect_to_server():
    conn = psycopg2.connect(database=os.getenv('POSTGRES_DATABASE'),
                    host=os.getenv('POSTGRES_HOST'),
                    user=os.getenv('POSTGRES_USER'),
                    password=os.getenv('POSTGRES_PASSWORD'),
                    port=5432)
    return conn

@app.get('/login')
async def start_login():
    return client.redirect()

@app.get("/ship/{id}", response_class=HTMLResponse)
def get_image(id: int, request: Request):
    user = request.session.get("discord_user")
    # Retrieve image information from the database based on the provided ID
    conn = connect_to_server()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM images WHERE id=%s", (id,))
    image_data = cursor.fetchone()
    conn.commit()
    conn.close()
    
    # ### dirty edit ###
    # script_dir = os.path.dirname(os.path.abspath(__file__))
 
    # # Create folder if it doesn't exist
    # folder_path = os.path.join(script_dir, f"tmp/{id}")
    # os.makedirs(folder_path, exist_ok=True)

    # # Decode base64 image data
    # image_bytes = base64.b64decode(image_data[2])

    # # Generate filename using image_data[1]
    # filename = image_data[1]

    # # Save the image file in the created folder
    # file_path = os.path.join(folder_path, filename)
    
    # # Replace backslash with forward slash in the file path
    # if not os.path.exists(file_path):
    #     with open(file_path, "wb") as f:
    #         f.write(image_bytes)
    # else:
    #     print("File already exists. Skipping creation.")
        
    # print(file_path)
    
    # Pass the image data and file path to the template
    # return templates.TemplateResponse("ship.html", {"request": request, "image": image_data, "user": user, "file_path": file_path})
    # ### dirty edit ###
    
    return templates.TemplateResponse("ship.html", {"request": request, "image": image_data, "user": user})

@app.get("/delete/{id}", response_class=HTMLResponse)
def delete_image(id: int, request: Request):
    # Delete image information from the database based on the provided ID
    user = request.session.get("discord_user")
    print(user)
    # conn = sqlite3.connect('example.db')
    conn = connect_to_server()
    cursor = conn.cursor()
    cursor.execute("SELECT submitted_by FROM images WHERE id=%s", (id,))
    image_data = cursor.fetchone()
    print(image_data[0])
    if user != image_data[0]:
        print("not allowed")
        conn.commit()
        conn.close()
        return RedirectResponse("/")
    cursor.execute("DELETE FROM images WHERE id=%s", (id,))
    conn.commit()
    conn.close()

    # Redirect to the home page after deleting the image
    return RedirectResponse("/")

@app.get("/edit/{id}", response_class=HTMLResponse)
def edit_image(id: int, request: Request):
    # Delete image information from the database based on the provided ID
    user = request.session.get("discord_user")
    print(user)
    # conn = sqlite3.connect('example.db')
    conn = connect_to_server()
    cursor = conn.cursor()
    cursor.execute("SELECT submitted_by FROM images WHERE id=%s", (id,))
    image_data = cursor.fetchone()
    #print(image_data[0])
    if user != image_data[0]:
        print("not allowed")
        conn.commit()
        conn.close()
        return RedirectResponse("/")
    cursor.execute("SELECT * FROM images WHERE id=%s", (id,))
    image_data = cursor.fetchone()
    conn.commit()
    conn.close()

    # Redirect to the home page after deleting the image
    return templates.TemplateResponse("edit.html", {"request": request, "image": image_data, "user": user})

@app.post("/edit/{id}")
async def edit_image(id: int, request: Request):

    # Get the user from the session
    user = request.session.get("discord_user")
    # conn = sqlite3.connect('example.db')
    conn = connect_to_server()
    cursor = conn.cursor()

    # Retrieve the existing image data from the database
    cursor.execute("SELECT * FROM images WHERE id=%s", (id,))
    image_data = list(cursor.fetchone())
    #print(image_data)
    if user != image_data[3]:
        print("not allowed")
        conn.commit()
        conn.close()
        return RedirectResponse("/")
    # Prepare the data
    form_data = await request.form()
    print("allowed")
    # Keep the existing values for 'name' and 'data'
    image_data[2] = image_data[2]
    image_data[3] = user
    image_data[4] = form_data.get('description', '')
    image_data[5] = form_data.get('ship_name', '')
    image_data[6] = form_data.get('author', '')
    image_data[7] = int(form_data.get('price', 0))

    # Update the boolean columns
    boolean_columns = [
        'cannon', 'deck_cannon', 'emp_missiles', 'flak_battery', 'he_missiles', 'large_cannon', 'mines', 'nukes',
        'railgun', 'ammo_factory', 'emp_factory', 'he_factory', 'mine_factory', 'nuke_factory', 'disruptors',
        'heavy_Laser', 'ion_Beam', 'ion_Prism', 'laser', 'mining_Laser', 'point_Defense', 'boost_thruster',
        'airlock', 'campaign_factories', 'explosive_charges', 'fire_extinguisher', 'no_fire_extinguishers',
        'large_reactor', 'large_shield', 'medium_reactor', 'sensor', 'small_hyperdrive', 'small_reactor',
        'small_shield', 'tractor_beams', 'hyperdrive_relay', 'bidirectional_thrust', 'mono_thrust', 'multi_thrust',
        'omni_thrust', 'armor_defenses', 'mixed_defenses', 'shield_defenses', 'Corvette', 'diagonal', 'flanker',
        'mixed_weapons', 'painted', 'unpainted', 'splitter', 'utility_weapons', 'transformer'
    ]
    for i, column in enumerate(boolean_columns, start=8):
        if column in form_data:
            image_data[i] = 1
        else:
            image_data[i] = 0

    # Update the image data in the database
    columns = ['name', 'data', 'submitted_by', 'description', 'ship_name', 'author', 'price'] + boolean_columns
    values = [image_data[1]] + [image_data[2]] + [image_data[3]] + image_data[4:8] + image_data[8:]
    query = f"UPDATE images SET {', '.join([f'{column}=%s' for column in columns])} WHERE id=%s"
    #print(query)
    cursor.execute(query, tuple(values + [id]))

    # Commit and close the connection
    conn.commit()
    conn.close()

    # Redirect to the home page
    return RedirectResponse(url="/", status_code=303)

@app.get('/callback')
async def finish_login(code: str, request: Request):
    async with client.session(code) as session:
        user = await session.identify()
        guilds = await session.guilds()
        if not user:
            return RedirectResponse("/login")
        # get guilds and parse them
        request.session["discord_user"] = str(user)
        # Access the parsed data
        desired_id = int(os.getenv('guild_id'))  # Excelsior server
        for guild in guilds:
            if guild.id == desired_id:
                print(user)
                return templates.TemplateResponse("upload.html", {"request": request, "user": user})
    # redirect to join the server before uploading
    return templates.TemplateResponse("auth.html", {"request": request, "user": user})    

# Endpoint for displaying the file upload page
@app.get("/upload", response_class=FileResponse)
async def upload_page(request: Request):
    user = request.session.get("discord_user")
    if not user:
        print("DEBUG not a user upload")
        return RedirectResponse("/login")
    print(user)
    return templates.TemplateResponse("upload.html", {"request": request, "user": user})

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
    user = request.session.get("discord_user")
    # conn = sqlite3.connect('example.db')
    conn = connect_to_server()
    cursor = conn.cursor()

    # Prepare the data
    form_data = await request.form()
    
    # Modify the file name to use authorized characters for HTML
    file_name = file.filename
    authorized_chars = re.sub(r'[^\w\-_.]', '_', file_name)
    
    image_data = {
        'name': authorized_chars,
        'data': encoded_data,
        'submitted_by': user,
        'description': form_data.get('description', ''),
        'ship_name': form_data.get('ship_name', ''),
        'author': form_data.get('author', ''),
        'price': int(form_data.get('price', 0))
    }

    # Define the column names
    columns = ['name', 'data', 'submitted_by', 'description', 'ship_name', 'author', 'price']

    # Prepare the values
    values = [image_data[column] for column in columns]

    # Prepare the boolean columns
    boolean_columns = [
        'cannon', 'deck_cannon', 'emp_missiles', 'flak_battery', 'he_missiles', 'large_cannon', 'mines', 'nukes',
        'railgun', 'ammo_factory', 'emp_factory', 'he_factory', 'mine_factory', 'nuke_factory', 'disruptors',
        'heavy_Laser', 'ion_Beam', 'ion_Prism', 'laser', 'mining_Laser', 'point_Defense', 'boost_thruster',
        'airlock', 'campaign_factories', 'explosive_charges', 'fire_extinguisher', 'no_fire_extinguishers',
        'large_reactor', 'large_shield', 'medium_reactor', 'sensor', 'small_hyperdrive', 'small_reactor',
        'small_shield', 'tractor_beams', 'hyperdrive_relay', 'bidirectional_thrust', 'mono_thrust', 'multi_thrust',
        'omni_thrust', 'armor_defenses', 'mixed_defenses', 'shield_defenses', 'Corvette', 'diagonal', 'flanker',
        'mixed_weapons', 'painted', 'unpainted', 'splitter', 'utility_weapons', 'transformer'
    ]

    # Prepare the boolean values
    boolean_values = [1 if column in form_data else 0 for column in boolean_columns]

    # Construct the SQL query
    query = f"INSERT INTO images ({', '.join(columns + boolean_columns)}) VALUES ({', '.join(['%s'] * (len(columns) + len(boolean_columns)))})"

    # Execute the query
    cursor.execute(query, tuple(values + boolean_values))

    # Commit and close the connection
    conn.commit()
    conn.close()

    # Redirect to the index page
    return RedirectResponse(url="/", status_code=303)

@app.route("/", methods=["GET", "POST"])
async def home(request: Request):
    user = request.session.get("discord_user")
    print(user)
    if not user:
        print("DEBUG not a user home")
        user = "Guest"
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

        # conn = sqlite3.connect('example.db')
        conn = connect_to_server()
        cursor = conn.cursor()

        # Build the SQL query based on the search criteria
        query = "SELECT * FROM images"
        args = []  # a list to store the parameters
        SQL_KEYWORDS = ['\\', ',', '\'', '"', '--', ';', '%', '&', '+', '*', '!', '%s', '=', '>', '<',
                        '(', ')', '[', ']', '{', '}', '|', 'like', 'and', 'or', 'not', 'from', 'where', 'table', 'select']

        # check name, author, and description
        other_conditions = []
        for word in [word for word in words if word not in query_tags]:
            # to further lessen the risk of SQL injection
            if word == "" or any(keyword in word for keyword in SQL_KEYWORDS):
                continue
            if word[0] != '-':
                other_conditions.append(
                    "(name LIKE %s OR author LIKE %s OR description LIKE %s)")
                # add the parameters to the list
                args.extend([f"%{word}%", f"%{word}%", f"%{word}%"])
            else:
                other_conditions.append(
                    "(name NOT LIKE %s AND author NOT LIKE %s)")
                # add the parameters to the list
                args.extend([f"%{word[1:]}%", f"%{word[1:]}%"])

        # check tags
        pos_tag_conditions = []
        for tag in query_tags:
            if tag[0] != '-':
                pos_tag_conditions.append(f"{tag} = %s")
                args.append(1)  # add the parameter to the list

        neg_tag_conditions = []
        for tag in query_tags:
            if tag[0] == '-':
                neg_tag_conditions.append(f"{tag[1:]} = %s")
                args.append(0)  # add the parameter to the list

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

        # print(query)  # DEBUG
        # print(args)  # DEBUG

        # execute the query with the parameters
        cursor.execute(query, args)

        images = cursor.fetchall()
        conn.close()

        return templates.TemplateResponse("index.html", {"request": request, "images": images, "user": user})

    else:
        # conn = sqlite3.connect('example.db')
        conn = connect_to_server()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM images')
        images = cursor.fetchall()
        conn.close()

        return templates.TemplateResponse("index.html", {"request": request, "images": images, "user": user})

# ### test section ###
# @app.get("/testget", response_class=FileResponse)
# async def test(request: Request):
#     conn = psycopg2.connect(database=os.getenv('POSTGRES_DATABASE'),
#                         host=os.getenv('POSTGRES_HOST'),
#                         user=os.getenv('POSTGRES_USER'),
#                         password=os.getenv('POSTGRES_PASSWORD'),
#                         port=5432)
#     cursor = conn.cursor()
#     cursor.execute("SELECT * FROM images")
#     images = cursor.fetchall()
#     conn.close()
#     return templates.TemplateResponse("index.html", {"request": request, "images": images, "user": "testget"})
# ### END ###


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

app.add_middleware(SessionMiddleware, secret_key=os.getenv('secret_session'))

if __name__ == '__main__':
    uvicorn.run(app)
