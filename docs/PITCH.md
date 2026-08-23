# Why a player would use CosmoShip — pitch and campaign doc

Internal marketing doc. The audience is Cosmoteer players, not developers. Every claim here maps
to a real shipped feature, listed at the end so copy never promises something the site does not do.

## The one-liner

**CosmoShip is where Cosmoteer players share their ships, roll for new ones like loot crates, and
run tournaments — free, no account hassle, just your Discord.**

## The hook by player type

### The builder: "Your fleet deserves an audience"

You spent six hours perfecting that broadside cruiser. Right now it lives in your screenshots
folder. Upload it to CosmoShip and it becomes a page other players can find, rate, favorite, and
fly. Your name is on it. The library already holds 2,000+ ships from 160+ captains.

Hook line: "You built it. Now show it off."

### The collector: "2,000 ships. One search bar."

Looking for a carrier under 40k credits with point defense? Filter by price, crew, tags, or author
and it appears in seconds. Save the best finds to collections so your next session starts loaded.

Hook line: "Stop rebuilding from scratch. Borrow 200 hours of someone else's tinkering."

### The gambler: "Roll the wheel. Win a ship."

This is the feature nobody else has. Pick any collection, pull the slot lever, and watch the wheel
spin CS:GO-style through glowing ship cards. Common to Legendary rarities. Confetti on the big
drops. Every roll lands on a real ship you can open, download, and fly immediately.

Hook line: "It's a loot crate full of actual spaceships."

### The competitor: "Run your tournament in minutes"

Hosting a community event? Create a game, drop an invite link in Discord, and players register by
typing their Discord name. Single or double elimination brackets build themselves. Winners advance,
byes resolve, champions get crowned. No spreadsheet, no manual seeding, no "who plays whom" chaos
in chat.

Hook line: "You bring the players. We bring the bracket."

## Campaign angles

**Discord-first distribution.** Players live in Discord servers. Every game page has a share link;
every roulette roll has a share button; every ship has a URL worth pasting. Seed it by rolling a
public roulette in Cosmoteer Discords and letting people ask "what is that site".

**The gacha loop.** Loot-crate psychology works because the reveal is fun. Lead visuals with the
spinning wheel and rarity glow, not the search grid. The wheel is the ad.

**Builder recognition.** Feature a "ship of the week" from the library. Builders share their own
pages; their fleets follow them in. Popularity rankings (download and favorite counts) give
builders a scoreboard.

**Zero-friction promise.** No email, no password, no profile setup. Click "Login with Discord",
you are in. Say this explicitly in every ad; signup friction kills gamer conversion.

## Copy blocks ready to paste

Short (Discord/Twitter):
> 2,000+ Cosmoteer ships. Roll for one like a loot crate, or upload yours and let the fleet find
> you. Free, Discord login only. cosmoship.example

Medium (Reddit/Discord post):
> Built a site for Cosmoteer players: browse 2,000+ community ships with real filters (price,
> crew, tags), save collections, and run tournaments with automatic single/double elimination
> brackets. Best part: pick any collection and hit the ship roulette. It spins like a CS:GO case
> and drops you a real ship to fly. Login is just Discord. Tell me what your fleet is missing.

Tournament announcement template:
> Tournament night! Register in 10 seconds with your Discord name: [link]. Bracket builds itself,
> winners advance automatically, losers bracket gives you a second life. Double elim, no spreadsheets.

## Voice rules

Talk like a player, not a product manager. "Ships", never "assets". "Fly it", never "deploy".
Numbers over adjectives: "2,000+ ships" beats "a vast library". Never promise competitive integrity
we do not have; the brackets handle advancement, human refs handle disputes.

## Claim-to-feature map

Every public claim traces to shipped code:

| Claim | Feature |
|---|---|
| 2,000+ ships, filterable | Search with price/crew/tag/author facets (`src/lib/db/search.ts`) |
| Roll for a ship | Ship roulette with weighted rarity (`src/lib/roulette.ts`) |
| Tournaments with auto brackets | Single/double elimination engine (`src/lib/bracket-util.ts`, `db/games.ts`) |
| Discord login only | Discord OAuth, JWT cookie (`src/lib/auth.ts`) |
| Upload your build | PNG blueprint uploads via UploadThing |
| Collections | Personal and public ship lists |
| Share links everywhere | Per-ship, per-game, per-roulette URLs |
