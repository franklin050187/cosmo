import requests
import psycopg2
import os
import ast
from dotenv import load_dotenv
from tagextractor import PNGTagExtractor
from urllib.parse import unquote_plus
# from png_upload import upload_image_to_imgbb

load_dotenv()

class ShipImageDatabase:
    def __init__(self):
        self.conn = self.connect_to_server()
        self.cursor = self.conn.cursor()

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
        print(authors)
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
                tags TEXT[]
            )
        """
        self.execute_query(create_table_query)
        
    def delete_ship(self, ship_id, user):
        query = "SELECT submitted_by FROM shipdb WHERE id=%s"
        image_data = self.fetch_data(query, (ship_id,))
        if user != image_data[0][0]:
            return "ko"
        query = "DELETE FROM shipdb WHERE id=%s"
        self.execute_query(query, (ship_id,))

    def edit_ship(self, ship_id, user):
        query = "SELECT submitted_by FROM shipdb WHERE id=%s"
        image_data = self.fetch_data(query, (ship_id,))
        if user != image_data[0][0]:
            return "ko"
        query = "SELECT * FROM shipdb WHERE id=%s"
        image_data = self.fetch_data(query, (ship_id,))
        return image_data[0]
# done
    def post_edit_ship(self, id, form_data, user):
        query = "SELECT * FROM shipdb WHERE id=%s"
        image_data = self.fetch_data(query, (id,))
        print("image_data = ", image_data)

        if user != image_data[0][3]:
            return "ko"
        
        print("form_data = ", form_data)
        
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
        print("tags = ",tags)
        if tags : 
            tup_for.extend(tags)

        # prepare data
        image_data = {
            'description': form_data.get('description', ''),
            'ship_name': form_data.get('ship_name', ''),
            'author': form_data.get('author', ''),
            'price': int(form_data.get('price', 0)),
            'tags' : tup_for,
            'id' : id
        }
        print("tup_for = ", tup_for)
        # prepare query
        insert_query = """
            UPDATE shipdb SET
            description = %s,
            ship_name = %s,
            author = %s,
            price = %s,
            tags = %s::text[]
            WHERE id = %s
        """
        
        # prepare values
        values = (
            image_data['description'],
            image_data['ship_name'],
            image_data['author'],
            image_data['price'],
            image_data['tags'],
            image_data['id'],
        )
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
    def get_search(self, query_params):
        query_params = str(query_params)
        print("query_params =", query_params)

        conditions = []
        not_conditions = []
        author_condition = None
        min_price_condition = None
        max_price_condition = None

        if query_params:
            for param in query_params.split("&"):
                key, value = param.split("=")
                if key == "author":
                    author_condition = unquote_plus(value)
                elif key == "minprice":
                    min_price_condition = value
                elif key == "maxprice":
                    max_price_condition = value
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

    def get_image_data(self, id):
        query = "SELECT * FROM shipdb WHERE id=%s"
        return self.fetch_data(query, (id,))

    def upload_image(self, form_data, user):
        url_png = form_data.get('url_png')
        response = requests.get(url_png)
        image_data = response.content
        print("form_data = ", form_data)
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
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::text[])
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
        self.execute_query(insert_query, values)
