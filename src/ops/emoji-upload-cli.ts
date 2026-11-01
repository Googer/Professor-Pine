import { REST } from 'discord.js';
import { isSnowflake } from '../db/snowflake.js';
import { emojiImage, uploadEmoji } from './emoji-upload.js';

// Uploads the game's type, weather and team icons and legacy Pine's icons of the posts' buttons
// that the bot's application lacks as its emoji:
//   node dist/ops/emoji-upload-cli.js [--apply]     (`./pine emoji-upload`, `npm run emoji:upload`)
// A dry run by default: it lists the application's emoji (a request to Discord) and says what it
// would upload. Reads DISCORD_TOKEN and DISCORD_APP_ID from the environment and prints neither.
const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== '--apply');
if (unknown.length > 0) {
  process.stderr.write(`Unknown arguments: ${unknown.join(' ')}\nUsage: emoji-upload [--apply]\n`);
  process.exit(2);
}
const token = process.env.DISCORD_TOKEN?.trim();
const appId = process.env.DISCORD_APP_ID?.trim();
if (!token || !appId || !isSnowflake(appId)) {
  process.stderr.write('DISCORD_TOKEN and DISCORD_APP_ID must be set (in .env).\n');
  process.exit(1);
}

process.exitCode = await uploadEmoji({
  rest: new REST().setToken(token),
  appId,
  apply: args.includes('--apply'),
  image: emojiImage,
  say: (line) => process.stdout.write(`${line}\n`),
  warn: (line) => process.stderr.write(`${line}\n`),
});
