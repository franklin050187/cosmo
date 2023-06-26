
# Cosmoteer Ship Library - Powered by Excelsior

* Source code for the website : https://cosmo-lilac.vercel.app/
* The site is an image gallery where users can share their ships.

# Features 
* Login via Discord to upload a ship
* Autotag ship
* Autoprice 
* Edit / delete user submitted ships
* Search by tags, author, description
* Exclude tags using -tagname
* Drag and drop from the ship page to the game for easy access
* Order search results
* Ability to favorite ships
* Discord webhook

# Roadmap
* Done add order for search in query param
* Done change button for tabs to post on /search with order=fav,pop,new (default to new) (need to add fav tab once db updated)
* Done remove js sort hacky funtion
* update db schema to add favorite counts (and corresponding updates)
* set up grid css for better layout
* update footer
* To do : UI clean up
* To do : code clean up


# Hosting 
* Vercel (backend and DB)

# Backend
* Fastapi
* uvicorn
* jinja2

# Database 
* PostGreSQL

# Contributions 
* GameDungeon : decoding ships 
https://gist.github.com/GameDungeon/e783ee9147e5990bcbfa8273b9406676

* Graxxian : providing mockup 
https://discord.com/channels/546229904488923141/968552700583235605/1024285180611006474

* 0neEye : fix and code optimize
https://github.com/0neye


## Contributing

Contributions are always welcome!

Ping me on Discord : Poney#5850


## License

 Copyright 2023 Poney!

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated 
 documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use,  
 copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software
 is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF 
 MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE 
 FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION 
 WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


File uploaded to the site are under the Attribution 4.0 International (CC BY 4.0) unless stated otherwise in the description
  
You are free to:

    Share — copy and redistribute the material in any medium or format
    Adapt — remix, transform, and build upon the material
    for any purpose, even commercially.

This license is acceptable for Free Cultural Works.

    The licensor cannot revoke these freedoms as long as you follow the license terms.

Under the following terms:

    Attribution — You must give appropriate credit, provide a link to the license, and indicate if changes were made. You may do so in any reasonable manner, but not in any way that suggests the licensor endorses you or your use.

    No additional restrictions — You may not apply legal terms or technological measures that legally restrict others from doing anything the license permits.


