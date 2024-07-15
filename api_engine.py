"""
api engine
multiple fall back
FIFO
"""

from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

API_URL = "https://api.cosmoship.duckdns.org/"
API_URL_FALLBACK = "https://cosmo-api-six.vercel.app/"
API_LOCAL = "http://192.168.1.57:33101/"


def extract_tags_v2(png_file, analyze=False):
    """
    Extracts tags and author information from a PNG file by making a request to the API.

    Args:
        png_file (str): The URL or file path of the PNG file.

    Returns:
        tuple: A tuple containing the extracted tags, author, crew, and price.

    Raises:
        Exception: If the API request fails with a status code other than 200.
    """

    # Function to make a simple GET request to check availability
    def check_url(base_url):
        try:
            response = requests.get(base_url, timeout=10)
            return base_url, response
        except requests.RequestException as e:
            print("check_url", e)
            return base_url, None

    # Function to send the actual file
    def send_file(base_url, png_file, analyze=False):
        try:
            if analyze:
                analyze_endpoint = "analyze?draw=1&analyze=1&url="
            else:
                analyze_endpoint = "analyze?draw=&analyze=&url="
            rq = f"{base_url}{analyze_endpoint}{png_file}"
            response = requests.get(rq, timeout=180)
            return response
        except requests.RequestException as e:
            print("send_file", e)
            return None

    # Check which API URL is available first
    with ThreadPoolExecutor() as executor:
        future_to_url = {
            executor.submit(check_url, url): url for url in [API_URL, API_URL_FALLBACK, API_LOCAL]
        }

        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                base_url, response = future.result()
                if response and response.status_code == 200:
                    print(f"Sending file to: {base_url}")
                    file_response = send_file(base_url, png_file, analyze)
                    if file_response and file_response.status_code == 200:
                        if analyze:
                            rsjson = file_response.json()
                            return rsjson

                        rsjson = file_response.json()

                        # Extract data, use default value "unknown" if key is missing
                        author = rsjson.get("author", "unknown")
                        tags = rsjson.get("tags", "unknown")
                        crew = rsjson.get("crew", "unknown")
                        price = rsjson.get("price", "unknown")
                        # Sort tags in alphabetical order
                        tags = sorted(tags)

                        return tags, author, crew, price
                    raise ValueError(f"Failed to send file to: {base_url}")
            except Exception as exc:
                print(f"{url} generated an exception: {exc}")

    raise ValueError("Both URLs failed to respond with status code 200.")
