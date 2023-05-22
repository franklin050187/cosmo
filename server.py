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
    cursor.execute('CREATE TABLE IF NOT EXISTS images (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, data TEXT)')
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
async def finish_login(code: str):
    async with client.session(code) as session:
        user = await session.identify()
        guilds = await session.guilds()
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
@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    # Read the image file
    contents = await file.read()
    # Encode the contents as base64
    encoded_data = base64.b64encode(contents).decode("utf-8")
    # Store the image data in the database
    conn = sqlite3.connect('example.db')
    cursor = conn.cursor()
    cursor.execute('INSERT INTO images (name, data) VALUES (?, ?)', (file.filename, encoded_data))
    conn.commit()
    conn.close()
    # Redirect to the index page
    return RedirectResponse(url="/", status_code=303)

# Endpoint for displaying the home page
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    conn = sqlite3.connect('example.db')
    cursor = conn.cursor()
    cursor.execute('SELECT name, data FROM images')
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
