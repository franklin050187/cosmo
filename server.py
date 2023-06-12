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

import uvicorn
import re
from fastapi import FastAPI, Request, File, UploadFile, Response
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request
from starlette_discord.client import DiscordOAuthClient
from png_upload import upload_image_to_imgbb
from tagextractor import PNGTagExtractor
from db import ShipImageDatabase
from fastapi.middleware.gzip import GZipMiddleware
from pricegen import calculate_price
from urllib.parse import urlencode
import requests
from typing import List

load_dotenv()

db_manager = ShipImageDatabase()

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

#init db as array
db_manager.init_db()

# ship specific page
@app.get("/ship/{id}")
async def get_image(id: int, request: Request):
    user = request.session.get("discord_user")
    if not user:
        # print("DEBUG not a user home")
        user = "Guest"
    db_manager.download_ship_png(id)
    image_data = db_manager.get_image_data(id)
    url_png = image_data[0][2] # change to send the url instead of the image
    return templates.TemplateResponse("ship.html", {"request": request, "image": image_data, "user": user, "url_png": url_png})

# delete user ship
@app.get("/delete/{id}")
async def delete_image(id: int, request: Request):
    # Delete image information from the database based on the provided ID
    user = request.session.get("discord_user")
    # print(user)
    # conn = sqlite3.connect('example.db')
    check = db_manager.delete_ship(id, user)
    if check is not None:
        return RedirectResponse("/")
    # Redirect to the home page after deleting the image
    return RedirectResponse("/")

# edit page get
@app.get("/edit/{id}")
async def edit_image(id: int, request: Request):
    # Delete image information from the database based on the provided ID
    user = request.session.get("discord_user")
    check = db_manager.edit_ship(id, user)
    if check == "ko":
        return RedirectResponse("/")
    # Redirect to the home page after deleting the image
    return templates.TemplateResponse("edit.html", {"request": request, "image": check, "user": user})

# edit post
@app.post("/edit/{id}")
async def edit_image(id: int, request: Request):
    # Get the user from the session
    user = request.session.get("discord_user")
    form_data = await request.form()
    check = db_manager.post_edit_ship(id, form_data, user)
    if check == "ko":
        return RedirectResponse("/")
    return RedirectResponse(url="/", status_code=303)

# init login
@app.route('/login')
async def start_login(request: Request):
    button_clicked = request.query_params.get('button')
    if button_clicked == "upload":
        request.session["button_clicked"] = "upload"  # Store button state in the session
        user = request.session.get("discord_user")
        if not user:
            return client.redirect(request)
        else:
            return RedirectResponse("/initupload")  # Skip the login and redirect to initupload
    elif button_clicked == "myships":
        request.session["button_clicked"] = "myships"  # Store button state in the session
        user = request.session.get("discord_user")
        if not user:
            return client.redirect(request)
        return RedirectResponse("/myships")  # Redirect to the same login route
    else:
        request.session["button_clicked"] = "login"  # Store button state in the session
        return client.redirect("/login")  # Redirect to the same login route

# login finish
@app.get('/callback')
async def finish_login(request: Request):
    code = request.query_params.get('code')
    async with client.session(code) as session:
        user = await session.identify()
        guilds = await session.guilds()
        if not user:
            return RedirectResponse("/login")

        request.session["discord_user"] = str(user)
        desired_id = int(os.getenv('guild_id'))  # Excelsior server
        for guild in guilds:
            if guild.id == desired_id:
                redirect_url = "/"
                button_clicked = request.session.pop("button_clicked", None)  # Retrieve button state from the session
                if button_clicked == "upload":
                    redirect_url = "/initupload"
                elif button_clicked == "myships":
                    redirect_url = "/myships"
                return RedirectResponse(redirect_url)

    return templates.TemplateResponse("auth.html", {"request": request, "user": None})

# Endpoint for displaying the file initupload page
@app.get("/initupload", response_class=FileResponse)
async def upload_page(request: Request):
    user = request.session.get("discord_user")
    if not user:
        return RedirectResponse("/login")
    return templates.TemplateResponse("initupload.html", {"request": request, "user": user})

# Endpoint for displaying the file initupload page
@app.get("/inituploadmass", response_class=FileResponse)
async def upload_page(request: Request):
    user = request.session.get("discord_user")
    if not user:
        return RedirectResponse("/login")
    return templates.TemplateResponse("massupload.html", {"request": request, "user": user})

@app.post("/inituploadmass")
async def upload(request: Request, files: List[UploadFile] = File(...)):
    # Read the image file
    for file in files:
        try:
            contents = await file.read()
            # Encode the contents as base64
            encoded_data = base64.b64encode(contents).decode("utf-8")
            # push to imagebb to be able to read it (fallback is enabled)
            try:
                url_png = upload_image_to_imgbb(encoded_data)
            except Exception as e:
                print(f"Error extracting tags for file {file.filename}: {str(e)}")
                continue  # Skip the current file and proceed to the next one

            if url_png == "ko":
                print("Uploading error")
                error = 'upload servers are down, try again later'
                continue
            # get the tags
            try:
                extractor = PNGTagExtractor()
                tags = extractor.extract_tags(url_png)
                author = extractor.extract_author(url_png)
                # print("tags = ",tags)
            except Exception as e:
                print(f"Error extracting tags for file {file.filename}: {str(e)}")
                continue  # Skip the current file and proceed to the next one

            # Modify the file name to use authorized characters for HTML
            file_name = file.filename
            authorized_chars = re.sub(r'[^\w\-_.]', '_', file_name)

            shipname = authorized_chars
            if ".png" in shipname:
                shipname = authorized_chars.replace(".png", "")
            if ".ship" in shipname:
                shipname = shipname.replace(".ship", "")

            price = calculate_price(url_png)
            user = request.session.get("discord_user")
            form_data = {
                'name': authorized_chars,
                'data': url_png,
                'submitted_by': user,
                'description': "BATCH IMPORT: ship needs to be reviewed",
                'shipname': shipname,
                'author': author,
                'price': price,
                'tags': tags,
                'url_png': url_png,
                'filename' : authorized_chars,
                'ship_name' : shipname
            }

            db_manager.upload_image(form_data, user)
        except Exception as e:
            print(f"Error processing file {file.filename}: {str(e)}")
            continue  # Skip the current file and proceed to the next one
        
    # Redirect to the index page
    return RedirectResponse(url="/", status_code=303)

# Logoff route
@app.get('/logoff')
async def logoff(request: Request):
    request.session.pop("discord_user", None)
    return RedirectResponse("/")

# Endpoint for uploading files
@app.post("/upload")
async def upload(request: Request):
    user = request.session.get("discord_user")
    form_data = await request.form()
    db_manager.upload_image(form_data, user)
    return RedirectResponse(url="/", status_code=303)

# Endpoint for checking file and getting tags
@app.post("/initupload")
async def upload(request: Request, file: UploadFile = File(...)):
    # Read the image file
    contents = await file.read()
    # Encode the contents as base64
    encoded_data = base64.b64encode(contents).decode("utf-8")
    # push to imagebb to be able to read it (fallback is enabled)
    url_png = upload_image_to_imgbb(encoded_data)
    if url_png == "ko":
        print("Uploading error")
        error = 'upload servers are down, try again later'
        return templates.TemplateResponse("badfile.html", {"request": request, "error": error})
    # get the tags
    try:
        extractor = PNGTagExtractor()
        tags = extractor.extract_tags(url_png)
        author = extractor.extract_author(url_png)
        # print("tags = ",tags)
    except Exception as e:
        error = 'unable to decode file provided, check upload guide below'
        return templates.TemplateResponse("badfile.html", {"request": request, "error": error})
        
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
    # Logic to retrieve the file path and filename based on the image_id
    result = db_manager.download_ship_png(image_id)
    if result:
        image_url, filename = result
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
        return "Image not found"

@app.get("/")
async def index(request: Request):
    user = request.session.get("discord_user")
    # print(user)
    if not user:
        # print("DEBUG not a user home")
        user = "Guest"
    images = db_manager.get_index()

    return templates.TemplateResponse("index.html", {"request": request, "images": images, "user": user})

@app.get("/myships")
async def index(request: Request):
    user = request.session.get("discord_user")
    # print(user)
    if not user:
        # print("DEBUG not a user home")
        return RedirectResponse("/login?button=myships")
        
    images = db_manager.get_my_ships(user)

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
    print("form", form_input) # debug
    # find the form data
    query: str = form_input.get("query").strip()
    authorstrip: str = form_input.get("author").strip()
    # split query string
    words = query.lower().split(" ")
    # print("words", words)
    minstrip: int = form_input.get("min-price").strip()
    maxstrip: int = form_input.get("max-price").strip()
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
    if authorstrip :
        query_tags.append(("author", authorstrip))
    query_tags.append(("minprice", minstrip))
    query_tags.append(("maxprice", maxstrip))
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
async def search(request: Request):
    user = request.session.get("discord_user")
    if not user:
        user = "Guest"
    # Get the query parameters from the request URL
    query_params = request.query_params
    images = db_manager.get_search(query_params)
    print("query_param_get = ",query_params)
    return templates.TemplateResponse("index.html", {"request": request, "images": images, "user": user})

@app.post("/search")
async def search(request: Request):
    user = request.session.get("discord_user")
    if not user:
        user = "Guest"
    # Get the query parameters from the request URL
    query_params = request.query_params
    images = db_manager.get_search(query_params)
    print("query_param_post = ",query_params)
    return templates.TemplateResponse("index.html", {"request": request, "images": images, "user": user})

@app.get('/authors')
async def get_authors():
    query_result = db_manager.get_authors()
    print("query_result = ",query_result)
    authors = [author for author, in query_result['authors']]
    print("authors = ",authors)
    return {'authors': authors}

# Catch-all endpoint for serving static files or the index page
@app.get("/{catchall:path}")
async def serve_files(request: Request):
    user = request.session.get("discord_user")
    # print(user)
    if not user:
        # print("DEBUG not a user home")
        user = "Guest"
    return RedirectResponse(url="/", status_code=303)

# session settings
app.add_middleware(SessionMiddleware, secret_key=os.getenv('secret_session'))
app.add_middleware(GZipMiddleware, minimum_size=1000)

# start server
if __name__ == '__main__':
    uvicorn.run(app)
