import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { SimpleCommand } from '../../discord/command.js';
import { channelContext } from '../../discord/channel-context.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, requireGuild, requireManagement } from '../../discord/guards.js';
import { v2Answer } from '../../discord/late-reply.js';
import {
  AUDIT_LINES,
  AUDIT_WHERE,
  memberAuditMessage,
  postAuditMessage,
} from '../../render/audit.js';

/**
 * `/audit [member]` (Matt, 2026-11-07): the staff audit log, for the same people as `/delete`
 * (Manage Messages, `requireManagement`; hidden from members in `/help`; no throttle). In a
 * party's post, active or ended, the log of that post (`PartyAuditReader.ofPost`: who reported
 * or made the party, anonymous or not, and who changed what, Pine's own changes as Pine); with
 * `member`, that member's newest changes in this server, each with its post. Entries are kept
 * 30 days. Answered privately.
 */
export const audit: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Who made and changed this raid, train or meetup (moderators)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((option) =>
      option.setName('member').setDescription('Their changes in this server instead'),
    ),
  help: {
    category: 'admin',
    details:
      'For admins and moderators. In the post of a raid, max battle, train or meetup, also one ' +
      'that has ended: who reported or made it (also when it is anonymous in the post) and who ' +
      'changed what since, with the time. Changes Pine made by itself show as Pine.\n\nWith ' +
      '`member`: that member’s latest changes in this server, each with its post.\n\nThe log ' +
      'keeps 30 days. Server Settings › Integrations decide who sees it (Manage Messages by ' +
      'default). Only you see the answer.',
    examples: ['/audit', '/audit member:@Ash'],
  },
  guards: [requireGuild, requireManagement],
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const serverId = guildIdOf(interaction);
    const now = Date.now();
    const user = interaction.options.getUser('member');
    if (user !== null) {
      const member = interaction.options.getMember('member');
      const inServer =
        member === null ? null : 'displayName' in member ? member.displayName : member.nick;
      const name = inServer ?? user.globalName ?? user.username;
      const records = await ctx.partyAudit.ofMember(serverId, user.id, AUDIT_LINES + 1);
      const more = records.length > AUDIT_LINES;
      await interaction.editReply(
        v2Answer(memberAuditMessage({ id: user.id, name }, records.slice(-AUDIT_LINES), now, more)),
      );
      return;
    }
    const where = channelContext(interaction);
    if (!where.isThread || where.channelId === null) throw new UserError(AUDIT_WHERE);
    const records = await ctx.partyAudit.ofPost(serverId, where.channelId);
    await interaction.editReply(v2Answer(postAuditMessage(records, now)));
  },
};
