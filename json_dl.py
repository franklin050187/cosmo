# get gist file from id
import requests


def get_gist(gist_id):
    url = f"https://api.github.com/gists/{gist_id}"
    response = requests.get(url)
    return response

def get_gist_file(gist_id, file_name):
    gist_response = get_gist(gist_id)
    if gist_response.status_code == 200:
        gist_data = gist_response.json()
        files = gist_data.get("files", {})
        if file_name in files:
            file_url = files[file_name]["raw_url"]
            file_response = requests.get(file_url)
            return file_response
    return None

# print(get_gist_file(GIST_ID, "cosmoteer_tags.json").text)
# print(get_gist_file(GIST_ID, "cosmoteer_authors.json").text)
# print(get_gist_file(GIST_ID, "cosmoteer_timestamp.json").text)
