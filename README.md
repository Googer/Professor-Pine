# Professor Pine Discord Bot

### Purpose
Primary purpose is to organize raids, secondary purpose to have fun!

### What you need
 - Discord account, 2x bot tokens
 - Node
 - MySQL, create an empty schema to hold bot data
 - Native build system (to build zlib-sync)
   - `npm install -g node-gyp`
   - (if on Windows) `npm install -g --production windows-build-tools`

Copy data/private-settings.json.default to data/private-settings.json and fill it out:

```
{
  "discord_bot_token": "<bot token for main bot>",
  "discord_notify_token": "<bot token for DM / notification bot>",
  "owner": "<your Discord Snowflake ID>",
  "pokemon_url_base": "<url for pokemon images>",
  "github_repo": "<github repo to receieve gym change requests, in form user/repo, not full URL>",
  "github_user": "<github user for creating gym change requests>",
  "github_password": "<github password for creating gym change requests>",
  "db": {
    "host": "<host for mysql db (localhost if running on same machine as bot)>",
    "user": "<mysql username>",
    "password: "<mysql password>",
    "schema": "<mysql schema name for pine's data>"
  }
}
```

Run `npm install` then `npm start` to start the bot.
 
