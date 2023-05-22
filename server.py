import uvicorn
from fastapi import FastAPI, Request, File, UploadFile
from fastapi.responses import FileResponse, RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
import sqlite3
import base64
import os

# Create a table in the database if it doesn't exist
def create_table():
    conn = sqlite3.connect('example.db')
    cursor = conn.cursor()
    cursor.execute('CREATE TABLE IF NOT EXISTS images (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, data TEXT)')
    conn.commit()
    conn.close()

app = FastAPI()
templates = Jinja2Templates(directory="templates")

@app.on_event("startup")
async def startup_event():
    create_table()

# Endpoint for uploading files
@app.post("/upload/")
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

# Endpoint for displaying the file upload page
@app.get("/upload", response_class=FileResponse)
async def upload_page(request: Request):
    path = 'templates/upload.html'
    return FileResponse(path)

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
