import requests
import base64
url = 'https://i.ibb.co/t3HZjBz/09480b726230.png'
base64img = base64.b64encode(requests.get(url).content)
print(base64img)