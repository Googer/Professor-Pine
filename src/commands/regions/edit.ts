import { SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf } from '../../discord/guards.js';
import { answer, v2Answer } from '../../discord/late-reply.js';
import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
import { actionRow, linkButton, textMessage } from '../../render/v2.js';
import { REGION_COLOUR } from './shared.js';

/**
 * `/region edit` (plan 8M-2): the address of the server's region editor on Pine's web pages and
 * a button that opens it logged in (a login link of five minutes, once, as `/maps` gives one:
 * issuing it is a write, hence `MEMBER_WRITE_THROTTLE`). Offered only with `settings.web`; for
 * staff, as all of `/region`; the editor asks Discord again who is staff at every request.
 */
export const editRegions: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('edit')
    .setDescription('Draw and change the regions on a map in your browser'),
  help: {
    details:
      'Gives you the address of the region editor, on a map in your browser, and a button that ' +
      'opens it and logs you in (it works once, within five minutes).\n\nThere you draw new ' +
      'regions, reshape, move, split and remove them, see the gyms, stops and Power Spots in ' +
      'no region and where regions overlap or leave gaps, load and export KML, and save: you ' +
      'see what a save would do first, in the words of `/region import`. Only you see the answer.',
    examples: ['/region edit'],
  },
  enabled: (config) => config.settings.web !== undefined,
  throttle: MEMBER_WRITE_THROTTLE,
  defer: 'late',
  async execute(interaction, ctx) {
    const { web } = ctx.config.settings;
    if (!web) throw new UserError('The web pages of this bot are off.');
    const guild = guildIdOf(interaction);
    // One login serves every server: the session is named as the account is.
    const { user } = interaction;
    const token = ctx.loginLinks.issue(
      guild,
      user.id,
      user.globalName ?? user.username,
      Date.now(),
      'regions/edit',
    );
    const editor = `${web.publicUrl}/s/${guild}/regions/edit`;
    await answer(
      interaction,
      v2Answer(
        textMessage(
          REGION_COLOUR,
          [
            // The address only as code, which Discord does not make a link (as /maps does).
            '### The region editor of this server\nOpen it with the button, which logs you in.',
            '-# The button works once, within five minutes; do not share it: it logs in ' +
              'whoever opens it as you. Use /region edit again for another. To share the ' +
              `editor, give its address: \`${editor}\``,
          ],
          [
            actionRow([
              linkButton(
                'Open the region editor (logs you in)',
                undefined,
                `${web.publicUrl}/auth/link/${guild}/${token}/edit`,
              ),
            ]),
          ],
        ),
      ),
    );
  },
};
