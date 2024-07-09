"""
Discord webhook manager for the website.
"""

import os

import dotenv
import requests

dotenv.load_dotenv()

webhookurl = os.getenv('webhookurl')

# data part
# desc = 'this is a good ship'
# image = "https://i.ibb.co/RBHdqSn/6b533b81724e.png"
# shipname = "test"
# shipurl = "https://cosmo-git-test-franklin050187.vercel.app/ship/44"
def send_message(shipurl, shipname, description, image, price, user, author):
    """
    Sends a message to a Discord webhook with information about a newly uploaded ship.

    Args:
        shipurl (str): The URL of the ship in the library.
        shipname (str): The name of the ship.
        description (str): A description of the ship.
        image (str): The URL of the ship image.
        price (str): The price of the ship.
        user (str): The user who uploaded the ship.
        author (str): The author of the ship.

    Returns:
        None

    Raises:
        requests.exceptions.HTTPError: If there is an error sending the message.

    """
    # message
    data = {
        "content" : "New ship uploaded"
    }
    data["embeds"] = [
        {
            "title": "Link to the library",
            "url": shipurl,
            "image": {"url": image},
            "fields": [
                {
                "name": "Ship name",
                "value": shipname
                },
                {
                "name": "Price",
                "value": price
                },
                {
                "name": "Description",
                "value": description
                },
                {
                "name": "Uploaded by",
                "value": user
                },
                {
                "name": "Author",
                "value": author
                },
            ],
        }
    ]
    # to post
    result = requests.post(webhookurl, json = data, timeout=30)
    # try posting
    try:
        result.raise_for_status()
    except requests.exceptions.HTTPError as err:
        print(err)
    else:
        print(f"Payload delivered successfully, code {result.status_code}.")
