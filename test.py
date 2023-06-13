from dotenv import load_dotenv
import os
import ast

load_dotenv()

modlist = os.getenv('mods_list')
modlist = ast.literal_eval(modlist)

user = '0neye#7330'
if user == 'Guest2' or user not in modlist:
    print('in list')
print(user)