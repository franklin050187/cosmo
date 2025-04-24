import ast
import base64
import math
import os
import re
import jwt
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlencode, urljoin

import requests
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, Path, Query
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

load_dotenv()

print("loading")

MAX_SHIPS_PER_PAGE = 24

SECRET_KEY = os.getenv("SECRET_KEY")
API_URL = os.getenv("API_URL")

# discord
client_id = os.getenv("discord_id")
client_secret = os.getenv("discord_secret")
redirect_uri = os.getenv("discord_redirect")
client = DiscordOAuthClient(client_id, client_secret, redirect_uri, ("identify", "guilds"))

# fastapi
app = FastAPI()

# static
static_path = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_path):
    app.mount("/static", StaticFiles(directory=static_path), name="static")
base_dir = os.path.dirname(__file__)
templates = Jinja2Templates(directory=os.path.join(base_dir, "templates"))

# generate user token
def create_token(user: str) -> str:
    """
    Create a secure token for adding a ship to favorites.
    The token is valid for 5 minutes and can only be used once.
    """
    payload = {
        "user": user,
        "iat": datetime.now(tz=timezone.utc),
        "exp": datetime.now(tz=timezone.utc) + timedelta(seconds=15),
     }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

@app.get("/robots.txt", response_class=PlainTextResponse)
def robots():
    """
    A function that returns the content for a robots.txt file.
    """
    data = """User-agent: *\nDisallow: \nCrawl-delay: 5"""
    return data


@app.get("/sitemap.xml")
async def get_sitemap():
    return FileResponse("static/sitemap.xml", media_type="application/xml")


@app.get("/ship/{ship_id}")
async def get_ship(request: Request, ship_id: int = Path(..., description="Id if the ship"), token: str = Query(None, description="Token for auth")):
# async def get_image(ship_id: int, request: Request): # API : need to pass user and ship_id and return ship data, fav + push on download and view
    user = request.session.get("discord_user")
    if not request.session.get("shipidsession"):
        shipidsession = []
        request.session["shipidsession"] = shipidsession
    else:
        shipidsession = request.session.get("shipidsession")

    if user:
        token = create_token(user=user)
    if not user:
        user = "Guest"

    base_path = f"/ship/{ship_id}"
    query_params = {'token': token} if token else {}

    # Build the full URL
    target = urljoin(API_URL, base_path)
    if query_params:
        target = f"{target}?{urlencode(query_params)}"

    response = requests.get(url=target)
    data = json.loads(response.content)
    page_info = data['data'][0]

    # if ship_id not in shipidsession: # FIXME
    #     request.session["shipidsession"].append(ship_id)
    #     db_manager.update_downloads(ship_id) # migrate
    # {"request": request, "images": images, "user": user, "maxpage": pages}
    return templates.TemplateResponse("ship.html", {"request": request, "data":page_info, "user":user, "ship_id":ship_id})


@app.get("/")  # DONE
async def index(request: Request):
    user = request.session.get("discord_user")
    if not user:
        user = "Guest"

    base_path = "/search"
    target = urljoin(API_URL, base_path)
    response = requests.get(url=target)
    data = json.loads(response.content)
    page_info = data['data']
    pages = data['max_page']

    return templates.TemplateResponse(
        "indexpop.html", {"request": request, "images": page_info, "user": user, "maxpage": pages}
    )

@app.get("/search")
async def search(request: Request):
    user = request.session.get("discord_user")
    if not user:
        user = "Guest"
    query_params = request.query_params
    base_path = "/search"
    target = urljoin(API_URL, base_path)
    if query_params:
        target = f"{target}?{urlencode(query_params)}"
    response = requests.get(url=target)
    data = json.loads(response.content)
    page_info = data['data']
    pages = data['max_page']
    return templates.TemplateResponse(
        "indexpop.html", {"request": request, "images": page_info, "user": user, "maxpage": pages}
    )

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
                request.session["brand"] = "exl"
                redirect_url = "/"
                button_clicked = request.session.pop(
                    "button_clicked", None
                )  # Retrieve button state from the session
                if button_clicked == "upload":
                    redirect_url = "/initupload"
                elif button_clicked == "myships":
                    redirect_url = "/myships"
                elif button_clicked == "myfavorite":
                    redirect_url = "/myfavorite"
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
                elif button_clicked == "myfavorite":
                    redirect_url = "/myfavorite"
                return RedirectResponse(redirect_url)
    return templates.TemplateResponse("auth.html", {"request": request, "user": None})


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


@app.get("/initupload", response_class=FileResponse)  # DONE
async def upload_page(request: Request):
    """
    A function to handle the "/initupload" route.
    Retrieves user and brand information from the request's session,
    checks and assigns the brand if not present, redirects to the login page
    if the user is not logged in, and returns a TemplateResponse with the "initupload.html"
    template along with the request, user, and brand data.
    """
    user = request.session.get("discord_user")
    if not user:
        return RedirectResponse("/login?button=upload")
    brand = request.session.get("brand")
    if not brand:
        brand = request.session.get("discord_server")
    return templates.TemplateResponse(
        "initupload.html", {"request": request, "user": user, "brand": brand}
    )


@app.get("/seo_about")
async def get_seo_about(request: Request):
    """display seo about page"""
    user = request.session.get("discord_user")
    if not user:
        user = "Guest"
    return templates.TemplateResponse("seo_about.html", {"request": request, "user": user})


# @app.get("/authors")
# async def get_authors():
#     """
#     Retrieves a list of authors from the database.

#     Returns:
#         dict: A dictionary containing the list of authors.

#     Example:
#         >>> await get_authors()
#         {'authors': ['John Doe', 'Jane Smith', 'Alice Johnson']}
#     """
#     query_result = db_manager.get_authors()
#     authors = [author for (author,) in query_result["authors"]]
#     return {"authors": authors}


@app.get("/analyze")
async def get_analyze(request: Request):
    """
    A route to analyze a URL and return the extracted tags.

    Parameters:
        request (Request): The HTTP request object.

    Returns:
        dict: A dictionary containing the extracted tags from the provided URL.
    """
    try:
        query_params = request.query_params
        print("query_params = ", query_params)
        url = query_params.get("url")
        datadata = extract_tags_v2(url, analyze=True)
        return {"datadata": datadata}
    except Exception:
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
