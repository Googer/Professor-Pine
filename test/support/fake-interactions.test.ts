import { ComponentType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  FAKE_CHANNEL_ID,
  FAKE_PARENT_ID,
  checkModal,
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeMessage,
  fakeModal,
  fakeSelect,
  sent,
} from './fake-interactions.js';

/** A form Discord takes: one label with a text input. */
const FORM = {
  custom_id: 'p:1:form',
  title: 'A form',
  components: [{ type: 18, label: 'Time', component: { type: 4, custom_id: 'time', style: 1 } }],
};

describe('fake interactions', () => {
  it('says what kind of interaction it is', () => {
    expect(fakeChatInput().isChatInputCommand()).toBe(true);
    expect(fakeAutocomplete().isAutocomplete()).toBe(true);
    const button = fakeButton({ customId: 'p:1:join' });
    expect([button.isMessageComponent(), button.isButton(), button.isAnySelectMenu()]).toEqual([
      true,
      true,
      false,
    ]);
    const select = fakeSelect({ customId: 'p:1:group', values: ['B'] });
    expect([select.isMessageComponent(), select.isButton(), select.isAnySelectMenu()]).toEqual([
      true,
      false,
      true,
    ]);
    expect(select.values).toEqual(['B']);
    const modal = fakeModal({ customId: 'p:1:time', fields: { time: '6pm' } });
    expect([modal.isModalSubmit(), modal.isMessageComponent()]).toEqual([true, false]);
    expect(modal.fields.getTextInputValue('time')).toBe('6pm');
    expect(() => modal.fields.getTextInputValue('other')).toThrow(/FieldNotFound/);
  });

  it('shows a member with the roles of `roleIds` that the server has, and @everyone', () => {
    const i = fakeChatInput({
      guildRoleNames: { '11': 'North', '12': 'South' },
      roleNames: ['admin'],
      roleIds: ['12', '99'],
    });
    expect(i.member?.roles.cache.map((role) => role.name)).toEqual(['admin', '@everyone', 'South']);
    expect([...(i.member?.roles.cache.keys() ?? [])]).toEqual(['0', i.guildId, '12']);
    // Without `roleIds` a member is as before: the roles of `roleNames` only.
    expect(fakeChatInput({ roleNames: ['admin'] }).member?.roles.cache.size).toBe(1);
  });

  it('has the time it was made and what the member may do, as a test says them', () => {
    const made = fakeChatInput({
      createdTimestamp: 1_800_000_000_000,
      permissions: PermissionFlagsBits.Administrator,
    });
    expect(made.createdTimestamp).toBe(1_800_000_000_000);
    // As in discord.js, an administrator has every permission, and nothing in a channel
    // changes that unless a test says so.
    expect(made.member?.permissions.has(PermissionFlagsBits.ManageRoles)).toBe(true);
    expect(made.memberPermissions?.has(PermissionFlagsBits.ManageRoles)).toBe(true);
    const plain = fakeChatInput();
    expect(Math.abs(plain.createdTimestamp - Date.now())).toBeLessThan(60_000);
    expect(plain.member?.permissions.has(PermissionFlagsBits.ManageRoles)).toBe(false);
    expect(plain.memberPermissions?.has(PermissionFlagsBits.ManageRoles)).toBe(false);
    expect(fakeChatInput({ isDm: true }).memberPermissions).toBeNull();
    expect(fakeChatInput({ isDm: true }).member).toBeNull();
  });

  it('keeps what a member may do on the server apart from what they may do in the channel', () => {
    // The channel permission "Manage Permissions" is the bit of the server's Manage Roles.
    const inChannel = fakeChatInput({ memberPermissions: PermissionFlagsBits.ManageRoles });
    expect(inChannel.memberPermissions?.has(PermissionFlagsBits.ManageRoles)).toBe(true);
    expect(inChannel.member?.permissions.has(PermissionFlagsBits.ManageRoles)).toBe(false);
    const onServer = fakeChatInput({
      permissions: PermissionFlagsBits.ManageRoles,
      memberPermissions: 0n,
    });
    expect(onServer.member?.permissions.has(PermissionFlagsBits.ManageRoles)).toBe(true);
    expect(onServer.memberPermissions?.has(PermissionFlagsBits.ManageRoles)).toBe(false);
    // As in discord.js, neither can be changed: adding to one makes another.
    onServer.member?.permissions.add(PermissionFlagsBits.KickMembers);
    onServer.memberPermissions?.add(PermissionFlagsBits.KickMembers);
    expect(onServer.member?.permissions.has(PermissionFlagsBits.KickMembers)).toBe(false);
    expect(onServer.memberPermissions?.has(PermissionFlagsBits.KickMembers)).toBe(false);
  });

  it('gives option values by type, and null for an option that was not given', () => {
    const i = fakeChatInput({
      subcommandGroup: 'boss',
      subcommand: 'add',
      options: { pokemon: 'mewtwo', count: 3, remote: true },
      resolved: { member: { id: '1' } },
    });
    expect(i.options.getSubcommandGroup()).toBe('boss');
    expect(i.options.getSubcommand()).toBe('add');
    expect(i.options.getString('pokemon')).toBe('mewtwo');
    expect(i.options.getInteger('count')).toBe(3);
    expect(i.options.getBoolean('remote')).toBe(true);
    expect(i.options.getString('count')).toBeNull();
    expect(i.options.getString('missing')).toBeNull();
    expect(i.options.getUser('member')).toEqual({ id: '1' });
    expect(i.options.getAttachment('missing')).toBeNull();
    expect(fakeChatInput().options.getSubcommand(false)).toBeNull();
  });

  it('refuses a second acknowledgement, as discord.js does', async () => {
    const replied = fakeChatInput();
    await replied.reply({ content: 'One.' });
    await expect(replied.reply({ content: 'Two.' })).rejects.toThrow(/InteractionAlreadyReplied/);
    await expect(replied.deferReply()).rejects.toThrow(/InteractionAlreadyReplied/);

    const deferred = fakeChatInput();
    await deferred.deferReply();
    await expect(deferred.reply({ content: 'Late.' })).rejects.toThrow(/InteractionAlreadyReplied/);
    await expect(deferred.deferReply()).rejects.toThrow(/InteractionAlreadyReplied/);
  });

  it('refuses editReply, deleteReply and followUp before the interaction is acknowledged', async () => {
    const fresh = fakeChatInput();
    await expect(fresh.editReply({ content: 'x' })).rejects.toThrow(/InteractionNotReplied/);
    await expect(fresh.deleteReply()).rejects.toThrow(/InteractionNotReplied/);
    await expect(fresh.followUp({ content: 'x' })).rejects.toThrow(/InteractionNotReplied/);
  });

  it('lets a follow-up through after a deferral and then counts as replied', async () => {
    const deferred = fakeChatInput();
    await deferred.deferReply();
    await deferred.followUp({ content: 'Here.' });
    expect([deferred.deferred, deferred.replied]).toEqual([true, true]);
  });

  it('lets update and showModal acknowledge once, and refuses them after an acknowledgement', async () => {
    const button = fakeButton({ customId: 'p:1:join' });
    await button.update({ content: 'Changed.' });
    expect(button.replied).toBe(true);
    await expect(button.update({ content: 'Again.' })).rejects.toThrow(/InteractionAlreadyReplied/);
    await expect(button.showModal({})).rejects.toThrow(/InteractionAlreadyReplied/);
    await expect(button.deferUpdate()).rejects.toThrow(/InteractionAlreadyReplied/);

    const opener = fakeButton({ customId: 'p:1:time' });
    await opener.showModal(FORM);
    expect(opener.replied).toBe(true);

    const deferred = fakeButton({ customId: 'p:1:join' });
    await deferred.deferUpdate();
    await expect(deferred.update({ content: 'x' })).rejects.toThrow(/InteractionAlreadyReplied/);
  });

  it('lets an autocomplete respond once', async () => {
    const autocomplete = fakeAutocomplete();
    await autocomplete.respond([]);
    expect(autocomplete.responded).toBe(true);
    await expect(autocomplete.respond([])).rejects.toThrow(/InteractionAlreadyReplied/);
  });

  it('requires a subcommand unless told it is optional, and a group only when asked', () => {
    const simple = fakeChatInput();
    expect(() => simple.options.getSubcommand()).toThrow(/no subcommand/);
    expect(() => simple.options.getSubcommand(true)).toThrow(/no subcommand/);
    expect(simple.options.getSubcommand(false)).toBeNull();
    expect(simple.options.getSubcommandGroup()).toBeNull();
    expect(simple.options.getSubcommandGroup(false)).toBeNull();
    expect(() => simple.options.getSubcommandGroup(true)).toThrow(/no subcommand/);
    const grouped = fakeChatInput({ subcommandGroup: 'boss', subcommand: 'add' });
    expect(grouped.options.getSubcommand()).toBe('add');
    expect(grouped.options.getSubcommandGroup(true)).toBe('boss');
  });

  it('throws for a required option that was not given', () => {
    const i = fakeChatInput({ options: { pokemon: 'mewtwo' } });
    expect(i.options.getString('pokemon', true)).toBe('mewtwo');
    expect(i.options.getString('other', false)).toBeNull();
    expect(() => i.options.getString('other', true)).toThrow('The fake has no option "other"');
    expect(() => i.options.getInteger('n', true)).toThrow(/no option "n"/);
    expect(() => i.options.getNumber('n', true)).toThrow(/no option "n"/);
    expect(() => i.options.getBoolean('b', true)).toThrow(/no option "b"/);
    expect(() => i.options.getUser('u', true)).toThrow(/no option "u"/);
    expect(() => i.options.getMember('u', true)).toThrow(/no option "u"/);
    expect(() => i.options.getRole('r', true)).toThrow(/no option "r"/);
    expect(() => i.options.getChannel('c', true)).toThrow(/no option "c"/);
    expect(() => i.options.getAttachment('a', true)).toThrow(/no option "a"/);
  });

  it('has no member and an unnamed channel in a DM', () => {
    const dm = fakeChatInput({ isDm: true });
    expect(dm.member).toBeNull();
    expect(dm.channel?.name).toBeUndefined();
    expect(dm.channel?.isDMBased()).toBe(true);
  });

  it('gives the focused autocomplete option as text or with its name', () => {
    const i = fakeAutocomplete({ focused: 'big f', focusedName: 'gym' });
    expect(i.options.getFocused()).toBe('big f');
    expect(i.options.getFocused(true)).toEqual({ name: 'gym', value: 'big f' });
  });

  it('keeps deferred, replied and ephemeral as discord.js does', async () => {
    const replied = fakeChatInput();
    expect([replied.deferred, replied.replied, replied.ephemeral]).toEqual([false, false, null]);
    await replied.reply({ content: 'Done.', flags: MessageFlags.Ephemeral });
    expect([replied.deferred, replied.replied, replied.ephemeral]).toEqual([false, true, true]);
    expect(sent(replied.reply).content).toBe('Done.');

    const deferred = fakeChatInput();
    await deferred.deferReply();
    expect([deferred.deferred, deferred.replied, deferred.ephemeral]).toEqual([true, false, false]);
    await deferred.editReply({ content: 'Here.' });
    expect(deferred.replied).toBe(true);

    const hidden = fakeChatInput();
    await hidden.deferReply({ flags: MessageFlags.Ephemeral });
    expect(hidden.ephemeral).toBe(true);

    const button = fakeButton({ customId: 'p:1:join' });
    await button.deferUpdate();
    expect([button.deferred, button.replied, button.ephemeral]).toEqual([true, false, null]);
  });

  it('complains when a test reads a payload that was never sent', () => {
    expect(() => sent(fakeChatInput().reply)).toThrow(/nothing was sent/);
  });

  it('is in a text channel unless told otherwise', () => {
    const text = fakeChatInput({ channelName: 'downtown', parentName: 'RAIDS' });
    expect(text.channelId).toBe(FAKE_CHANNEL_ID);
    expect(text.channel?.isThread()).toBe(false);
    expect(text.channel?.name).toBe('downtown');
    expect(text.channel?.parent?.name).toBe('RAIDS');

    const post = fakeChatInput({
      channelName: 'Mewtwo · Big Fountain',
      thread: { parentName: 'downtown-raids', categoryName: 'RAIDS' },
    });
    expect(post.channel?.isThread()).toBe(true);
    expect(post.channel?.parentId).toBe(FAKE_PARENT_ID);
    expect(post.channel?.parent).toEqual({
      id: FAKE_PARENT_ID,
      name: 'downtown-raids',
      parentId: null,
      parent: { id: '600000000000000003', name: 'RAIDS' },
    });
    // A category by its id (plan 19A-1).
    const under = fakeChatInput({ parentId: '600000000000000009' });
    expect([under.channel?.parentId, under.channel?.parent?.id]).toEqual([
      '600000000000000009',
      '600000000000000009',
    ]);

    expect(fakeChatInput({ uncachedChannel: true }).channel).toBeNull();
    const dm = fakeChatInput({ isDm: true });
    expect([dm.inGuild(), dm.guildId, dm.channel?.isDMBased()]).toEqual([false, null, true]);
  });
});

describe('the message a control is on', () => {
  const row = (...ids: string[]) => ({
    type: 1,
    components: ids.map((custom_id) => ({ type: 2, custom_id })),
  });

  it('is there for a button, a select and a modal only', () => {
    expect('message' in fakeButton({ customId: 'a:1:b' })).toBe(true);
    expect('message' in fakeSelect({ customId: 'a:1:b' })).toBe(true);
    expect('message' in fakeModal({ customId: 'a:1:b' })).toBe(true);
    expect('message' in fakeChatInput()).toBe(false);
    expect('message' in fakeAutocomplete()).toBe(false);
  });

  it('is shared by presses on one message: a press sees it as it was, `fetchReply` as it is', async () => {
    const message = fakeMessage([row('a:1:x', 'a:1:y')]);
    const first = fakeButton({ customId: 'a:1:x', message });
    const second = fakeButton({ customId: 'a:1:y', message });
    await first.deferUpdate();
    await first.editReply({ components: [row('a:1:y')] });
    // The second press was made before the edit: it carries the message as it was then.
    expect(second.message?.components[0]?.toJSON().components).toHaveLength(2);
    await second.deferUpdate();
    const fresh = await second.fetchReply();
    expect(fresh.id).toBe(message.id);
    expect(fresh.components[0]?.toJSON()).toEqual(row('a:1:y'));
    await expect(fakeButton({ customId: 'a:1:x' }).fetchReply()).rejects.toThrow();
  });
});

describe('the files of the message a control is on', () => {
  it('are kept by an edit unless it says which stay, as in Discord', async () => {
    const kept = fakeButton({ customId: 'a:1:x', message: fakeMessage([], undefined, '', ['f1']) });
    await kept.update({ content: 'changed' });
    expect((await kept.fetchReply()).attachments).toEqual(['f1']);

    const cleared = fakeButton({
      customId: 'a:1:x',
      message: fakeMessage([], undefined, '', ['f1']),
    });
    await cleared.update({ content: 'changed', attachments: [] });
    expect((await cleared.fetchReply()).attachments).toEqual([]);

    const added = fakeButton({
      customId: 'a:1:x',
      message: fakeMessage([], undefined, '', ['f1']),
    });
    await added.deferUpdate();
    await added.editReply({ content: 'changed', files: ['f2'] });
    // discord.js lists only the new files as the message's attachments: the old ones go.
    expect((await added.fetchReply()).attachments).toEqual(['f2']);

    const both = fakeButton({ customId: 'a:1:x', message: fakeMessage([], undefined, '', ['f1']) });
    await both.update({ content: 'changed', attachments: ['f1'], files: ['f2'] });
    expect((await both.fetchReply()).attachments).toEqual(['f1', 'f2']);
  });

  it('refuses a v2 update of a classic message, which is not tried', async () => {
    const text = { type: ComponentType.TextDisplay, content: 'Hello' };
    const v2 = { flags: MessageFlags.IsComponentsV2, components: [text] };
    const classic = fakeButton({ customId: 'a:1:x' });
    await expect(classic.update(v2)).rejects.toThrow('a classic-to-v2 update is not tried');
    const deferred = fakeButton({ customId: 'a:1:x' });
    await deferred.deferUpdate();
    await expect(deferred.editReply(v2)).rejects.toThrow('a classic-to-v2 update is not tried');
    // A message that is v2 takes it, and so does a private answer of its own.
    await fakeButton({ customId: 'a:1:x', v2Message: true }).update(v2);
    const apart = fakeButton({ customId: 'a:1:x' });
    await apart.deferReply({ flags: MessageFlags.Ephemeral });
    await apart.editReply(v2);
    // A v2 message pressed refuses becoming classic.
    const shownV2 = fakeButton({ customId: 'a:1:x', v2Message: true });
    await expect(shownV2.update({ content: 'classic' })).rejects.toThrow(
      'a components-v2 message cannot become classic',
    );
  });

  it('checks the files of a new answer against its own files, not the pressed message', async () => {
    const text = { type: ComponentType.TextDisplay, content: 'Map' };
    const gallery = {
      type: ComponentType.MediaGallery,
      items: [{ media: { url: 'attachment://map.png' } }],
    };
    const v2 = { flags: MessageFlags.IsComponentsV2, components: [text, gallery] };
    const message = fakeMessage([], undefined, '', [{ name: 'map.png' }]);
    const replied = fakeButton({ customId: 'a:1:x', message });
    await expect(replied.reply(v2)).rejects.toThrow('no file attachment://map.png in the message');
    const deferred = fakeButton({ customId: 'a:1:x', message });
    await deferred.deferReply({ flags: MessageFlags.Ephemeral });
    await expect(deferred.editReply(v2)).rejects.toThrow('no file attachment://map.png');
    const followed = fakeButton({ customId: 'a:1:x', message, v2Message: true });
    await followed.deferUpdate();
    await expect(followed.followUp(v2)).rejects.toThrow('no file attachment://map.png');
    await followed.followUp({ ...v2, files: ['var/images/map.png'] });
    // An update that sends new files keeps none of the old: a component of an old one is refused.
    const updated = fakeButton({ customId: 'a:1:x', message, v2Message: true });
    await expect(updated.update({ ...v2, files: ['other.png'] })).rejects.toThrow(
      'no file attachment://map.png',
    );
  });

  it('holds a components-v2 answer to the limits of Discord, and keeps it v2', async () => {
    const text = { type: ComponentType.TextDisplay, content: 'Hello' };
    const used = fakeChatInput({ commandName: 'gym' });
    await used.deferReply({ flags: MessageFlags.Ephemeral });
    await expect(
      used.editReply({ flags: MessageFlags.IsComponentsV2, content: 'no', components: [text] }),
    ).rejects.toThrow('a v2 message has no content or embeds');
    await expect(
      used.editReply({ flags: MessageFlags.IsComponentsV2, components: [] }),
    ).rejects.toThrow('a message needs a component');
    await used.editReply({ flags: MessageFlags.IsComponentsV2, components: [text] });
    await expect(used.editReply({ content: 'classic again' })).rejects.toThrow(
      'a components-v2 message cannot become classic',
    );

    const pressed = fakeButton({ customId: 'gymreview:1:skip', v2Message: true });
    await expect(
      pressed.update({
        flags: MessageFlags.IsComponentsV2,
        components: [{ ...text, content: ' ' }],
      }),
    ).rejects.toThrow('a text display needs text');
  });

  it('shows a file in a components-v2 answer only when the message has it', async () => {
    const text = { type: ComponentType.TextDisplay, content: 'Report' };
    const file = { type: ComponentType.File, file: { url: 'attachment://report.csv' } };
    const used = fakeChatInput({ commandName: 'gym' });
    await used.deferReply({ flags: MessageFlags.Ephemeral });
    await expect(
      used.editReply({ flags: MessageFlags.IsComponentsV2, components: [text, file] }),
    ).rejects.toThrow('no file attachment://report.csv in the message');
    await expect(
      used.editReply({
        flags: MessageFlags.IsComponentsV2,
        components: [text, { ...file, file: { url: 'https://example.com/report.csv' } }],
      }),
    ).rejects.toThrow('a file component names a file of the message');
    await used.editReply({
      flags: MessageFlags.IsComponentsV2,
      components: [text, file],
      files: [{ name: 'report.csv' }],
    });
  });
});

describe('the forms a control opens', () => {
  const select = (custom_id: string, n: number, extra: object = {}) => ({
    type: ComponentType.Label,
    label: 'Pick',
    component: {
      type: ComponentType.StringSelect,
      custom_id,
      options: Array.from({ length: n }, (_, i) => ({ label: `L${i}`, value: `v${i}` })),
      ...extra,
    },
  });
  const boxes = (custom_id: string, n: number, extra: object = {}) => ({
    type: ComponentType.Label,
    label: 'Tick',
    component: {
      type: ComponentType.CheckboxGroup,
      custom_id,
      options: Array.from({ length: n }, (_, i) => ({ label: `L${i}`, value: `v${i}` })),
      ...extra,
    },
  });
  const form = (components: object[], title = 'A form') => ({
    custom_id: 'a:1:form',
    title,
    components,
  });

  it('takes what Discord takes: labels with selects, checkbox groups and text inputs', () => {
    expect(() =>
      checkModal(
        form([
          select('b', 25),
          boxes('c', 10, { min_values: 0, required: false }),
          FORM.components[0] as object,
        ]),
      ),
    ).not.toThrow();
    expect(() => checkModal(form([select('a', 25, { options: undefined })]))).toThrow(
      /1 to 25 options, not 0/,
    );
  });

  it('refuses what Discord refuses', () => {
    const six = Array.from({ length: 6 }, (_, i) => select(`s${i}`, 2));
    expect(() => checkModal(form(six))).toThrow(/1 to 5 components, not 6/);
    expect(() => checkModal(form([select('a', 2)], 'x'.repeat(46)))).toThrow(/a title of 1 to 45/);
    expect(() => checkModal(form([{ ...select('a', 2), label: 'x'.repeat(46) }]))).toThrow(
      /a label of 1 to 45/,
    );
    expect(() => checkModal(form([select('a', 26)]))).toThrow(/1 to 25 options, not 26/);
    expect(() => checkModal(form([boxes('a', 11)]))).toThrow(/1 to 10 options, not 11/);
    expect(() => checkModal(form([select('a', 2), select('a', 2)]))).toThrow(/not unique/);
    expect(() => checkModal(form([select('a:1:form', 2)]))).toThrow(/not unique/);
    const twoTicked = select('a', 3, {
      options: [
        { label: 'One', value: '1', default: true },
        { label: 'Two', value: '2', default: true },
      ],
    });
    expect(() => checkModal(form([twoTicked]))).toThrow(/2 options ticked by default, at most 1/);
    expect(() =>
      checkModal(
        form([
          select('a', 1, {
            options: [
              { label: 'One', value: '1' },
              { label: 'Again', value: '1' },
            ],
          }),
        ]),
      ),
    ).toThrow(/the value 1 twice/);
    expect(() => checkModal(form([select('a', 2, { max_values: 3 })]))).toThrow(/max_values 3/);
    expect(() => checkModal(form([{ type: ComponentType.Button }]))).toThrow(/no component/);
  });

  it('is checked when a form is shown, and carries what was chosen and ticked back', async () => {
    const opener = fakeButton({ customId: 'a:1:open' });
    await expect(opener.showModal(form([select('a', 26)]))).rejects.toThrow(/26/);
    expect(opener.replied).toBe(false);
    const submitted = fakeModal({
      customId: 'a:1:form',
      selected: { a: ['v1'] },
      checked: { c: ['v0', 'v2'] },
    });
    expect(submitted.fields.getStringSelectValues('a')).toEqual(['v1']);
    expect(submitted.fields.getCheckboxGroup('c')).toEqual(['v0', 'v2']);
    expect(() => submitted.fields.getCheckboxGroup('none')).toThrow(/FieldNotFound/);
    // An input read as another type than it is: as discord.js, an error.
    expect(() => submitted.fields.getCheckboxGroup('a')).toThrow(/FieldNotFound/);
    expect(() => submitted.fields.getTextInputValue('a')).toThrow(/FieldNotFound/);
  });

  it('submits every input of the form the opener showed, and nothing else', () => {
    const shown = form([
      select('a', 3),
      select('b', 3, { min_values: 0, required: false }),
      boxes('c', 3, { min_values: 0, required: false }),
      FORM.components[0] as object,
    ]);
    const submitted = fakeModal({ customId: 'a:1:form', form: shown, selected: { a: ['v2'] } });
    expect(submitted.fields.getStringSelectValues('a')).toEqual(['v2']);
    // Left empty: an optional menu, an unticked group, a text nobody typed.
    expect(submitted.fields.getStringSelectValues('b')).toEqual([]);
    expect(submitted.fields.getCheckboxGroup('c')).toEqual([]);
    expect(submitted.fields.getTextInputValue('time')).toBe('');
    expect(() => fakeModal({ customId: 'a:1:form', form: shown })).toThrow(
      /no value for its required menu a/,
    );
    expect(() =>
      fakeModal({ customId: 'a:1:form', form: shown, selected: { a: ['v1'], z: ['v1'] } }),
    ).toThrow(/has no input z/);
    expect(() =>
      fakeModal({ customId: 'a:1:form', form: shown, selected: { a: ['v1'] }, checked: { a: [] } }),
    ).toThrow(/no such/);
  });

  const radio = (custom_id: string, n: number, extra: object = {}) => ({
    type: ComponentType.Label,
    label: 'Choose',
    component: {
      type: ComponentType.RadioGroup,
      custom_id,
      required: true,
      options: Array.from({ length: n }, (_, i) => ({ label: `L${i}`, value: `v${i}` })),
      ...extra,
    },
  });
  const text = (content: string) => ({ type: ComponentType.TextDisplay, content });

  it('takes a radio group of 2 to 10 choices and a text display of 1 to 4,000 characters', () => {
    expect(() => checkModal(form([text('x'.repeat(4_000)), radio('a', 2)]))).not.toThrow();
    expect(() => checkModal(form([radio('a', 10)]))).not.toThrow();
    expect(() => checkModal(form([text('x')]))).not.toThrow();
    expect(() => checkModal(form([radio('a', 1)]))).toThrow(/2 to 10 options, not 1/);
    expect(() => checkModal(form([radio('a', 11)]))).toThrow(/2 to 10 options, not 11/);
    expect(() =>
      checkModal(
        form([
          radio('a', 2, {
            options: [
              { label: 'x'.repeat(101), value: '1' },
              { label: 'y', value: '2' },
            ],
          }),
        ]),
      ),
    ).toThrow(/label and value of 1 to 100/);
    expect(() =>
      checkModal(
        form([
          radio('a', 2, {
            options: [
              { label: 'x', value: '1', description: 'd'.repeat(101) },
              { label: 'y', value: '2' },
            ],
          }),
        ]),
      ),
    ).toThrow(/description of at most 100/);
    expect(() => checkModal(form([text('x'.repeat(4_001))]))).toThrow(
      /a text display of 1 to 4000 characters/,
    );
    expect(() => checkModal(form([text('')]))).toThrow(/a text display of 1 to 4000/);
    // A radio group has none of a menu's min_values, max_values or placeholder.
    for (const key of ['min_values', 'max_values', 'placeholder']) {
      expect(() => checkModal(form([radio('a', 2, { [key]: 1 })]))).toThrow(
        new RegExp(`a radio group has no ${key}`),
      );
    }
  });

  it('submits the choice picked in a radio group, and refuses a required one left unpicked', () => {
    const shown = form([radio('a', 3), radio('b', 2, { required: false })]);
    const submitted = fakeModal({ customId: 'a:1:form', form: shown, picked: { a: 'v2' } });
    expect(submitted.fields.getRadioGroup('a')).toBe('v2');
    expect(submitted.fields.getRadioGroup('b')).toBeNull();
    expect(() => submitted.fields.getRadioGroup('b', true)).toThrow(/FieldEmpty/);
    expect(() => submitted.fields.getStringSelectValues('a')).toThrow(/FieldNotFound/);
    // Discord refuses the Submit: the bot never gets an empty pick of a required group.
    expect(() => fakeModal({ customId: 'a:1:form', form: shown })).toThrow(
      /no value for its required radio group a/,
    );
    expect(() => fakeModal({ customId: 'a:1:form', form: shown, picked: { a: 'v9' } })).toThrow(
      /has no choice v9/,
    );
  });

  const checkbox = (custom_id: string, extra: object = {}) => ({
    type: ComponentType.Label,
    label: 'Only costumed ones',
    description: 'Any costume, now or later.',
    component: { type: ComponentType.Checkbox, custom_id, ...extra },
  });

  it('takes a Checkbox of its custom id and default alone, and submits it ticked or not (plan 8R-4)', () => {
    expect(() => checkModal(form([checkbox('c'), checkbox('d', { default: true })]))).not.toThrow();
    for (const key of ['label', 'description', 'options', 'required', 'min_values']) {
      expect(() => checkModal(form([checkbox('c', { [key]: 'x' })])), key).toThrow(
        new RegExp(`a checkbox has no ${key}`),
      );
    }
    const shown = form([
      checkbox('c'),
      checkbox('d'),
      boxes('g', 2, { min_values: 0, required: false }),
    ]);
    const submitted = fakeModal({ customId: 'a:1:form', form: shown, ticks: { c: true } });
    expect(submitted.fields.getCheckbox('c')).toBe(true);
    // Left unticked: false, as Discord sends it.
    expect(submitted.fields.getCheckbox('d')).toBe(false);
    expect(() => submitted.fields.getCheckbox('g')).toThrow(/FieldNotFound/);
    expect(() => submitted.fields.getCheckboxGroup('c')).toThrow(/FieldNotFound/);
    expect(() => fakeModal({ customId: 'a:1:form', form: shown, ticks: { z: true } })).toThrow(
      /has no input z/,
    );
  });

  it('lets no Submit through with fewer than a required group’s min_values ticked (plan 8R-4)', () => {
    const shown = form([
      boxes('g', 3, { min_values: 1, required: true }),
      boxes('h', 3, { min_values: 0, required: false }),
    ]);
    expect(
      fakeModal({
        customId: 'a:1:form',
        form: shown,
        checked: { g: ['v1'] },
      }).fields.getCheckboxGroup('g'),
    ).toEqual(['v1']);
    // Discord keeps Submit from going through: the bot never gets such a form.
    expect(() => fakeModal({ customId: 'a:1:form', form: shown })).toThrow(
      /no value for its required checkbox group g/,
    );
    expect(() => fakeModal({ customId: 'a:1:form', form: shown, checked: { g: [] } })).toThrow(
      /at least 1 of g/,
    );
    expect(() => checkModal(form([boxes('a', 2, { min_values: 0, required: true })]))).toThrow(
      /min_values 0 in a form needs required false/,
    );
  });

  it('refuses a menu of a form that may stay empty without saying it is not required', () => {
    expect(() => checkModal(form([select('a', 2, { min_values: 0 })]))).toThrow(
      /min_values 0 in a form needs required false/,
    );
    expect(() => checkModal(form([boxes('a', 2, { min_values: 0 })]))).toThrow(
      /min_values 0 in a form needs required false/,
    );
  });

  it('says who asked for the message a control is on, and whether it is private', () => {
    const pressed = fakeButton({ customId: 'a:1:x', askedBy: '700000000000000009' });
    expect(pressed.message?.interactionMetadata?.user.id).toBe('700000000000000009');
    expect(pressed.message?.flags.has(MessageFlags.Ephemeral)).toBe(false);
    const own = fakeButton({ customId: 'a:1:x', ephemeralMessage: true });
    expect(own.message?.interactionMetadata).toBeNull();
    expect(own.message?.flags.has(MessageFlags.Ephemeral)).toBe(true);
  });
});
