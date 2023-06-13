import requests #dependency
import dotenv
import os
dotenv.load_dotenv()

webhookurl = os.getenv('webhookurl')

# data part
# desc = 'this is a good ship'
# image = "https://i.ibb.co/RBHdqSn/6b533b81724e.png"
# shipname = "test"
# shipurl = "https://cosmo-git-test-franklin050187.vercel.app/ship/44"
def send_message(shipurl, shipname, description, image, price, user, author):
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
    result = requests.post(webhookurl, json = data)
    # try posting
    try:
        result.raise_for_status()
    except requests.exceptions.HTTPError as err:
        print(err)
    else:
        print("Payload delivered successfully, code {}.".format(result.status_code))