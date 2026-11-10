import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import type { SimpleCommand } from '../../discord/command.js';
import { regionChannelOf } from '../../discord/guards.js';
import { answer, v2Answer } from '../../discord/late-reply.js';
import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
import { actionRow, LIST_COLOUR, linkButton, textMessage } from '../../render/v2.js';

/**
 * `/maps` (the legacy `!maps`), for the member alone. With the web pages (`settings.web`, plan
 * 8M-1): the address of the server's map and a button that opens it logged in (a login link of
 * five minutes, once; issuing one is a write, hence `MEMBER_WRITE_THROTTLE`), on the region of
 * the channel it was used in (plan 8M-7: `?region=<id>` in the address and the link); in a DM, which
 * names no server, the map of all regions where `settings.regionMapLink` is set, else where to
 * ask. Without them: the address of the map of all regions, anywhere. Offered where either is
 * set; also in a DM with the bot and the post of a party: the legacy bot sent it by DM to keep
 * raid channels quiet, and a private answer is as quiet.
 */
export const maps: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('maps')
    .setDescription('The map of the regions and gyms')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),
  help: {
    category: 'util',
    details: (settings) =>
      settings.web
        ? "Gives you the address of this server's map of regions and gyms, and a button that " +
          'opens it and logs you in (it works once, within five minutes). Only you see the answer.'
        : 'Gives you the address of a map that shows every region. Only you see the answer.',
    examples: ['/maps'],
  },
  enabled: (config) =>
    config.settings.regionMapLink !== undefined || config.settings.web !== undefined,
  throttle: MEMBER_WRITE_THROTTLE,
  defer: 'late',
  async execute(interaction, ctx) {
    const { web, regionMapLink } = ctx.config.settings;
    if (web && interaction.inGuild()) {
      const guild = interaction.guildId;
      // One login serves every server: the session is named as the account is, not as the
      // member is named in this server (as logging in with Discord names it).
      const { user } = interaction;
      // Used in a region's channel (or its forum), the map opens on that region (plan 8M-7).
      const channel = regionChannelOf(interaction, ctx);
      const region = channel === undefined ? undefined : ctx.regions.byChannel(channel)?.id;
      const token = ctx.loginLinks.issue(
        guild,
        user.id,
        user.globalName ?? user.username,
        Date.now(),
        'map',
        region,
      );
      const map = `${web.publicUrl}/s/${guild}/map${region === undefined ? '' : `?region=${region}`}`;
      await answer(
        interaction,
        v2Answer(
          textMessage(
            LIST_COLOUR,
            [
              // The address only as code, which Discord does not make a link: tapped, it opened
              // the map logged out (Matt, 2026-10-25). The button is the one way in.
              '### The map of this server\nIts regions and gyms: open it with the button, ' +
                'which logs you in.',
              '-# The button works once, within five minutes; do not share it: it logs in ' +
                'whoever opens it as you. Use /maps again for another. To share the map, give ' +
                `its address: \`${map}\``,
            ],
            [
              actionRow([
                linkButton(
                  'Open the map (logs you in)',
                  undefined,
                  `${web.publicUrl}/auth/link/${guild}/${token}`,
                ),
              ]),
            ],
          ),
        ),
      );
      return;
    }
    const content =
      regionMapLink !== undefined
        ? `The map of all regions: ${regionMapLink}`
        : web
          ? 'Use /maps in your server.'
          : 'There is no map of the regions.';
    await answer(interaction, { content });
  },
};
