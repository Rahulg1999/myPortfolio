# music/

Your soundtrack is **folders, not a settings screen**. Drop audio files in and the game
finds them on load.

```
music/
├── menu/      plays in the menus
└── combat/    plays during a run
```

## Naming

Number the files: `01`, `02`, `03`, … Any of these extensions work:

`.mp3` `.ogg` `.m4a` `.opus` `.wav` `.webm`

```
music/combat/01.mp3
music/combat/02.mp3
music/combat/03.ogg
music/menu/01.mp3
```

**Why numbers?** A browser cannot list a directory, and the previous server-side approach
was removed. So the game probes `01`, `02`, … and stops after 3 consecutive misses.
Numbering is the price of needing no server and no manifest to keep in sync.

Gaps are fine up to 2 in a row (`01`, `02`, `04` works — `01`, `05` does not). Up to 40
tracks per folder.

## Behaviour

- Both lists are **shuffled at the start of every match**, so runs don't open on the same
  track twice in a row.
- Leave one folder empty and the other covers both contexts.
- Leave both empty and the built-in adaptive score plays instead.
- **M** switches between your playlists and the adaptive score. **N** skips a track.
- Settings → Soundtrack shows how many tracks were found, with a **Rescan folders**
  button for when you add files without reloading.

If nothing is found, check the numbering first — that is almost always the reason.
