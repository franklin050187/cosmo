# tool to regen sitemap

from json_dl import get_gist_file
import os
from dotenv import load_dotenv
from datetime import datetime, timezone
from urllib.parse import quote

load_dotenv()

GIST_ID = os.getenv("GIST_ID")
SITE_URL = os.getenv("SITE_URL")

tags = get_gist_file(GIST_ID, "cosmoteer_tags.json").json()
authors = get_gist_file(GIST_ID, "cosmoteer_authors.json").json()
timestamps = get_gist_file(GIST_ID, "cosmoteer_timestamp.json").json()

# generate xml line
# tags lines
def generate_tag_line(tag, timestamp):
    timestamp = timestamp['last_updated'] # 1762251066
    # convert to datetime
    timestamp = datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat() + '+00:00'
    tag_lines = []
    for tag in tags["tags"]:
        loc = SITE_URL + "/search?" + tag + "=1"
        tag_lines.append(f'<url><loc>{loc}</loc><lastmod>{timestamp}</lastmod><priority>1.0</priority></url>') 

    return "\n".join(tag_lines)

def generate_author_line(author, timestamp):
    timestamp = timestamp['last_updated'] # 1762251066
    # convert to datetime
    timestamp = datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat() + '+00:00'
    author_lines = []
    for author in authors["authors"]:
        # remove tailing space
        author = author.rstrip()
        # convert author string to url
        author = quote(author)
        loc = SITE_URL + "/search?author=" + author
        author_lines.append(f'<url><loc>{loc}</loc><lastmod>{timestamp}</lastmod><priority>1.0</priority></url>') 

    return "\n".join(author_lines)

def generate_sitemap():
    sitemap = []
    sitemap.append('<?xml version="1.0" encoding="UTF-8"?>')
    sitemap.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    sitemap.append(generate_tag_line(tags, timestamps))
    sitemap.append(generate_author_line(authors, timestamps))
    sitemap.append('</urlset>')
    return "\n".join(sitemap)

static_path = os.path.join(os.path.dirname(__file__), "static")
with open(f"{static_path}/sitemap.xml", "w") as f:
    f.write(generate_sitemap())
