import {
  DEFAULT_USER_SETTINGS,
  type NicknameHolder,
  type UserSettings,
  type UserSettingsPatch,
  type UserSettingsStore,
} from '../../src/db/repositories/user-repository.js';

/**
 * Members' settings kept in memory as `UserRepository` keeps them: a member who never changed a
 * setting has the defaults. `settings` holds what differs from them, by member; a test may fill
 * it directly, and `everybody` (the second argument) is what all members have set. `reads`
 * counts the calls of each method (a batch read is one call, however many members it names),
 * and `asked` holds the members of each batch read.
 */
export class MemoryUsers implements UserSettingsStore {
  readonly reads = { get: 0, getMany: 0 };
  readonly asked: string[][] = [];

  /** `everybody` is what every member has set, whoever they are. */
  constructor(
    readonly settings = new Map<string, Partial<UserSettings>>(),
    private readonly everybody: Partial<UserSettings> = {},
  ) {}

  private of(snowflake: string): UserSettings {
    return {
      snowflake,
      ...DEFAULT_USER_SETTINGS,
      ...this.everybody,
      ...this.settings.get(snowflake),
    };
  }

  get(snowflake: string): Promise<UserSettings> {
    this.reads.get += 1;
    return Promise.resolve(this.of(snowflake));
  }

  getMany(snowflakes: readonly string[]): Promise<Map<string, UserSettings>> {
    this.reads.getMany += 1;
    this.asked.push([...snowflakes]);
    return Promise.resolve(new Map(snowflakes.map((snowflake) => [snowflake, this.of(snowflake)])));
  }

  update(snowflake: string, patch: UserSettingsPatch): Promise<void> {
    this.settings.set(snowflake, { ...this.settings.get(snowflake), ...patch });
    return Promise.resolve();
  }

  /** As the column's collation compares: the whole name, without regard to case and accents. */
  withNickname(nickname: string): Promise<NicknameHolder[]> {
    const holders: NicknameHolder[] = [];
    for (const [snowflake, set] of this.settings) {
      const stored = set.nickname;
      if (
        typeof stored === 'string' &&
        stored.localeCompare(nickname, 'en', { sensitivity: 'base' }) === 0
      ) {
        holders.push({ snowflake, nickname: stored });
      }
    }
    return Promise.resolve(holders);
  }
}
