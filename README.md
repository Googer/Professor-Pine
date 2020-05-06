# Professor Pine Discord Bot

### Official Discord server (setup help, support, feedback, etc.)
 - https://discord.com/invite/8FkjJVe

### What you need
 - Discord account, 2x bot tokens
 - Node (v12+)
 - MySQL, create an empty schema to hold bot data
 - Native build system (to build zlib-sync)
   - `npm install -g node-gyp`
   - (if on Windows) `npm install -g --production windows-build-tools`

Copy data/private-settings.json.default to data/private-settings.json and fill it out:

```
{
  "discordBotToken": "<bot token for main bot>",
  "discordNotifyToken": "<bot token for DM / notification bot>",
  "owner": "<your Discord Snowflake ID>",
  "pokemonUrlBase": "<url for pokemon images>",
  "githubRepo": "<github repo to receieve gym change requests, in form user/repo, not full URL>",
  "githubUser": "<github user for creating gym change requests>",
  "githubPassword": "<github password for creating gym change requests>",
  "db": {
    "host": "<host for mysql db (localhost if running on same machine as bot)>",
    "port": "<mysql db port>",
    "user": "<mysql username>",
    "password: "<mysql password>",
    "schema": "<mysql schema name for pine's data>"
  }
}
```

Run `npm install` then `npm start` to start the bot.
