"""Copyright 2023 Poney!
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the “Software”), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.
THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE."""

import ast
import base64
import math
import os
import re
from urllib.parse import quote, urlencode

import requests
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import PlainTextResponse
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request
from starlette.responses import FileResponse, RedirectResponse, Response
from starlette.staticfiles import StaticFiles
from starlette.templating import Jinja2Templates
from starlette_discord.client import DiscordOAuthClient

from api_engine import extract_tags_v2
from db import ShipImageDatabase
from png_upload import upload_image_to_imgbb
from sitemap import generate_sitemap

load_dotenv()

print("loading")

db_manager = ShipImageDatabase()

client_id = os.getenv("discord_id")
client_secret = os.getenv("discord_secret")
redirect_uri = os.getenv("discord_redirect")
client = DiscordOAuthClient(client_id, client_secret, redirect_uri, ("identify", "guilds"))
api_uri = os.getenv("api_uri")
trusted_host = os.getenv("trusted_host")
app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")
db_manager.init_db()
modlist = os.getenv("mods_list")
modlist = ast.literal_eval(modlist)


@app.get("/robots.txt", response_class=PlainTextResponse)
def robots():
    """
    A function that returns the content for a robots.txt file.
    """
    data = """User-agent: *\nDisallow: \nCrawl-delay: 5"""
    return data


@app.get("/sitemap.xml")
async def get_sitemap():
    """
    A function that generates the sitemap.xml file by writing the output
    of generate_sitemap() to 'static/sitemap.xml'.
    If an exception occurs during the file write operation, it serves the static file.
    Returns a FileResponse object for the sitemap.xml file.
    """
    try:
        with open("static/sitemap.xml", "w", encoding="utf-8") as f:
            f.write(generate_sitemap())
    except Exception as e:
        # not writable access, serve static file
        print(e)
    return FileResponse("static/sitemap.xml", media_type="application/xml")


@app.get("/ship/{ship_id}")
async def get_image(ship_id: int, request: Request):
    """
    A function that handles the retrieval of an image based on the provided ID.
    It checks user session data, manages favorites, updates session information,
    retrieves image data from the database, handles API requests for analysis,
    and returns a template response with relevant data for the ship image page.
    Parameters:
        id (int): The ID of the image to retrieve.
        request (Request): The request object containing session and query data.
    Returns:
        templates.TemplateResponse: The response containing data for rendering the ship image page.
    """
    user = request.session.get("discord_user")
    if not request.session.get("shipidsession"):
        shipidsession = []
        request.session["shipidsession"] = shipidsession
    else:
        shipidsession = request.session.get("shipidsession")
    fav = 0
    if user:
        litsid = db_manager.get_my_favorite(user)
        ids = [item[0] for item in litsid]
        if ship_id in ids:
            fav = 1
    if not user:
        user = "Guest"
    if ship_id not in shipidsession:
        request.session["shipidsession"].append(ship_id)
        db_manager.update_downloads(ship_id)
    brand = request.session.get("brand")
    if not brand:
        brand = "gen"
    image_data = db_manager.get_image_data(ship_id)
    url_png = image_data[0][2]  # change to send the url instead of the image
    datadata = {}
    query_params = request.query_params
    isanalyze = query_params.get("analyze")
    if isanalyze == "1":
        try:
            rs = extract_tags_v2(url_png, analyze=True)
        except Exception as e:
            print(e)
            rs = None
        datadata = rs
        return templates.TemplateResponse(
            "ship.html",
            {
                "request": request,
                "image": image_data,
                "user": user,
                "url_png": url_png,
                "modlist": modlist,
                "fav": fav,
                "brand": brand,
                "datadata": datadata,
            },
        )
    return templates.TemplateResponse(
        "ship.html",
        {
            "request": request,
            "image": image_data,
            "user": user,
            "url_png": url_png,
            "modlist": modlist,
            "fav": fav,
            "brand": brand,
            "datadata": datadata,
        },
    )


@app.get("/delete/{ship_id}")
async def delete_image(ship_id: int, request: Request):
    """
    Delete image information from the database based on the provided ID.

    Parameters:
        id (int): The ID of the image to be deleted.
        request (Request): The HTTP request object.

    Returns:
        RedirectResponse: A redirect response to the home page if the image is successfully deleted.
    """
    user = request.session.get("discord_user")
    check = db_manager.delete_ship(ship_id, user)
    if check is not None:
        return RedirectResponse("/")
    return RedirectResponse("/")


@app.get("/favorite/{ship_id}")
async def favorite(ship_id: int, request: Request):
    """
    Adds a ship to the user's favorites and redirects to the ship page.

    Parameters:
        ship_id (int): The ID of the ship to be added to favorites.
        request (Request): The HTTP request object.

    Returns:
        RedirectResponse: A redirect response to the ship page if the user is logged in.
    """
    user = request.session.get("discord_user")
    if not user:
        return RedirectResponse("/login")
    user = request.session.get("discord_user")
    db_manager.add_to_favorites(user, ship_id)
    db_manager.add_fav(ship_id)
    url = "/ship/" + str(ship_id)
    return RedirectResponse(url)


@app.get("/rmfavorite/{ship_id}")
async def rmfavorite(ship_id: int, request: Request):
    """
    Remove a ship from the user's favorites and redirect to the ship page.

    Parameters:
        ship_id (int): The ID of the ship to be removed from favorites.
        request (Request): The HTTP request object.

    Returns:
        RedirectResponse: A redirect response to the ship page if the user is logged in.
    """
    user = request.session.get("discord_user")
    if not user:
        return RedirectResponse("/login")
    user = request.session.get("discord_user")
    db_manager.delete_from_favorites(user, ship_id)
    db_manager.remove_fav(ship_id)
    url = "/ship/" + str(ship_id)
    return RedirectResponse(url)


@app.get("/myfavorite")
async def myfavorite(request: Request):
    """
    A function to handle the "/myfavorite" route.

    Parameters:
        request (Request): The HTTP request object.

    Returns:
        TemplateResponse: A response based on user's favorite images and brand.
    """
    user = request.session.get("discord_user")
    if not user:
        return RedirectResponse("/login?button=myfavorite")
    images = db_manager.get_my_favorite(user)
    if not request.session.get("brand"):
        brand = "gen"
        request.session["brand"] = brand
    brand = request.session.get("brand")
    if brand == "exl":
        return templates.TemplateResponse(
            "index.html", {"request": request, "images": images, "user": user}
        )
    else:
        rows = db_manager.get_my_favorite_pages(user)
        # pages is number of row / 60 int up
        pages = math.ceil(rows[0][0] / 60)
        return templates.TemplateResponse(
            "indexpop.html", {"request": request, "images": images, "user": user, "maxpage": pages}
        )


@app.get("/edit/{ship_id}")
async def edit_image(ship_id: int, request: Request):
    """
    Replace image information from the database based on the provided ID
    """
    # Delete image information from the database based on the provided ID
    user = request.session.get("discord_user")
    check = db_manager.edit_ship(ship_id, user)
    if check == "ko":
        return RedirectResponse("/")
    brand = request.session.get("brand")
    if not brand:
        brand = request.session.get("discord_server")
    print(check)
    # Redirect to the home page after deleting the image
    return templates.TemplateResponse(
        "edit.html", {"request": request, "image": check, "user": user, "brand": brand}
    )


@app.post("/edit/{ship_id}")
async def edit_image_post(ship_id: int, request: Request):
    """
    Edit an image in the database based on the provided ship ID.

    Parameters:
        ship_id (int): The ID of the ship to be edited.
        request (Request): The request object containing the session and form data.

    Returns:
        RedirectResponse: A redirect response to the home page if the edit is successful,
        or to the home page if the edit fails.

    Raises:
        None.
    """
    user = request.session.get("discord_user")
    form_data = await request.form()
    check = db_manager.post_edit_ship(ship_id, form_data, user)
    if check == "ko":
        return RedirectResponse("/")
    return RedirectResponse(url="/", status_code=303)


@app.get("/update/{ship_id}")
async def update_image(ship_id: int, request: Request):
    """
    Update image information from the database based on the provided ID

    Parameters:
        ship_id (int): The ID of the ship to be updated.
        request (Request): The HTTP request object containing user information.

    Returns:
        TemplateResponse: A response containing the update page with relevant data.
    """
    user = request.session.get("discord_user")
    check = db_manager.edit_ship(ship_id, user)
    if check == "ko":
        return RedirectResponse("/")  # this should be an "you dont have the rights" page
    brand = request.session.get("brand")
    if not brand:
        brand = request.session.get("discord_server")
    if not user:
        return RedirectResponse("/login")
    return templates.TemplateResponse(
        "update.html", {"request": request, "image": check, "user": user, "brand": brand}
    )


@app.post("/update/{ship_id}")
async def upload_update(ship_id: int, request: Request, file: UploadFile = File(...)):
    """
    A function to handle the upload of an image update for a ship.

    Parameters:
        ship_id (int): The ID of the ship to be updated.
        request (Request): The HTTP request object containing user information.
        file (UploadFile): The file object containing the image to be uploaded.

    Returns:
        RedirectResponse: Redirects to the edit page of the ship with status code 303.
    """
    user = request.session.get("discord_user")
    check = db_manager.edit_ship(ship_id, user)
    if check == "ko":
        return RedirectResponse("/")  # this should be an "you dont have the rights" page
    contents = await file.read()
    encoded_data = base64.b64encode(contents).decode("utf-8")
    url_png = upload_image_to_imgbb(encoded_data)
    if url_png == "ko":
        error = "upload servers are down, try again later"
        return templates.TemplateResponse("badfile.html", {"request": request, "error": error})
    # get the tags
    try:
        dataextract = extract_tags_v2(url_png)
        tags = dataextract[0]
        crew = dataextract[2]
        price = dataextract[3]

    except Exception:
        error = "unable to decode file provided, check upload guide below"
        return templates.TemplateResponse("badfile.html", {"request": request, "error": error})

    file_name = file.filename
    authorized_chars = re.sub(r"[^\w\-_.]", "_", file_name)
    shipname = authorized_chars
    if ".png" in shipname:
        shipname = authorized_chars.replace(".png", "")
    if ".ship" in shipname:
        shipname = shipname.replace(".ship", "")
    brand = request.session.get("brand")
    if not brand:
        brand = request.session.get("discord_server")
    data = {
        "id": ship_id,
        "url_png": url_png,
        "price": price,
        "crew": crew,
        "tags": tags,
    }
    db_manager.upload_update(data)
    return RedirectResponse(url="/edit/" + str(ship_id), status_code=303)


@app.route("/login")
async def start_login(request: Request):
    """
    Function that handles the login route based on the button clicked,
    storing the button state in the session
    and redirecting the user accordingly. Returns different redirects based on the button clicked.
    """
    button_clicked = request.query_params.get("button")
    if button_clicked == "upload":
        request.session["button_clicked"] = "upload"  # Store button state in the session
        user = request.session.get("discord_user")
        if not user:
            return client.redirect(request)
        return RedirectResponse("/initupload")  # Skip the login and redirect to initupload
    if button_clicked == "myships":
        request.session["button_clicked"] = "myships"  # Store button state in the session
        user = request.session.get("discord_user")
        if not user:
            return client.redirect(request)
        return RedirectResponse("/myships")  # Redirect to the same login route
    if button_clicked == "myfavorite":
        request.session["button_clicked"] = "myfavorite"  # Store button state in the session
        user = request.session.get("discord_user")
        if not user:
            return client.redirect(request)
        return RedirectResponse("/myfavorite")  # Redirect to the same login route
    request.session["button_clicked"] = "login"  # Store button state in the session
    return client.redirect("/login")  # Redirect to the same login route


@app.get("/callback")
async def finish_login(request: Request):
    """
    Function that handles the callback route after the user has logged in.
    """
    code = request.query_params.get("code")
    async with client.session(code) as session:
        user = await session.identify()
        guilds = await session.guilds()
        if not user:
            return RedirectResponse("/login")

        request.session["discord_user"] = str(user)
        desired_id = (
            546229904488923141  # Excelsior server 546229904488923141 / Cosmoteer 314103695568666625
        )
        second_id = 314103695568666625
        for guild in guilds:
            if guild.id == desired_id:
                request.session["discord_server"] = "exl"
                redirect_url = "/"
                button_clicked = request.session.pop(
                    "button_clicked", None
                )  # Retrieve button state from the session
                if button_clicked == "upload":
                    redirect_url = "/initupload"
                elif button_clicked == "myships":
                    redirect_url = "/myships"
                return RedirectResponse(redirect_url)
        for guild in guilds:  # to ensure higher privilege
            if guild.id == second_id:
                request.session["discord_server"] = "gen"
                redirect_url = "/"
                button_clicked = request.session.pop(
                    "button_clicked", None
                )  # Retrieve button state from the session
                if button_clicked == "upload":
                    redirect_url = "/initupload"
                elif button_clicked == "myships":
                    redirect_url = "/myships"
                return RedirectResponse(redirect_url)
    return templates.TemplateResponse("auth.html", {"request": request, "user": None})


@app.get("/initupload", response_class=FileResponse)
async def upload_page(request: Request):
    """
    A function to handle the "/initupload" route.
    Retrieves user and brand information from the request's session,
    checks and assigns the brand if not present, redirects to the login page
    if the user is not logged in, and returns a TemplateResponse with the "initupload.html"
    template along with the request, user, and brand data.
    """
    user = request.session.get("discord_user")
    brand = request.session.get("brand")
    if not brand:
        brand = request.session.get("discord_server")
    if not user:
        return RedirectResponse("/login")
    return templates.TemplateResponse(
        "initupload.html", {"request": request, "user": user, "brand": brand}
    )


@app.get("/logoff")
async def logoff(request: Request):
    """
    Logs off the user by removing the "discord_user" key from the session.

    Parameters:
        request (Request): The HTTP request object.

    Returns:
        RedirectResponse: A redirect response to the root URL ("/").
    """
    request.session.pop("discord_user", None)
    return RedirectResponse("/")


@app.post("/upload")
async def upload(request: Request):
    """
    Uploads an image to the server.

    Parameters:
        request (Request): The HTTP request object.

    Returns:
        RedirectResponse: A redirect response to the root URL ("/").
    """
    user = request.session.get("discord_user")
    form_data = await request.form()
    db_manager.upload_image(form_data, user)
    return RedirectResponse(url="/", status_code=303)


@app.post("/initupload")
async def init_upload(request: Request, file: UploadFile = File(...)):
    """
    A function to handle the initial upload of an image.

    Parameters:
        request (Request): The HTTP request object.
        file (UploadFile): The file object containing the image to be uploaded.

    Returns:
        TemplateResponse: A response containing the uploaded image data and metadata.
    """
    contents = await file.read()
    encoded_data = base64.b64encode(contents).decode("utf-8")
    url_png = upload_image_to_imgbb(encoded_data)
    if url_png == "ko":
        error = "upload servers are down, try again later"
        return templates.TemplateResponse("badfile.html", {"request": request, "error": error})
    try:
        tags, author, crew, price = extract_tags_v2(url_png)
    except Exception:
        error = "unable to decode file provided, check upload guide below"
        return templates.TemplateResponse("badfile.html", {"request": request, "error": error})
    file_name = file.filename
    authorized_chars = re.sub(r"[^\w\-_.]", "_", file_name)
    shipname = authorized_chars
    if ".png" in shipname:
        shipname = authorized_chars.replace(".png", "")
    if ".ship" in shipname:
        shipname = shipname.replace(".ship", "")
    brand = request.session.get("brand")
    if not brand:
        brand = request.session.get("discord_server")
    data = {
        "name": authorized_chars,
        "url_png": url_png,
        "author": author,
        "shipname": shipname,
        "price": price,
        "brand": brand,
        "crew": crew,
    }
    request.session["upload_data"] = data
    return templates.TemplateResponse(
        "upload.html",
        {"request": request, "data": data, "tags": tags, "brand": brand, "crew": crew},
    )


@app.get("/download/{image_id}")
async def download_ship(image_id: str):
    """
    Downloads a ship image based on the given image ID.

    Args:
        image_id (str): The ID of the image to download.

    Returns:
        Response: The downloaded image as a response with the appropriate content type and filename.
        str: If the image ID is not found or the image cannot be fetched from the URL.

    Raises:
        None
    """
    # Logic to retrieve the file path and filename based on the image_id
    result = db_manager.download_ship_png(image_id)
    if result:
        image_url, filename = result
        # Fetch the image content from the URL
        response = requests.get(image_url, timeout=30)
        if response.status_code == 200:
            # Set the appropriate content type based on the response headers
            content_type = response.headers.get("content-type", "application/octet-stream")

            # Encode the filename with UTF-8 and quote special characters
            encoded_filename = quote(filename.encode("utf-8"))

            # Use the 'filename*' parameter to specify UTF-8 encoding
            headers = {"Content-Disposition": f"attachment; filename={encoded_filename}"}

            # Return the image content as bytes with the encoded filename
            return Response(content=response.content, media_type=content_type, headers=headers)
        return "Failed to fetch the image from the URL"
    return "Image not found"


@app.get("/")
async def index(request: Request):
    """
    Handle the root route ("/") and render the appropriate template based on the user's brand.

    Parameters:
        request (Request): The HTTP request object.

    Returns:
        TemplateResponse: The rendered template with the appropriate images and user information.
    """
    if not request.session.get("brand"):
        brand = "gen"
        request.session["brand"] = brand
    brand = request.session.get("brand")
    user = request.session.get("discord_user")
    if not user:
        user = "Guest"
    if brand == "exl":
        images = db_manager.get_index_exl()
        return templates.TemplateResponse(
            "index.html", {"request": request, "images": images, "user": user}
        )
    images = db_manager.get_index()
    rows = db_manager.get_pages()
    # pages is number of row / 60 int up
    pages = math.ceil(rows[0][0] / 60)
    # print(pages)
    return templates.TemplateResponse(
        "indexpop.html", {"request": request, "images": images, "user": user, "maxpage": pages}
    )


@app.get("/gen")
async def index_gen(request: Request):
    """
    sets the brand to gen on the session
    """
    brand = "gen"
    if not request.session.get("brand"):
        request.session["brand"] = brand
    else:
        request.session["brand"] = brand
    return RedirectResponse(url="/", status_code=303)


@app.get("/exl")
async def index_exl(request: Request):
    """
    sets the brand to exl on the session
    """
    brand = "exl"
    if not request.session.get("brand"):
        request.session["brand"] = brand
    else:
        request.session["brand"] = brand
    return RedirectResponse(url="/", status_code=303)


@app.get("/myships")
async def index_get(request: Request):
    """
    A function to handle the "/myships" route, retrieves user information, images, and brand to
    render the appropriate template.
    """
    user = request.session.get("discord_user")
    if not user:
        return RedirectResponse("/login?button=myships")
    images = db_manager.get_my_ships(user)
    if not request.session.get("brand"):
        brand = "gen"
        request.session["brand"] = brand
    brand = request.session.get("brand")
    if brand == "exl":
        return templates.TemplateResponse(
            "index.html", {"request": request, "images": images, "user": user}
        )
    rows = db_manager.get_my_ships_pages(user)
    # pages is number of row / 60 int up
    pages = math.ceil(rows[0][0] / 60)
    return templates.TemplateResponse(
        "indexpop.html", {"request": request, "images": images, "user": user, "maxpage": pages}
    )


@app.post("/")
async def home(request: Request):
    """
    A function to handle the "/" route, processes form input to build a SQL query
    based on search tags, constructs a redirect URL with query parameters, and redirects
    the user to the search route.

    Parameters:
    - request: Request object containing information about the incoming request.

    Return Type:
    - RedirectResponse: Redirects the user to the search route with the constructed
    query parameters.
    """
    user = request.session.get("discord_user")
    fulltext = None
    ftauthor = None
    if not user:
        user = "Guest"
    tags_list = [
        "cannon",
        "deck_cannon",
        "emp_missiles",
        "flak_battery",
        "he_missiles",
        "large_cannon",
        "mines",
        "nukes",
        "railgun",
        "ammo_factory",
        "emp_factory",
        "he_factory",
        "mine_factory",
        "nuke_factory",
        "disruptors",
        "heavy_laser",
        "ion_beam",
        "ion_prism",
        "laser",
        "mining_laser",
        "point_defense",
        "boost_thruster",
        "airlock",
        "campaign_factories",
        "explosive_charges",
        "fire_extinguisher",
        "no_fire_extinguishers",
        "chaingun",
        "large_reactor",
        "large_shield",
        "medium_reactor",
        "sensor",
        "small_hyperdrive",
        "large_hyperdrive",
        "rocket_thruster",
        "small_reactor",
        "small_shield",
        "tractor_beams",
        "hyperdrive_relay",
        "bidirectional_thrust",
        "mono_thrust",
        "multi_thrust",
        "omni_thrust",
        "no_thrust",
        "armor_defenses",
        "mixed_defenses",
        "shield_defenses",
        "no_defenses",
        "kiter",
        "diagonal",
        "avoider",
        "mixed_weapons",
        "painted",
        "unpainted",
        "splitter",
        "utility_weapons",
        "rammer",
        "orbiter",
        "campaign_ship",
        "builtin",
        "elimination_ship",
        "domination_ship",
        "scout/racer",
        "broadsider",
        "waste_ship",
        "debugging_tool",
        "sundiver",
        "cargo_ship",
        "spinner",
    ]
    form_input = await request.form()
    query: str = form_input.get("query").strip()
    authorstrip: str = form_input.get("author").strip()
    orderstrip: str = form_input.get("order").strip()
    words = query.lower().split(" ")
    descstrip: str = form_input.get("desc").strip()
    minstrip: int = form_input.get("min-price").strip()
    maxstrip: int = form_input.get("max-price").strip()
    crewstrip: int = form_input.get("max-crew").strip()
    query_tags = []
    for word in words:
        if word.startswith("-"):
            tag = word[1:]
            value = 0
            if tag in tags_list:
                query_tags.append((tag, value))
        elif word.startswith("fulltext="):
            fulltext = word[9:]
        elif word.startswith("ftauthor="):
            ftauthor = word[9:]
        else:
            tag = word
            value = 1
            if tag in tags_list:
                query_tags.append((tag, value))
    if fulltext:
        query_tags.append(("fulltext", fulltext))
    if ftauthor:
        query_tags.append(("ftauthor", ftauthor))
    if authorstrip:
        query_tags.append(("author", authorstrip))
    if descstrip:
        query_tags.append(("desc", descstrip))
    if orderstrip:
        query_tags.append(("order", orderstrip))
    if not orderstrip:
        query_tags.append(("order", "new"))
    if crewstrip:
        query_tags.append(("max-crew", crewstrip))
    query_tags.append(("minprice", minstrip))
    query_tags.append(("maxprice", maxstrip))
    query = "SELECT * FROM images"
    conditions = []
    args = []
    for tag, value in query_tags:
        conditions.append(f"{tag} = %s")
        args.append(value)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query_params = {}
    for tag, value in query_tags:
        query_params[tag] = str(value)
    base_url = request.url_for("search")
    redirect_url = f"{base_url}?"
    redirect_url += urlencode(query_params)
    return RedirectResponse(redirect_url, status_code=307)


@app.get("/search")
async def search(request: Request):
    """
    Handle the "/search" route to retrieve and display search results based on query parameters.

    Parameters:
        request (Request): The HTTP request object containing session and query parameters.

    Returns:
        TemplateResponse: The rendered template with search results and user information.
    """
    user = request.session.get("discord_user")
    if not user:
        user = "Guest"
    query_params = request.query_params
    if not request.session.get("brand"):
        brand = "gen"
        request.session["brand"] = brand
    brand = request.session.get("brand")
    if brand == "exl":
        images = db_manager.get_search_exl(query_params)
        return templates.TemplateResponse(
            "index.html", {"request": request, "images": images, "user": user}
        )
    images = db_manager.get_search(query_params)
    rows = db_manager.get_pages_search(query_params)
    pages = math.ceil(rows[0][0] / 60)
    return templates.TemplateResponse(
        "indexpop.html", {"request": request, "images": images, "user": user, "maxpage": pages}
    )


@app.post("/search")
async def search_post(request: Request):
    """
    Handle the "/search" route to retrieve and display search results based on query parameters.

    Parameters:
        request (Request): The HTTP request object containing session and query parameters.

    Returns:
        TemplateResponse: The rendered template with search results and user information.
    """
    user = request.session.get("discord_user")
    if not user:
        user = "Guest"
    # Get the query parameters from the request URL
    query_params = request.query_params

    # print("query_param_post = ",query_params)
    if not request.session.get("brand"):
        brand = "gen"
        request.session["brand"] = brand
    brand = request.session.get("brand")
    if brand == "exl":
        images = db_manager.get_search_exl(query_params)
        return templates.TemplateResponse(
            "index.html", {"request": request, "images": images, "user": user}
        )
    else:
        images = db_manager.get_search(query_params)
        rows = db_manager.get_pages_search(query_params)
        # pages is number of row / 60 int up
        pages = math.ceil(rows[0][0] / 60)
        return templates.TemplateResponse(
            "indexpop.html", {"request": request, "images": images, "user": user, "maxpage": pages}
        )

@app.get("/seo_tags")
async def get_seo_tags(request: Request):
    """display seo tags"""
    user = request.session.get("discord_user")
    if not user:
        user = "Guest"
    return templates.TemplateResponse(
            "seo_tags.html", {"request": request, "user": user}
    )

@app.get("/authors")
async def get_authors():
    """
    Retrieves a list of authors from the database.

    Returns:
        dict: A dictionary containing the list of authors.

    Example:
        >>> await get_authors()
        {'authors': ['John Doe', 'Jane Smith', 'Alice Johnson']}
    """
    query_result = db_manager.get_authors()
    authors = [author for (author,) in query_result["authors"]]
    return {"authors": authors}

@app.get("/analyze")
async def get_analyze(request: Request):
    """
    A route to analyze a URL and return the extracted tags.
    
    Parameters:
        request (Request): The HTTP request object.
    
    Returns:
        dict: A dictionary containing the extracted tags from the provided URL.
    """
    try :
        query_params = request.query_params
        print("query_params = ",query_params)
        url = query_params.get("url")
        datadata = extract_tags_v2(url, analyze=True)
        return {"datadata": datadata}
    except Exception :
        return {"datadata": "Error"}

@app.get("/{catchall:path}")
async def serve_files(request: Request):
    """
    Redirects the user to the root URL ("/") if they are not authenticated.

    Parameters:
        request (Request): The HTTP request object.

    Returns:
        RedirectResponse: A redirect response to the root URL ("/").
    """
    user = request.session.get("discord_user")
    if not user:
        user = "Guest"
    return RedirectResponse(url="/", status_code=303)


# session settings
app.add_middleware(SessionMiddleware, secret_key=os.getenv("secret_session"))
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])
app.add_middleware(HTTPSRedirectMiddleware)
# start server
if __name__ == "__main__":
    # uvicorn.run(app, host="0.0.0.0", port=8000, proxy_headers=True, forwarded_allow_ips="*")
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        proxy_headers=True,
        forwarded_allow_ips="*",
        workers=5,
    )
