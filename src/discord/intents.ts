import { GatewayIntentBits } from 'discord.js';

/** Features that need a privileged intent. Both default to off (spec 3.1). */
export interface IntentFlags {
  /** Passive screenshot OCR: needs Message Content. */
  ocrPassive: boolean;
  /** Auto-assign a role on join: needs Server Members. */
  autoAssignRole: boolean;
}

const BASE_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.DirectMessages,
];

export function intentsFor(flags: IntentFlags): GatewayIntentBits[] {
  return [
    ...BASE_INTENTS,
    ...(flags.ocrPassive ? [GatewayIntentBits.MessageContent] : []),
    ...(flags.autoAssignRole ? [GatewayIntentBits.GuildMembers] : []),
  ];
}

/** Every subset of the requested flags, largest first, ending with none. */
export function fallbackCandidates(flags: IntentFlags): IntentFlags[] {
  const ocrOptions = flags.ocrPassive ? [true, false] : [false];
  const autoOptions = flags.autoAssignRole ? [true, false] : [false];
  const candidates: IntentFlags[] = [];
  for (const ocrPassive of ocrOptions) {
    for (const autoAssignRole of autoOptions) candidates.push({ ocrPassive, autoAssignRole });
  }
  const enabled = (f: IntentFlags) => Number(f.ocrPassive) + Number(f.autoAssignRole);
  return candidates.sort((a, b) => enabled(b) - enabled(a));
}

/** Gateway close code 4014: the app asked for a privileged intent it has not been granted. */
export function isDisallowedIntentsError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if ((err as { code?: unknown }).code === 4014) return true;
  return /disallowed intents|privileged intent/i.test(err.message);
}
