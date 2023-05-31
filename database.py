import os
from dotenv import load_dotenv

load_dotenv()

import psycopg2

conn = psycopg2.connect(database=os.getenv('POSTGRES_DATABASE'),
                        host=os.getenv('POSTGRES_HOST'),
                        user=os.getenv('POSTGRES_USER'),
                        password=os.getenv('POSTGRES_PASSWORD'),
                        port=5432)

cursor = conn.cursor()
cursor.execute("SELECT * FROM images")
image_data = cursor.fetchone()
print( image_data)
conn.commit()
conn.close()