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
from fastapi.responses import JSONResponse, RedirectResponse
from api_engine import extract_tags_v2

load_dotenv()

print("loading")


SECRET_KEY = os.getenv("SECRET_KEY")
API_URL = os.getenv("API_URL")
GIST_ID = os.getenv("GIST_ID")

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


@app.get("/ship/{ship_id}") # TODO : use json instead of api
async def get_ship(request: Request, ship_id: int = Path(..., description="Id if the ship"), token: str = Query(None, description="Token for auth")):
    try :
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

        response = requests.get(url=target) # TODO : update to use json data instead of api
        data = json.loads(response.content)
        try :
            page_info = data["data"][0]
        except :
            return RedirectResponse("/")

        try :
            if ship_id not in shipidsession: # FIXME
                request.session["shipidsession"].append(ship_id)
                base_path = f"/ship/{ship_id}/adddl"
                target = urljoin(API_URL, base_path)
                requests.post(url=target)
        except :
            pass
        return templates.TemplateResponse("ship.html", {"request": request, "data":page_info, "user":user, "ship_id":ship_id})
    except Exception:
        return templates.TemplateResponse("error.html", {"request": request}, status_code=500)


@app.get("/")  # DONE
async def index(request: Request):
    try :
        user = request.session.get("discord_user")
        if not user:
            user = "Guest"
        return templates.TemplateResponse(
            "indexpop.html", {"request": request, "user": user, "API_URL": API_URL, "GIST_ID": GIST_ID} # TODO : update to use json data instead of api - this one is done in js in the template
        )
    except Exception:
        return templates.TemplateResponse("error.html", {"request": request}, status_code=500)

@app.get("/search")
async def search(request: Request):
    try :
        user = request.session.get("discord_user")
        if not user:
            user = "Guest"
        return templates.TemplateResponse(
            "indexpop.html", {"request": request, "user": user, "API_URL": API_URL, "GIST_ID": GIST_ID} # TODO : update to use json data instead of api - should be fixed with get / route
        )
    except Exception:
        return templates.TemplateResponse("error.html", {"request": request}, status_code=500)

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

@app.get("/initupload", response_class=FileResponse) # show upload page
async def upload_page(request: Request):
    user = request.session.get("discord_user")
    if not user:
        return RedirectResponse("/login?button=upload")
    brand = request.session.get("brand")
    # wakeup the api
    requests.get(url=API_URL)
    if not brand:
        brand = request.session.get("discord_server")
    return templates.TemplateResponse(
        "initupload.html", {"request": request, "user": user, "brand": brand}
    )

# @app.post("/initupload", response_class=FileResponse) # FIXME: redirect to edit page
# async def upload_api(request: Request, file: UploadFile = File(...)):
#     user = request.session.get("discord_user")
#     if not user:
#         return RedirectResponse("/login?button=upload")
#     brand = request.session.get("brand")
#     if not brand:
#         brand = request.session.get("discord_server")
#     contents = await file.read() # get the file
#     encoded_data = base64.b64encode(contents).decode("utf-8") # convert to base64
#     token = create_token(user=user) # get a token to use for the api call
#     # call the api and read response
#     base_path = "/insert_ship"
#     json_data = {'token': token, 'image': encoded_data}

#     # Build the full URL
#     target = urljoin(API_URL, base_path)
#     response = requests.post(url=target, json=json_data)
#     data = json.loads(response.content)
#     try :
#         ship_id = data["data"]["ship_id"]
#     except :
#         ship_id = None

#     if ship_id:
#         # add purge
#         return RedirectResponse(url=f"/edit/{ship_id}", status_code=303)

#     error = "unable to decode file provided, check upload guide below"
#     return templates.TemplateResponse("badfile.html", {"request": request, "error": error})

@app.post("/initupload")
async def upload_api(request: Request, file: UploadFile = File(...)):
    user = request.session.get("discord_user")
    if not user:
        return JSONResponse({"error": "login_required"}, status_code=401)

    brand = request.session.get("brand") or request.session.get("discord_server")

    contents = await file.read()
    encoded_data = base64.b64encode(contents).decode("utf-8")
    token = create_token(user=user)
    base_path = "/insert_ship"
    json_data = {"token": token, "image": encoded_data}

    target = urljoin(API_URL, base_path)

    try:
        response = requests.post(url=target, json=json_data, timeout=30)
        data = response.json()
        ship_id = data.get("data", {}).get("ship_id")
        if ship_id:
            return JSONResponse({"ship_id": ship_id})
        else:
            return JSONResponse({"error": "unable_to_decode"}, status_code=400)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/edit/{ship_id}")
async def edit_ship(request: Request, ship_id: int = Path(..., description="Id if the ship"), token: str = Query(None, description="Token for auth")):
    user = request.session.get("discord_user")
    if user:
        token = create_token(user=user)
    if not user:
        # send to home as not the owner
        return RedirectResponse(url="/", status_code=303)

    base_path = f"/ship/{ship_id}"
    query_params = {'token': token} if token else {}

    # Build the full URL
    target = urljoin(API_URL, base_path)
    if query_params:
        target = f"{target}?{urlencode(query_params)}"

    response = requests.get(url=target)
    data = json.loads(response.content)
    try :
        page_info = data["data"][0]
    except :
        return RedirectResponse("/")
    if page_info["is_owner"] == 0:
        return RedirectResponse(f"/ship/{ship_id}")
    return templates.TemplateResponse("edit.html", {"request": request, "image":page_info, "user":user, "ship_id":ship_id})

@app.post("/edit/{ship_id}")
async def send_edit(request: Request, ship_id: int = Path(..., description="Id if the ship")):
    user = request.session.get("discord_user")
    if not user: # if no user return to ship page
        return RedirectResponse(f"/ship/{ship_id}", status_code=303)
    
    # send data from the form
    form_data = await request.form()
    token = create_token(user=user) # get a token to use for the api call
    
    # Convert form data to dict and prepare for API
    form_dict = dict(form_data)
    # Ensure tags are properly formatted as a list
    if 'tags' in form_dict:
        form_dict['tags'] = form_dict['tags'].strip("[]").replace("'", "").split(", ")
    
    # Prepare API request
    base_path = f"/edit/{ship_id}"
    json_data = {
        'token': token,
        'data': form_dict
    }

    # Build the full URL and make request
    target = urljoin(API_URL, base_path)
    response = requests.post(url=target, json=json_data)
    data = json.loads(response.content)

    # call /updategist with token
    base_path = "/updategist"
    query_params = {'token': token} if token else {}
    target = urljoin(API_URL, base_path)
    if query_params:
        target += f"?{urlencode(query_params)}"
    if token and user:
        requests.post(url=target)
    ### EOF

    return RedirectResponse(f"/ship/{ship_id}", status_code=303)

@app.get("/seo_about")
async def get_seo_about(request: Request):
    """display seo about page"""
    user = request.session.get("discord_user")
    if not user:
        user = "Guest"
    return templates.TemplateResponse("seo_about.html", {"request": request, "user": user})

@app.get("/myships")
async def get_myships(request: Request):
    user = request.session.get("discord_user")

    if user:
        token = create_token(user=user)

    if not user:
        user = "Guest"
        # redirect to login
        return RedirectResponse("/login?button=myships")
    query_params = {'token': token} if token else {}
    base_path = "/myships"
    target = urljoin(API_URL, base_path)
    if query_params:
        target = f"{target}?{urlencode(query_params)}"
    response = requests.get(url=target) # TODO : update to use json data instead of api
    data = json.loads(response.content)
    page_info = data['data']
    pages = data['max_page']
    return templates.TemplateResponse(
        "indexpop.html", {"request": request, "images": page_info, "user": user, "maxpage": pages, "API_URL": API_URL, "GIST_ID": GIST_ID}
    )

@app.get("/myfavorite")
async def get_myfavorite(request: Request):
    user = request.session.get("discord_user")

    if user:
        token = create_token(user=user)

    if not user:
        user = "Guest"
        return RedirectResponse("/login?button=myfavorite")
    query_params = {'token': token} if token else {}
    base_path = "/myfavorite"
    target = urljoin(API_URL, base_path)
    if query_params:
        target = f"{target}?{urlencode(query_params)}"
    response = requests.get(url=target) # TODO : update to use json data instead of api
    data = json.loads(response.content)
    page_info = data['data']
    pages = data['max_page']
    return templates.TemplateResponse(
        "indexpop.html", {"request": request, "images": page_info, "user": user, "maxpage": pages, "API_URL": API_URL, "GIST_ID": GIST_ID}
    )

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

@app.post("/ship/{ship_id}/addfav")
async def add_to_favorite(request: Request, ship_id: int = Path(...), token: str = Query(None)):
    user = request.session.get("discord_user")
    if not request.session.get("shipidsession"):
        request.session["shipidsession"] = []
    
    if user:
        token = create_token(user=user)
    else:
        user = "Guest"

    # Call API to add to favorites
    base_path = f"/ship/{ship_id}/addfav"
    query_params = {'token': token} if token else {}
    target = urljoin(API_URL, base_path)
    if query_params:
        target += f"?{urlencode(query_params)}"
    if token and user:
        requests.post(url=target)

    # Redirect to ship detail page
    redirect_url = f"/ship/{ship_id}"

    # call /updategist with token
    base_path = "/updategist"
    query_params = {'token': token} if token else {}
    target = urljoin(API_URL, base_path)
    if query_params:
        target += f"?{urlencode(query_params)}"
    if token and user:
        requests.post(url=target)
    ### EOF

    return RedirectResponse(url=redirect_url, status_code=303)

@app.post("/ship/{ship_id}/rmfav")
async def remove_from_favorite(request: Request, ship_id: int = Path(...), token: str = Query(None)):
    user = request.session.get("discord_user")
    if not request.session.get("shipidsession"):
        request.session["shipidsession"] = []
    
    if user:
        token = create_token(user=user)
    else:
        user = "Guest"

    # Call API to remove from favorites
    base_path = f"/ship/{ship_id}/rmfav"
    query_params = {'token': token} if token else {}
    target = urljoin(API_URL, base_path)
    if query_params:
        target += f"?{urlencode(query_params)}"
    if token and user:
        requests.post(url=target)

    # Redirect to ship detail page
    redirect_url = f"/ship/{ship_id}"

    # call /updategist with token
    base_path = "/updategist"
    query_params = {'token': token} if token else {}
    target = urljoin(API_URL, base_path)
    if query_params:
        target += f"?{urlencode(query_params)}"
    if token and user:
        requests.post(url=target)
    ### EOF

    return RedirectResponse(url=redirect_url, status_code=303)

@app.post("/delete/{ship_id}")
async def remove_from_db(request: Request, ship_id: int = Path(...), token: str = Query(None)):
    user = request.session.get("discord_user")
    if not request.session.get("shipidsession"):
        request.session["shipidsession"] = []
    
    if user:
        token = create_token(user=user)
    else:
        user = "Guest"

    # Call API to remove from favorites
    base_path = f"/delete/{ship_id}"
    query_params = {'token': token} if token else {}
    target = urljoin(API_URL, base_path)
    if query_params:
        target += f"?{urlencode(query_params)}"
    if token and user:
        requests.post(url=target)

    # Redirect to ship detail page
    redirect_url = "/"
    # add purge

    # call /updategist with token
    base_path = "/updategist"
    query_params = {'token': token} if token else {}
    target = urljoin(API_URL, base_path)
    if query_params:
        target += f"?{urlencode(query_params)}"
    if token and user:
        requests.post(url=target)
    ### EOF

    return RedirectResponse(url=redirect_url, status_code=303)

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
