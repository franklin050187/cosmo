"""Sitemap generation for the website."""
import time
from urllib.parse import quote

from db import ShipImageDatabase

db_manager = ShipImageDatabase()

def generate_sitemap():
    """
    Generate the sitemap XML for the website including main page, authors, and tags.
    """
    authors = db_manager.get_authors()['authors']
    tags = db_manager.get_tags()
    current_time = time.strftime("%Y-%m-%dT%H:%M:%S+01:00", time.gmtime())

    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>']
    sitemap.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

    # Main page
    sitemap.append('<url>')
    sitemap.append('<loc>https://cosmoship.duckdns.org/</loc>')
    sitemap.append(f'<lastmod>{current_time}</lastmod>')
    sitemap.append('<priority>1.0</priority>')
    sitemap.append('</url>')

    # Authors
    for author in authors:
        author = quote(author[0])
        sitemap.append('<url>')
        sitemap.append(f'<loc>https://cosmoship.duckdns.org/search?author={author}</loc>')
        sitemap.append(f'<lastmod>{current_time}</lastmod>')
        sitemap.append('<priority>1.0</priority>')
        sitemap.append('</url>')

    # Tags
    for tag in tags:
        tag = quote(tag[0])
        sitemap.append('<url>')
        sitemap.append(f'<loc>https://cosmoship.duckdns.org/search?{tag}=1</loc>')
        sitemap.append(f'<lastmod>{current_time}</lastmod>')
        sitemap.append('<priority>1.0</priority>')
        sitemap.append('</url>')

    sitemap.append('</urlset>')

    return '\n'.join(sitemap)
