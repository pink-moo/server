# Pink Moo Server

Hi, this is Pink

First of all, this repository is obviously not 100% my own work, though I do modify it a lot. A huge thanks for [@al007ex](https://github.com/al007ex) & [@kookywarrior](https://github.com/kookywarrior) for the client & server code base. I'm a git idiot and don't know how to leave credits in the repo, so I leave it here, if you want to help you can find me on Discord. Just to clarify again I don't mean to steal the code & credits...

## Intro

This is basically a moomoo clone, except to make it easier to test mods, I have an option to spawn players at age 10, full ruby tools by default, and all hats free to buy. And there's more admin commands than in the original server code, with tp, tp-here, invincibility, no-clip, object, mobs & bots spawning etc

My bot has very good spike tick mechanics (as it checks on server side, the placer is 100% accurate) but very bad movement

### List of Commands

I might forget some, IDK

- `!c/clear` Clear all your own objects
- `!login <password>` Log in as admin
- `!setup` Give you a lot of resources
- `!u/upgrade <item-name/item-id>` Set custom upgrades
- `!v/variant <stone/gold/diamond/ruby>` Set weapon variant
- `!tp <x> <y>` or `!tp <player-id>` Teleporting
- `!tph <player-id>` Reverse teleporting
- `!dmg <amount>` Set custom damage, empty to reset
- `!health <amount>` Set custom max health
- `!sight` Allow you to see enemy's traps
- `!invc` Toggle invincibility
- `!noclip` Toggle no-clip, go through objects and world borders
- `!destroy` Toggle destroy mode, one hit every objects includes trees & stones
- `!s/spawn <cow/bull/moofie/...>` Spawn stuff, `!spawn bot` to spawn the bot
- `!suicide` Instant death for yourself

## How to Run

Just figure it out yourself, it's not that complicated

## Future

I'm planning on rewriting all the code with better syntax and optimization, all in TypeScript. But this will be very time-consuming, even with the help of generative AIs. But I already did that to my Pink Client code base, I can use some of the shared code there, that might save me some time!
