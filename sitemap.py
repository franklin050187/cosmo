"""Sitemap generation for the website."""

import time
from urllib.parse import quote

from db import ShipImageDatabase

db_manager = ShipImageDatabase()


def generate_sitemap():
    """
    Generate the sitemap XML for the website including main page, authors, and tags.
    """
    authors = db_manager.get_authors()["authors"]
    tags = db_manager.get_tags()
    current_time = time.strftime("%Y-%m-%dT%H:%M:%S+01:00", time.gmtime())

    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>']
    sitemap.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

    # Main page
    sitemap.append("<url>")
    sitemap.append("<loc>https://cosmoship.duckdns.org/</loc>")
    sitemap.append(f"<lastmod>{current_time}</lastmod>")
    sitemap.append("<priority>1.0</priority>")
    sitemap.append("</url>")

    # Authors
    for author in authors:
        author = quote(author[0])
        sitemap.append("<url>")
        sitemap.append(f"<loc>https://cosmoship.duckdns.org/search?author={author}</loc>")
        sitemap.append(f"<lastmod>{current_time}</lastmod>")
        sitemap.append("<priority>1.0</priority>")
        sitemap.append("</url>")

    # Tags
    for tag in tags:
        tag = quote(tag[0])
        sitemap.append("<url>")
        sitemap.append(f"<loc>https://cosmoship.duckdns.org/search?{tag}=1</loc>")
        sitemap.append(f"<lastmod>{current_time}</lastmod>")
        sitemap.append("<priority>1.0</priority>")
        sitemap.append("</url>")

    sitemap.append("</urlset>")

    return "\n".join(sitemap)


def generate_url_tags():
    """Generate a tag for html content to push to seo_tags page."""
    urllist = []
    tags = db_manager.get_tags()
    for tag in tags:
        taguri = quote(tag[0])
        linetag = (
            "<h3><a href="
            + f"https://cosmoship.duckdns.org/search?{taguri}=1"
            + ">"
            + tag[0]
            + "</a></h3>"
        )
        urllist.append(linetag)
    return "\n".join(urllist)


def generate_url_authors():
    """
    Generates a list of HTML links for each author in the database.

    Returns:
        str: A string containing HTML links for each author, separated by newlines.
    """
    urllist = []
    authors = db_manager.get_authors()["authors"]
    for author in authors:
        authoruri = quote(author[0])
        line = (
            "<h3><a href="
            + f"https://cosmoship.duckdns.org/search?author={authoruri}"
            + ">"
            + author[0]
            + "</a></h3>"
        )
        # print(line)
        urllist.append(line)
    return "\n".join(urllist)
