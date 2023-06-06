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
import base64
from dotenv import load_dotenv

import psycopg2
import uvicorn
import re
from fastapi import FastAPI, Request, File, UploadFile, Depends, Query, Response
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request
from starlette_discord.client import DiscordOAuthClient
from png_upload import upload_image_to_imgbb
from tagextractor import PNGTagExtractor
from db import upload_image, get_image_data, get_image_url, update_downloads
from fastapi.middleware.gzip import GZipMiddleware
from pricegen import calculate_price
from urllib.parse import urlencode
from collections import OrderedDict
import requests

load_dotenv()

# Discord OAuth2 settings
client_id = os.getenv('discord_id')
client_secret = os.getenv('discord_secret')
redirect_uri = os.getenv('discord_redirect')
client = DiscordOAuthClient(
    client_id, client_secret, redirect_uri, ("identify", "guilds"))

# app configuration
app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
#app.mount("/tmp", StaticFiles(directory="tmp"), name="tmp") # mounting tmp crashed the serverless function
templates = Jinja2Templates(directory="templates")

# postgresql configuration (db and table must be setup before use)
def connect_to_server():
    conn = psycopg2.connect(database=os.getenv('POSTGRES_DATABASE'),
                    host=os.getenv('POSTGRES_HOST'),
                    user=os.getenv('POSTGRES_USER'),
                    password=os.getenv('POSTGRES_PASSWORD'),
                    port=5432)
    return conn

def get_upload_data(request: Request):
    return request.session.get("upload_data")

# init login
@app.get('/login')
async def start_login():
    return client.redirect()

# ship specific page
@app.get("/ship/{id}", response_class=HTMLResponse)
def get_image(id: int, request: Request):
    user = request.session.get("discord_user")
    
    image_data = get_image_data(id)
    url_png = image_data[2] # change to send the url instead of the image
    
    return templates.TemplateResponse("ship.html", {"request": request, "image": image_data, "user": user, "url_png": url_png})

# delete user ship
@app.get("/delete/{id}", response_class=HTMLResponse)
def delete_image(id: int, request: Request):
    # Delete image information from the database based on the provided ID
    user = request.session.get("discord_user")
    # print(user)
    # conn = sqlite3.connect('example.db')
    conn = connect_to_server()
    cursor = conn.cursor()
    cursor.execute("SELECT submitted_by FROM images WHERE id=%s", (id,))
    image_data = cursor.fetchone()
    # print(image_data[0])
    if user != image_data[0]:
        # print("not allowed")
        conn.commit()
        conn.close()
        return RedirectResponse("/")
    cursor.execute("DELETE FROM images WHERE id=%s", (id,))
    conn.commit()
    conn.close()

    # Redirect to the home page after deleting the image
    return RedirectResponse("/")

# edit page get
@app.get("/edit/{id}", response_class=HTMLResponse)
def edit_image(id: int, request: Request):
    # Delete image information from the database based on the provided ID
    user = request.session.get("discord_user")
    # print(user)
    # conn = sqlite3.connect('example.db')
    conn = connect_to_server()
    cursor = conn.cursor()
    cursor.execute("SELECT submitted_by FROM images WHERE id=%s", (id,))
    image_data = cursor.fetchone()
    #print(image_data[0])
    if user != image_data[0]:
        # print("not allowed")
        conn.commit()
        conn.close()
        return RedirectResponse("/")
    cursor.execute("SELECT * FROM images WHERE id=%s", (id,))
    image_data = cursor.fetchone()
    conn.commit()
    conn.close()

    # Redirect to the home page after deleting the image
    return templates.TemplateResponse("edit.html", {"request": request, "image": image_data, "user": user})

# edit post
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
        # print("not allowed")
        conn.commit()
        conn.close()
        return RedirectResponse("/")
    # Prepare the data
    form_data = await request.form()
    # print("allowed")
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
        'mixed_weapons', 'painted', 'unpainted', 'splitter', 'utility_weapons', 'transformer', 'campaign_ship', 'factories'
    ]
    for i, column in enumerate(boolean_columns, start=8):
        if column in form_data:
            image_data[i] = 1
        else:
            image_data[i] = 0

    # Update the image data in the database
    columns = ['name', 'data', 'submitted_by', 'description', 'ship_name', 'author', 'price'] + boolean_columns + ['downloads'] + ['date']
    
    values = [image_data[1]] + [image_data[2]] + [image_data[3]] + image_data[4:8] + image_data[8:]
    query = f"UPDATE images SET {', '.join([f'{column}=%s' for column in columns])} WHERE id=%s"
    print(query)
    cursor.execute(query, tuple(values + [id]))

    # Commit and close the connection
    conn.commit()
    conn.close()

    # Redirect to the home page
    return RedirectResponse(url="/", status_code=303)

# login finish
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
                # print(user)
                return templates.TemplateResponse("initupload.html", {"request": request, "user": user})
    # redirect to join the server before uploading
    return templates.TemplateResponse("auth.html", {"request": request, "user": user})    

# Endpoint for uploading files
@app.post("/upload")
async def upload(request: Request):
    user = request.session.get("discord_user")
    form_data = await request.form()
    upload_image(form_data, user)
    return RedirectResponse(url="/", status_code=303)

# Endpoint for displaying the file initupload page
@app.get("/initupload", response_class=FileResponse)
async def upload_page(request: Request):
    user = request.session.get("discord_user")
    if not user:
        # print("DEBUG not a user upload")
        return RedirectResponse("/login")
    # print(user)
    return templates.TemplateResponse("initupload.html", {"request": request, "user": user})

# Endpoint for checking file and getting tags
@app.post("/initupload")
async def upload(request: Request, file: UploadFile = File(...)):
    # Read the image file
    contents = await file.read()
    # Encode the contents as base64
    encoded_data = base64.b64encode(contents).decode("utf-8")
    # push to imagebb to be able to read it
    url_png = upload_image_to_imgbb(encoded_data)
    # get the tags
    try:
        extractor = PNGTagExtractor()
        tags = extractor.extract_tags(url_png)
        author = extractor.extract_author(url_png)
    except Exception as e:
    # Redirect the user to the "badfile.html" page
        return templates.TemplateResponse("badfile.html", {"request": request})
        
    # Modify the file name to use authorized characters for HTML
    file_name = file.filename
    authorized_chars = re.sub(r'[^\w\-_.]', '_', file_name)

    shipname = authorized_chars
    if ".png" in shipname:
        shipname = authorized_chars.replace(".png", "")
    if ".ship" in shipname:
        shipname = shipname.replace(".ship", "")
    
    price = calculate_price(url_png)
    
    data = {
        'name': authorized_chars,
        # 'data': encoded_data,
        'url_png': url_png,
        'author' : author,
        'shipname': shipname,
        'price': price,
    }
    request.session["upload_data"] = data
    # Redirect to the index page
    return templates.TemplateResponse("upload.html", {"request": request, "data": data, "tags": tags})

@app.get("/download/{image_id}")
async def download_ship(image_id: str):
    # Call the update_downloads function with the ship_id
    

    # Logic to retrieve the file path and filename based on the image_id
    conn = connect_to_server()
    cursor = conn.cursor()
    cursor.execute("SELECT data, name FROM images WHERE id = %s", (image_id,))
    result = cursor.fetchone()  # Retrieve the first row of the query result
    # print(result)
    if result:
        image_url, filename = result
        cursor.close()
        conn.close()
        update_downloads(image_id)

        # Fetch the image content from the URL
        response = requests.get(image_url)
        if response.status_code == 200:
            # Set the appropriate content type based on the response headers
            content_type = response.headers.get("content-type", "application/octet-stream")
            
            # Return the image content as bytes
            return Response(content=response.content, media_type=content_type, headers={"Content-Disposition": f"attachment; filename={filename}"})
        else:
            return "Failed to fetch the image from the URL"
    else:
        # Handle the case when the image_id is not found
        cursor.close()
        conn.close()
        return "Image not found"

@app.get("/")
async def index(request: Request):
    user = request.session.get("discord_user")
    # print(user)
    if not user:
        # print("DEBUG not a user home")
        user = "Guest"
    # conn = sqlite3.connect('example.db')
    conn = connect_to_server()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM images')
    images = cursor.fetchall()
    conn.close()

    return templates.TemplateResponse("index.html", {"request": request, "images": images, "user": user})

# main page + search results
@app.post("/")
async def home(request: Request):
    user = request.session.get("discord_user")
    # print(user)
    if not user:
        # print("DEBUG not a user home")
        user = "Guest"

    # tag list
    TAGS = ['cannon', 'deck_cannon', 'emp_missiles', 'flak_battery', 'he_missiles', 'large_cannon', 'mines', 'nukes', 'railgun', 'ammo_factory', 'emp_factory', 'he_factory', 'mine_factory', 'nuke_factory', 'disruptors', 'heavy_laser', 'ion_beam', 'ion_prism', 'laser', 'mining_laser', 'point_defense', 'boost_thruster', 'airlock', 'campaign_factories', 'explosive_charges', 'fire_extinguisher', 'no_fire_extinguishers',
            'large_reactor', 'large_shield', 'medium_reactor', 'sensor', 'small_hyperdrive', 'small_reactor', 'small_shield', 'tractor_beams', 'hyperdrive_relay', 'bidirectional_thrust', 'mono_thrust', 'multi_thrust', 'omni_thrust', 'armor_defenses', 'mixed_defenses', 'shield_defenses', 'corvette', 'diagonal', 'flanker', 'mixed_weapons', 'painted', 'unpainted', 'splitter', 'utility_weapons', 'transformer']

    # get the form
    form_input = await request.form()
    # print("form", form_input) # debug
    
    # find the form data
    query: str = form_input.get("query").strip()
    
    # split query string
    words = query.lower().split(" ")
    
    # print("words", words)
    # init query
    query_tags = []
    for word in words:
        if word.startswith('-'):
            tag = word[1:]
            value = 0
            if tag in TAGS:
                query_tags.append((tag, value))
        else:
            tag = word
            value = 1
            if tag in TAGS:
                query_tags.append((tag, value))

    # print("post qt", query_tags) # debug
    # Build the SQL query based on the query tags
    query = "SELECT * FROM images"
    conditions = []
    args = []
    for tag, value in query_tags:
        conditions.append(f"{tag} = %s")
        args.append(value)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)
        
        
    # print("post cond", conditions) 
    # print("post arg", args)

    # Construct the query parameters for the search tags
    query_params = {}
    for tag, value in query_tags:
        query_params[tag] = str(value)

    # Get the base URL of the "search" endpoint
    base_url = request.url_for("search")

    # Construct the redirect URL with query parameters
    redirect_url = f"{base_url}?"
    redirect_url += urlencode(query_params)
    # print("redirect", redirect_url)

    # Redirect the user to the search route
    return RedirectResponse(redirect_url, status_code=307)


@app.get("/search")
def search(request: Request):
    user = request.session.get("discord_user")
    if not user:
        user = "Guest"

    # Get the query parameters from the request URL
    query_params = request.query_params

    # print("qp",query_params)
    # print("qp items",query_params.items())
    
    # Build the SQL query based on the search criteria
    query = "SELECT * FROM images"
    conditions = []
    args = []

        # searching ships
    TAGS = ['cannon', 'deck_cannon', 'emp_missiles', 'flak_battery', 'he_missiles', 'large_cannon', 'mines', 'nukes', 'railgun', 'ammo_factory', 'emp_factory', 'he_factory', 'mine_factory', 'nuke_factory', 'disruptors', 'heavy_laser', 'ion_beam', 'ion_prism', 'laser', 'mining_laser', 'point_defense', 'boost_thruster', 'airlock', 'campaign_factories', 'explosive_charges', 'fire_extinguisher', 'no_fire_extinguishers',
            'large_reactor', 'large_shield', 'medium_reactor', 'sensor', 'small_hyperdrive', 'small_reactor', 'small_shield', 'tractor_beams', 'hyperdrive_relay', 'bidirectional_thrust', 'mono_thrust', 'multi_thrust', 'omni_thrust', 'armor_defenses', 'mixed_defenses', 'shield_defenses', 'corvette', 'diagonal', 'flanker', 'mixed_weapons', 'painted', 'unpainted', 'splitter', 'utility_weapons', 'transformer']

    
    for tag, arg in query_params.items():
        if tag in TAGS:
            if arg.lower() == '1':
                conditions.append(f"{tag} = %s")
                args.append(1)
            elif arg.lower() == '0':
                conditions.append(f"{tag} = %s")
                args.append(0)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    # print(query_tags)
    # print("args",args)
    # print("query", query)

    conn = connect_to_server()
    cursor = conn.cursor()
    # Execute the query with the parameters
    cursor.execute(query, args)
    images = cursor.fetchall()
    conn.close()

    return templates.TemplateResponse("index.html", {"request": request, "images": images, "user": user})

@app.post("/search")
def search(request: Request):
    user = request.session.get("discord_user")
    if not user:
        user = "Guest"

    # Get the query parameters from the request URL
    query_params = request.query_params

    # print("qp",query_params)
    # print("qp items",query_params.items())
    
    # Build the SQL query based on the search criteria
    query = "SELECT * FROM images"
    conditions = []
    args = []

        # searching ships
    TAGS = ['cannon', 'deck_cannon', 'emp_missiles', 'flak_battery', 'he_missiles', 'large_cannon', 'mines', 'nukes', 'railgun', 'ammo_factory', 'emp_factory', 'he_factory', 'mine_factory', 'nuke_factory', 'disruptors', 'heavy_laser', 'ion_beam', 'ion_prism', 'laser', 'mining_laser', 'point_defense', 'boost_thruster', 'airlock', 'campaign_factories', 'explosive_charges', 'fire_extinguisher', 'no_fire_extinguishers',
            'large_reactor', 'large_shield', 'medium_reactor', 'sensor', 'small_hyperdrive', 'small_reactor', 'small_shield', 'tractor_beams', 'hyperdrive_relay', 'bidirectional_thrust', 'mono_thrust', 'multi_thrust', 'omni_thrust', 'armor_defenses', 'mixed_defenses', 'shield_defenses', 'corvette', 'diagonal', 'flanker', 'mixed_weapons', 'painted', 'unpainted', 'splitter', 'utility_weapons', 'transformer']

    
    for tag, arg in query_params.items():
        if tag in TAGS:
            if arg.lower() == '1':
                conditions.append(f"{tag} = %s")
                args.append(1)
            elif arg.lower() == '0':
                conditions.append(f"{tag} = %s")
                args.append(0)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    # print(query_tags)
    # print("args",args)
    # print("query", query)

    conn = connect_to_server()
    cursor = conn.cursor()
    # Execute the query with the parameters
    cursor.execute(query, args)
    images = cursor.fetchall()
    conn.close()

    return templates.TemplateResponse("index.html", {"request": request, "images": images, "user": user})




# Catch-all endpoint for serving static files or the index page
@app.get("/{catchall:path}")
def serve_files(request: Request):
    # Check if the requested file exists
    path = request.path_params["catchall"]
    file = 'templates/' + path
    # if os.path.exists(file):
    #     return FileResponse(file)
    # Otherwise, return the index file
    # index = 'templates/index.html'
    return RedirectResponse(url="/", status_code=303)

# session settings
app.add_middleware(SessionMiddleware, secret_key=os.getenv('secret_session'))
app.add_middleware(GZipMiddleware, minimum_size=1000)

# start server
if __name__ == '__main__':
    uvicorn.run(app)
