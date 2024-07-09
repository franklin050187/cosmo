"""Uploads an image to ImgBB, fallback to Cloudinary."""

import os

import requests
from dotenv import load_dotenv

load_dotenv()

def upload_image_to_imgbb(image_base64):
    """
    Uploads an image to ImgBB and returns the URL of the uploaded image. 
    If the upload fails, it falls back to uploading the image to Cloudinary.

    Args:
        image_base64 (str): The base64-encoded image data to be uploaded.

    Returns:
        str: The URL of the uploaded image if successful, or the result of the 
        fallback function if the upload fails.
    """
    api_key = os.getenv('imagebb_api')
    url = "https://api.imgbb.com/1/upload"

    # Prepare the upload request
    payload = {
        "key": api_key,
        "image": image_base64
    }

    try:
        # Send the upload request
        response = requests.post(url, payload, timeout=30)
        response.raise_for_status()  # Raise an exception for non-2xx status codes

        # Parse the response
        data = response.json()
        image_url = data["data"]["url"]

        return image_url
    except requests.exceptions.RequestException:
        # print("fallback : ", e)
        return upload_image_to_cloudinary(image_base64)

def upload_image_to_cloudinary(image_base64):
    """
    A function to upload an image to Cloudinary using the provided base64 image data.
    Params:
        image_base64 (str): The base64-encoded image data to be uploaded.
    Returns:
        str: The URL of the uploaded image if successful, 'ko' otherwise.
    """
    # Set your Cloudinary credentials
    cloudinary_url = "https://api.cloudinary.com/v1_1/{cloud_name}/image/upload"
    api_key = os.getenv('cloud_api_key')
    api_secret = os.getenv('cloud_api_secret')
    cloud_name = os.getenv('cloud_name')

    # Create the payload
    payload = {
        "file": "data:image/png;base64,"+image_base64,
        "upload_preset": "xttg4crr",
        "api_key": api_key,
        "api_secret": api_secret,
    }

    # Make the POST request
    response = requests.post(cloudinary_url.format(cloud_name=cloud_name), data=payload, timeout=30)

    # Process the response
    if response.status_code == 200:
        json_response = response.json()
        # Extract the URL of the uploaded image
        image_url = json_response["secure_url"]
        # print("Image uploaded successfully. URL:", image_url)
        return image_url
    else:
        # print("Error uploading image:", response.text)
        return "ko"
