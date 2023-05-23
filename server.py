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
    conn = sqlite3.connect('example.db')
    cursor = conn.cursor()
    cursor.execute('CREATE TABLE IF NOT EXISTS images (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, data TEXT, submitted_by TEXT, price INT, cannon INT, deck_cannon INT, emp_missiles INT, flak_battery INT, he_missiles INT, large_cannon INT, mines INT, nukes INT, railgun INT, ammo_factory INT, emp_factory INT, he_factory INT, mine_factory INT, nuke_factory INT, disruptors INT, heavy_Laser INT, ion_Beam INT, ion_Prism INT, laser INT, mining_Laser INT, point_Defense INT, boost_thruster INT, description TEXT, ship_name TEXT)')
    conn.commit()
    conn.close()
    
app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key="12345678")
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
        print("not a user upload")
        return RedirectResponse("/login")
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
    cursor.execute("INSERT INTO images (name, data, submitted_by, price, cannon, deck_cannon, emp_missiles, flak_battery, he_missiles, large_cannon, mines, nukes, railgun, ammo_factory, emp_factory, he_factory, mine_factory, nuke_factory, disruptors, heavy_Laser, ion_Beam, ion_Prism, laser, mining_Laser, point_Defense, boost_thruster, description, ship_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
               (file.filename, 
                encoded_data, 
                form_data["submitted_by"], 
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
                form_data["description"],
                form_data["ship_name"]))
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

        conn = sqlite3.connect('example.db')
        cursor = conn.cursor()

        # Build the SQL query based on the form data
        query = "SELECT * FROM images"
        conditions = []
        if cannon_value == "must_have":
            conditions.append("cannon = 1")
        elif cannon_value == "must_not_have":
            conditions.append("cannon = 0")
        if deck_cannon_value == "must_have":
            conditions.append("deck_cannon = 1")
        elif deck_cannon_value == "must_not_have":
            conditions.append("deck_cannon = 0")
        if emp_missiles_value == "must_have":
            conditions.append("emp_missiles = 1")
        elif emp_missiles_value == "must_not_have":
            conditions.append("emp_missiles = 0")

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
