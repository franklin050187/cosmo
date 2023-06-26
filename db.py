import requests
import psycopg2
import os
import ast
from dotenv import load_dotenv
from tagextractor import PNGTagExtractor
from urllib.parse import unquote_plus
from discordwh import send_message
# from png_upload import upload_image_to_imgbb

load_dotenv()

class ShipImageDatabase:
    def __init__(self):
        self.conn = self.connect_to_server()
        self.cursor = self.conn.cursor()
        self.modlist = os.getenv('mods_list')
        self.modlist = ast.literal_eval(self.modlist)

    def execute_query(self, query, values=None):
        conn = self.connect_to_server()
        cursor = conn.cursor()
        if values is not None:
            cursor.execute(query, values)
        else:
            cursor.execute(query)
        conn.commit()
        cursor.close()
        conn.close()
    def execute_query_return(self, query, values=None):
        conn = self.connect_to_server()
        cursor = conn.cursor()
        if values is not None:
            cursor.execute(query, values)
            inserted_id = cursor.fetchone()[0]
            # print(inserted_id)
            conn.commit()
            cursor.close()
            conn.close()
            return inserted_id
        else:
            cursor.execute(query)
            conn.commit()
            cursor.close()
            conn.close()


    def fetch_data(self, query, values=None):
        conn = self.connect_to_server()
        cursor = conn.cursor()
        if values is not None:
            cursor.execute(query, values)
        else:
            cursor.execute(query)
        data = cursor.fetchall()
        cursor.close()
        conn.close()
        return data

    def connect_to_server(self):
        conn = psycopg2.connect(database=os.getenv('POSTGRES_DATABASE'),
                                host=os.getenv('POSTGRES_HOST'),
                                user=os.getenv('POSTGRES_USER'),
                                password=os.getenv('POSTGRES_PASSWORD'),
                                port=5432)
        return conn

    def close_connection(self):
        self.cursor.close()
        self.conn.close()
        
    def get_authors(self):
        query = "SELECT DISTINCT author FROM shipdb;"
        authors = self.fetch_data(query)
        # print(authors)
        # authors = [author[0] for author in authors]  # Extracting only the author value
        return {'authors': authors}

    

    def init_db(self):
        # Define the create table query
        create_table_query = """
            CREATE TABLE IF NOT EXISTS shipdb (
                id SERIAL PRIMARY KEY,
                name TEXT,
                data TEXT,
                submitted_by TEXT,
                description TEXT,
                ship_name TEXT,
                author TEXT,
                price integer null default 0,
                downloads integer null default 0,
                date date null default current_date,
                tags TEXT[],
                fav integer null default 0
            )
        """
        self.execute_query(create_table_query)
        # add favorite table
        create_table_query = """
            CREATE TABLE IF NOT EXISTS favoritedb (
                id SERIAL PRIMARY KEY,
                name TEXT,
                favorite TEXT[]
            )
        """
        self.execute_query(create_table_query)
        
    def delete_ship(self, ship_id, user):
        query = "SELECT submitted_by FROM shipdb WHERE id=%s"
        image_data = self.fetch_data(query, (ship_id,))
        if user != image_data[0][0] and user not in self.modlist:
            return "ko"
        query = "DELETE FROM shipdb WHERE id=%s"
        self.execute_query(query, (ship_id,))

    def edit_ship(self, ship_id, user):
        query = "SELECT submitted_by FROM shipdb WHERE id=%s"
        image_data = self.fetch_data(query, (ship_id,))
        # print(self.modlist) # ['Poney#5850', '0neye#7330']
        # print(user) # Poney#5850
        if user != image_data[0][0] and user not in self.modlist:
            return "ko"
        query = "SELECT * FROM shipdb WHERE id=%s"
        image_data = self.fetch_data(query, (ship_id,))
        # print("edit_ship_image_data[0] = ",image_data[0])
        return image_data[0]
# done
    def post_edit_ship(self, id, form_data, user):
        query = "SELECT * FROM shipdb WHERE id=%s"
        image_data = self.fetch_data(query, (id,))
        # print("image_data = ", image_data)
        # print("post_edit_ship_form_data = ",form_data)
        if user != image_data[0][3] and user not in self.modlist:
            return "ko"
        
        # print("form_data = ", form_data)
        
        tup_for = []
        if 'thrust_type' in form_data:
            tup_for.append(form_data['thrust_type'])
        if 'defense_type' in form_data:
            tup_for.append(form_data['defense_type'])
        for key, value in form_data.items():
            if value == 'on':
                tup_for.append(key)
        # generate ship tags
        url_png = image_data[0][2]
        extractor = PNGTagExtractor()
        tags = extractor.extract_tags(url_png)
        # print("tags = ",tags)
        if tags : 
            tup_for.extend(tags[0])
        # prepare data
        image_data = {
            'description': form_data.get('description', ''),
            'ship_name': form_data.get('ship_name', ''),
            'author': form_data.get('author', ''),
            'submitted_by': form_data.get('submitted_by', ''),
            'price': int(form_data.get('price', 0)),
            'tags' : tup_for,
            'id' : id
        }
        # print("tup_for = ", tup_for)
        # prepare query
        insert_query = """
            UPDATE shipdb SET
            description = %s,
            ship_name = %s,
            author = %s,
            price = %s,
            submitted_by = %s,
            tags = %s::text[]
            WHERE id = %s
        """
        
        # prepare values
        values = (
            image_data['description'],
            image_data['ship_name'],
            image_data['author'],
            image_data['price'],
            image_data['submitted_by'],
            image_data['tags'],
            image_data['id'],
        )
        # print("insert_query = ",insert_query)
        # print("values = ",values)
        # execute
        self.execute_query(insert_query, values)

    def download_ship_png(self, image_id):
        query = "SELECT data, name FROM shipdb WHERE id = %s"
        result = self.fetch_data(query, (image_id,))
        if result:
            self.update_downloads(image_id)
            return result[0]
        else:
            return "Image not found"

    def get_index(self):
        query = "SELECT * FROM shipdb"
        return self.fetch_data(query)

    def get_my_ships(self, user):
        query = "SELECT * FROM shipdb WHERE submitted_by=%s"
        return self.fetch_data(query, (user,))
  # done  
    def get_my_favorite(self, user):
        query = "SELECT * FROM shipdb WHERE id = ANY (SELECT UNNEST(favorite) FROM favoritedb WHERE name = %s)"
        return self.fetch_data(query, (user,))

  
    def get_search(self, query_params):
        query_params = str(query_params)
        # print("query_params =", query_params)

        conditions = []
        not_conditions = []
        author_condition = None
        min_price_condition = None
        max_price_condition = None
        order_by = None

        if query_params:
            for param in query_params.split("&"):
                key, value = param.split("=")
                if key == "author":
                    author_condition = unquote_plus(value)
                elif key == "minprice":
                    min_price_condition = value
                elif key == "maxprice":
                    max_price_condition = value
                elif key == "order":
                    order_by = value
                elif value == "1":
                    conditions.append(key)
                elif value == "0":
                    not_conditions.append(key)

        # Build the query dynamically
        if conditions and not_conditions:
            query = "SELECT * FROM shipdb WHERE tags @> ARRAY{} AND NOT tags @> ARRAY{}"
            if min_price_condition and max_price_condition:
                query += " AND price >= {} AND price <= {}".format(min_price_condition, max_price_condition)
            elif min_price_condition:
                query += " AND price >= {}".format(min_price_condition)
            elif max_price_condition:
                query += " AND price <= {}".format(max_price_condition)
            query = query.format(
                conditions,
                not_conditions
            )
        elif conditions:
            query = "SELECT * FROM shipdb WHERE tags @> ARRAY{}"
            if min_price_condition and max_price_condition:
                query += " AND price >= {} AND price <= {}".format(min_price_condition, max_price_condition)
            elif min_price_condition:
                query += " AND price >= {}".format(min_price_condition)
            elif max_price_condition:
                query += " AND price <= {}".format(max_price_condition)
            query = query.format(conditions)
        elif not_conditions:
            query = "SELECT * FROM shipdb WHERE NOT tags @> ARRAY{}"
            if min_price_condition and max_price_condition:
                query += " AND price >= {} AND price <= {}".format(min_price_condition, max_price_condition)
            elif min_price_condition:
                query += " AND price >= {}".format(min_price_condition)
            elif max_price_condition:
                query += " AND price <= {}".format(max_price_condition)
            query = query.format(not_conditions)
        else:
            query = "SELECT * FROM shipdb"
            if min_price_condition and max_price_condition:
                query += " WHERE price >= {} AND price <= {}".format(min_price_condition, max_price_condition)
            elif min_price_condition:
                query += " WHERE price >= {}".format(min_price_condition)
            elif max_price_condition:
                query += " WHERE price <= {}".format(max_price_condition)

        if author_condition:
            if conditions or not_conditions or min_price_condition or max_price_condition:
                query += " AND author = '{}'".format(author_condition)
            else:
                query += " WHERE author = '{}'".format(author_condition)

        if order_by == "fav":
            query += " ORDER BY fav DESC"
        elif order_by == "pop":
            query += " ORDER BY downloads DESC"
        elif order_by == "new":
            query += " ORDER BY date DESC"

        print("conditions =", conditions)
        print("not conditions =", not_conditions)
        print("author condition =", author_condition)
        print("min price condition =", min_price_condition)
        print("max price condition =", max_price_condition)
        print("query =", query)

        return self.fetch_data(query)

    def update_downloads(self, ship_id):
        query = "UPDATE shipdb SET downloads = downloads + 1 WHERE id = %s"
        self.execute_query(query, (ship_id,))

    def add_fav(self, ship_id):
        query = "UPDATE shipdb SET fav = fav + 1 WHERE id = %s"
        self.execute_query(query, (ship_id,))
    
    def remove_fav(self, ship_id):
        query = "UPDATE shipdb SET fav = fav - 1 WHERE id = %s"
        self.execute_query(query, (ship_id,))

    def get_image_data(self, id):
        query = "SELECT * FROM shipdb WHERE id=%s"
        return self.fetch_data(query, (id,))

    def upload_image(self, form_data, user):
        url_png = form_data.get('url_png')
        response = requests.get(url_png)
        image_data = response.content
        # print("form_data = ", form_data)
        # print("tags = ", form_data['tags'])
        tup_for = []
        if 'thrust_type' in form_data:
            tup_for.append(form_data['thrust_type'])
        if 'defense_type' in form_data:
            tup_for.append(form_data['defense_type'])
        for key, value in form_data.items():
            if value == 'on':
                tup_for.append(key)
        if 'tags' in form_data:
            tags_value = form_data['tags']
            try:
                tags_list = ast.literal_eval(tags_value)  # Safely evaluate the string as a list
                tup_for.extend(tags_list)
            except (SyntaxError, ValueError):
                # Handle the exception here (e.g., keep the tags as a string)
                tup_for.append(tags_value)
        # prepare data
        image_data = {
            'name': form_data.get('filename', ''),
            'data': url_png,  # change to store URL of the image instead of the base64 image
            'submitted_by': user,
            'description': form_data.get('description', ''),
            'ship_name': form_data.get('ship_name', ''),
            'author': form_data.get('author', ''),
            'price': int(form_data.get('price', 0)),
            'tags': tup_for  # Use getlist() to get all values of 'tags' as a list
        }
        # print("tup_for = ", tup_for)
        # prepare query
        insert_query = """
            INSERT INTO shipdb
            (name, data, submitted_by, description, ship_name, author, price, tags)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::text[]) RETURNING id
        """
        # prepare values
        values = (
            image_data['name'],
            image_data['data'],
            image_data['submitted_by'],
            image_data['description'],
            image_data['ship_name'],
            image_data['author'],
            image_data['price'],
            image_data['tags']
        )
        # execute
        insertedid = self.execute_query_return(insert_query, values)
        link = "https://cosmo-lilac.vercel.app/ship/"+str(insertedid)
        # call webhook
        # send_message(shipurl, shipname, description, image, price, user, author):
        send_message(link, image_data['name'], image_data['description'],image_data['data'], image_data['price'], image_data['submitted_by'], image_data['author'])
        
    def add_to_favorites(self, user, ship_id):
        query = "SELECT * FROM favoritedb WHERE name = %s"
        result = self.fetch_data(query, (user,))
        if not result:
            query = "INSERT INTO favoritedb (name, favorite) VALUES (%s, ARRAY[%s])"
            self.execute_query(query, (user, ship_id))
            # print("new line")
        else:
            # print(result)
            favorites = result[0][2]
            if ship_id not in favorites:
                favorites.append(ship_id)
                query = "UPDATE favoritedb SET favorite = favorite || ARRAY[%s] WHERE name = %s"
                self.execute_query(query, (ship_id, user))
                # print("update line")
            else:
                print("Already in favorites, skipping update")

    def delete_from_favorites(self, user, ship_id):
        query = "SELECT * FROM favoritedb WHERE name = %s"
        result = self.fetch_data(query, (user,))
        if result:
            favorites = result[0][2]
            if ship_id in favorites:
                favorites.remove(ship_id)
                if not favorites:
                    query = "DELETE FROM favoritedb WHERE name = %s"
                    self.execute_query(query, (user,))
                else:
                    query = "UPDATE favoritedb SET favorite = %s WHERE name = %s"
                    self.execute_query(query, (favorites, user))

