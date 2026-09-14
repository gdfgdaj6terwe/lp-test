# Nuvio direct anime and Lampac providers

Files: `nvo-mode.js`, `manifest.json`, `nvo-mode.test.cjs`, `nvo-animego.test.cjs`.
Target: official NuvioTV `0.9.2-beta` (release commit `e54a749`).

## Version 0.2.1: Slime S4E9

Added the fixed profile NVO AniBoom / РуАниме / DEEP / 1080p. AnimeGO provides this episode through AniBoom in that voice. AniLibria is present only through Kodik, and JAM CLUB is absent from the tested episode response. Therefore the two earlier AniBoom profiles correctly return no result for S4E9 and Nuvio removes their red source chips.

The new profile returned one source in QuickJS using the Nuvio fetch polyfill. Existing studio profiles stay exact: they never silently switch to DEEP. Refresh the plugin repository and select the DEEP profile for this episode. Availability still varies by episode and studio.

## Version 0.2.0: direct 1080p anime

Refresh the existing plugin repository. Two enabled profiles now appear at the top:

- **NVO AniBoom / AniLibria / 1080p**
- **NVO AniBoom / JAM CLUB / 1080p**

They run directly in Nuvio without Real-Debrid, AIOStreams, or another paid account. Existing Kodik profile IDs and behavior remain unchanged. Keep the same next-episode settings listed below.

The resolver searches AnimeGO, checks the title and release date against TMDB episode dates, and maps split anime releases to their local episode numbers. Full localized halves of bilingual titles are accepted. Unrelated shows, ambiguous matches, missing episodes, specials and missing studios return no stream instead of guessing. This route supports Japanese-language series.

AniBoom provides an HLS master with separate audio. The plugin confirms that the master offers 1080p and returns it intact with the required playback headers. Returning only its video variant would lose sound. Playback is adaptive up to 1080p; use the native player quality selector to pin 1080p if needed. The plugin does not force track selection.

Live full-resolver checks passed for Slime S3E1 and S3E2 in AniLibria and JAM CLUB, plus Solo Leveling S1E1 in AniLibria. They used actual TMDB, AnimeGO and AniBoom responses. Final runs took about 0.45-1.07 seconds and 8-10 requests per profile.

ffprobe found a real 1920x1080 H.264 rendition and AAC audio in both Slime voices. ffmpeg decoded two seconds of S3E2 at 1080p with audio for both, exit 0. Studio names come from AnimeGO; the audio language tag itself is unspecified. Playback of this new provider inside the TV app and automatic episode transitions remain unverified. The user confirmed that the earlier separate voice profiles switch correctly in Nuvio.

Coverage follows AnimeGO. Slime S3 is verified; the first two seasons were not found in the tested searches. This does not promise every title or season. Existing Kodik profiles remain available as a 720p fallback.

All 22 fixture tests pass, including audio preservation, exact voice matching, adjacent episodes, split releases, wrong dates, bilingual titles and actual manifest IDs. Run `node --test nvo-mode.test.cjs nvo-animego.test.cjs`.

## Install

GitHub Pages manifest: https://gdfgdaj6terwe.github.io/lp-test/manifest.json

Serve only the JS and manifest together in an isolated HTTP directory, or publish those two files to a static host. Add the URL ending in `/manifest.json` under Nuvio's plugin repositories. Keep the installed AIOStreams addon. Lampac results appear alongside its sources in Nuvio's normal source picker.

Do not serve the whole lp-test directory: it contains unrelated configuration. GitHub Pages installation requires no local server.

The manifest also enables four fixed Kodik profiles: AniLibria.TV, AniLibria.TV Old, AniDUB and KANSAI Studio, all at 720p. Other balancers have optional MANUAL profiles, disabled initially. Enable these in the plugin list when browsing their sources. Their availability has not been established by the adjacent-episode smoke check.

## Next episode

Under playback / automatic source selection, use:

- Manual initial source selection.
- `Автовоспроизведение следующего эпизода`: on.
- `Предпочитать ту же группу (Binge Group)`: on.
- `Запасной вариант при ошибке группы серий`: off.

Select a fixed profile, not one labelled MANUAL. Nuvio will request the next episode and match the profile's group. If the voice or exact quality is missing, or several distinct editions match, this prototype returns no stream for that profile. With fallback disabled, Nuvio should show its source picker rather than select another profile.

For MANUAL profiles, turn same-group preference and next-episode autoplay off: Nuvio groups all results of that profile together, so it cannot preserve a selected voice within the group. Reusing the last link is a separate same-episode cache, not the next-episode mechanism.

Nuvio controls the timing of its next-episode prompt. This plugin does not replace the player or its end-of-video handling. For an end-of-file trial, use a zero-minutes-before-end threshold and account for any enabled outro skipping.

## How matching works

Nuvio ignores a JS result's custom `behaviorHints`. Its converter assigns `local-plugin-<scraper.id>` itself, and the manager prefixes the manifest ID with the repository ID. The runtime exposes this full ID through `SCRAPER_ID`.

The manifest therefore registers the same JS under separate stable IDs: `nvo1~provider~URL-encoded-exact-voice~quality`. The JS decodes the ID and returns only that variant. Do not change the meaning of an existing ID or move the repository URL while testing group reuse. Add a new ID for a new voice or quality. Matching normalizes case and whitespace only; aliases such as AniLibria.TV and AniLibria.TV Old stay separate.

The script uses the TMDB key supplied by Nuvio at runtime. No user token is embedded. It reads metadata, requests the exact season and episode from Lampac, follows voice menus, resolves call responses, and preserves HTTP headers and supported subtitle data. Navigation and resolver requests remain on the configured Lampac origin. Media URLs can point to the returned CDN.

## Evidence and limits

`rc.bwa.ad` returned an RCH WebSocket challenge for Rezka, Kodik and AniLibria. The inspected Nuvio runtime has no WebSocket bridge. The prototype uses `http://smotret24.com`, an alternate already present in the project's tests. Its metadata requests use HTTP; the two tested video links used HTTPS.

Live resolver checks for TMDB 82684, S1E1 and S1E2 returned one Kodik / AniLibria.TV / 720p stream each, in approximately 1.03 and 0.67 seconds. Each episode made three Lampac requests. The smoke harness supplied known title metadata instead of calling authenticated TMDB; actual TMDB integration in Nuvio remains untested. No video segments were downloaded.

Automated fixtures cover adjacent episodes, missing voice/quality, exact season selection, season zero, resolver headers, foreign resolver rejection, cycles, challenges, ambiguous editions, repository-prefixed IDs, and manifest execution. Run `node --test nvo-mode.test.cjs` from the directory containing the three files.

Not yet verified: installation in the TV app, actual playback, the end-to-next-episode transition, the other balancers, and long-term server availability. RCH and authorization failures raise explicit errors; Nuvio may show these only in plugin diagnostics. A successful link response does not prove successful playback.

## Source references

- [AnimeGO/AniBoom protocol reference](https://github.com/ialakey/anime-dl-core/blob/main/src/anime_dl_core/players/aniboom.py)
- [AnimeGO catalog/player reference](https://github.com/ialakey/anime-dl-core/blob/main/src/anime_dl_core/sources/animego.py)

- [Plugin result conversion](https://github.com/NuvioMedia/NuvioTV/blob/0.9.2-beta/app/src/main/java/com/nuvio/tv/domain/model/Plugin.kt)
- [Plugin manager and installed IDs](https://github.com/NuvioMedia/NuvioTV/blob/0.9.2-beta/app/src/full/java/com/nuvio/tv/core/plugin/PluginManager.kt)
- [JS runtime](https://github.com/NuvioMedia/NuvioTV/blob/0.9.2-beta/app/src/full/java/com/nuvio/tv/core/plugin/PluginRuntime.kt)
- [Next-episode source selection](https://github.com/NuvioMedia/NuvioTV/blob/0.9.2-beta/app/src/main/java/com/nuvio/tv/ui/screens/player/PlayerRuntimeControllerStreams.kt)
