"""
api engine
multiple fall back
FIFO
"""

import requests
import os

API_URL = "https://api.cosmoship.duckdns.org/"
API_URL_FALLBACK = os.getenv("API_URL")


def extract_tags_v2(png_file, analyze=False):
    """
    direct call
    """
    try:
        if analyze:
            analyze_endpoint = "analyze?draw=1&analyze=1&url="
        else:
            analyze_endpoint = "analyze?draw=&analyze=&url="
        rq = f"{API_URL_FALLBACK}{analyze_endpoint}{png_file}"
        file_response = requests.get(rq, timeout=10)
    except requests.RequestException as e:
        print("send_file", e)
        return None

    if file_response and file_response.status_code == 200:
        if analyze:
            rsjson = file_response.json()
            return rsjson
        rsjson = file_response.json()
        author = rsjson.get("author", "unknown")
        tags = rsjson.get("tags", "unknown")
        crew = rsjson.get("crew", "unknown")
        price = rsjson.get("price", "unknown")
        tags = sorted(tags)
        return tags, author, crew, price
    return None
