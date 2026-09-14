# Nuvio Lampac prototype

Files: `nvo-mode.js`, `nvo-manifest.json`, `nvo-mode.test.cjs`.
Target: official NuvioTV `0.9.2-beta` (release commit `e54a749`).

## Install

GitHub Pages manifest: https://gdfgdaj6terwe.github.io/lp-test/nvo-manifest.json

Serve only the JS and manifest together in an isolated HTTP directory, or publish those two files to a static host. Add the URL ending in `/nvo-manifest.json` under Nuvio's plugin repositories. Keep the installed AIOStreams addon. Lampac results appear alongside its sources in Nuvio's normal source picker.

Do not serve the whole lp-test directory: it contains unrelated configuration. GitHub Pages installation requires no local server.

The manifest enables four fixed Kodik profiles: AniLibria.TV, AniLibria.TV Old, AniDUB and KANSAI Studio, all at 720p. Other balancers have optional MANUAL profiles, disabled initially. Enable these in the plugin list when browsing their sources. Their availability has not been established by the adjacent-episode smoke check.

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

- [Plugin result conversion](https://github.com/NuvioMedia/NuvioTV/blob/0.9.2-beta/app/src/main/java/com/nuvio/tv/domain/model/Plugin.kt)
- [Plugin manager and installed IDs](https://github.com/NuvioMedia/NuvioTV/blob/0.9.2-beta/app/src/full/java/com/nuvio/tv/core/plugin/PluginManager.kt)
- [JS runtime](https://github.com/NuvioMedia/NuvioTV/blob/0.9.2-beta/app/src/full/java/com/nuvio/tv/core/plugin/PluginRuntime.kt)
- [Next-episode source selection](https://github.com/NuvioMedia/NuvioTV/blob/0.9.2-beta/app/src/main/java/com/nuvio/tv/ui/screens/player/PlayerRuntimeControllerStreams.kt)
