import { RollRepository } from './rollRepository';

// Guest data and preferences never touch the original darkroom library.
export const guestRollRepository = new RollRepository(undefined, 'darkroom-guest-rolls');
export const guestActiveRollKey = 'darkroom-guest-active-roll';
export const guestWelcomeKey = 'darkroom-guest-welcome';
