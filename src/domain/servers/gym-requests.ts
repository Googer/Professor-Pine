import { isTrustedServer, type Instance } from '../operators/tiers.js';

/**
 * Where a server's gym requests (`/request`) go (plan 19B-4; spec, "Per-server settings"):
 * `repository`, the instance's GitHub repository; `bot-lab`, the server's moderators' bot lab;
 * `nowhere`, neither, and the command is not set up in that server.
 */
export type GymRequestWay = 'repository' | 'bot-lab' | 'nowhere';

/**
 * The one rule of where a gym request goes: the instance's repository (where its `GITHUB_TOKEN`
 * and `GITHUB_REPO` are set, `repository`) serves only a server the instance trusts with what
 * every server shares (`isTrustedServer`: an instance that is not open, and lists no servers or
 * lists that one); any other server's requests go to its own moderators' bot lab, where its staff
 * chose one (`botLab`).
 */
export function gymRequestWay(
  serverId: string,
  instance: Instance & { repository: boolean },
  botLab: string | undefined,
): GymRequestWay {
  if (instance.repository && isTrustedServer(serverId, instance)) return 'repository';
  return botLab === undefined ? 'nowhere' : 'bot-lab';
}
