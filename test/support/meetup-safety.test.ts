import { describe } from 'vitest';
import { meetupSafetyCases } from './meetup-safety-cases.js';
import { MemoryMeetupSafety } from './meetup-safety.js';

describe('MemoryMeetupSafety', () => {
  meetupSafetyCases(() => Promise.resolve(new MemoryMeetupSafety()));
});
