import { afterEach, expect, it, vi } from 'vitest';
import { ScreeningSession } from '../../src/screening/session';
import { BASELINE_ROLL } from '../../src/utils/rollLayout';

const session = (music = 'autumn') => new ScreeningSession(BASELINE_ROLL,
  { reel: 'tracking', pace: 'normal', tuning: {}, music, volume: .4 }, { stockType: 'negative' },
  { title: 'Test', stock: '', format: '', frames: 5 }, 16 / 9);
afterEach(() => vi.restoreAllMocks());

it('loops music, follows its clock, and stops for pause, seek, preparation and export', () => {
  const s = session(), audio = s.musicPlayer;
  const play = vi.spyOn(audio, 'play').mockResolvedValue();
  const stop = vi.spyOn(audio, 'stop');
  vi.spyOn(audio, 'unlock').mockResolvedValue();
  const now = vi.spyOn(audio, 'now').mockReturnValue(null);
  s.holding = true; s.tick(.1); expect(play).not.toHaveBeenCalled();
  s.holding = false; s.tick(.1);
  expect(play).toHaveBeenLastCalledWith(s.musicTrack, 0, s.musicTrack!.drop, s.timeline.duration, .4, true);
  now.mockReturnValue(8); s.tick(.1); expect(s.time).toBe(8);
  s.pause(); expect(stop).toHaveBeenCalled(); s.tick(.1); expect(s.time).toBe(8);
  s.seek(12); expect(s.time).toBe(12);
  now.mockReturnValue(null); s.play(); s.tick(.1);
  expect(play).toHaveBeenLastCalledWith(s.musicTrack, 12, s.musicTrack!.drop, s.timeline.duration, .4, true);
  s.setExporting(true); expect(s.playing).toBe(false);
  const calls = play.mock.calls.length; s.tick(.1); expect(play).toHaveBeenCalledTimes(calls);
});

it('continues silently after a load failure without retrying every frame', async () => {
  const s = session();
  const play = vi.spyOn(s.musicPlayer, 'play').mockRejectedValue(new Error('Music unavailable'));
  s.tick(.1); await Promise.resolve();
  expect(s.getSnapshot().musicError).toBe('Music unavailable');
  s.tick(.1); expect(play).toHaveBeenCalledTimes(1); expect(s.time).toBeCloseTo(.2);
});

it('does not create audio for No music', () => {
  const s = session('none'), play = vi.spyOn(s.musicPlayer, 'play');
  s.play(); s.tick(.1); expect(play).not.toHaveBeenCalled(); expect(s.time).toBe(.1);
});
