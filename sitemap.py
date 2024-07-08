import time
from db import ShipImageDatabase
from urllib.parse import quote

db_manager = ShipImageDatabase()

def generate_sitemap():
    authors = db_manager.get_authors()['authors']
    tags = db_manager.get_tags()
    current_time = time.strftime("%Y-%m-%dT%H:%M:%S+01:00", time.gmtime())

    sitemap = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    sitemap += '\n'.join([
        '<url><loc>https://cosmoship.duckdns.org/</loc><lastmod>{}</lastmod><priority>1.0</priority></url>'.format(current_time)
    ])

    for author in authors:
        # clean author data
        author = author[0]
        # encode author data for url
        author = quote(author)
        # print("author", author)

        sitemap += '\n<url><loc>https://cosmoship.duckdns.org/search?author={}</loc><lastmod>{}</lastmod><priority>1.0</priority></url>'.format(author, current_time)
    for tag in tags:
        tag = tag[0]
        tag = quote(tag)
        # print("tag", tag)
        sitemap += '\n<url><loc>https://cosmoship.duckdns.org/search?{}=1</loc><lastmod>{}</lastmod><priority>1.0</priority></url>'.format(tag, current_time)

    sitemap += '\n</urlset>'

    return sitemap
    
    