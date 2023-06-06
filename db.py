import requests
import psycopg2
import os
from dotenv import load_dotenv
from png_upload import upload_image_to_imgbb

load_dotenv()

class ShipImageDatabase:
    def __init__(self):
        self.conn = self.connect_to_server()
        self.cursor = self.conn.cursor()
        self.boolean_columns = [
            'cannon', 'deck_cannon', 'emp_missiles', 'flak_battery', 'he_missiles', 'large_cannon', 'mines', 'nukes',
            'railgun', 'ammo_factory', 'emp_factory', 'he_factory', 'mine_factory', 'nuke_factory', 'disruptors',
            'heavy_Laser', 'ion_Beam', 'ion_Prism', 'laser', 'mining_Laser', 'point_Defense', 'boost_thruster',
            'airlock', 'campaign_factories', 'explosive_charges', 'fire_extinguisher', 'no_fire_extinguishers',
            'large_reactor', 'large_shield', 'medium_reactor', 'sensor', 'small_hyperdrive', 'small_reactor',
            'small_shield', 'tractor_beams', 'hyperdrive_relay', 'bidirectional_thrust', 'mono_thrust', 'multi_thrust',
            'omni_thrust', 'armor_defenses', 'mixed_defenses', 'shield_defenses', 'Corvette', 'diagonal', 'flanker',
            'mixed_weapons', 'painted', 'unpainted', 'splitter', 'utility_weapons', 'transformer', 'campaign_ship', 'factories'
        ]

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


    def delete_ship(self, ship_id, user):
        query = "SELECT submitted_by FROM images WHERE id=%s"
        image_data = self.fetch_data(query, (ship_id,))
        if user != image_data[0][0]:
            return "ko"
        query = "DELETE FROM images WHERE id=%s"
        self.execute_query(query, (ship_id,))

    def edit_ship(self, ship_id, user):
        query = "SELECT submitted_by FROM images WHERE id=%s"
        image_data = self.fetch_data(query, (ship_id,))
        if user != image_data[0][0]:
            return "ko"
        query = "SELECT * FROM images WHERE id=%s"
        image_data = self.fetch_data(query, (ship_id,))
        return image_data[0]

    def post_edit_ship(self, id, form_data, user):
        query = "SELECT * FROM images WHERE id=%s"
        image_data = self.fetch_data(query, (id,))

        if user != image_data[0][3]:
            return "ko"

        image_data = list(image_data[0])
        image_data[4] = form_data.get('description', '')
        image_data[5] = form_data.get('ship_name', '')
        image_data[6] = form_data.get('author', '')
        image_data[7] = int(form_data.get('price', 0))

        for i, column in enumerate(self.boolean_columns, start=8):
            if column in form_data:
                image_data[i] = 1
            else:
                image_data[i] = 0

        columns = ['name', 'data', 'submitted_by', 'description', 'ship_name', 'author', 'price'] + self.boolean_columns + ['downloads'] + ['date']
        values = [image_data[1]] + [image_data[2]] + [image_data[3]] + image_data[4:8] + image_data[8:]
        query = f"UPDATE images SET {', '.join([f'{column}=%s' for column in columns])} WHERE id=%s"
        self.execute_query(query, tuple(values + [id]))

    def download_ship_png(self, image_id):
        query = "SELECT data, name FROM images WHERE id = %s"
        result = self.fetch_data(query, (image_id,))
        if result:
            self.update_downloads(image_id)
            return result[0]
        else:
            return "Image not found"

    def get_index(self):
        query = "SELECT * FROM images"
        return self.fetch_data(query)

    def get_my_ships(self, user):
        query = "SELECT * FROM images WHERE submitted_by=%s"
        return self.fetch_data(query, (user,))
    
    def get_search(self, query_params):
        query = "SELECT * FROM images"
        conditions = []
        args = []
        query_params = str(query_params)
        print("query_params =", query_params)
        for param in query_params.split("&"):
            key, value = param.split("=")
            if key.lower() in [column.lower() for column in self.boolean_columns]:
                if value.lower() == '1':
                    conditions.append(f"{key} = %s")
                    args.append(1)
                elif value.lower() == '0':
                    conditions.append(f"{key} = %s")
                    args.append(0)
            print("param =", param)
            print("conditions =", conditions)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        print("query =", query)
        return self.fetch_data(query, args)



    def update_downloads(self, ship_id):
        query = "UPDATE images SET downloads = downloads + 1 WHERE id = %s"
        self.execute_query(query, (ship_id,))

    def get_image_data(self, id):
        query = "SELECT * FROM images WHERE id=%s"
        return self.fetch_data(query, (id,))

    def get_image_url(self, image_data):
        url_png = upload_image_to_imgbb(image_data[2])
        return url_png

    def upload_image(self, form_data, user):
        url_png = form_data.get('url_png')
        response = requests.get(url_png)
        image_data = response.content

        image_data = {
            'name': form_data.get('filename', ''),
            'data': url_png,  # change to store URL of the image instead of the base64 image
            'submitted_by': user,
            'description': form_data.get('description', ''),
            'ship_name': form_data.get('ship_name', ''),
            'author': form_data.get('author', ''),
            'price': int(form_data.get('price', 0))
        }

        columns = ['name', 'data', 'submitted_by', 'description', 'ship_name', 'author', 'price']
        values = [image_data[column] for column in columns]
        boolean_values = [1 if column in form_data else 0 for column in self.boolean_columns]

        query = f"INSERT INTO images ({', '.join(columns + self.boolean_columns)}) VALUES ({', '.join(['%s'] * (len(columns) + len(self.boolean_columns)))})"
        self.execute_query(query, tuple(values + boolean_values))


