import requests
import base64
import psycopg2
import os
from dotenv import load_dotenv
from png_upload import upload_image_to_imgbb

load_dotenv()

# postgresql configuration (db and table must be setup before use)
def connect_to_server():
    conn = psycopg2.connect(database=os.getenv('POSTGRES_DATABASE'),
                    host=os.getenv('POSTGRES_HOST'),
                    user=os.getenv('POSTGRES_USER'),
                    password=os.getenv('POSTGRES_PASSWORD'),
                    port=5432)
    return conn

def delete_ship(ship_id, user):
    conn = connect_to_server()
    cursor = conn.cursor()
    cursor.execute("SELECT submitted_by FROM images WHERE id=%s", (ship_id,))
    image_data = cursor.fetchone()
    # print(image_data[0])
    if user != image_data[0]:
        # print("not allowed")
        conn.commit()
        cursor.close()
        conn.close()
        return "ko"
    cursor.execute("DELETE FROM images WHERE id=%s", (ship_id,))
    conn.commit()
    cursor.close()
    conn.close()
    return

def edit_ship(ship_id, user):
    # Delete image information from the database based on the provided ID
    conn = connect_to_server()
    cursor = conn.cursor()
    cursor.execute("SELECT submitted_by FROM images WHERE id=%s", (ship_id,))
    image_data = cursor.fetchone()
    if user != image_data[0]:
        conn.commit()
        cursor.close()
        conn.close()
        return "ko"
    cursor.execute("SELECT * FROM images WHERE id=%s", (ship_id,))
    image_data = cursor.fetchone()
    conn.commit()
    cursor.close()
    conn.close()

    # Redirect to the home page after deleting the image
    return image_data

def post_edit_ship(id, form_data, user):

    conn = connect_to_server()
    cursor = conn.cursor()

    # Retrieve the existing image data from the database
    cursor.execute("SELECT * FROM images WHERE id=%s", (id,))
    image_data = list(cursor.fetchone())

    if user != image_data[3]:
        # print("not allowed")
        conn.commit()
        cursor.close()
        conn.close()
        return "ko"

    # Keep the existing values for 'name' and 'data'
    image_data[2] = image_data[2]
    image_data[3] = user
    image_data[4] = form_data.get('description', '')
    image_data[5] = form_data.get('ship_name', '')
    image_data[6] = form_data.get('author', '')
    image_data[7] = int(form_data.get('price', 0))

    # Update the boolean columns
    boolean_columns = [
        'cannon', 'deck_cannon', 'emp_missiles', 'flak_battery', 'he_missiles', 'large_cannon', 'mines', 'nukes',
        'railgun', 'ammo_factory', 'emp_factory', 'he_factory', 'mine_factory', 'nuke_factory', 'disruptors',
        'heavy_Laser', 'ion_Beam', 'ion_Prism', 'laser', 'mining_Laser', 'point_Defense', 'boost_thruster',
        'airlock', 'campaign_factories', 'explosive_charges', 'fire_extinguisher', 'no_fire_extinguishers',
        'large_reactor', 'large_shield', 'medium_reactor', 'sensor', 'small_hyperdrive', 'small_reactor',
        'small_shield', 'tractor_beams', 'hyperdrive_relay', 'bidirectional_thrust', 'mono_thrust', 'multi_thrust',
        'omni_thrust', 'armor_defenses', 'mixed_defenses', 'shield_defenses', 'Corvette', 'diagonal', 'flanker',
        'mixed_weapons', 'painted', 'unpainted', 'splitter', 'utility_weapons', 'transformer', 'campaign_ship', 'factories'
    ]
    for i, column in enumerate(boolean_columns, start=8):
        if column in form_data:
            image_data[i] = 1
        else:
            image_data[i] = 0

    # Update the image data in the database
    columns = ['name', 'data', 'submitted_by', 'description', 'ship_name', 'author', 'price'] + boolean_columns + ['downloads'] + ['date']
    
    values = [image_data[1]] + [image_data[2]] + [image_data[3]] + image_data[4:8] + image_data[8:]
    query = f"UPDATE images SET {', '.join([f'{column}=%s' for column in columns])} WHERE id=%s"

    cursor.execute(query, tuple(values + [id]))

    # Commit and close the connection
    conn.commit()
    cursor.close()
    conn.close()

    # Redirect to the home page
    return
    
def download_ship_png(image_id):
    # Logic to retrieve the file path and filename based on the image_id
    conn = connect_to_server()
    cursor = conn.cursor()
    cursor.execute("SELECT data, name FROM images WHERE id = %s", (image_id,))
    result = cursor.fetchone()  # Retrieve the first row of the query result
    # print(result)
    if result:

        cursor.close()
        conn.close()
        update_downloads(image_id)
        return result
    else:
        # Handle the case when the image_id is not found
        cursor.close()
        conn.close()
        return "Image not found"

def get_index():
    conn = connect_to_server()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM images')
    images = cursor.fetchall()
    cursor.close()
    conn.close()

    return images

def get_my_ships(user):
    conn = connect_to_server()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM images WHERE submitted_by=%s', (user,))
    images = cursor.fetchall()
    conn.close()

    return images

def get_search(query_params):
    # Build the SQL query based on the search criteria
    query = "SELECT * FROM images"
    conditions = []
    args = []

        # searching ships
    TAGS = ['cannon', 'deck_cannon', 'emp_missiles', 'flak_battery', 'he_missiles', 'large_cannon', 'mines', 'nukes', 'railgun', 'ammo_factory', 'emp_factory', 'he_factory', 'mine_factory', 'nuke_factory', 'disruptors', 'heavy_laser', 'ion_beam', 'ion_prism', 'laser', 'mining_laser', 'point_defense', 'boost_thruster', 'airlock', 'campaign_factories', 'explosive_charges', 'fire_extinguisher', 'no_fire_extinguishers',
            'large_reactor', 'large_shield', 'medium_reactor', 'sensor', 'small_hyperdrive', 'small_reactor', 'small_shield', 'tractor_beams', 'hyperdrive_relay', 'bidirectional_thrust', 'mono_thrust', 'multi_thrust', 'omni_thrust', 'armor_defenses', 'mixed_defenses', 'shield_defenses', 'corvette', 'diagonal', 'flanker', 'mixed_weapons', 'painted', 'unpainted', 'splitter', 'utility_weapons', 'transformer']

    for tag, arg in query_params.items():
        if tag in TAGS:
            if arg.lower() == '1':
                conditions.append(f"{tag} = %s")
                args.append(1)
            elif arg.lower() == '0':
                conditions.append(f"{tag} = %s")
                args.append(0)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    conn = connect_to_server()
    cursor = conn.cursor()
    # Execute the query with the parameters
    cursor.execute(query, args)
    images = cursor.fetchall()
    conn.close()

    return images

def update_downloads(ship_id):
    conn = connect_to_server()
    cursor = conn.cursor()
    # Execute an UPDATE query to increment the downloads column by 1 for the given ship_id
    cursor.execute("UPDATE images SET downloads = downloads + 1 WHERE id = %s", (ship_id,))
    conn.commit()
    cursor.close()
    conn.close()

def get_image_data(id: int):
    conn = connect_to_server()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM images WHERE id=%s", (id,))
    image_data = cursor.fetchone()
    conn.commit()
    cursor.close()
    conn.close()
    return image_data

def get_image_url(image_data):
    url_png = upload_image_to_imgbb(image_data[2])
    return url_png

def upload_image(form_data, user):
    conn = connect_to_server()
    cursor = conn.cursor()

    url_png = form_data.get('url_png')

    response = requests.get(url_png)
    image_data = response.content

    # base64_image = base64.b64encode(image_data).decode('utf-8')

    image_data = {
        'name': form_data.get('filename', ''),
        'data': url_png, # change to store url of the image instead of the base64 image
        'submitted_by': user,
        'description': form_data.get('description', ''),
        'ship_name': form_data.get('ship_name', ''),
        'author': form_data.get('author', ''),
        'price': int(form_data.get('price', 0))
    }

    columns = ['name', 'data', 'submitted_by', 'description', 'ship_name', 'author', 'price']
    values = [image_data[column] for column in columns]

    boolean_columns = [
        'cannon', 'deck_cannon', 'emp_missiles', 'flak_battery', 'he_missiles', 'large_cannon', 'mines', 'nukes',
        'railgun', 'ammo_factory', 'emp_factory', 'he_factory', 'mine_factory', 'nuke_factory', 'disruptors',
        'heavy_Laser', 'ion_Beam', 'ion_Prism', 'laser', 'mining_Laser', 'point_Defense', 'boost_thruster',
        'airlock', 'campaign_factories', 'explosive_charges', 'fire_extinguisher', 'no_fire_extinguishers',
        'large_reactor', 'large_shield', 'medium_reactor', 'sensor', 'small_hyperdrive', 'small_reactor',
        'small_shield', 'tractor_beams', 'hyperdrive_relay', 'bidirectional_thrust', 'mono_thrust', 'multi_thrust',
        'omni_thrust', 'armor_defenses', 'mixed_defenses', 'shield_defenses', 'Corvette', 'diagonal', 'flanker',
        'mixed_weapons', 'painted', 'unpainted', 'splitter', 'utility_weapons', 'transformer', 'campaign_ship', 'factories'
    ]
    boolean_values = [1 if column in form_data else 0 for column in boolean_columns]

    query = f"INSERT INTO images ({', '.join(columns + boolean_columns)}) VALUES ({', '.join(['%s'] * (len(columns) + len(boolean_columns)))})"

    cursor.execute(query, tuple(values + boolean_values))

    conn.commit()
    cursor.close()
    conn.close()

    return
