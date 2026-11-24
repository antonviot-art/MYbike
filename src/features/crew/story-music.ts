export type StoryTrack = { id: string; title: string; style?: string; credit?: { artist: string; source: string } };

const scottBuckleyTracks = [
  ["neon", "Neon"],
  ["race-the-sun", "Race The Sun"],
  ["tears-in-rain", "Tears in Rain"],
  ["the-distant-sun", "Monomyth – The Distant Sun"],
  ["the-encounter", "Monomyth – The Encounter"],
  ["signal-to-noise", "Signal to Noise"],
  ["the-climb", "The Climb"],
  ["omega", "Omega"],
  ["hiraeth", "Hiraeth"],
  ["origami", "Origami"],
  ["aphelion", "Aphelion"],
  ["convergence", "Convergence"],
  ["starfire", "Starfire"],
  ["born-of-the-sky", "Born Of The Sky"],
  ["penumbra", "Penumbra"],
  ["wildflowers", "Wildflowers"],
  ["memories-of-stone", "Memories Of Stone"],
  ["unraveling", "Unraveling"],
  ["with-these-hands", "With These Hands"],
  ["eyes-in-the-void", "Eyes In The Void"],
  ["song-of-the-forge", "Song Of The Forge"],
  ["meanwhile", "Meanwhile"],
  ["the-long-dark", "The Long Dark"],
] as const;

export const licensedStoryTracks: StoryTrack[] = scottBuckleyTracks.map(([slug, title]) => ({
  id: 'sb-' + slug,
  title,
  credit: { artist: 'Scott Buckley', source: 'https://www.scottbuckley.com.au/library/' + slug + '/' },
}));
