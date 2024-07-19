"""
Database manager for the website.
"""

import ast
import os

from urllib.parse import unquote_plus

import psycopg2
import requests
from dotenv import load_dotenv

from api_engine import extract_tags_v2
from discordwh import send_message

MAX_SHIPS_PER_PAGE = 24

load_dotenv()

class ShipImageDatabase:
    """db manager"""
    def __init__(self):
        self.conn = self.connect_to_server()
        self.cursor = self.conn.cursor()
        self.modlist = os.getenv('mods_list')
        self.modlist = ast.literal_eval(self.modlist)

    def execute_query(self, query, values=None):
        """
        Executes a query on the database.

        Parameters:
            query (str): The SQL query to execute.
            values (tuple, optional): The values to substitute into the query.

        Returns:
            None
        """
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
        """
        Executes a SQL query and returns the inserted ID if applicable.

        Args:
            query (str): The SQL query to execute.
            values (tuple, optional): The values to be inserted into the query. Defaults to None.

        Returns:
            int or None: The inserted ID if applicable. Returns None if no values are provided.

        Raises:
            None

        Notes:
            - This method connects to the server, creates a cursor, and executes the SQL query.
            - If values are provided, the query is executed with the values
            and the inserted ID is returned.
            - If no values are provided, the query is executed without values.
            - After executing the query, the cursor is closed and the connection is closed.
        """
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

        cursor.execute(query)
        conn.commit()
        cursor.close()
        conn.close()
        return None


    def fetch_data(self, query, values=None):
        """
        Executes a query on the database to fetch data.

        Parameters:
            query (str): The SQL query to execute.
            values (tuple, optional): The values to substitute into the query.

        Returns:
            list: The fetched data from the query.
        """
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
        """
        Establishes a connection to the server.

        Returns:
            psycopg2.extensions.connection: The connection object.
        """
        conn = psycopg2.connect(database=os.getenv('POSTGRES_DATABASE'),
                                host=os.getenv('POSTGRES_HOST'),
                                user=os.getenv('POSTGRES_USER'),
                                password=os.getenv('POSTGRES_PASSWORD'),
                                port=6543)
        return conn

    def close_connection(self):
        """
        Closes the connection to the server by closing the cursor and the connection objects.
        """
        self.cursor.close()
        self.conn.close()

    def get_authors(self):
        """
        Retrieves a list of distinct authors from the ship database.

        :return: A dictionary containing the list of authors.
        """
        query = "SELECT DISTINCT author FROM shipdb;"
        authors = self.fetch_data(query)
        # print(authors)
        # authors = [author[0] for author in authors]  # Extracting only the author value
        return {'authors': authors}

    # get all unique tags from the ship database
    def get_tags(self):
        """
        Retrieves a list of distinct tags from the ship database.

        Returns:
            dict: A dictionary containing the list of tags. The keys are 'tags' 
            and the values are a list of strings.
        """
        # tags are tags TEXT[]
        query = "SELECT DISTINCT unnest(tags) AS tag FROM shipdb;"
        tagsdict = self.fetch_data(query)
        # print(tagsdict)
        return tagsdict

    def init_db(self):
        """
        Initializes the ship database by creating the necessary tables if they do not already exist.

        This function executes two SQL queries to create the `shipdb` and `favoritedb` tables. 
        The `shipdb` table has the following columns:
        - `id`: a serial primary key
        - `name`: a text column to store the name of the ship
        - `data`: a text column to store the data of the ship
        - `submitted_by`: a text column to store the name of the submitter
        - `description`: a text column to store the description of the ship
        - `ship_name`: a text column to store the name of the ship
        - `author`: a text column to store the author of the ship
        - `price`: an integer column to store the price of the ship (default is 0)
        - `downloads`: an integer column to store the number of downloads of the ship (default is 0)
        - `date`: a timestamp with time zone column to store the submission date of the ship 
        (default is the current UTC time)
        - `tags`: a text array column to store the tags associated with the ship
        - `fav`: an integer column to store the favorite count of the ship (default is 0)

        The `favoritedb` table has the following columns:
        - `id`: a serial primary key
        - `name`: a text column to store the name of the favorite list
        - `favorite`: a text array column to store the favorite ships

        This function does not take any parameters and does not return any values.
        """
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
                date timestampz DEFAULT (now() AT TIME ZONE 'utc'::text),
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
        """
        Deletes a ship from the shipdb table if the user is the owner or is in the modlist.

        Parameters:
            ship_id (int): The ID of the ship to be deleted.
            user (str): The username of the user performing the deletion.

        Returns:
            str: "ko" if the user is not the owner and is not in the modlist, otherwise None.
        """
        query = "SELECT submitted_by FROM shipdb WHERE id=%s"
        image_data = self.fetch_data(query, (ship_id,))
        if user != image_data[0][0] and user not in self.modlist:
            return "ko"
        query = "DELETE FROM shipdb WHERE id=%s"
        self.execute_query(query, (ship_id,))

    def edit_ship(self, ship_id, user):
        """
        Edits a ship in the ship database.

        Args:
            ship_id (int): The ID of the ship to be edited.
            user (str): The username of the user performing the edit.

        Returns:
            tuple: The data of the edited ship.

        Raises:
            None.

        """
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
    def post_edit_ship(self, ship_id, form_data, user):
        """
        Updates a ship in the database.

        Args:
            id (int): The ID of the ship to be updated.
            form_data (dict): The data containing the updated information for the ship.
            user (str): The username of the user performing the update.

        Returns:
            None

        Raises:
            None.

        """
        query = "SELECT * FROM shipdb WHERE id=%s"
        image_data = self.fetch_data(query, (ship_id,))
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
        # extractor = PNGTagExtractor()
        # tags = extractor.extract_tags(url_png)
        data_ship = extract_tags_v2(url_png)
        tags = data_ship[0]

        # add tup for to tags
        
        print("tags = ",tags) # tags are good here
        if tags :
            tup_for.extend(tags)
        # prepare data
        image_data = {
            'description': form_data.get('description', ''),
            'ship_name': form_data.get('ship_name', ''),
            'author': form_data.get('author', ''),
            'submitted_by': form_data.get('submitted_by', ''),
            'price': int(form_data.get('price', 0)),
            'brand': form_data.get('brand', ''),
            'tags' : tup_for,
            'id' : ship_id
        }
        print("tup_for = ", tup_for)
        # prepare query
        insert_query = """
            UPDATE shipdb SET
            description = %s,
            ship_name = %s,
            author = %s,
            price = %s,
            submitted_by = %s,
            brand = %s,
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
            image_data['brand'],
            image_data['tags'],
            image_data['id'],
        )

        self.execute_query(insert_query, values)
        return None

    def download_ship_png(self, image_id):
        """
        Retrieves the PNG image data and name associated with the given image ID from the ship 
        database.

        Parameters:
            image_id (int): The ID of the image to retrieve.

        Returns:
            tuple: A tuple containing the image data and name if the image is found in the database.
                   Otherwise, returns the string "Image not found".
        """
        query = "SELECT data, name FROM shipdb WHERE id = %s"
        result = self.fetch_data(query, (image_id,))
        if result:
            # self.update_downloads(image_id)
            return result[0]
        else:
            return "Image not found"

    def get_index(self):
        """
        Retrieves the latest 60 ship records from the ship database, 
        sorted by date in descending order.

        Returns:
            list: A list of ship records.
        """
        query = f"SELECT * FROM shipdb ORDER BY date DESC LIMIT {MAX_SHIPS_PER_PAGE}"
        return self.fetch_data(query)

    def get_pages(self):
        """
        Retrieves the number of rows from the ship database.
        
        Returns:
            Any: The result of fetching data from the ship database.
        """
        # count number of rows
        query = "SELECT COUNT(*) FROM shipdb"
        return self.fetch_data(query)

    def get_index_exl(self):
        """
        Retrieves the latest 60 ship records from the ship database where the brand is 'exl', 
        sorted by date in descending order.

        Returns:
            list: A list of ship records.
        """
        query = f"SELECT * FROM shipdb WHERE brand = 'exl' ORDER BY date DESC LIMIT {MAX_SHIPS_PER_PAGE} "
        return self.fetch_data(query)

    def get_my_ships(self, user):
        """
        Retrieves all ship records from the ship database where the submitted_by column 
        matches the given user.

        :param user: A string representing the user whose ships are to be retrieved.
        :return: A list of ship records where the submitted_by column matches the given user.
        """
        query = "SELECT * FROM shipdb WHERE submitted_by=%s"
        return self.fetch_data(query, (user,))
    def get_my_ships_pages(self, user):
        """
        Retrieves the number of pages of user's ships.

        Args:
            user (str): The username of the user.

        Returns:
            int: The number of pages of user's ships.
        """
        query = "SELECT COUNT(*) FROM shipdb WHERE submitted_by=%s"
        return self.fetch_data(query, (user,))

    def get_my_favorite(self, user):
        """
        Retrieves the favorite ships of a user from the database.

        Args:
            user (str): The name of the user.

        Returns:
            list: A list of favorite ship records for the user.
        """
        query = (
            "SELECT * FROM shipdb "
            "WHERE id = ANY (SELECT UNNEST(favorite) "
            "FROM favoritedb WHERE name = %s)"
        )
        return self.fetch_data(query, (user,))

    def get_my_favorite_pages(self, user):
        """
        Retrieves the number of pages of user's ships.

        Args:
            user (str): The username of the user.

        Returns:
            int: The number of pages of user's ships.
        """
        query = "SELECT COUNT(*) FROM shipdb WHERE id = ANY (SELECT UNNEST(favorite) FROM favoritedb WHERE name = %s)"
        return self.fetch_data(query, (user,))

    def get_search(self, query_params):
        """
        Retrieves the search results from the database based on the given query parameters.

        Args:
            query_params (str): The query parameters as a string.

        Returns:
            list: A list of search results.
        """
        # print("gen search",query_params)
        query_params = str(query_params)
        conditions = []
        not_conditions = []
        author_condition = None
        desc_condition = None
        min_price_condition = None
        max_price_condition = None
        max_crew_condition = None
        fulltext = None
        order_by = None
        page = 1

        if query_params:
            for param in query_params.split("&"):
                key, value = param.split("=")
                if key == "author":
                    author_condition = unquote_plus(value)
                elif key == "desc":
                    desc_condition = unquote_plus(value)
                elif key == "minprice":
                    min_price_condition = value
                elif key == "maxprice":
                    max_price_condition = value
                elif key == "max-crew":
                    max_crew_condition = value
                elif key == "order":
                    order_by = value
                elif value == "1" and not key == "page":
                    conditions.append(key)
                elif value == "0":
                    not_conditions.append(key)
                elif key == "page":
                    page = value
                elif key == "fulltext":
                    fulltext = unquote_plus(value)

        # Build the query dynamically
        if conditions and not_conditions:
            query = "SELECT * FROM shipdb WHERE tags @> ARRAY{} AND NOT tags @> ARRAY{}"
            if min_price_condition and max_price_condition:
                query += f" AND price >= {min_price_condition} AND price <= {max_price_condition}"
            elif min_price_condition:
                query += f" AND price >= {min_price_condition}"
            elif max_price_condition:
                query += f" AND price <= {max_price_condition}"
            query = query.format(
                conditions,
                not_conditions
            )
        elif conditions:
            query = "SELECT * FROM shipdb WHERE tags @> ARRAY{}"
            if min_price_condition and max_price_condition:
                query += f" AND price >= {min_price_condition} AND price <= {max_price_condition}"
            elif min_price_condition:
                query += f" AND price >= {min_price_condition}"
            elif max_price_condition:
                query += f" AND price <= {max_price_condition}"
            query = query.format(conditions)
        elif not_conditions:
            query = "SELECT * FROM shipdb WHERE NOT tags @> ARRAY{}"
            if min_price_condition and max_price_condition:
                query += f" AND price >= {min_price_condition} AND price <= {max_price_condition}"
            elif min_price_condition:
                query += f" AND price >= {min_price_condition}"
            elif max_price_condition:
                query += f" AND price <= {max_price_condition}"
            query = query.format(not_conditions)
        else:
            query = "SELECT * FROM shipdb"
            if min_price_condition and max_price_condition:
                query += f" WHERE price >= {min_price_condition} AND price <= {max_price_condition}"
            elif min_price_condition:
                query += f" WHERE price >= {min_price_condition}"
            elif max_price_condition:
                query += f" WHERE price <= {max_price_condition}"

        if author_condition:
            if conditions or not_conditions or min_price_condition or max_price_condition or max_crew_condition:
                query += f" AND author ilike '%{author_condition}%'"
            else:
                query += f" WHERE author ilike '%{author_condition}%'"
        
        if desc_condition:
            if conditions or not_conditions or min_price_condition or max_price_condition or max_crew_condition:
                query += f" AND description ILIKE '%{desc_condition}%' OR ship_name ILIKE '%{desc_condition}%'"
            else:
                query += f" WHERE description ILIKE '%{desc_condition}%' OR ship_name ILIKE '%{desc_condition}%'"
        
        if max_crew_condition:
            if conditions or not_conditions or min_price_condition or max_price_condition or author_condition or desc_condition:
                query += f" AND crew <= {max_crew_condition}"
            else:
                query += f" WHERE crew <= {max_crew_condition}"

        if fulltext:
            if conditions or not_conditions or min_price_condition or max_price_condition or author_condition or desc_condition or max_crew_condition:
                query += f" AND exists ( select 1 from unnest(tags) as tag where tag like '{fulltext}%' )"
            else:
                query += f" WHERE exists ( select 1 from unnest(tags) as tag where tag like '{fulltext}%' )"

        if order_by == "fav":
            query += " ORDER BY fav DESC"
        elif order_by == "pop":
            query += " ORDER BY downloads DESC"
        elif order_by == "new":
            query += " ORDER BY date DESC"

        if page:
            limit = MAX_SHIPS_PER_PAGE
            offset = (int(page) - 1) * limit
            query += f" LIMIT {limit} OFFSET {offset}"
        # print(query)
        return self.fetch_data(query)

    def get_pages_search(self, query_params):
        # print("gen search",query_params)
        query_params = str(query_params)
        conditions = []
        not_conditions = []
        author_condition = None
        desc_condition = None
        min_price_condition = None
        max_price_condition = None
        max_crew_condition = None
        fulltext = None


        if query_params:
            for param in query_params.split("&"):
                key, value = param.split("=")
                if key == "author":
                    author_condition = unquote_plus(value)
                elif key == "desc":
                    desc_condition = unquote_plus(value)
                elif key == "minprice":
                    min_price_condition = value
                elif key == "maxprice":
                    max_price_condition = value
                elif key == "max-crew":
                    max_crew_condition = value
                elif key == "order":
                    order_by = value
                elif value == "1" and not key == "page":
                    conditions.append(key)
                elif value == "0":
                    not_conditions.append(key)
                elif key == "page":
                    page = value
                elif key == "fulltext":
                    fulltext = unquote_plus(value)


        # Build the query dynamically
        if conditions and not_conditions:
            query = "SELECT COUNT(*) FROM shipdb WHERE tags @> ARRAY{} AND NOT tags @> ARRAY{}"
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
            query = "SELECT COUNT(*) FROM shipdb WHERE tags @> ARRAY{}"
            if min_price_condition and max_price_condition:
                query += " AND price >= {} AND price <= {}".format(min_price_condition, max_price_condition)
            elif min_price_condition:
                query += " AND price >= {}".format(min_price_condition)
            elif max_price_condition:
                query += " AND price <= {}".format(max_price_condition)
            query = query.format(conditions)
        elif not_conditions:
            query = "SELECT COUNT(*) FROM shipdb WHERE NOT tags @> ARRAY{}"
            if min_price_condition and max_price_condition:
                query += " AND price >= {} AND price <= {}".format(min_price_condition, max_price_condition)
            elif min_price_condition:
                query += " AND price >= {}".format(min_price_condition)
            elif max_price_condition:
                query += " AND price <= {}".format(max_price_condition)
            query = query.format(not_conditions)
        else:
            query = "SELECT COUNT(*) FROM shipdb"
            if min_price_condition and max_price_condition:
                query += " WHERE price >= {} AND price <= {}".format(min_price_condition, max_price_condition)
            elif min_price_condition:
                query += " WHERE price >= {}".format(min_price_condition)
            elif max_price_condition:
                query += " WHERE price <= {}".format(max_price_condition)

        if author_condition:
            if conditions or not_conditions or min_price_condition or max_price_condition or max_crew_condition:
                query += " AND author ilike '%{}%'".format(author_condition)
            else:
                query += " WHERE author ilike '%{}%'".format(author_condition)
        
        if desc_condition:
            if conditions or not_conditions or min_price_condition or max_price_condition or max_crew_condition:
                query += " AND description ILIKE '%{}%' OR ship_name ILIKE '%{}%'".format(desc_condition, desc_condition)
            else:
                query += " WHERE description ILIKE '%{}%' OR ship_name ILIKE '%{}%'".format(desc_condition, desc_condition)
        
        if max_crew_condition:
            if conditions or not_conditions or min_price_condition or max_price_condition or author_condition or desc_condition:
                query += " AND crew <= {}".format(max_crew_condition)
            else:
                query += " WHERE crew <= {}".format(max_crew_condition)

        if fulltext:
            if conditions or not_conditions or min_price_condition or max_price_condition or author_condition or desc_condition or max_crew_condition:
                # query for tags @> ARRAY['{text}%']
                """  exists ( select 1 from unnest(tags) as tag where tag like 'ion%' )"""
                query += " AND exists ( select 1 from unnest(tags) as tag where tag like '{}%' )".format(fulltext)
            else:
                query += " WHERE exists ( select 1 from unnest(tags) as tag where tag like '{}%' )".format(fulltext)
        # print(query)
        return self.fetch_data(query)

    def get_search_exl(self, query_params):
        # print("exl search",query_params)
        query_params = str(query_params)

        conditions = []
        not_conditions = []
        author_condition = None
        desc_condition = None
        min_price_condition = None
        max_price_condition = None
        order_by = None
        page = 1

        if query_params:
            for param in query_params.split("&"):
                key, value = param.split("=")
                if key == "author":
                    author_condition = unquote_plus(value)
                elif key == "desc":
                    desc_condition = unquote_plus(value)
                elif key == "minprice":
                    min_price_condition = value
                elif key == "maxprice":
                    max_price_condition = value
                elif key == "order":
                    order_by = value
                elif value == "1" and not key == "page":
                    conditions.append(key)
                elif value == "0":
                    not_conditions.append(key)
                elif key == "page":
                    page = value

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
                query += " AND author ilike '%{}%'".format(author_condition)
            else:
                query += " WHERE author ilike '%{}%'".format(author_condition)
                
        if desc_condition:
            if conditions or not_conditions or min_price_condition or max_price_condition or author_condition:
                query += " AND (description ILIKE '%{}%' OR ship_name ILIKE '%{}%')".format(desc_condition, desc_condition)
            else:
                query += " WHERE (description ILIKE '%{}%' OR ship_name ILIKE '%{}%')".format(desc_condition, desc_condition)

        if conditions or not_conditions or min_price_condition or max_price_condition or author_condition or desc_condition:
            query += " AND brand = 'exl'"
        else :
            query += " WHERE brand = 'exl'"
            
        
        if order_by == "fav":
            query += " ORDER BY fav DESC"
        elif order_by == "pop":
            query += " ORDER BY downloads DESC"
        elif order_by == "new":
            query += " ORDER BY date DESC"

        # Add pagination
        #page = query_params.get("page", 1)
        if page:
            limit = MAX_SHIPS_PER_PAGE
            offset = (int(page) - 1) * limit
            query += f" LIMIT {limit} OFFSET {offset}"
        # print(query)
        return self.fetch_data(query)

    def update_downloads(self, ship_id):
        """
        Updates the 'downloads' field of a ship in the database by incrementing its value by 1.

        Args:
            ship_id (int): The ID of the ship to update.

        Returns:
            None
        """
        query = "UPDATE shipdb SET downloads = downloads + 1 WHERE id = %s"
        self.execute_query(query, (ship_id,))

    def add_fav(self, ship_id):
        """
        Update the favorite count of a ship in the shipdb by incrementing it by 1.

        Parameters:
            self: the ShipImageDatabase object
            ship_id: integer, the id of the ship to update

        Returns:
            None
        """
        query = "UPDATE shipdb SET fav = fav + 1 WHERE id = %s"
        self.execute_query(query, (ship_id,))

    def remove_fav(self, ship_id):
        """
        Update the favorite count of a ship in the shipdb by decrementing it by 1.

        Parameters:
            self: the ShipImageDatabase object
            ship_id: integer, the id of the ship to update

        Returns:
            None
        """
        query = "UPDATE shipdb SET fav = fav - 1 WHERE id = %s"
        self.execute_query(query, (ship_id,))

    def get_image_data(self, ship_id):
        """
        Retrieves the data of a ship from the shipdb table based on the given ID.

        Args:
            id (int): The ID of the ship to retrieve.

        Returns:
            tuple: A tuple containing the data of the ship if found, or None if not found.
        """
        query = "SELECT * FROM shipdb WHERE id=%s"
        return self.fetch_data(query, (ship_id,))

    def upload_image(self, form_data, user):
        """
        Uploads an image to the ship database.

        Args:
            self: The object instance.
            form_data (dict): The form data containing information about the image.
            user (str): The user who is uploading the image.

        Returns:
            None
        """
        url_png = form_data.get('url_png')
        response = requests.get(url_png, timeout=30)
        image_data = response.content
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
            'brand': form_data.get('brand', 'gen'),
            'crew': int(form_data.get('crew', 0)),
            'tags': tup_for,  # Use getlist() to get all values of 'tags' as a list
        }

        insert_query = """
            INSERT INTO shipdb
            (name, data, submitted_by, description, ship_name, author, price, brand, crew, tags)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::text[]) RETURNING id
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
            image_data['brand'],
            image_data['crew'],
            image_data['tags']
        )
        # execute
        insertedid = self.execute_query_return(insert_query, values)
        link = "https://cosmo-lilac.vercel.app/ship/"+str(insertedid)
        # call webhook
        send_message(link, image_data['name'], image_data['description'],
                     image_data['data'], image_data['price'], image_data['submitted_by'],
                     image_data['author'])
        # self.insert_json(image_data['data'], insertedid, image_data['name']) # insert json in db

    def upload_update(self, data):
        """
    	Updates the ship information in the database based on the provided data.
        
        Parameters:
        - self: the object itself
        - data: a dictionary containing the ship information including 
        'id', 'url_png', 'price', 'crew', and 'tags'
        
        Returns:
        - None
    	"""

        url_png = data.get('url_png')
        tags = data.get('tags', [])

        image_data = {
            'data': url_png,  # change to store URL of the image instead of the base64 image
            'price': data.get('price', 0),
            'crew': int(data.get('crew', 0)),
            'tags': tags,  # Use getlist() to get all values of 'tags' as a list
        }

        insert_query = """
            UPDATE shipdb
            SET
            data = %s,
            price = %s,
            crew = %s,
            tags = %s::text[]
            WHERE id = %s
        """

        values = (
            image_data['data'],
            image_data['price'],
            image_data['crew'],
            image_data['tags'],
            data['id']
        )

        self.execute_query(insert_query, values)

    def add_to_favorites(self, user, ship_id):
        """
        Adds a ship to the user's favorites in the 'favoritedb' table.

        Args:
            user (str): The name of the user.
            ship_id (int): The ID of the ship to be added to favorites.

        Returns:
            None

        This function checks if the user already has a record in the 'favoritedb' table. 
        If not, it inserts a new record
        with the user's name and the given ship ID. If the user already has a record, 
        it checks if the ship ID is already
        in the user's favorites. If not, it appends the ship ID to the user's favorites 
        and updates the 'favoritedb' table.
        If the ship ID is already in the user's favorites, it prints a message indicating 
        that the update was skipped.
        """
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
        """
        Deletes a ship from the user's favorites in the 'favoritedb' table.

        Args:
            user (str): The name of the user.
            ship_id (int): The ID of the ship to be removed from favorites.

        Returns:
            None

        This function checks if the user already has a record in the 'favoritedb' table. 
        If so, it retrieves the user's
        favorites from the database. If the given ship ID is in the user's favorites, 
        it removes it from the list. If the
        list becomes empty, it deletes the user's record from the 'favoritedb' table. 
        Otherwise, it updates the user's
        record in the 'favoritedb' table with the updated list of favorites.

        Note:
            This function assumes that the 'favoritedb' table has the following schema:
                - name (str): The name of the user.
                - favorite (List[int]): The list of ship IDs that the user has favorited.
        """
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

    # def insert_json(self, url, id, name):
    #     url = str(url)
    #     data = cleansavetool.Ship(url).data
    #     id = int(id)
    #     name = str(name)
    #     json_data = json.dumps(data)
    #     query = "INSERT INTO jsondb (shipjson, shipid, shipname) VALUES (%s, %s, %s)"
    #     self.execute_query(query, (json_data, id, name))
