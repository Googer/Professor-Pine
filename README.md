# Professor Pine Discord Bot

### Purpose
Primary purpose is to organize raids, secondary purpose to have fun!

### What you need
 - Discord
 - Node
 - Native build system (to build zlib-sync)
   - `npm install -g node-gyp`
   - (if on Windows) `npm install --global --production windows-build-tools`

Create a file in data/ called discord.json with the following format:

```
{
  "discord_bot_token": "<your bot token>",
  "owner": "<your Discord Snowflake ID>"
}
```

Run `npm install` then `npm start` to start the bot.
 