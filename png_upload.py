import requests
import os
import base64
from dotenv import load_dotenv

load_dotenv()

def upload_image_to_imgbb(image_base64):
    api_key = os.getenv('imagebb_api')
    url = "https://api.imgbb.com/1/upload"

    # Decode the base64 image data
    # image_data = base64.b64decode(image_base64)

    # Prepare the upload request
    payload = {
        "key": api_key,
        "image": image_base64
    }

    # Send the upload request
    response = requests.post(url, payload)
    print(response)
    # Parse the response
    data = response.json()
    print(data)
    image_url = data["data"]["url"]

    return image_url