/**
 * AIOStreams - Lampa Plugin
 * Version: 3.0.1
 *
 * Plugin for integrating AIOStreams (Stremio aggregator) with Lampa
 *
 * Installation:
 * 1. Add this plugin URL to Lampa settings
 * 2. Go to Settings -> AIOStreams
 * 3. Verify manifest URL
 */

(function () {
    'use strict';

    var PLUGIN_NAME = 'aiostreams';
    var PLUGIN_VERSION = '4.3.2';
    var PLUGIN_TITLE = 'AIOStreams';
    var PLUGIN_LOGO = 'https://raw.githubusercontent.com/Viren070/AIOStreams/refs/heads/main/packages/frontend/public/logo.png';

    // Default settings
    var DEFAULT_SETTINGS = {
        aiostreams_url: '',
        timeout: 120000     // Request timeout - 2 minutes
    };

    // ==================== UTILITIES ====================

    /**
     * Extract base URL from manifest URL
     */
    function extractBaseUrl(manifestUrl) {
        if (!manifestUrl) return '';
        var url = manifestUrl.trim();
        // Remove /manifest.json if present
        url = url.replace(/\/manifest\.json\/?$/i, '');
        // Remove trailing slash
        url = url.replace(/\/$/, '');
        return url;
    }

    /**
     * Determine content type
     */
    function getContentType(movie) {
        if (movie.number_of_seasons || movie.seasons) return 'series';
        if (movie.first_air_date) return 'series';
        return 'movie';
    }

    /**
     * Get IMDb ID
     */
    function getImdbId(movie) {
        return movie.imdb_id || '';
    }

    /**
     * Parse stream title for display
     */
    function parseStreamTitle(stream) {
        var title = stream.title || stream.name || 'Unknown';

        // Extract quality
        var quality = '';
        var qualityMatch = title.match(/\b(4K|2160p|1080p|720p|480p|HDR|DV|Dolby Vision)\b/i);
        if (qualityMatch) quality = qualityMatch[1].toUpperCase();

        // Extract size
        var size = '';
        var sizeMatch = title.match(/(\d+\.?\d*)\s*(GB|MB)/i);
        if (sizeMatch) size = sizeMatch[1] + ' ' + sizeMatch[2].toUpperCase();

        // Extract codec
        var codec = '';
        var codecMatch = title.match(/\b(HEVC|H\.?265|H\.?264|x265|x264|AV1)\b/i);
        if (codecMatch) codec = codecMatch[1].toUpperCase();

        // Extract audio
        var audio = '';
        var audioMatch = title.match(/\b(Atmos|DTS-HD|DTS|TrueHD|DD\+?5\.1|AAC|AC3)\b/i);
        if (audioMatch) audio = audioMatch[1];

        // Extract languages (common patterns)
        var languages = [];
        var langPatterns = [
            /\b(Russian|Русский|RUS|Рус)\b/i,
            /\b(English|ENG|Англ)\b/i,
            /\b(Ukrainian|Ukr|Укр)\b/i,
            /\b(Multi|Dual|Много)\b/i,
            /\b(German|Ger|Deu)\b/i,
            /\b(French|Fre|Fra)\b/i,
            /\b(Spanish|Spa|Esp)\b/i
        ];
        langPatterns.forEach(function (pattern) {
            var match = title.match(pattern);
            if (match) languages.push(match[1]);
        });

        // Extract source/release info
        var source = '';
        var sourceMatch = title.match(/\b(BluRay|BDRip|WEB-DL|WEBRip|HDTV|DVDRip|Remux)\b/i);
        if (sourceMatch) source = sourceMatch[1];

        return {
            full: title,
            quality: quality,
            size: size,
            codec: codec,
            audio: audio,
            languages: languages,
            source: source
        };
    }

    /**
     * Get stream URL - handle different stream formats
     */
    function getStreamUrl(stream) {
        // Direct URL
        if (stream.url) {
            return stream.url;
        }

        // Some addons use different field names
        if (stream.externalUrl) {
            return stream.externalUrl;
        }

        return null;
    }

    /**
     * Show player choice dialog for web platform
     */
    function showPlayerChoiceDialog(playerData, movie) {
        // If not on web platform, play directly with internal player
        if (!Lampa.Platform.is('web')) {
            Lampa.Player.play(playerData);
            return;
        }

        // On web platform, default to external player (torrent player)
        var torrentPlayer = Lampa.Storage.get('player_torrent', '');
        if (torrentPlayer) {
            playerData.player = torrentPlayer;
        }

        console.log('AIOStreams: Opening in external player:', torrentPlayer || 'default');
        Lampa.Player.play(playerData);
    }

    // ==================== AIOSTREAMS SOURCE ====================


var DbrStyles = ".dbr3 {\n  color: #f6f6f6;\n  background: #141414;\n}\n.dbr3 .explorer__files-head {\n  display: none;\n}\n.dbr3 .explorer__files {\n  width: 100%;\n  min-width: 0;\n}\n.dbr3-layout {\n  display: flex;\n  height: calc(100vh - 4em);\n  box-sizing: border-box;\n  padding: 1.2em 2em 1.2em 1em;\n  gap: 2.4em;\n  min-height: 0;\n}\n.dbr4-detail {\n  flex: 0 0 30%;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  overflow: hidden;\n}\n.dbr4-art {\n  height: 9em;\n  flex-shrink: 0;\n  background: #202020;\n  position: relative;\n  border-radius: 0.4em;\n  overflow: hidden;\n  margin-bottom: 1em;\n}\n.dbr4-art img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n}\n.dbr4-art:before {\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  background: linear-gradient(0deg, rgba(20,20,20, 0.3), transparent 50%);\n  z-index: 1;\n}\n.dbr4-kicker {\n  font-size: 0.68em;\n  letter-spacing: 0.1em;\n  text-transform: uppercase;\n  color: #b5b5b5;\n  height: 1.6em;\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n  flex-shrink: 0;\n}\n.dbr4-detail h1 {\n  font-size: 1.65em;\n  line-height: 1.15;\n  height: 2.3em;\n  margin: 0.35em 0 0.4em;\n  overflow: hidden;\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  flex-shrink: 0;\n}\n.dbr4-meta {\n  font-size: 0.78em;\n  line-height: 1.5;\n  height: 1.5em;\n  color: #bebebe;\n  flex-shrink: 0;\n}\n.dbr4-description {\n  font-size: 0.82em;\n  line-height: 1.55;\n  height: 4.65em;\n  margin: 1em 0 0.5em;\n  overflow: hidden;\n  display: -webkit-box;\n  -webkit-line-clamp: 3;\n  -webkit-box-orient: vertical;\n  flex-shrink: 0;\n}\n.dbr4-progress {\n  height: 2em;\n  flex-shrink: 0;\n  margin: 0.3em 0 0.5em;\n}\n.dbr4-progress-label {\n  font-size: 0.68em;\n  color: #b8b8b8;\n  height: 1.4em;\n}\n.dbr4-progress-track {\n  height: 2px;\n  background: #343434;\n  margin-top: 0.3em;\n}\n.dbr4-progress-fill {\n  height: 100%;\n  background: #565656;\n}\n.dbr4-actions {\n  display: flex;\n  flex-direction: column;\n  gap: 0.6em;\n  margin-top: 0.4em;\n}\n.dbr3-button {\n  cursor: pointer;\n  padding: 0.65em 0.9em;\n  border-radius: 0.28em;\n  line-height: 1.25;\n  font-size: 0.84em;\n  background: #292929;\n  box-sizing: border-box;\n  min-width: 0;\n}\n.dbr4-actions .dbr3-button {\n  height: 2.8em;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  flex-shrink: 0;\n}\n.dbr4-primary {\n  background: #f4f4f4;\n  color: #151515;\n  font-weight: 700;\n}\n.dbr4-right {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n}\n.dbr4-toolbar {\n  flex-shrink: 0;\n  padding: 0.25em 0.25em 0.8em;\n}\n.dbr4-tabs {\n  display: flex;\n  align-items: center;\n  gap: 1em;\n  border-bottom: 1px solid #393939;\n  padding-bottom: 0.65em;\n}\n.dbr4-tab {\n  background: transparent;\n  font-size: 1.05em;\n  padding: 0.4em 0.15em;\n  border-radius: 0;\n  position: relative;\n  color: #a7a7a7;\n}\n.dbr4-tab.selected {\n  color: white;\n}\n.dbr4-tab.selected:after {\n  content: \"\";\n  height: 3px;\n  background: #565656;\n  position: absolute;\n  left: 0;\n  right: 0;\n  bottom: -0.7em;\n}\n.dbr4-tools {\n  margin-left: auto;\n  display: flex;\n  gap: 0.6em;\n}\n.dbr4-dropdown {\n  display: flex;\n  align-items: center;\n  gap: 1em;\n}\n.dbr4-chevron {\n  width: 1em;\n  height: 1em;\n  flex-shrink: 0;\n}\n.dbr3-sources {\n  display: flex;\n  align-items: center;\n  gap: 0.65em;\n  height: 3.2em;\n  flex-shrink: 0;\n  overflow-x: auto;\n  overflow-y: hidden;\n  padding: 0.2em 0.25em;\n  box-sizing: border-box;\n  scrollbar-width: none;\n}\n.dbr3-source {\n  display: flex;\n  gap: 0.7em;\n  align-items: center;\n  flex-shrink: 0;\n  background: transparent;\n  color: #aaaaaa;\n  font-size: 0.8em;\n  max-width: 14em;\n  white-space: nowrap;\n  overflow: hidden;\n}\n.dbr3-source b {\n  font-size: 0.8em;\n  font-weight: 400;\n  color: inherit;\n}\n.dbr3-source.selected {\n  background: #303030;\n  color: #ffffff;\n}\n.dbr4-voices {\n  display: flex;\n  align-items: center;\n  gap: 0.55em;\n  height: 3.3em;\n  flex-shrink: 0;\n  padding: 0.3em 0.25em 0.6em;\n  overflow-x: auto;\n  overflow-y: hidden;\n  box-sizing: border-box;\n  scrollbar-width: none;\n}\n.dbr4-voice-label {\n  font-size: 0.7em;\n  color: #999999;\n  flex-shrink: 0;\n  margin-right: 0.45em;\n}\n.dbr4-voice {\n  font-size: 0.74em;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  max-width: 14em;\n  flex-shrink: 0;\n  background: #141619;\n}\n.dbr4-voice.selected {\n  background: #eeeeee;\n  color: #161616;\n}\n.dbr4-muted {\n  font-size: 0.75em;\n  color: #999999;\n}\n.dbr4-right > .scroll {\n  flex: 1;\n  min-height: 0;\n  height: 100% !important;\n  width: 100%;\n  overflow: hidden;\n}\n.dbr4-right .scroll__body {\n  padding: 0.3em 0.3em 1em !important;\n}\n.dbr3 .selector.focus {\n  outline: 0.14em solid white;\n  outline-offset: 0.12em;\n  box-shadow: none;\n  background: #3b3b3b;\n  color: #ffffff;\n}\n.dbr3 .dbr4-primary.focus {\n  background: white;\n  color: #111111;\n}\n.dbr3-stream {\n  display: flex;\n  align-items: center;\n  gap: 1em;\n  height: 7.1em;\n  padding: 1em 0.8em;\n  margin: 0.25em 0 0.45em;\n  border-bottom: 1px solid #303030;\n  border-radius: 0.3em;\n  box-sizing: border-box;\n  cursor: pointer;\n}\n.dbr3-quality {\n  flex: 0 0 3.5em;\n  font-size: 1.1em;\n  font-weight: 700;\n}\n.dbr3-stream-copy {\n  flex: 1;\n  min-width: 0;\n}\n.dbr3-stream-copy strong {\n  display: block;\n  font-size: 0.95em;\n  line-height: 1.4;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.dbr3-stream-copy small {\n  display: block;\n  font-size: 0.67em;\n  line-height: 1.4;\n  color: #aaaaaa;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  margin-top: 0.25em;\n}\n.dbr3-stream-copy p {\n  font-size: 0.7em;\n  color: #999999;\n  line-height: 1.4;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  margin: 0.35em 0;\n}\n.dbr3-size {\n  flex: 0 0 4.5em;\n  text-align: right;\n  font-size: 0.78em;\n}\n.dbr3-size small {\n  display: block;\n  color: #b2b2b2;\n  font-size: 0.75em;\n  margin-top: 0.5em;\n}\n.dbr3-count {\n  font-size: 0.7em;\n  color: #929292;\n  padding: 0.4em 0.9em 0.7em;\n}\n.dbr3-episode {\n  display: flex;\n  align-items: center;\n  gap: 0.9em;\n  height: 7.2em;\n  padding: 0.65em 0.4em;\n  margin: 0.2em 0 0.6em;\n  border-radius: 0.35em;\n  box-sizing: border-box;\n  cursor: pointer;\n}\n.dbr4-episode-number {\n  flex: 0 0 1.2em;\n  font-size: 1.1em;\n  color: #aaaaaa;\n  text-align: center;\n}\n.dbr3-preview {\n  width: 8.7em;\n  height: 4.9em;\n  flex-shrink: 0;\n  position: relative;\n  border-radius: 0.25em;\n  overflow: hidden;\n  background: #141619;\n  color: #999999;\n  font-size: 0.8em;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n.dbr3-preview img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n}\n.dbr3-episode-copy {\n  flex: 1;\n  min-width: 0;\n}\n.dbr3-episode-copy strong {\n  font-size: 0.95em;\n  display: block;\n  line-height: 1.35;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.dbr3-episode-copy p {\n  font-size: 0.72em;\n  line-height: 1.5;\n  height: 3em;\n  margin: 0.5em 0;\n  overflow: hidden;\n  color: #aaaaaa;\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n}\n.dbr3-episode-copy .time-line {\n  height: 2px;\n}\n.dbr4-episode-status {\n  flex: 0 0 3.4em;\n  text-align: right;\n  font-size: 0.7em;\n  color: #aaaaaa;\n}\n.dbr4-episode-status span,\n.dbr4-episode-status small {\n  display: block;\n  height: 1.6em;\n}\n.dbr4-episode-status small {\n  color: #c0c0c0;\n}\n.dbr3-empty {\n  padding: 2.5em 1em;\n  line-height: 1.6;\n  font-size: 0.95em;\n  color: #aaaaaa;\n}\n.dbr3-loading {\n  font-size: 0.75em;\n  color: #aaaaaa;\n  padding: 0.7em;\n}\n.dbr3-skeleton {\n  display: flex;\n  align-items: center;\n  gap: 1em;\n  height: 7em;\n  padding: 1em;\n  box-sizing: border-box;\n}\n.dbr3-skeleton-preview {\n  width: 5em;\n  height: 3em;\n}\n.dbr3-skeleton-body {\n  flex: 1;\n}\n.dbr3-skeleton-body div {\n  height: 0.65em;\n  margin: 0.75em 0;\n  width: 75%;\n}\n.dbr3-skeleton-body div:first-child {\n  width: 55%;\n  height: 0.85em;\n}\n.dbr3-skeleton-body div:last-child {\n  width: 40%;\n}\n.dbr3-skeleton-end {\n  width: 3em;\n  height: 1em;\n}\n.dbr4-source-placeholder {\n  width: 5em;\n  height: 1.5em;\n  flex-shrink: 0;\n}\n.dbr4-voice-placeholder {\n  width: 5em;\n  height: 1.8em;\n  flex-shrink: 0;\n}\n.dbr4-shimmer,\n.dbr3-skeleton-preview,\n.dbr3-skeleton-body div,\n.dbr3-skeleton-end {\n  position: relative;\n  overflow: hidden;\n  background: #141619;\n  border-radius: 0.25em;\n}\n.dbr4-shimmer:after,\n.dbr3-skeleton-preview:after,\n.dbr3-skeleton-body div:after,\n.dbr3-skeleton-end:after {\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  background: linear-gradient(\n    105deg,\n    transparent 20%,\n    rgba(255,255,255, 0.08) 50%,\n    transparent 80%\n  );\n  transform: translateX(-100%);\n  animation: dbr4-shimmer 1.7s ease-in-out infinite;\n  pointer-events: none;\n}\n@keyframes dbr4-shimmer {\n  to {\n    transform: translateX(100%);\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .dbr4-shimmer:after,\n  .dbr3-skeleton *:after {\n    animation: none;\n  }\n}\n@media (max-height: 650px) {\n  .dbr4-art {\n    height: 7em;\n  }\n  .dbr4-description {\n    margin-top: 0.6em;\n  }\n  .dbr3-layout {\n    padding-top: 0.5em;\n  }\n}\n@media (max-width: 800px) {\n  .dbr3-layout {\n    gap: 1.3em;\n    padding-right: 1em;\n  }\n  .dbr4-detail {\n    flex-basis: 29%;\n  }\n  .dbr4-tools {\n    gap: 0.4em;\n  }\n  .dbr4-tabs {\n    gap: 0.7em;\n  }\n  .dbr3-preview {\n    width: 6.5em;\n    height: 3.7em;\n  }\n}\n\n.dbr4-right .scroll__content{padding:0!important}.dbr4-art{height:9.5em}.dbr4-right .scroll{mask-image:none!important;-webkit-mask-image:none!important}\n\n.dbr3 {\n  background: #141619;\n  color: #ededed;\n}\n.dbr3-layout {\n  position: relative;\n  isolation: isolate;\n  padding-left: 1.5em;\n}\n.dbr4-detail {\n  padding-top: 4.2em;\n  box-sizing: border-box;\n}\n.dbr4-art {\n  position: absolute;\n  left: 0;\n  top: 0;\n  width: 65%;\n  height: 100%;\n  margin: 0;\n  border-radius: 0;\n  background: transparent;\n  z-index: -1;\n  pointer-events: none;\n}\n.dbr4-art img {\n  object-fit: cover;\n  object-position: 35% center;\n  opacity: 0.62;\n}\n.dbr4-art:before {\n  z-index: 1;\n  background:\n    linear-gradient(\n      90deg,\n      rgba(35,35,35, 0.2),\n      rgba(35,35,35, 0.65) 47%,\n      #141619 96%\n    ),\n    linear-gradient(\n      0deg,\n      #141619 3%,\n      rgba(35,35,35, 0.7) 40%,\n      transparent 90%\n    );\n}\n.dbr4-art.dbr4-shimmer:after {\n  opacity: 0.2;\n}\n.dbr4-kicker {\n  color: #b8b8b8;\n}\n.dbr4-detail h1 {\n  font-size: 1.9em;\n  height: 2.3em;\n  color: #f1f1f1;\n}\n.dbr4-meta {\n  color: #b6b6b6;\n}\n.dbr4-description {\n  color: #cecece;\n}\n.dbr4-progress-label {\n  color: #b4b4b4;\n}\n.dbr4-progress-track {\n  background: #ffffff1c;\n}\n.dbr4-progress-fill,\n.dbr4-tab.selected:after {\n  background: #a6a6a6;\n}\n.dbr4-tabs {\n  border-color: #ffffff20;\n}\n.dbr3-button {\n  background: #ffffff0c;\n  color: #d1d1d1;\n}\n.dbr3 .selector.focus {\n  background: #4a4a4a;\n  color: #f8f8f8;\n  outline-color: #d3d3d3;\n}\n.dbr4-primary,\n.dbr3 .dbr4-primary.focus {\n  background: #e2e2e2;\n  color: #141619;\n}\n.dbr3-source.selected {\n  background: #ffffff13;\n  color: #eaeaea;\n}\n.dbr4-voice {\n  background: #ffffff08;\n  border: 1px solid #ffffff14;\n}\n.dbr4-voice.selected {\n  background: #c4c4c4;\n  color: #141619;\n  border-color: #c4c4c4;\n}\n.dbr3-stream {\n  border-color: #ffffff15;\n}\n.dbr3-stream-copy small,\n.dbr3-stream-copy p,\n.dbr3-episode-copy p,\n.dbr3-count,\n.dbr4-voice-label {\n  color: #aeaeae;\n}\n.dbr3-preview,\n.dbr4-source-placeholder,\n.dbr4-voice-placeholder,\n.dbr3-skeleton-preview,\n.dbr3-skeleton-body div,\n.dbr3-skeleton-end {\n  background: #303030;\n}\n.dbr4-actions {\n  margin-top: 1em;\n}\n.dbr4-actions .dbr3-button:not(.dbr4-primary) {\n  background: transparent;\n  border: 1px solid #ffffff18;\n}\n.dbr4-actions .dbr3-button.focus {\n  background: #4a4a4a;\n}\n.dbr4-primary {\n  max-width: 100%;\n}\n@media (max-height: 650px) {\n  .dbr4-detail {\n    padding-top: 3em;\n  }\n}\n@media (max-width: 700px) {\n  .dbr4-detail {\n    padding-top: 2em;\n  }\n}\n\n.dbr3-button {\n  border: 1px solid rgba(233,233,233, 0.13);\n  background: rgba(228,228,228, 0.045);\n  border-radius: 0.45em;\n  color: #d7d7d7;\n  box-shadow: inset 0 1px 0 rgba(255,255,255, 0.035);\n  transition:\n    background 0.15s,\n    border-color 0.15s,\n    box-shadow 0.15s;\n}\n.dbr4-actions .dbr3-button:not(.dbr4-primary) {\n  background: rgba(33,33,33, 0.32);\n  border-color: rgba(230,230,230, 0.17);\n}\n.dbr4-tools .dbr3-button {\n  background: rgba(221,221,221, 0.045);\n  border-color: rgba(230,230,230, 0.14);\n  padding: 0.65em 1em;\n}\n.dbr4-tab {\n  border: 0;\n  box-shadow: none;\n  background: transparent;\n  border-radius: 0;\n}\n.dbr3-source {\n  border-color: transparent;\n  box-shadow: none;\n  background: transparent;\n}\n.dbr3-source.selected {\n  background: rgba(229,229,229, 0.055);\n  border-color: rgba(230,230,230, 0.16);\n}\n.dbr4-voice {\n  background: rgba(228,228,228, 0.035);\n  border-color: rgba(230,230,230, 0.14);\n}\n.dbr4-voice.selected {\n  color: #e3e3e3;\n  background: rgba(173,173,173, 0.15);\n  border-color: rgba(203,203,203, 0.46);\n}\n.dbr4-primary {\n  border-color: rgba(248,248,248, 0.42);\n  background: linear-gradient(\n    135deg,\n    rgba(240,240,240, 0.92),\n    rgba(204,204,204, 0.87)\n  );\n  color: #222222;\n  box-shadow:\n    inset 0 1px 0 rgba(255,255,255, 0.3),\n    0 0.15em 0.7em rgba(0,0,0, 0.14);\n  font-weight: 600;\n}\n.dbr3 .selector.focus {\n  background: rgba(194,194,194, 0.16);\n  color: #f3f3f3;\n  outline: 0.12em solid rgba(222,222,222, 0.9);\n  outline-offset: 0.12em;\n  box-shadow: 0 0 0 0.22em rgba(188,188,188, 0.07);\n}\n.dbr3 .dbr4-primary.focus {\n  background: linear-gradient(135deg, #f2f2f2, #d4d4d4);\n  color: #1f1f1f;\n  box-shadow: 0 0.15em 1em rgba(0,0,0, 0.15);\n  outline-color: rgba(238,238,238, 0.94);\n}\n.dbr3 .dbr4-actions .dbr3-button.focus:not(.dbr4-primary) {\n  background: rgba(189,189,189, 0.17);\n  border-color: rgba(231,231,231, 0.45);\n}\n.dbr4-primary:before {\n  content: \"\";\n  display: block;\n  width: 0;\n  height: 0;\n  border-top: 0.32em solid transparent;\n  border-bottom: 0.32em solid transparent;\n  border-left: 0.5em solid currentColor;\n  margin-right: 0.65em;\n}\n.dbr4-actions {\n  max-width: 19em;\n}\n.dbr3-stream.focus,\n.dbr3-episode.focus {\n  background: rgba(208,208,208, 0.065);\n}\n@supports (backdrop-filter: blur(1px)) {\n  .dbr4-actions .dbr3-button,\n  .dbr4-tools .dbr3-button,\n  .dbr4-voice {\n    backdrop-filter: blur(8px);\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .dbr3-button {\n    transition: none;\n  }\n}\n\n.dbr4-icon {\n  display: inline-block;\n  width: 1em;\n  height: 1em;\n  flex: 0 0 1em;\n  vertical-align: middle;\n  color: #b2b2b2;\n}\n.dbr4-flag {\n  width: 1.25em;\n  height: 0.85em;\n  display: block;\n  flex-shrink: 0;\n  border-radius: 0.12em;\n  overflow: hidden;\n  opacity: 0.9;\n}\n.dbr4-language-row {\n  display: flex;\n  align-items: center;\n  gap: 0.45em;\n  min-height: 1.7em;\n  overflow: hidden;\n  white-space: nowrap;\n}\n.dbr4-language {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.4em;\n  background: rgba(218,218,218, 0.045);\n  border: 1px solid rgba(218,218,218, 0.12);\n  border-radius: 0.3em;\n  padding: 0.28em 0.45em;\n  font-size: 0.72em;\n  line-height: 1.15;\n  color: #e0e0e0;\n  flex-shrink: 0;\n}\n.dbr4-language > span {\n  font-size: 1em !important;\n  color: inherit !important;\n}\n.dbr4-more-languages {\n  font-size: 0.7em;\n  color: #b1b1b1;\n  padding: 0.3em;\n}\n.dbr4-metadata {\n  display: flex;\n  align-items: center;\n  gap: 1.1em;\n  margin-top: 0.6em;\n  overflow: hidden;\n  white-space: nowrap;\n}\n.dbr4-badge {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.4em;\n  font-size: 0.7em;\n  color: #b4b4b4;\n  line-height: 1.3;\n  flex-shrink: 0;\n}\n.dbr4-origin {\n  display: flex;\n  align-items: center;\n  gap: 0.45em;\n  margin-top: 0.55em;\n  font-size: 0.65em;\n  color: #8f8f8f;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.dbr4-translation-name {\n  font-size: 0.85em !important;\n  font-weight: 500;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.dbr3-quality {\n  font-size: 1em;\n  color: #e1e1e1;\n}\n.dbr3-size {\n  font-size: 0.76em;\n}\n.dbr3-size .dbr4-icon {\n  display: inline-block;\n  margin-right: 0.3em;\n}\n.dbr4-voices .dbr4-flag {\n  display: inline-block;\n  vertical-align: middle;\n  margin-right: 0.5em;\n}\n.dbr3-stream {\n  height: 6.8em;\n}\n.dbr4-voice {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.1em;\n}\n.dbr4-art {\n  z-index: 0;\n}\n.dbr4-detail > :not(.dbr4-art),\n.dbr4-right {\n  position: relative;\n  z-index: 1;\n}\n\n.dbr3 {\n  font-size: max(1em, 1.55vw);\n}\n.dbr3-layout {\n  gap: 1.5em;\n  padding: 1em 1.4em 1em 1.3em;\n}\n.dbr4-detail {\n  flex-basis: 31%;\n  padding-top: 2em;\n}\n.dbr4-detail h1 {\n  font-size: 1.7em;\n  line-height: 1.18;\n  height: 2.36em;\n  margin: 0.5em 0;\n}\n.dbr4-kicker {\n  font-size: 0.78em;\n  letter-spacing: 0.055em;\n}\n.dbr4-meta {\n  font-size: 0.9em;\n}\n.dbr4-description {\n  font-size: 0.95em;\n  line-height: 1.5;\n  height: 4.5em;\n  margin: 0.8em 0 0.5em;\n}\n.dbr4-progress {\n  height: 1.5em;\n  margin: 0.2em 0 0.5em;\n}\n.dbr4-progress-label {\n  font-size: 0.78em;\n}\n.dbr4-actions {\n  gap: 0.6em;\n  margin-top: 0.7em;\n}\n.dbr4-actions .dbr3-button {\n  font-size: 1em;\n  height: 2.8em;\n}\n.dbr4-tabs {\n  gap: 0.9em;\n  padding-bottom: 0.55em;\n}\n.dbr4-tab {\n  font-size: 1.1em;\n}\n.dbr4-tools .dbr3-button {\n  font-size: 0.85em;\n}\n.dbr4-toolbar {\n  padding-bottom: 0.5em;\n}\n.dbr3-sources {\n  height: 2.8em;\n  gap: 0.45em;\n}\n.dbr3-source {\n  font-size: 0.85em;\n  max-width: 11em;\n  padding: 0.5em 0.65em;\n}\n.dbr4-voices {\n  height: 2.9em;\n  gap: 0.4em;\n}\n.dbr4-voice {\n  font-size: 0.85em;\n  padding: 0.5em 0.6em;\n}\n.dbr4-voice-label {\n  font-size: 0.78em;\n  margin-right: 0.15em;\n}\n.dbr3-stream {\n  height: 7.3em;\n  padding: 0.9em 0.7em;\n  gap: 0.8em;\n}\n.dbr3-quality {\n  font-size: 1.1em;\n  flex-basis: 3em;\n}\n.dbr4-language {\n  font-size: 0.9em;\n}\n.dbr4-more-languages {\n  font-size: 0.85em;\n}\n.dbr4-badge {\n  font-size: 0.83em;\n}\n.dbr4-metadata {\n  gap: 0.8em;\n}\n.dbr4-origin {\n  font-size: 0.78em;\n}\n.dbr3-size {\n  font-size: 0.85em;\n  flex-basis: 4.1em;\n}\n.dbr3-episode {\n  height: 7.8em;\n  gap: 0.8em;\n  padding: 0.6em 0.35em;\n}\n.dbr3-preview {\n  width: 8.1em;\n  height: 4.6em;\n  font-size: 1em;\n}\n.dbr3-episode-copy strong {\n  font-size: 1.05em;\n  white-space: normal;\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  line-height: 1.3;\n  max-height: 2.6em;\n}\n.dbr3-episode-copy p {\n  font-size: 0.85em;\n  line-height: 1.4;\n  height: 2.8em;\n  margin: 0.4em 0;\n}\n.dbr4-episode-status {\n  font-size: 0.8em;\n  flex-basis: 3.1em;\n}\n.dbr4-episode-number {\n  font-size: 1em;\n  flex-basis: 0.8em;\n}\n.dbr3-episode-copy .time-line {\n  max-width: 10em;\n  opacity: 0.65;\n}\n.dbr3-count {\n  font-size: 0.8em;\n}\n.dbr4-translation-name {\n  font-size: 1em !important;\n}\n@media (max-aspect-ratio: 4/3) {\n  .dbr3-layout {\n    gap: 1em;\n    padding: 0.6em;\n  }\n  .dbr4-detail {\n    flex-basis: 32%;\n    padding-top: 1em;\n  }\n  .dbr3-preview {\n    width: 5.5em;\n    height: 3.1em;\n  }\n  .dbr4-tools .dbr3-button {\n    padding: 0.6em;\n  }\n  .dbr4-kicker {\n    letter-spacing: 0;\n  }\n}\n@media (max-width: 600px) {\n  .dbr3 {\n    font-size: 16px;\n  }\n  .dbr4-detail {\n    display: none;\n  }\n  .dbr3-preview {\n    width: 6em;\n    height: 3.4em;\n  }\n  .dbr3-layout {\n    height: 100%;\n  }\n  .dbr4-tools {\n    gap: 0.3em;\n  }\n  .dbr4-tabs {\n    gap: 0.6em;\n  }\n}\n\n.dbr3-episode {\n  height: 8.5em;\n  padding: 0.8em 0.6em;\n  border: 1px solid transparent;\n  border-radius: 0.6em;\n  margin: 0.35em 0 0.7em;\n}\n.dbr3-preview {\n  width: 9.6em;\n  height: 5.4em;\n  border-radius: 0.4em;\n}\n.dbr3-episode-copy strong {\n  font-size: 1.12em;\n  line-height: 1.35;\n}\n.dbr3-episode-copy p {\n  font-size: 0.9em;\n  color: #bababa;\n}\n.dbr3-episode,\n.dbr3-stream {\n  transition:\n    background 0.14s,\n    border-color 0.14s,\n    box-shadow 0.14s;\n}\n.dbr3-stream {\n  border-radius: 0.6em;\n  border: 1px solid rgba(225,225,225, 0.07);\n  background: rgba(22,22,22, 0.16);\n  margin: 0.35em 0 0.7em;\n}\n.dbr3 .selector.focus {\n  outline: none !important;\n  border-color: rgba(213,213,213, 0.65) !important;\n  box-shadow:\n    inset 0 0 0 1px rgba(219,219,219, 0.32),\n    0 0 0 2px rgba(219,219,219, 0.1) !important;\n  background: rgba(203,203,203, 0.11) !important;\n  color: #f4f4f4 !important;\n}\n.dbr3 .dbr4-primary.focus {\n  background: linear-gradient(135deg, #f2f2f2, #d4d4d4) !important;\n  color: #1f1f1f !important;\n  box-shadow:\n    0 0 0 2px rgba(234,234,234, 0.5),\n    0 0.2em 0.8em rgba(0,0,0, 0.15) !important;\n}\n.dbr3 .dbr4-tab.focus {\n  background: transparent !important;\n  border-radius: 0.2em;\n  box-shadow: 0 0 0 2px rgba(213,213,213, 0.65) !important;\n}\n.dbr3-episode.focus .dbr3-preview {\n  box-shadow: 0 0.15em 0.8em rgba(0,0,0, 0.25);\n}\n.dbr4-actions .dbr3-button {\n  border-radius: 0.5em;\n  font-weight: 500;\n}\n.dbr4-actions .dbr4-primary {\n  font-weight: 600;\n}\n.dbr4-episode-status {\n  color: #bbbbbb;\n}\n.dbr3 .selector.focus:after {\n  outline: none;\n}\n.dbr4-description {\n  color: #d3d3d3;\n}\n.dbr4-tools {\n  gap: 0.6em;\n}\n.dbr3-quality {\n  font-weight: 600;\n}\n.dbr4-metadata {\n  color: #bdbdbd;\n}\n@media (hover: hover) and (pointer: fine) {\n  .dbr3 .dbr3-button:hover,\n  .dbr3 .dbr3-episode:hover,\n  .dbr3 .dbr3-stream:hover {\n    background: rgba(214,214,214, 0.085);\n    border-color: rgba(213,213,213, 0.3);\n    cursor: pointer;\n  }\n  .dbr3 .dbr4-primary:hover {\n    background: linear-gradient(135deg, #f2f2f2, #d4d4d4);\n    color: #1f1f1f;\n  }\n  .dbr3 .dbr4-tab:hover {\n    background: transparent;\n    color: #f3f3f3;\n  }\n}\n@media (max-width: 900px) {\n  .dbr3-preview {\n    width: 7.5em;\n    height: 4.22em;\n  }\n  .dbr3-episode {\n    height: 8em;\n  }\n  .dbr4-detail h1 {\n    font-size: 1.55em;\n  }\n  .dbr4-metadata {\n    gap: 0.55em;\n  }\n  .dbr4-language {\n    font-size: 0.82em;\n  }\n}\n@media (max-width: 600px) {\n  .dbr3-preview {\n    width: 6.8em;\n    height: 3.83em;\n  }\n  .dbr3-episode-copy p {\n    font-size: 0.82em;\n  }\n  .dbr4-episode-status {\n    display: none;\n  }\n  .dbr3-episode {\n    height: 7.5em;\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .dbr3-episode,\n  .dbr3-stream {\n    transition: none;\n  }\n}\n\n.dbr4-detail{padding-top:.75em}.dbr4-description{height:3em;-webkit-line-clamp:2;line-height:1.5}.dbr3-episode{height:7em;padding:.55em .6em;margin:.3em 0 .4em}.dbr4-episode-status{flex-basis:3.8em;white-space:nowrap}.dbr4-episode-status span,.dbr4-episode-status small{height:auto;min-height:1.5em}.dbr4-actions{flex-shrink:0}.dbr4-detail h1{margin:.35em 0}.dbr4-tab.selected,.dbr4-tab{background:transparent!important}\n\n.dbr3{font-size:clamp(18px,1.25vw,24px)}.dbr3.dbr4-tv{font-size:max(1em,1.55vw)}.dbr3-episode{background:rgba(25,25,25,.4);border-color:rgba(225,225,225,.12)}.dbr3-stream{background:rgba(25,25,25,.48);border-color:rgba(225,225,225,.14)}.dbr3 .dbr3-episode.focus,.dbr3 .dbr3-stream.focus{background:rgba(92,92,92,.48)!important;border-color:#c3c3c3!important}.dbr4-art img{opacity:.48}.dbr4-right{isolation:isolate}.dbr4-metadata{flex-wrap:wrap;row-gap:.4em}.dbr4-episode-number{color:#c6c6c6}.dbr4-actions .dbr3-button:not(.dbr4-primary){background:rgba(40,40,40,.62);border-color:rgba(213,213,213,.3)}.dbr4-detail .dbr4-description{height:3em;-webkit-line-clamp:2}.dbr3 .dbr4-tab{box-shadow:none;border-color:transparent}.dbr4-tools .dbr3-button{background:rgba(51,51,51,.6);border-color:rgba(213,213,213,.26)}\n\n.dbr4-play-mark{width:2em;height:2em;display:block;padding:.3em;border:1px solid rgba(218,218,218,.25);border-radius:50%;box-sizing:border-box}.dbr4-translation-name{display:block;font-weight:600!important}.dbr4-metadata:empty{display:none}\n\n.dbr4-tv .dbr3-button{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;transition:background-color .1s,border-color .1s}.dbr4-tv .dbr3-episode,.dbr4-tv .dbr3-stream{transition:background-color .1s,border-color .1s}.dbr4-tv .dbr3-preview{box-shadow:none!important}.dbr4-tv .dbr4-art img{transition:none}.dbr4-right>.scroll{contain:layout paint}\n\n.dbr3 .scroll__body{transition:transform .16s ease-out,-webkit-transform .16s ease-out!important;will-change:transform}.dbr3 .scroll__body.notransition{transition:none!important}.dbr4-tv .dbr3-episode.focus,.dbr4-tv .dbr3-stream.focus{box-shadow:inset 0 0 0 2px #c3c3c3!important}@media(prefers-reduced-motion:reduce){.dbr3 .scroll__body{transition:none!important}}\n\nbody.dbr-active .head{background:#181b20!important;color:#f4f5f7}.dbr3{background:#141619;color:#f4f5f7}.dbr3 .dbr4-primary{background:#f1f3f5!important;color:#15171a!important}.dbr3 .dbr4-primary.focus{background:#fff!important}.dbr3 .selector.focus{outline-color:#fff!important}.dbr3 .dbr3-stream.focus,.dbr3 .dbr3-episode.focus{border-color:#fff!important;box-shadow:inset 0 0 0 2px #fff!important}\n";

var DbrCore = (function () {
    'use strict';
    var fields = ['audio', 'subtitles', 'quality', 'voice', 'range'];
    var languageNames = { ru: 'Русский', en: 'English', uk: 'Українська', pl: 'Polski', ja: '日本語', de: 'Deutsch', fr: 'Français', es: 'Español', it: 'Italiano', pt: 'Português', zh: '中文', ko: '한국어', hi: 'हिन्दी', nl: 'Nederlands', tr: 'Türkçe', ar: 'العربية', vi: 'Tiếng Việt', th: 'ไทย', id: 'Bahasa Indonesia', ms: 'Bahasa Melayu', unknown: 'Не указаны', none: 'Не предоставлены' };
    function escape(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
        });
    }
    function httpUrl(value) {
        return typeof value === 'string' && /^https?:\/\/[^\s]+$/i.test(value) ? value : '';
    }
    function unique(items) {
        return items.filter(function (value, index) { return items.indexOf(value) === index; });
    }
    function baseUrl(value) {
        return httpUrl(String(value || '').trim().replace(/^stremio:\/\//i, 'https://').replace(/\/manifest\.json\/?$/i, '').replace(/\/+$/, ''));
    }
    function streamUrl(base, imdb, type, season, episode) {
        var id = imdb;
        if (type === 'series') id += ':' + season + ':' + episode;
        return baseUrl(base) + '/stream/' + type + '/' + id + '.json';
    }
    function type(movie) {
        return movie.number_of_seasons || movie.seasons || movie.first_air_date || movie.type === 'tv' || movie.type === 'series' || movie.method === 'tv' ? 'series' : 'movie';
    }
    function languages(text) {
        var rules = [
            ['ru', /🇷🇺|(^|[^a-zа-я])(rus|russian|русский|рус)([^a-zа-я]|$)/i],
            ['en', /🇬🇧|🇺🇸|(^|[^a-z])(eng|english)([^a-z]|$)/i],
            ['uk', /🇺🇦|(^|[^a-zа-я])(ukr|ukrainian|українська|укр)([^a-zа-я]|$)/i],
            ['pl', /🇵🇱|(^|[^a-z])(pol|polish|polski)([^a-z]|$)/i],
            ['ja', /🇯🇵|(^|[^a-z])(jpn|japanese|jap)([^a-z]|$)/i],
            ['de', /🇩🇪|(^|[^a-z])(deu|ger|german|deutsch)([^a-z]|$)/i],
            ['fr', /🇫🇷|(^|[^a-z])(fra|fre|french)([^a-z]|$)/i],
            ['es', /🇪🇸|(^|[^a-z])(spa|spanish)([^a-z]|$)/i],
            ['it', /🇮🇹|\b(ita|italian)\b/i], ['pt', /🇵🇹|🇧🇷|\b(por|portuguese)\b/i],
            ['zh', /🇨🇳|🇹🇼|\b(zho|chi|chinese|mandarin)\b/i], ['ko', /🇰🇷|\b(kor|korean)\b/i],
            ['hi', /\b(hin|hindi)\b/i], ['nl', /🇳🇱|\b(nld|dut|dutch)\b/i], ['tr', /🇹🇷|\b(tur|turkish)\b/i],
            ['ar', /🇸🇦|\b(ara|arabic)\b/i], ['vi', /🇻🇳|\b(vie|vietnamese)\b/i], ['th', /🇹🇭|\b(tha|thai)\b/i],
            ['id', /🇮🇩|\b(ind|indonesian)\b/i], ['ms', /🇲🇾|\b(msa|malay)\b/i]
        ];
        return rules.filter(function (rule) { return rule[1].test(text); }).map(function (rule) { return rule[0]; });
    }
    function languageCode(value) {
        var code = String(value || '').toLowerCase();
        var aliases = { rus: 'ru', eng: 'en', ukr: 'uk', pol: 'pl', jpn: 'ja', ger: 'de', deu: 'de', fre: 'fr', fra: 'fr', spa: 'es', ita: 'it', por: 'pt', zho: 'zh', chi: 'zh', kor: 'ko', hin: 'hi', nld: 'nl', dut: 'nl', tur: 'tr', ara: 'ar', vie: 'vi', tha: 'th', ind: 'id', msa: 'ms' };
        return aliases[code] || (languageNames[code] ? code : languages(code)[0]) || 'unknown';
    }
    function normalize(stream, index, provider) {
        var text = [stream.name, stream.description, stream.title].filter(Boolean).join('\n');
        var hints = stream.behaviorHints || {};
        var exact = String(stream.resolution || hints.filename || '');
        var quality = exact.match(/\b(2160|1440|1080|720|576|480|360|240|144)p?\b/i) || text.match(/\b(2160|1440|1080|720|576|480|360|240|144)p?\b/i);
        var alias = /\b(4K|UHD)\b/i.test(text) ? '2160' : /\bQHD\b/i.test(text) ? '1440' : /\bFHD\b/i.test(text) ? '1080' : /\bHD\b/i.test(text) ? '720' : /Low Quality/i.test(text) ? 'low' : 'unknown';
        var size = text.match(/(\d+(?:[.,]\d+)?)\s*(GB|GiB|MB|MiB|ГБ|МБ)/i);
        var codec = text.match(/\b(HEVC|H\.?265|H\.?264|x265|x264|AV1|AVC)\b/i);
        var subtitleSections = text.match(/(?:📝|(?:subtitles?|субтитры|\bsubs)\s*[:：])[^\n]*/ig) || [];
        var subtitleText = subtitleSections.map(function (part) { return part.replace(/^(?:📝|(?:subtitles?|субтитры|\bsubs)\s*[:：])\s*/i, '').split(/(?:🎥|🎞|🎧|🔊|🗣|📦|📊|📡|🎭|💻|🔍)/)[0]; }).join('\n');
        var audioText = text.replace(/(?:📝|(?:subtitles?|субтитры|\bsubs)\s*[:：])[^\n]*/ig, '').split('\n').filter(function (line) { return !/subtitles?|субтитр|\bsubs\b/i.test(line); }).join('\n');
        var explicitAudio = stream.audioLanguages || stream.languages;
        var audio = Array.isArray(explicitAudio) ? unique(explicitAudio.map(languageCode)) : languages(audioText);
        var voiceMatch = text.match(/LostFilm|NewStudio|Кубик в Кубе|Дубляж|Многоголосая|Закадровая|AniLibria|AniDUB|JAM|Lektor/ig);
        var subtitles;
        if (Array.isArray(stream.subtitles)) subtitles = unique(stream.subtitles.map(function (sub) { return languageCode(sub.lang || sub.language || sub.label || sub.title); }));
        var describedSubtitles = languages(subtitleText);
        if (Array.isArray(stream.subtitleLanguages)) describedSubtitles = describedSubtitles.concat(stream.subtitleLanguages.map(languageCode));
        if (describedSubtitles.length) subtitles = unique((subtitles || []).concat(describedSubtitles));
        else if (subtitleSections.length && subtitles === undefined) subtitles = /^(?:none|no|нет|без|—|-)$/i.test(subtitleText.trim()) ? [] : ['unknown'];
        return {
            id: provider + '-' + index,
            provider: provider,
            raw: stream,
            title: stream.description || stream.title || stream.name || 'Поток ' + (index + 1),
            source: ((text.match(/📡\s*([^\n🎭]+)/) || [])[1] || stream.name || provider).trim(),
            release: String(hints.filename || stream.title || String(stream.description || '').split('\n')[0]).replace(/(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF])/g, '').trim(),
            url: httpUrl(stream.url),
            external: httpUrl(stream.externalUrl),
            method: stream.method || 'play',
            quality: stream.dbr_quality || (quality ? quality[1] : alias),
            audio: audio,
            subtitles: subtitles,
            voice: stream.dbr_voice ? [stream.dbr_voice] : unique(voiceMatch || []),
            range: /Dolby.?Vision|\bDV\b/i.test(text) ? ['Dolby Vision'] : /HDR10\+/i.test(text) ? ['HDR10+'] : /HDR/i.test(text) ? ['HDR'] : /\bSDR\b/i.test(text) ? ['SDR'] : [],
            codec: codec ? (/AVC/i.test(codec[1]) ? 'H.264' : codec[1]) : '',
            audioCodec: (text.match(/\b(EAC3|E-AC-3|AC3|AAC|OPUS|FLAC|PCM|DTS(?:-HD)?|TRUEHD)\b/i) || [''])[0],
            size: typeof hints.videoSize === 'number' && hints.videoSize > 0 ? hints.videoSize / 1073741824 : size ? parseFloat(size[1].replace(',', '.')) / (/^(M|М)/i.test(size[2]) ? 1024 : 1) : undefined,
            cached: hints.cached === true || /RD\+|Real.?Debrid.*cached/i.test(text)
        };
    }
    function qualityValue(value) {
        var match = String(value).match(/(2160|1440|1080|720|576|480|360|240|144)/);
        return match ? match[1] : /4k|uhd/i.test(value) ? '2160' : 'unknown';
    }
    function qualityKeys(qualities) {
        return Object.keys(qualities).filter(function (key) { return httpUrl(String(qualities[key]).split(' or ')[0]); }).sort(function (a, b) { return (parseInt(qualityValue(b), 10) || 0) - (parseInt(qualityValue(a), 10) || 0); });
    }
    function values(row, key) {
        if (key === 'quality' && row.qualityOptions && row.qualityOptions.length) return row.qualityOptions;
        if (row[key] === undefined) return ['unknown'];
        if (Array.isArray(row[key])) return row[key].length ? row[key] : [key === 'subtitles' ? 'none' : 'unknown'];
        return [row[key]];
    }
    function select(rows, selected, except) {
        return rows.filter(function (row) {
            return fields.every(function (key) {
                return key === except || (key === 'quality' && row.method === 'call' && row.qualityOptions === undefined) || !selected[key] || !selected[key].length || selected[key].some(function (value) { return values(row, key).indexOf(value) !== -1; });
            });
        });
    }
    function facet(rows, selected, key) {
        var candidates = [];
        rows.forEach(function (row) { candidates = candidates.concat(values(row, key)); });
        candidates = unique(candidates.concat(selected[key] || []));
        var matching = select(rows, selected, key);
        return candidates.map(function (value) {
            return { value: value, count: matching.filter(function (row) { return values(row, key).indexOf(value) !== -1; }).length };
        });
    }
    function sort(rows, order) {
        return rows.map(function (row, index) { return { row: row, index: index }; }).sort(function (a, b) {
            var diff = 0;
            if (order === 'quality') diff = (parseInt(b.row.quality, 10) || 0) - (parseInt(a.row.quality, 10) || 0);
            if (order === 'size') diff = (a.row.size === undefined ? Infinity : a.row.size) - (b.row.size === undefined ? Infinity : b.row.size);
            return diff || a.index - b.index;
        }).map(function (item) { return item.row; });
    }
    function lampacRows(items, provider, metadata) {
        metadata = metadata || {};
        var rows = [];
        items.forEach(function (item) {
            var qualities = item.quality || item.qualitys || {};
            var keys = item.method === 'call' ? [] : Object.keys(qualities);
            if (!keys.length) keys = [''];
            keys.forEach(function (quality) {
                var stream = {};
                Object.keys(item).forEach(function (key) { stream[key] = item[key]; });
                stream.url = String(quality ? qualities[quality] : item.url || '').split(' or ')[0];
                stream.name = metadata.name || provider;
                stream.description = item.title || item.translate || provider;
                stream.dbr_voice = item.translate || item.voice_name || metadata.voice || '';
                stream.dbr_quality = quality ? String(parseInt(quality, 10)) : item.maxquality ? String(parseInt(item.maxquality, 10)) : 'unknown';
                rows.push(normalize(stream, rows.length, provider));
            });
        });
        return rows;
    }
    function nextVariant(rows, previous) {
        var group = previous && previous.raw && previous.raw.behaviorHints && previous.raw.behaviorHints.bingeGroup;
        if (!group) return undefined;
        var matches = rows.filter(function (row) {
            var hints = row.raw.behaviorHints || {};
            return hints.bingeGroup === group && row.quality === previous.quality && ['audio', 'voice', 'range', 'subtitles'].every(function (key) {
                return values(row, key).slice().sort().join('|') === values(previous, key).slice().sort().join('|');
            });
        });
        return matches.length === 1 ? matches[0] : undefined;
    }
    function label(key, value) {
        if (languageNames[value]) return languageNames[value];
        return key === 'quality' ? value === '2160' ? '4K' : value + 'p' : value;
    }
    return { qualityValue: qualityValue, qualityKeys: qualityKeys, nextVariant: nextVariant, fields: fields, escape: escape, httpUrl: httpUrl, baseUrl: baseUrl, streamUrl: streamUrl, type: type, normalize: normalize, values: values, select: select, facet: facet, sort: sort, lampacRows: lampacRows, label: label };
})();

var DbrI18n = (function () {
var en = {"Лучшее":"Best","Загружаем качество…":"Loading quality options…","Выбранное качество недоступно":"Selected quality is unavailable","Фильм": "Movie", "Смотреть": "Play", "Потоки": "Streams", "Серии": "Episodes", "Серия ": "Episode ", "Сезон ": "Season ", "Сезон": "Season", "Следующая серия": "Next episode", "Описание": "Description", "Описание отсутствует": "No description available", "Просмотрено": "Watched", "Просмотрено ": "Watched ", " мин": " min", "Нет превью": "No preview", "Не указаны": "Unknown", "Перевод": "Translation", "Озвучка": "Translation", "Язык": "Language", "Субтитры": "Subtitles", "Качество": "Quality", "Видео": "Video", "Фильтры": "Filters", "Список серий пока недоступен": "Episodes are not available yet", " · показано ": " · showing ", " ГБ": " GB", " из ": " of ", " потоков": " streams", " потоков нет. Выберите другой источник слева.": " has no streams. Choose another source above.", "В ": "", "В кэше RD": "RD cached", "Веб-страница": "Web page", "Видео недоступно на этом устройстве": "Video unavailable on this device", "Все варианты": "All options", "Выберите поток следующей серии": "Choose a stream for the next episode", "Выбрать серию": "Choose episode", "Готово · ": "Done · ", "Загружаем серии…": "Loading episodes…", "Информация о потоке": "Stream information", "Источник вернул веб-страницу вместо прямого видео": "Source returned a web page instead of video", "Источник вернул неподдерживаемый ответ": "Unsupported source response", "Источник недоступен": "Source unavailable", "Источник недоступен на этом устройстве": "Source unavailable on this device", "Источник требует авторизацию": "Source requires sign in", "Источник требует проверку в своём плагине": "Source requires verification in its plugin", "Источник требует уточнить название": "Source requires a title match", "Ищем потоки…": "Finding streams…", "Найдено в ": "Available on ", "Не удалось загрузить сведения о сериях": "Could not load episode details", "Не удалось определить IMDb ID": "Could not identify the IMDb ID", "Не удалось подключиться": "Could not connect", "Не удалось получить видео": "Could not retrieve video", "Повторить": "Retry", "Потоки найдены, но не подходят под выбранные фильтры.": "No streams match your filters.", "Прямая ссылка на видео отсутствует": "No direct video link available", "Сбросить фильтры": "Reset filters", "Следующая серия пока недоступна": "Next episode is not available yet", "Укажите адрес AIOStreams в настройках": "Add your AIOStreams address in settings", "Это последняя доступная серия": "This is the last available episode", "Язык не указан": "Language unknown", "Сортировка": "Sort", "Как у источника": "Source order", "Качество: выше": "Highest quality", "Размер: меньше": "Smallest size", "Низкое качество": "Low quality", "Не предоставлены": "Not provided"};
function text(value) { return Lampa.Storage.get("language", "ru") === "ru" ? value.replace("другой источник слева", "другой источник выше") : en[value] === undefined ? value : en[value]; }
function label(key, value) { if(value === "low") return text("Низкое качество"); if(value === "unknown") return text("Не указаны"); if(value === "none") return text("Не предоставлены"); return DbrCore.label(key, value); }
return {text:text,label:label};
})();

var DbrNavigation = (function () {
  function move(groups, key, direction, memory) {
    var order = ["header", "tabs", "sources", "voices", "list"];
    var group;
    Object.keys(groups).some(function (name) {
      if (groups[name].indexOf(key) !== -1) {
        group = name;
        return true;
      }
      return false;
    });
    function target(name, fallback) {
      var items = groups[name] || [];
      if (!items.length) return undefined;
      var index = memory[name] === undefined ? fallback || 0 : memory[name];
      return { key: items[Math.max(0, Math.min(index, items.length - 1))] };
    }
    if (!group) return target("list") || target("tabs") || target("header");
    var items = groups[group],
      index = items.indexOf(key);
    var vertical = group === "list" || group === "detail";
    if (
      (vertical && (direction === "up" || direction === "down")) ||
      (!vertical && (direction === "left" || direction === "right"))
    ) {
      var next = index + (direction === "up" || direction === "left" ? -1 : 1);
      if (next >= 0 && next < items.length) return { key: items[next] };
    }
    if (direction === "left")
      return group === "detail" || group === "header"
        ? { action: "menu" }
        : target("detail") || { action: "menu" };
    if (direction === "right")
      return group === "detail"
        ? target("list") || target("tabs")
        : { action: "filters" };
    if (group === "detail")
      return direction === "up"
        ? target("tabs") || target("header")
        : target("list") || target("tabs");
    if (group === "list" && direction === "down") return { key: key };
    var position = order.indexOf(group),
      step = direction === "up" ? -1 : 1;
    for (var n = position + step; n >= 0 && n < order.length; n += step) {
      var result = target(order[n], index);
      if (result) return result;
    }
    return direction === "up" ? { action: "head" } : { key: key };
  }
  return { move: move };
})();

var DbrPresentation = (function () {
  var paths = {
    audio:
      '<path d="M4 14v-3a8 8 0 0 1 16 0v3M4 13h3v7H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Zm13 0h3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-3Z"/>',
    subtitles:
      '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M6 10h4M6 14h4M14 10h4M14 14h4"/>',
    video:
      '<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 22h8M12 18v4"/>',
    source: '<path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5"/>',
    size: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 15h18M7 18h1M12 18h1"/>',
    cached:
      '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Z"/><path d="m8 12 3 3 5-6"/>',
  };
  function icon(name) {
    return (
      '<svg class="dbr4-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (paths[name] || paths.source) +
      "</svg>"
    );
  }
  function flag(code) {
    var drawing = {
      ru: '<path fill="#ecebe7" d="M0 0h24v5H0z"/><path fill="#5779b1" d="M0 5h24v6H0z"/><path fill="#b45c65" d="M0 11h24v5H0z"/>',
      en: '<path fill="#445b82" d="M0 0h24v16H0z"/><path stroke="#e8e3d8" stroke-width="4" d="m0 0 24 16M24 0 0 16"/><path stroke="#b86a70" stroke-width="1.5" d="m0 0 24 16M24 0 0 16"/><path stroke="#eee8dd" stroke-width="6" d="M12 0v16M0 8h24"/><path stroke="#b86a70" stroke-width="3" d="M12 0v16M0 8h24"/>',
      ja: '<path fill="#ede9df" d="M0 0h24v16H0z"/><circle fill="#ba606e" cx="12" cy="8" r="4.5"/>',
      uk: '<path fill="#5782b2" d="M0 0h24v8H0z"/><path fill="#dbbc69" d="M0 8h24v8H0z"/>',
      pl: '<path fill="#ece8df" d="M0 0h24v8H0z"/><path fill="#ba6371" d="M0 8h24v8H0z"/>',
      de: '<path fill="#333" d="M0 0h24v6H0z"/><path fill="#b96568" d="M0 5h24v6H0z"/><path fill="#d5b86c" d="M0 11h24v5H0z"/>',
      fr: '<path fill="#5876a5" d="M0 0h8v16H0z"/><path fill="#ede9df" d="M8 0h8v16H8z"/><path fill="#b7646a" d="M16 0h8v16h-8z"/>',
      es: '<path fill="#b15e61" d="M0 0h24v16H0z"/><path fill="#d7b46d" d="M0 4h24v8H0z"/>',
    };
    return drawing[code]
      ? '<svg class="dbr4-flag" viewBox="0 0 24 16" aria-hidden="true">' +
          drawing[code] +
          "</svg>"
      : icon("audio");
  }
  function language(code) {
    var name = DbrI18n.label("audio", code);
    return $('<span class="dbr4-language"></span>')
      .attr("title", name)
      .append(flag(code))
      .append(
        $("<span></span>").text(code === "unknown" ? name : code.toUpperCase()),
      );
  }
  function badge(kind, text) {
    return $('<span class="dbr4-badge"></span>')
      .append(icon(kind))
      .append($("<span></span>").text(text));
  }
  function stream(row, title, label) {
    var box = $('<div class="dbr3-stream-copy"></div>');
    var langs = $('<div class="dbr4-language-row"></div>');
    var audio = row.audio.length ? row.audio : row.voice.length ? [] : ["unknown"];
    audio.filter(function (code) { return ["ru", "en", "pl", "unknown"].indexOf(code) >= 0; }).sort(function (a, b) { return ["ru", "en", "pl", "unknown"].indexOf(a) - ["ru", "en", "pl", "unknown"].indexOf(b); }).forEach(function (code) {
      langs.append(language(code));
    });
    var hidden = audio.filter(function (code) { return ["ru", "en", "pl", "unknown"].indexOf(code) < 0; }).length;
    if (hidden)
      langs.append(
        $('<span class="dbr4-more-languages"></span>').text(
          "+" + (hidden),
        ),
      );
    if (row.voice.length)
      langs.append(
        $('<strong class="dbr4-translation-name"></strong>').text(
          row.voice.join(" / "),
        ),
      );
    box.append(langs);
    var metadata = $('<div class="dbr4-metadata"></div>');
    if (row.codec || row.range.length)
      metadata.append(
        badge(
          "video",
          [row.codec, row.range.join(" / ")].filter(Boolean).join(" · "),
        ),
      );
    if (row.audioCodec) metadata.append(badge("audio", row.audioCodec));
    if (row.provider === "aio" || row.subtitles !== undefined) metadata.append(
      badge(
        "subtitles",
        DbrCore.values(row, "subtitles")
          .map(function (code) {
            return code === "unknown" || code === "none"
              ? label("subtitles", code)
              : code.toUpperCase();
          })
          .join(" / "),
      ),
    );
    box.append(metadata);
    box.append(
      $('<div class="dbr4-origin"></div>')
        .append(icon("source"))
        .append($("<span></span>").text(row.source)),
    );
    return box;
  }
  return {
    icon: icon,
    flag: flag,
    language: language,
    badge: badge,
    stream: stream,
  };
})();

function DbrHistory(movie) {
  var identity = movie.imdb_id || movie.tmdb_id || movie.id;
  var storageKey = "debrid_episode_history";
  function timeline(season, episode) {
    var suffix =
      DbrCore.type(movie) === "series" ? season + "_" + episode : "movie";
    return Lampa.Timeline.view(
      Lampa.Utils.hash("dbr_" + identity + "_" + suffix),
    );
  }
  function key() {
    return String(timeline(1, 1).profile || 0) + ":" + identity;
  }
  function read() {
    var rows = Lampa.Storage.get(storageKey, {});
    return rows && typeof rows === "object" && !Array.isArray(rows) ? rows : {};
  }
  this.timeline = timeline;
  this.last = function () {
    var item = read()[key()];
    if (
      !item ||
      !Number.isInteger(item.season) ||
      item.season < 0 ||
      !Number.isInteger(item.episode) ||
      item.episode < 1
    )
      return undefined;
    return { season: item.season, episode: item.episode };
  };
  this.save = function (season, episode) {
    if (
      DbrCore.type(movie) !== "series" ||
      !Number.isInteger(season) ||
      season < 0 ||
      !Number.isInteger(episode) ||
      episode < 1
    )
      return;
    var rows = read();
    rows[key()] = { season: season, episode: episode, updated: Date.now() };
    var keys = Object.keys(rows).sort(function (a, b) {
      return (Number(rows[b] && rows[b].updated) || 0) - (Number(rows[a] && rows[a].updated) || 0);
    });
    keys.slice(100).forEach(function (id) {
      delete rows[id];
    });
    Lampa.Storage.set(storageKey, rows);
  };
}

function DbrDirectPlayback(player) {
  if (/\.(m3u8|mpd)(?:[?#]|$)/i.test(player.url)) return function () {};
  var listener = Lampa.Player.listener;
  var originalField = Lampa.Storage.field;
  var finished = false;
  function field(name) {
    // Web Audio cannot process media fetched without CORS permission.
    if (name === "player_normalization" && Lampa.Player.playdata() === player)
      return false;
    return originalField.apply(this, arguments);
  }
  function cleanup() {
    if (finished) return;
    finished = true;
    listener.remove("ready", ready);
    listener.remove("external", external);
    listener.remove("destroy", cleanup);
    if (Lampa.Storage.field === field) Lampa.Storage.field = originalField;
  }
  function external(data) {
    if (data === player) cleanup();
  }
  function ready(data) {
    if (data !== player) return;
    cleanup();
    var video =
      Lampa.PlayerVideo && Lampa.PlayerVideo.video && Lampa.PlayerVideo.video();
    if (!video || String(video.tagName).toLowerCase() !== "video") return;
    if (!video.hasAttribute("crossorigin")) return;
    video.removeAttribute("crossorigin");
    video.load();
    if (!player.timeline || !player.timeline.waiting_for_user) {
      var started = video.play();
      if (started && started.catch) started.catch(function () {});
    }
  }
  Lampa.Storage.field = field;
  listener.follow("ready", ready);
  listener.follow("external", external);
  listener.follow("destroy", cleanup);
  return cleanup;
}

function DbrNativeHls(player) {
  if (
    !Lampa.Platform.is("android") ||
    typeof AndroidJS === "undefined" ||
    typeof AndroidJS.httpReq !== "function" ||
    !window.Hls
  )
    return function () {};
  var Original = window.Hls;
  player.hls_type = 'hlsjs';
  var active = [];
  var released = false;
  function Loader() {
    this.stats = {
      aborted: false,
      loaded: 0,
      retry: 0,
      total: 0,
      chunkCount: 0,
      bwEstimate: 0,
      loading: { start: 0, first: 0, end: 0 },
      parsing: { start: 0, end: 0 },
      buffering: { start: 0, first: 0, end: 0 },
    };
    this.context = undefined;
    this.net = undefined;
    this.timer = undefined;
    this.finished = false;
    active.push(this);
  }
  Loader.prototype.abort = function () {
    this.finished = true;
    this.stats.aborted = true;
    clearTimeout(this.timer);
    if (this.net) this.net.clear();
  };
  Loader.prototype.destroy = function () {
    this.abort();
    active = active.filter(function (item) {
      return item !== this;
    }, this);
    this.context = undefined;
  };
  Loader.prototype.getCacheAge = function () {
    return null;
  };
  Loader.prototype.getResponseHeader = function () {
    return null;
  };
  Loader.prototype.load = function (context, config, callbacks) {
    var self = this;
    this.context = context;
    this.stats.loading.start = performance.now();
    this.net = new Lampa.Reguest();
    var timeout = config.timeout || 20000;
    var binary = context.responseType === "arraybuffer";
    var headers = {};
    Object.keys(player.headers || {}).forEach(function (key) {
      headers[key] = player.headers[key];
    });
    if (context.rangeEnd)
      headers.Range =
        "bytes=" + (context.rangeStart || 0) + "-" + (context.rangeEnd - 1);
    function finish() {
      if (self.finished || released) return false;
      self.finished = true;
      clearTimeout(self.timer);
      return true;
    }
    function failure() {
      if (finish())
        callbacks.onError(
          { code: 0, text: "Native HLS request failed" },
          context,
          null,
          self.stats,
        );
    }
    this.timer = setTimeout(function () {
      if (!finish()) return;
      self.net.clear();
      callbacks.onTimeout(self.stats, context, null);
    }, timeout);
    this.net.timeout(timeout);
    try {
      this.net.native(
        context.url,
        function (raw) {
          var response, data;
          try {
            response = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (!response || typeof response.body !== "string")
              throw new Error("Missing native response");
            data = response.body;
            if (binary) {
              if (response.encoding !== "base64" || data.length > 44739244)
                throw new Error("Binary transport unavailable");
              var decoded = atob(data),
                bytes = new Uint8Array(decoded.length);
              for (var i = 0; i < decoded.length; i++)
                bytes[i] = decoded.charCodeAt(i);
              data = bytes.buffer;
            }
          } catch (ignore) {
            failure();
            return;
          }
          if (!finish()) return;
          self.stats.loading.first = self.stats.loading.end = performance.now();
          self.stats.loaded = self.stats.total = binary
            ? data.byteLength
            : data.length;
          callbacks.onSuccess(
            { url: response.currentUrl || context.url, data: data },
            self.stats,
            context,
            null,
          );
        },
        failure,
        false,
        {
          dataType: binary ? "base64" : "text",
          returnHeaders: true,
          headers: headers,
          timeout: timeout,
        },
      );
    } catch (ignore) {
      failure();
    }
  };
  function NativeHls(config) {
    if (released || Lampa.Player.playdata() !== player)
      return new Original(config);
    var options = {};
    Object.keys(config || {}).forEach(function (key) {
      options[key] = config[key];
    });
    options.loader = Loader;
    options.fLoader = options.pLoader = undefined;
    return new Original(options);
  }
  Object.getOwnPropertyNames(Original).forEach(function (key) {
    if (["name", "length", "prototype", "caller", "arguments"].indexOf(key) < 0)
      Object.defineProperty(
        NativeHls,
        key,
        Object.getOwnPropertyDescriptor(Original, key),
      );
  });
  NativeHls.prototype = Original.prototype;
  window.Hls = NativeHls;
  function cleanup() {
    if (released) return;
    released = true;
    active.slice().forEach(function (loader) {
      loader.destroy();
    });
    if (window.Hls === NativeHls) window.Hls = Original;
    Lampa.Player.listener.remove("destroy", cleanup);
    Lampa.Player.listener.remove("external", external);
  }
  function external(data) {
    if (data === player) cleanup();
  }
  Lampa.Player.listener.follow("destroy", cleanup);
  Lampa.Player.listener.follow("external", external);
  return cleanup;
}

function DbrAutoplay(player, onEnded) {
  var listener = Lampa.Player.listener;
  var video;
  var videoEvents = Lampa.PlayerVideo && Lampa.PlayerVideo.listener;
  var released = false;
  var timer;
  function detach() {
    listener.remove("ready", ready);
    listener.remove("destroy", cleanup);
    listener.remove("external", cleanup);
    if (videoEvents) videoEvents.remove("loadeddata", rebind);
    if (video) video.removeEventListener("ended", ended, true);
  }
  function cleanup() {
    released = true;
    clearTimeout(timer);
    detach();
  }
  function ended() {
    if (released || !video.ended || Lampa.Player.playdata() !== player) return;
    if (player.timeline && player.timeline.waiting_for_user) return;
    released = true;
    detach();
    timer = setTimeout(function () {
      if (Lampa.Player.playdata() !== player) return;
      Lampa.Player.close();
      onEnded();
    }, 0);
  }
  function rebind() { if (Lampa.Player.playdata() === player) ready(player); }
  function ready(data) {
    if (data !== player || released) return;
    if (video) video.removeEventListener("ended", ended, true);
    video =
      Lampa.PlayerVideo && Lampa.PlayerVideo.video && Lampa.PlayerVideo.video();
    if (video && String(video.tagName).toLowerCase() === "video")
      video.addEventListener("ended", ended, true);
  }
  if (videoEvents) videoEvents.follow("loadeddata", rebind);
  listener.follow("ready", ready);
  listener.follow("destroy", cleanup);
  listener.follow("external", cleanup);
  return cleanup;
}

function DbrPlayerControls(player, options) {
  if (!Lampa.PlayerPanel || !Lampa.PlayerPanel.listener || !Lampa.PlayerVideo || !Lampa.PlayerVideo.listener) return function () {};
  var listeners = Lampa.Player.listener;
  var videoEvents = Lampa.PlayerVideo.listener;
  var panel = Lampa.PlayerPanel;
  var nativeAudioAllowed = true, nativeSubsAllowed = true;
  var currentVideo,
    nativeLists = [],
    closed = false;
  function active() {
    return !closed && Lampa.Player.playdata() === player;
  }
  function updateNativeTracks() {
    if (!active() || !currentVideo) return;
    var audio = currentVideo.audioTracks;
    if (nativeAudioAllowed && audio && audio.length) {
      var tracks = [];
      for (var n = 0; n < audio.length; n++)
        (function (track, index) {
          var item = {
            index: index,
            language: track.language,
            label: track.label,
            selected: !!track.enabled,
          };
          Object.defineProperty(item, "enabled", {
            get: function () {
              return track.enabled;
            },
            set: function (value) {
              track.enabled = value;
            },
          });
          tracks.push(item);
        })(audio[n], n);
      panel.setTracks(tracks);
    }
    var subs = currentVideo.textTracks;
    if (
      nativeSubsAllowed && subs &&
      subs.length &&
      !(currentVideo.customSubs && currentVideo.customSubs.length)
    ) {
      var subtitles = [];
      for (var n = 0; n < subs.length; n++)
        (function (track, index) {
          if (track.kind !== "subtitles" && track.kind !== "captions") return;
          var item = {
            index: index,
            language: track.language,
            label: track.label,
            selected: track.mode === "showing",
          };
          Object.defineProperty(item, "mode", {
            get: function () {
              return track.mode;
            },
            set: function (value) {
              track.mode = value;
            },
          });
          subtitles.push(item);
        })(subs[n], n);
      if (subtitles.length) panel.setSubs(subtitles);
    }
  }
  function containsOnlyNative(items, list) {
    if (!items || !list) return false;
    return items.every(function (item) { for (var n = 0; n < list.length; n++) if (item === list[n]) return true; return false; });
  }
  function audioEvent(event) {
    if (!active() || !currentVideo) return;
    nativeAudioAllowed = containsOnlyNative(event.tracks, currentVideo.audioTracks);
    updateNativeTracks();
  }
  function subtitleEvent(event) {
    if (!active() || !currentVideo) return;
    nativeSubsAllowed = containsOnlyNative(event.subs, currentVideo.textTracks);
    updateNativeTracks();
  }
  function detachNative() {
    nativeLists.forEach(function (list) {
      list.removeEventListener("addtrack", updateNativeTracks);
    });
    nativeLists = [];
  }
  function loaded() {
    if (!active()) return;
    var video = Lampa.PlayerVideo.video();
    if (video !== currentVideo) {
      detachNative();
      currentVideo = video;
      nativeAudioAllowed = nativeSubsAllowed = true;
      [video && video.audioTracks, video && video.textTracks].forEach(
        function (list) {
          if (list && list.addEventListener) {
            list.addEventListener("addtrack", updateNativeTracks);
            nativeLists.push(list);
          }
        },
      );
    }
    if (currentVideo && player.subtitles && player.subtitles.length && !currentVideo.customSubs) Lampa.Player.subtitles(player.subtitles);
    updateNativeTracks();
  }
  function ready(data) {
    if (data !== player || !active()) return;
    if (Object.keys(options.qualities || {}).length > 1) {
      player.quality = options.qualities;
      panel.quality(options.qualities, player.url);
    }
    loaded();
    if (options.loadSubtitles)
      options.loadSubtitles(function (list) {
        if (!active() || !list.length) return;
        var merged = (player.subtitles || [])
          .concat(list)
          .filter(function (sub, index, all) {
            return (
              all.findIndex(function (item) {
                return item.url === sub.url;
              }) === index
            );
          });
        player.subtitles = merged;
        Lampa.Player.subtitles(merged);
      });
  }
  function quality(event) {
    if (active() && options.onQuality) options.onQuality(event.name);
  }
  function cleanup() {
    closed = true;
    detachNative();
    listeners.remove("ready", ready);
    listeners.remove("destroy", cleanup);
    listeners.remove("external", cleanup);
    videoEvents.remove("loadeddata", loaded);
    videoEvents.remove("subs", subtitleEvent);
    videoEvents.remove("tracks", audioEvent);
    panel.listener.remove("quality", quality);
  }
  listeners.follow("ready", ready);
  listeners.follow("destroy", cleanup);
  listeners.follow("external", cleanup);
  videoEvents.follow("loadeddata", loaded);
  videoEvents.follow("subs", subtitleEvent);
  videoEvents.follow("tracks", audioEvent);
  panel.listener.follow("quality", quality);
  return cleanup;
}

function DbrAnime(movie, network, metadata) {
    var TMDB_API_KEY = 'lampa-metadata';
    var SERVER = '';
    var cache = {}, serial = Promise.resolve();
    function fetch(url, options) {
        var key = url + JSON.stringify(options || {});
        if (!cache[key]) cache[key] = serial.then(function () {
            return new Promise(function (resolve) { setTimeout(resolve, 300); });
        }).then(function () {
            if (url.indexOf('https://api.themoviedb.org/3/') === 0) {
                return metadata(url.split('/3/')[1].split('?')[0]);
            }
            return network(url, options && options.headers);
        }).then(function (data) {
            return {ok:true, status:200, text:function () { return Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)); }, json:function () { return Promise.resolve(typeof data === 'string' ? JSON.parse(data) : data); }};
        });
        serial = cache[key].catch(function () {});
        return cache[key];
    }
  function normalized(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }
  function origin(url) {
    var m = String(url).match(/^https?:\/\/[^/]+/i);
    return m ? m[0].toLowerCase() : "";
  }
  function localUrl(url) {
    if (typeof url !== "string") return "";
    if (/^\/(?!\/)/.test(url)) url = origin(SERVER) + url;
    return origin(url) === origin(SERVER) && !/[\s\\]/.test(url) ? url : "";
  }
  function httpUrl(url) {
    return (
      typeof url === "string" &&
      /^https?:\/\/[^\s/]+/i.test(url) &&
      !/[\s\\]/.test(url)
    );
  }
  function query(url, params) {
    Object.keys(params).forEach(function (key) {
      var value = encodeURIComponent(params[key]);
      var re = new RegExp("([?&])" + key + "=[^&]*");
      url = re.test(url)
        ? url.replace(re, "$1" + key + "=" + value)
        : url + (url.indexOf("?") < 0 ? "?" : "&") + key + "=" + value;
    });
    return url;
  }
  async function json(url) {
    var response;
    try {
      response = await fetch(url);
    } catch (_) {
      throw new Error("NVO: network request failed");
    }
    if (!response.ok) throw new Error("NVO: HTTP " + response.status);
    var data;
    try {
      data = await response.json();
    } catch (_) {
      throw new Error("NVO: invalid JSON");
    }
    if (data && data.rch)
      throw new Error(
        "NVO: Lampac requires WebSocket RCH; this Nuvio JS runtime cannot perform it",
      );
    if (data && data.accsdb)
      throw new Error("NVO: Lampac requires server authorization");
    return data;
  }
  function profileFromId(id) {
    var parts = String(id || "")
      .replace(/^.*:/, "")
      .split("~");
    if (
      parts.length !== 4 ||
      parts[0] !== "nvo1" ||
      !/^[a-z0-9_-]+$/.test(parts[1])
    )
      throw new Error("NVO: invalid manifest profile");
    var voice = decodeURIComponent(parts[2]);
    if (parts[3] !== "any" && !/^\d{3,4}$/.test(parts[3]))
      throw new Error("NVO: invalid quality profile");
    return {
      provider: parts[1],
      voice: voice,
      quality: parts[3],
      strict: voice !== "*" && parts[3] !== "any",
    };
  }
  function decodeHtml(value) {
    return String(value || "").replace(
      /&(?:quot|apos|amp|lt|gt|#\d+|#x[\da-f]+);/gi,
      function (entity) {
        var named = {
          "&quot;": '"',
          "&apos;": "'",
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
        };
        if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
        var hex = entity.toLowerCase().indexOf("&#x") === 0;
        return String.fromCodePoint(
          parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10),
        );
      },
    );
  }
  function attributes(tag) {
    var result = {},
      match,
      pattern = /([a-zA-Z0-9-]+)="([^"]*)"/g;
    while ((match = pattern.exec(tag))) result[match[1]] = decodeHtml(match[2]);
    return result;
  }
  async function textRequest(url, extraHeaders) {
    var headers = { "User-Agent": "Mozilla/5.0" };
    Object.keys(extraHeaders || {}).forEach(function (key) {
      headers[key] = extraHeaders[key];
    });
    var response;
    try {
      response = await fetch(url, { headers: headers });
    } catch (_) {
      throw new Error("NVO: AnimeGO network request failed");
    }
    if (!response.ok) throw new Error("NVO: AnimeGO HTTP " + response.status);
    return response.text();
  }
  function titleKey(value) {
    return normalized(value)
      .replace(/ё/g, "е")
      .replace(/[\s.,:!?"'()[\]–—-]+/g, "");
  }
  function relatedTitle(source, movie) {
    var alternatives = [movie.name, movie.original_name];
    [movie.name, movie.original_name].forEach(function (name) {
      String(name || "")
        .split(":")
        .forEach(function (part) {
          if (titleKey(part).length >= 8) alternatives.push(part);
        });
    });
    var expected = alternatives.map(titleKey).filter(Boolean);
    return [source.name, source.alternateName].some(function (name) {
      var key = titleKey(name);
      return expected.some(function (base) {
        return key === base || (base.length >= 4 && key.indexOf(base) === 0);
      });
    });
  }
  function dateValue(date) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(date || ""))) return NaN;
    return Date.parse(String(date).slice(0, 10) + "T00:00:00Z");
  }
  function relativeMediaUrl(base, path) {
    if (httpUrl(path)) return path;
    if (path.indexOf("//") === 0) return "https:" + path;
    var root = origin(base);
    var full = path.charAt(0) === "/" ? path : base.slice(root.length).split(/[?#]/)[0].replace(/[^/]*$/, "") + path;
    var pieces = full.split("/"), result = [];
    pieces.forEach(function (part) {
      if (part === "..") result.pop();
      else if (part !== ".") result.push(part);
    });
    var url = root + result.join("/");
    return httpUrl(url) ? url : "";
  }
  async function cvhStreams(content, profile, season, episode) {
    var coordinates = [];
    (content.match(/<button\b[^>]*>/g) || []).map(attributes).forEach(function (attr) {
      var match = /\/cdn-iframe\/(\d+)\/[^/]+\/(\d+)\/(\d+)(?:[?#]|$)/.exec(attr["data-player"] || "");
      if (match) {
        var key = [match[1], match[2], match[3]].join("/");
        if (coordinates.indexOf(key) < 0) coordinates.push(key);
      }
    });
    if (coordinates.length !== 1) return [];
    var parts = coordinates[0].split("/");
    var api = "https://plapi.cdnvideohub.com/api/v1/player/sv";
    var headers = { Referer: "https://animego.me/", "User-Agent": "Mozilla/5.0" };
    var playlist = JSON.parse(await textRequest(api + "/playlist?pub=747&aggr=mali&id=" + parts[0], headers));
    var ids = [];
    (Array.isArray(playlist.items) ? playlist.items : []).forEach(function (item) {
      if (normalized(item.voiceStudio || "Original") === normalized(profile.voice) &&
          Number(item.season) === Number(parts[1]) && Number(item.episode) === Number(parts[2]) &&
          /^\d+$/.test(String(item.vkId)) && ids.indexOf(String(item.vkId)) < 0)
        ids.push(String(item.vkId));
    });
    if (ids.length !== 1) return [];
    var video = JSON.parse(await textRequest(api + "/video/" + ids[0], headers));
    var masterUrl = video.sources && video.sources.hlsUrl;
    if (!httpUrl(masterUrl)) return [];
    var master = await textRequest(masterUrl, headers);
    if (master.indexOf("#EXTM3U") !== 0) return [];
    var lines = master.split(/\r?\n/), urls = [];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf("#EXT-X-STREAM-INF:") !== 0) continue;
      var resolution = /RESOLUTION=\d+x(\d+)(?:,|$)/.exec(lines[i]);
      if (!resolution || resolution[1] !== profile.quality) continue;
      // A standalone video rendition would lose an external audio group.
      if (/(?:[:,])AUDIO=/.test(lines[i])) continue;
      var next = i + 1;
      while (next < lines.length && !lines[next].trim()) next++;
      if (next >= lines.length || lines[next].charAt(0) === "#") continue;
      var url = relativeMediaUrl(masterUrl, lines[next].trim());
      if (url && urls.indexOf(url) < 0) urls.push(url);
    }
    if (!urls.length) return [];
    return [{ name: "CVH | " + profile.voice,
      title: "S" + season + "E" + episode + " | " + profile.voice + " | " + profile.quality + "p",
      url: urls[0], quality: profile.quality + "p",
      language: profile.voice === "Original" ? "Japanese" : "Russian", headers: headers }];
  }

  async function animeGoStreams(profile, movie, tmdbId, season, episode) {
    if (season < 1 || !profile.strict || movie.original_language !== "ja")
      return [];
    var site = "https://animego.me";
    var episodeData = await json(
      query("https://api.themoviedb.org/3/tv/" + tmdbId + "/season/" + season, {
        api_key: TMDB_API_KEY,
        language: "ru-RU",
      }),
    );
    var episodes =
      episodeData && Array.isArray(episodeData.episodes)
        ? episodeData.episodes
        : [];
    episodes = episodes.slice().sort(function (a, b) {
      return a.episode_number - b.episode_number;
    });
    var targetIndex = episodes.findIndex(function (item) {
      return item.episode_number === episode;
    });
    if (
      targetIndex < 0 ||
      !Number.isFinite(dateValue(episodes[targetIndex].air_date))
    )
      return [];
    var search = await textRequest(
      site + "/search/anime?q=" + encodeURIComponent(movie.name),
    );
    var paths = [];
    (search.match(/<a\b[^>]*>/g) || [])
      .map(attributes)
      .forEach(function (link) {
        if (
          /^\/anime\/[a-z0-9-]+-\d+$/.test(link.href || "") &&
          link.title &&
          relatedTitle({ name: link.title }, movie) &&
          paths.indexOf(link.href) < 0
        )
          paths.push(link.href);
      });
    var candidates = await Promise.all(
      paths.slice(0, 10).map(async function (path) {
        try {
          var page = await textRequest(site + path);
          var block =
            /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i.exec(
              page,
            );
          if (!block) return undefined;
          var source = JSON.parse(block[1]);
          if (source["@type"] !== "TVSeries" || !relatedTitle(source, movie))
            return undefined;
          var sourceDate = dateValue(source.datePublished);
          var starts = episodes
            .map(function (ep, index) {
              return {
                index: index,
                difference: Math.abs(dateValue(ep.air_date) - sourceDate),
              };
            })
            .filter(function (item) {
              return item.index <= targetIndex && item.difference <= 86400000;
            });
          if (starts.length !== 1) return undefined;
          var first = starts[0].index,
            localEpisode = targetIndex - first + 1;
          if (
            !Number.isInteger(Number(source.numberOfEpisodes)) ||
            localEpisode > Number(source.numberOfEpisodes)
          )
            return undefined;
          return {
            id: path.match(/-(\d+)$/)[1],
            first: first,
            episode: localEpisode,
          };
        } catch (_) {
          return undefined;
        }
      }),
    );
    candidates = candidates.filter(Boolean).sort(function (a, b) {
      return b.first - a.first;
    });
    if (
      !candidates.length ||
      (candidates.length > 1 && candidates[0].first === candidates[1].first)
    )
      return [];
    var chosen = candidates[0];
    var playerHeaders = {
      Referer: site + "/",
      "X-Requested-With": "XMLHttpRequest",
    };
    async function playerHtml(path) {
      var result = JSON.parse(await textRequest(site + path, playerHeaders));
      return result && result.data && typeof result.data.content === "string"
        ? result.data.content
        : "";
    }
    var content = await playerHtml("/player/" + chosen.id);
    if (chosen.episode !== 1) {
      var tags = content.match(/<[^>]+\bdata-episode[^>]*>/g) || [];
      var episodeIds = tags
        .map(attributes)
        .filter(function (attr) {
          return (
            Number(attr["data-episode-number"]) === chosen.episode &&
            /^\d+$/.test(attr["data-episode"] || "")
          );
        })
        .map(function (attr) {
          return attr["data-episode"];
        });
      episodeIds = episodeIds.filter(function (id, index) {
        return episodeIds.indexOf(id) === index;
      });
      if (episodeIds.length !== 1) return [];
      content = await playerHtml("/player/videos/" + episodeIds[0]);
    }
    if (profile.provider === "cvh") return cvhStreams(content, profile, season, episode);
    if (profile.provider === "discover") return content;
    var players = (content.match(/<button\b[^>]*>/g) || [])
      .map(attributes)
      .filter(function (attr) {
        return (
          normalized(attr["data-provider-title"]) === "aniboom" &&
          normalized(attr["data-translation-title"]) ===
            normalized(profile.voice)
        );
      });
    var embeds = players
      .map(function (attr) {
        var url = attr["data-player"] || "";
        return url.indexOf("//") === 0 ? "https:" + url : url;
      })
      .filter(function (url, index, all) {
        return (
          /^https:\/\/aniboom\.(one|tv)\/embed\/[^\s]+$/.test(url) &&
          all.indexOf(url) === index
        );
      });
    if (embeds.length !== 1) return [];
    var embed = embeds[0],
      embedOrigin = origin(embed);
    var page = await textRequest(embed, { Referer: site + "/" });
    var video = /<video\b[^>]*\bdata-parameters="([^"]+)"/i.exec(page);
    if (!video) return [];
    var data = JSON.parse(decodeHtml(video[1]));
    var hls = typeof data.hls === "string" ? JSON.parse(data.hls) : data.hls;
    if (!hls || !httpUrl(hls.src)) return [];
    var playbackHeaders = {
      Referer: embedOrigin + "/",
      Origin: embedOrigin,
      "User-Agent": "Mozilla/5.0",
    };
    var master = await textRequest(hls.src, playbackHeaders);
    if (master.indexOf("#EXTM3U") !== 0) return [];
    var heights = [],
      resolution,
      resolutions = /RESOLUTION=\d+x(\d+)/g;
    while ((resolution = resolutions.exec(master)))
      heights.push(Number(resolution[1]));
    if (heights.indexOf(Number(profile.quality)) < 0) return [];
    // Keep the master: its audio rendition is separate from the video variants.
    return [
      {
        name: "AniBoom | " + profile.voice,
        title:
          "S" +
          season +
          "E" +
          episode +
          " | " +
          profile.voice +
          " | Adaptive up to " +
          Math.max.apply(Math, heights) +
          "p",
        url: hls.src,
        quality: profile.quality + "p",
        language: "Russian",
        headers: playbackHeaders,
      },
    ];
  }

    this.load = async function (season, episode) {
        var id = movie.tmdb_id || movie.id;
        var content = await animeGoStreams({provider:'discover',voice:'discovery',quality:'1080',strict:true},movie,id,season,episode);
        if (typeof content !== 'string') return [];
        var profiles = [], seen = {};
        function add(provider, voice) {
            var key = provider + '|' + voice;
            if (!seen[key]) { seen[key] = true; profiles.push({provider:provider,voice:voice,quality:'1080',strict:true}); }
        }
        var buttons=(content.match(/<button\b[^>]*>/g)||[]).map(attributes);
        buttons.forEach(function (b) {
            if (normalized(b['data-provider-title']) === 'aniboom' && b['data-translation-title']) add('aniboom',b['data-translation-title']);
        });
        var coordinates = [];
        buttons.forEach(function (b) {
            var m=/\/cdn-iframe\/(\d+)\/[^/]+\/(\d+)\/(\d+)(?:[?#]|$)/.exec(b['data-player']||'');
            if (m && coordinates.indexOf(m[1]+'/'+m[2]+'/'+m[3])<0) coordinates.push(m[1]+'/'+m[2]+'/'+m[3]);
        });
        if (coordinates.length === 1) {
            var c=coordinates[0].split('/');
            var list=JSON.parse(await textRequest('https://plapi.cdnvideohub.com/api/v1/player/sv/playlist?pub=747&aggr=mali&id='+c[0], {Referer:'https://animego.me/','User-Agent':'Mozilla/5.0'}));
            (list.items||[]).forEach(function (item) { if (Number(item.season)===Number(c[1]) && Number(item.episode)===Number(c[2])) add('cvh',item.voiceStudio||'Original'); });
        }
        var rows=[], failures=0;
        for (var i=0;i<profiles.length;i++) {
            var profile=profiles[i], quality={}, headers, max=0, adaptive=false;
            try {
                var levels=profile.provider==='cvh'?['2160','1440','1080']:['1080'];
                for (var j=0;j<levels.length;j++) {
                    profile.quality=levels[j];
                    var streams=await animeGoStreams(profile,movie,id,season,episode);
                    if (streams.length) { quality[levels[j]+'p']=/\.m3u8/.test(streams[0].url)?streams[0].url:streams[0].url.split('#')[0]+'#dbr.m3u8'; headers=streams[0].headers; max=Math.max(max,Number(levels[j])); adaptive=profile.provider==='aniboom'; }
                }
                if (max) rows.push({name:profile.provider==='cvh'?'CVH':'AniBoom', title:profile.voice+(adaptive?' · Adaptive':''), dbr_voice:profile.voice, dbr_quality:String(max), quality:quality, url:quality[max+'p'], headers:headers, behaviorHints:{bingeGroup:'dbr-anime|'+profile.provider+'|'+profile.voice}, dbr_anime:true, audioLanguages:[profile.voice==='Original'?'ja':'ru']});
            } catch (e) { failures++; }
        }
        if (!rows.length && failures) throw new Error('Anime source unavailable');
        return rows.sort(function (a,b) { return Number(b.dbr_quality)-Number(a.dbr_quality); });
    };
}

function DbrApi(movie) {
    var pending = [];
    var timers = [];
    var epoch = 0;
    var server = DbrCore.baseUrl(Lampa.Storage.get('debrid_lampac_url', '')) || 'https://rc.bwa.ad';
    var socket;
    var transportId = '';
    var transportReady = false;
    var transportWaiters = [];
    var transportTimer;
    var relayActive = 0;
    var addon = DbrCore.baseUrl(Lampa.Storage.get('debrid_aiostreams_url', ''));
    var clientType = 'web';
    var apkVersion = 0;
    if (Lampa.Platform && Lampa.Platform.is('android') && typeof AndroidJS !== 'undefined' && typeof AndroidJS.appVersion === 'function') {
        var version = String(AndroidJS.appVersion()).split('-').pop();
        apkVersion = parseInt(version, 10) || 0;
        clientType = 'apk';
    }


    function origin(url) { var match = String(url).match(/^https?:\/\/[^/]+/i); return match ? match[0].toLowerCase() : ''; }
    function serverUrl(url) {
        if (typeof url !== 'string') return '';
        if (url.charAt(0) === '/' && url.charAt(1) !== '/') url = origin(server) + url;
        return DbrCore.httpUrl(url) && origin(url) === origin(server) ? url : '';
    }
    function query(url, params) {
        Object.keys(params).forEach(function (key) {
            var pattern = new RegExp('([?&])' + key + '=[^&]*');
            if (pattern.test(url)) url = url.replace(pattern, '$1' + key + '=' + encodeURIComponent(params[key]));
            else url += (url.indexOf('?') === -1 ? '?' : '&') + key + '=' + encodeURIComponent(params[key]);
        });
        return url;
    }
    function movieParams() {
        return {
            id: movie.tmdb_id || movie.id || '', tmdb_id: movie.tmdb_id || '', anime: movie.original_language === 'ja' ? 1 : 0, imdb_id: movie.imdb_id || '', kinopoisk_id: movie.kinopoisk_id || movie.kp_id || '',
            title: movie.title || movie.name || '', original_title: movie.original_title || movie.original_name || '',
            serial: DbrCore.type(movie) === 'series' ? 1 : 0,
            year: String(movie.release_date || movie.first_air_date || '').slice(0, 4), source: movie.source || 'tmdb', rjson: 'true'
        };
    }
    function transport(callback) {
        if (transportReady && socket && socket.readyState === 1) return callback('');
        if (typeof WebSocket === 'undefined') return callback('challenge');
        transportWaiters.push(callback);
        if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;
        var generation = epoch;
        transportId = Lampa.Utils.uid(32).toLowerCase();
        function finish(error) {
            clearTimeout(transportTimer);
            var waiters = transportWaiters;
            transportWaiters = [];
            if (generation === epoch) waiters.forEach(function (done) { done(error); });
        }
        try {
            socket = new WebSocket(origin(server).replace(/^http/, 'ws') + '/nws?id=' + encodeURIComponent(transportId) + '&ver=1');
        } catch (ignore) { return finish('network'); }
        var connection = socket;
        function send(method, args) {
            if (connection.readyState === 1) connection.send(JSON.stringify({ method: method, args: args }));
        }
        transportTimer = setTimeout(function () { finish('network'); connection.close(); }, 10000);
        connection.onmessage = function (event) {
            if (generation !== epoch || connection !== socket) return;
            var message;
            try { message = JSON.parse(event.data); } catch (ignore) { return; }
            var args = message.args || [];
            if (message.method === 'Connected') {
                send('RchRegistry', [{ host: location.host, rchtype: clientType, apkVersion: apkVersion, player: Lampa.Storage.field ? Lampa.Storage.field('player') || 'inner' : 'inner' }]);
            } else if (message.method === 'RchRegistry') {
                transportReady = true;
                finish('');
            } else if (message.method === 'RchClient') {
                var requestId = args[0], target = args[1];
                if (target === 'ping') { send('RchResult', [requestId, 'pong']); return; }
                var host = /^https:\/\/([a-z0-9.-]+)(?:\/|$)/i.exec(String(target || ''));
                var allowed = ['kodik-api.com', 'kodikapi.com', 'kodikplayer.com', 'kodikres.com', 'api.anilibria.app', 'anilib.me', 'anime1.best', 'dreamerscast.com', 'api.luxembd.ws', 'eneyida.tv'];
                if (!host || allowed.indexOf(host[1].toLowerCase()) < 0 || relayActive >= 3) {
                    send('RchResult', [requestId, '']); return;
                }
                var relay = new Lampa.Reguest(), completed = false;
                if (typeof relay.native !== 'function') { send('RchResult', [requestId, '']); return; }
                relayActive++;
                pending.push(relay);
                var relayTimer = setTimeout(function () { complete(''); relay.clear(); }, 8000);
                timers.push(relayTimer);
                function complete(body) {
                    if (completed) return;
                    completed = true;
                    if (generation === epoch) relayActive--;
                    clearTimeout(relayTimer);
                    timers = timers.filter(function (item) { return item !== relayTimer; });
                    pending = pending.filter(function (item) { return item !== relay; });
                    if (generation !== epoch || connection !== socket) return;
                    if (typeof body !== 'string') {
                        try { body = JSON.stringify(body); } catch (_) { body = ''; }
                    }
                    send('RchResult', [requestId, body && body.length <= 1048576 ? body : '']);
                }
                var headers = {};
                Object.keys(args[3] || {}).forEach(function (key) {
                    if (/^(accept|accept-language|content-type|user-agent|referer|origin|x-requested-with)$/i.test(key) && typeof args[3][key] === 'string') headers[key] = args[3][key];
                });
                relay.timeout(8000);
                try {
                    relay.native(target, complete, function () { complete(''); }, args[2] || false, {dataType:'text', timeout:8000, headers:headers, returnHeaders:args[4] === true});
                } catch (ignore) { complete(''); }
            }
        };
        connection.onerror = function () { finish('network'); connection.close(); };
        connection.onclose = function () {
            if (connection !== socket) return;
            transportReady = false;
            socket = undefined;
            finish('network');
        };
    }
    function request(url, callback, timeout, retried) {
        var generation = epoch;
        var local = origin(url) === origin(server);
        if (local && transportReady) url = query(url, { nws_id: transportId, rchtype: clientType });
        var net = new Lampa.Reguest();
        var finished = false;
        pending.push(net);
        function finish(error, data) {
            if (finished) return;
            finished = true;
            pending = pending.filter(function (item) { return item !== net; });
            if (generation !== epoch) return;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch (ignore) { return callback('format'); }
            }
            if (!error && local && data && data.rch && !retried && data.nws) {
                return transport(function (failure) {
                    if (generation !== epoch) return;
                    if (failure) callback(failure);
                    else request(url, callback, timeout, true);
                });
            }
            if (!error && local && data && data.accsdb && /на данном устройстве недоступно/i.test(String(data.msg || ''))) return callback('device');
            callback(error, data);
        }
        net.timeout(timeout || 20000);
        var method = typeof net['native'] === 'function' ? 'native' : 'silent';
        net[method](url, function (data) { finish('', data); }, function () { finish('network'); });
    }
    function tmdb(path, callback) {
        var generation = epoch;
        var source = Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb;
        if (!source || !source.get) return callback('metadata');
        var finished = false;
        var timer = setTimeout(function () { done('metadata'); }, 20000);
        timers.push(timer);
        function done(error, data) {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            timers = timers.filter(function (item) { return item !== timer; });
            if (generation === epoch) callback(error, data);
        }
        source.get(path, {}, function (data) { done('', data); }, function () { done('metadata'); });
    }
    this.cancel = function () {
        epoch++;
        relayActive = 0;
        clearTimeout(transportTimer);
        transportWaiters = [];
        transportReady = false;
        var oldSocket = socket;
        socket = undefined;
        if (oldSocket) oldSocket.close();
        timers.forEach(function (timer) { clearTimeout(timer); });
        timers = [];
        var old = pending;
        pending = [];
        old.forEach(function (net) { net.clear(); });
    };
    this.resolveMovie = function (callback) {
        var id = movie.tmdb_id || ((!movie.source || /^(tmdb|cub)$/.test(movie.source)) && /^\d+$/.test(String(movie.id)) ? movie.id : '');
        var type = DbrCore.type(movie) === 'series' ? 'tv' : 'movie';
        function details() {
            if (!id) return callback(movie.imdb_id ? '' : 'metadata');
            movie.tmdb_id = id;
            tmdb(type + '/' + id + '?append_to_response=external_ids', function (error, data) {
                if (data) {
                    if (!movie.imdb_id) movie.imdb_id = data.imdb_id || (data.external_ids && data.external_ids.imdb_id) || '';
                    if (Array.isArray(data.seasons)) movie.seasons = data.seasons;
                    movie.original_language = data.original_language || movie.original_language;
                    movie.original_name = data.original_name || movie.original_name;
                    movie.name = data.name || movie.name;
                }
                callback(error && !movie.imdb_id ? error : '');
            });
        }
        if (!id && movie.imdb_id) {
            tmdb('find/' + movie.imdb_id + '?external_source=imdb_id', function (error, data) {
                var rows = data && (type === 'tv' ? data.tv_results : data.movie_results);
                if (rows && rows.length) id = rows[0].id;
                details();
            });
        } else details();
    };
    this.episodes = function (season, callback) {
        if (!movie.tmdb_id) return callback('metadata', []);
        tmdb('tv/' + movie.tmdb_id + '/season/' + season, function (error, json) {
            callback(error, json && Array.isArray(json.episodes) ? json.episodes : []);
        });
    };
    this.anime = function (season, episode, callback) {
        var generation = epoch;
        var lastStage = 'metadata', failure = '';
        function diagnostic(reason) { return 'anime:' + (failure || lastStage + ':' + reason) + ':' + clientType + '-' + apkVersion; }
        function stage(url) {
            if (url.indexOf('/search/anime') >= 0) return 'search';
            if (url.indexOf('/anime/') >= 0) return 'title';
            if (url.indexOf('/player/videos/') >= 0) return 'episode';
            if (url.indexOf('animego.me/player/') >= 0) return 'player';
            if (url.indexOf('/playlist?') >= 0) return 'cvh-list';
            if (url.indexOf('/player/sv/video/') >= 0) return 'cvh-video';
            if (url.indexOf('aniboom.one') >= 0) return 'aniboom';
            return 'hls';
        }
        var engine = new DbrAnime(movie, function (url, headers) {
            return new Promise(function (resolve, reject) {
                if (generation !== epoch) return reject(new Error('Cancelled'));
                lastStage = stage(url);
                var requestStage = lastStage;
                var net = new Lampa.Reguest(); pending.push(net); net.timeout(20000);
                function finish(error, data) {
                    pending = pending.filter(function (item) { return item !== net; });
                    if (error && generation === epoch) failure = requestStage + ':HTTP-' + (data && Number(data.status) || 0);
                    if (error || generation !== epoch) reject(new Error('Anime network request failed'));
                    else resolve(data);
                }
                net.native(url, function (data) { finish(false, data); }, function (error) { finish(true, error); }, false, {dataType:'text', headers:headers});
            });
        }, function (path) {
            return new Promise(function (resolve,reject) {
                if (generation !== epoch) return reject(new Error('Cancelled'));
                tmdb(path,function (error,data) { if (error) { failure = 'metadata:failed'; reject(new Error('Metadata unavailable')); } else resolve(data); });
            });
        });
        engine.load(season,episode).then(function (streams) {
            if (generation !== epoch) return;
            if (!streams.length) return callback(diagnostic('empty'),[],[]);
            callback('',streams.map(function (stream,index) {
                var row=DbrCore.normalize(stream,index,'anime');
                row.qualityOptions=DbrCore.qualityKeys(stream.quality).map(DbrCore.qualityValue);
                return row;
            }),[]);
        }).catch(function () { if (generation === epoch) callback(diagnostic('parse-or-request'),[],[]); });
    };
    this.aio = function (season, episode, callback) {
        if (!addon) return callback('config', []);
        if (!movie.imdb_id) return callback('imdb', []);
        request(DbrCore.streamUrl(addon, movie.imdb_id, DbrCore.type(movie), season, episode), function (error, json) {
            if (error) return callback(error, []);
            if (!json || !Array.isArray(json.streams)) return callback('format', []);
            callback('', json.streams.map(function (stream, index) { return DbrCore.normalize(stream, index, 'aio'); }));
        }, Number(Lampa.Storage.get('debrid_timeout', 120000)) || 120000);
    };
    this.providers = function (callback) {
        request(query(server + '/lite/events', movieParams()), function (error, json) {
            if (error) return callback(error, []);
            if (json && (json.accsdb || json.rch)) return callback(json.accsdb ? 'auth' : 'challenge', []);
            if (!Array.isArray(json)) return callback('format', []);
            callback('', json.filter(function (item) { return serverUrl(item.url); }).map(function (item, index) {
                return { id: 'lampac-' + index, name: String(item.name || item.balanser || 'Источник'), url: serverUrl(item.url) };
            }));
        });
    };
    this.lampac = function (provider, season, episode, callback) {
        var params = movieParams();
        params.s = season;
        params.e = episode;
        var visited = [];
        function load(url, depth) {
            url = serverUrl(url);
            if (!url || depth > 4 || visited.indexOf(url) !== -1) return callback('format', [], []);
            visited.push(url);
            request(query(url, { rjson: 'true' }), function (error, json) {
                if (error) return callback(error, [], []);
                if (json && (json.accsdb || json.rch)) return callback(json.accsdb ? 'auth' : 'challenge', [], []);
                if (!json || !Array.isArray(json.data)) {
                    return callback(json && Object.keys(json).length ? 'format' : '', [], []);
                }
                if (json.type === 'season') {
                    var match = json.data.filter(function (item) { return Number(item.id) === Number(season); })[0];
                    return match ? load(match.url, depth + 1) : callback('', [], []);
                }
                var voices = Array.isArray(json.voice) ? json.voice.filter(function (item) { return serverUrl(item.url); }) : [];
                var items = json.data.filter(function (item) {
                    return (item.method === 'play' || item.method === 'call') && (DbrCore.type(movie) !== 'series' || (Number(item.e) === Number(episode) && Number(item.s) === Number(season)));
                });
                var links = json.data.filter(function (item) { return item.method === 'link' && !item.similar; });
                if (!items.length && links.length === 1) return load(links[0].url, depth + 1);
                if (!items.length && json.type !== 'episode' && json.type !== 'movie' && json.data.length) return callback('match', [], voices);
                callback('', DbrCore.lampacRows(items, provider.id, { name: provider.name, voice: provider.voiceName }), voices);
            });
        }
        load(provider.voiceUrl || query(provider.url, params), 0);
    };
    var subtitleSupport;
    this.subtitles = function (row, season, episode, callback) {
        if (!addon || !movie.imdb_id) return callback([]);
        function fetchSubtitles() {
            if (!subtitleSupport) return callback([]);
            var id = movie.imdb_id + (DbrCore.type(movie) === 'series' ? ':' + season + ':' + episode : '');
            var hints = row.raw.behaviorHints || {}, extra = [];
            ['filename', 'videoSize', 'videoHash'].forEach(function (key) { if (hints[key]) extra.push(key + '=' + encodeURIComponent(String(hints[key]))); });
            var url = addon + '/subtitles/' + DbrCore.type(movie) + '/' + encodeURIComponent(id) + (extra.length ? '/' + extra.join('&') : '') + '.json';
            request(url, function (error, data) {
                var list = !error && data && Array.isArray(data.subtitles) ? data.subtitles : [];
                callback(list.filter(function (item) { return item && DbrCore.httpUrl(item.url); }).map(function (item) { return { url: item.url, label: item.label || item.title || item.lang || 'Subtitles', language: item.lang || item.language || '' }; }));
            }, 10000);
        }
        if (subtitleSupport !== undefined) return fetchSubtitles();
        request(addon + '/manifest.json', function (error, manifest) {
            if (error) return callback([]);
            subtitleSupport = !!(manifest && Array.isArray(manifest.resources) && manifest.resources.some(function (resource) { return resource === 'subtitles' || (resource && resource.name === 'subtitles'); }));
            fetchSubtitles();
        }, 10000);
    };
    this.resolveStream = function (row, callback) {
        if (row.method !== 'call') return callback('', row.raw);
        var url = serverUrl(row.url);
        if (!url) return callback('format');
        request(url, function (error, json) {
            if (error) return callback(error);
            if (json && (json.accsdb || json.rch)) return callback(json.accsdb ? 'auth' : 'challenge');
            if (!json || !DbrCore.httpUrl(json.url)) return callback('format');
            callback('', json);
        });
    };
}

function DebridComponent(object) {
    var self = this;
    var movie = object.movie;
    var api = new DbrApi(movie);
    var history;
    var progressTimer;
    var qualityRequest = 0;
    var backdropTimer;
    var detailTimer;
    var backdropKey = '';
    var voiceRenderKey = '';
    var releaseAutoplay = function () {};
    var releasePlayerControls = function () {};
    var releasePlayback = function () {};
    var files = new Lampa.Explorer($.extend({}, object, { params: $.extend({}, object.params, { noinfo: true }) }));
    var scroll = new Lampa.Scroll({ mask: false, over: false, nopadding: true });
    var header = $('<div class="dbr3-header"></div>');
    var t = DbrI18n.text;
    var label = DbrI18n.label;
    var detailPanel = $('<div class="dbr4-detail"></div>');
    var rightPanel = $('<div class="dbr4-right"></div>');
    var toolbar = $('<div class="dbr4-toolbar"></div>');
    var voicebar = $('<div class="dbr4-voices"></div>');
    var previewEpisode = 1;
    var focusMemory = {};
    var navigationGroups = {};
    var navigationNodes = {};
    var navigationIndexes = {};
    var chevron = '<svg class="dbr4-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var side = $('<div class="dbr3-sources"></div>');
    var layout = $('<div class="dbr3-layout"></div>');
    var mode = DbrCore.type(movie) === 'series' ? 'episodes' : 'streams';
    var seasons = [];
    var episodes = [];
    var season = 1;
    var episode = 1;
    var providers = [];
    var selectedProvider = 'aio';
    var selection = {};
    var order = 'quality';
    var lastKey = '';
    var renderedListKey = '';
    var dead = false;
    var initializing = true;
    var metadataError = '';
    var discoveryError = '';
    var pendingProviders = [];
    var runningProviders = 0;
    var playbackRequest = 0;
    var lastPlayback;
    var nextRequest;
    var advancing = false;
    var labels = { audio: t('Язык'), subtitles: t('Субтитры'), quality: t('Качество'), voice: t('Озвучка'), range: t('Видео') };
    var errors = { network: t('Не удалось подключиться'), playback: t('Видео недоступно на этом устройстве'), format: t('Источник вернул неподдерживаемый ответ'), config: t('Укажите адрес AIOStreams в настройках'), imdb: t('Не удалось определить IMDb ID'), auth: t('Источник требует авторизацию'), device: t('Источник недоступен на этом устройстве'), challenge: t('Источник требует проверку в своём плагине'), match: t('Источник требует уточнить название'), metadata: t('Не удалось загрузить сведения о сериях') };

    function detail(item) {
      item =
        item ||
        episodes.filter(function (entry) {
          return entry.episode_number === episode;
        })[0] ||
        movie;
      var number = item.episode_number || episode;
      var series = DbrCore.type(movie) === "series";
      var preview = image(
        item.still_path || movie.backdrop_path || movie.poster_path,
      );
      if (backdropKey !== preview) {
        backdropKey = preview;
        clearTimeout(backdropTimer);
        backdropTimer = setTimeout(function () {
          if (dead || backdropKey !== preview) return;
          var art = detailPanel.find('.dbr4-art');
          if (!preview) { art.empty().removeClass('dbr4-shimmer'); return; }
          var img = $('<img alt="">');
          img.on('load', function () {
            if (!dead && backdropKey === preview) art.empty().removeClass('dbr4-shimmer').append(img);
          }).on('error', function () {
            if (!dead && backdropKey === preview) art.empty().removeClass('dbr4-shimmer');
          }).attr('src', preview);
        }, 160);
      }
      detailPanel.find(".dbr4-kicker").text(series ? title() : t("Фильм"));
      detailPanel
        .find("h1")
        .text(series ? item.name || t("Серия ") + number : title());
      detailPanel
        .find(".dbr4-meta")
        .text(
          series
            ? t("Сезон ") +
                season +
                " · " +
                t("Серия ") +
                number +
                (item.runtime ? " · " + item.runtime + t(" мин") : "")
            : (movie.release_date || "").slice(0, 4),
        );
      detailPanel
        .find(".dbr4-description")
        .text(item.overview || movie.overview || t("Описание отсутствует"));
      var progress = history ? history.timeline(season, number) : {};
      detailPanel
        .find(".dbr4-progress-label")
        .text(
          progress.percent > 0
            ? progress.percent >= 90
              ? t("Просмотрено")
              : t("Просмотрено ") + Math.round(progress.percent) + "%"
            : "",
        );
      detailPanel
        .find(".dbr4-progress-fill")
        .css("width", Math.max(0, Math.min(100, progress.percent || 0)) + "%");
      previewEpisode = number;
    }
    function buildDetail() {
      if (detailPanel.children().length) {
        detail();
        return;
      }
      detailPanel.append(
        '<div class="dbr4-art dbr4-shimmer"></div><div class="dbr4-kicker"></div><h1></h1><div class="dbr4-meta"></div><p class="dbr4-description"></p><div class="dbr4-progress"><div class="dbr4-progress-label"></div><div class="dbr4-progress-track"><div class="dbr4-progress-fill"></div></div></div>',
      );
      var actions = $('<div class="dbr4-actions"></div>');
      actions.append(
        button(
          t("Смотреть"),
          "detail-play",
          function () {
            if (mode === "episodes") {
              episode = previewEpisode;
              beginStreams();
            } else {
              var available = controlsFor("list");
              if (available.length)
                Lampa.Controller.collectionFocus(available.first(), layout);
            }
          },
          "dbr4-primary",
        ).attr("data-dbr-group", "detail"),
      );
      if (DbrCore.type(movie) === "series")
        actions.append(
          button(t("Следующая серия"), "next-episode", nextEpisode).attr(
            "data-dbr-group",
            "detail",
          ),
        );
      detailPanel.append(actions);
      detail();
    }
    function controlsFor(group) {
      return layout
        .find(".selector")
        .filter(":visible")
        .filter(function () {
          return !group || $(this).attr("data-dbr-group") === group;
        });
    }
    function cacheControls() {
        navigationGroups = {};
        navigationNodes = {};
        navigationIndexes = {};
        controlsFor().each(function () {
            var node = $(this), group = node.attr('data-dbr-group') || 'list', key = node.attr('data-dbr-key');
            if (!navigationGroups[group]) navigationGroups[group] = [];
            navigationIndexes[key] = navigationGroups[group].length;
            navigationGroups[group].push(key);
            navigationNodes[key] = node;
        });
    }
    function move(direction) {
        var next = DbrNavigation.move(navigationGroups, lastKey, direction, focusMemory);
        if (!next) return;
        if (next.action === 'filters') { filterMenu(); return; }
        if (next.action) { Lampa.Controller.toggle(next.action); return; }
        var target = navigationNodes[next.key];
        if (target && target.length) Lampa.Controller.collectionFocus(target, layout);
    }
    function reveal(element, group) {
        if (group === 'sources' || group === 'voices') {
            var bar = group === 'sources' ? side[0] : voicebar[0];
            var itemBox = element[0].getBoundingClientRect(), barBox = bar.getBoundingClientRect();
            if (itemBox.left < barBox.left) bar.scrollLeft += itemBox.left - barBox.left;
            else if (itemBox.right > barBox.right) bar.scrollLeft += itemBox.right - barBox.right;
        } else if ($.contains(scroll.render()[0], element[0])) {
            var item = element[0].getBoundingClientRect(), box = scroll.render()[0].getBoundingClientRect();
            var bodyTop = scroll.render().find('.scroll__body')[0].getBoundingClientRect().top;
            var pendingShift = scroll.position() - (bodyTop - box.top);
            if (item.top + pendingShift < box.top + 6 || item.bottom + pendingShift > box.bottom - 6) scroll.update(element, true);
        }
    }
    function viewportChanged() { resize(); cacheControls(); }
    function resize() {
        if (!layout[0] || !layout[0].offsetParent) return;
        layout.css('height', Math.max(200, window.innerHeight - layout[0].getBoundingClientRect().top) + 'px');
    }
    function title() { return movie.title || movie.name || t('Видео'); }
    function provider() { return providers.filter(function (item) { return item.id === selectedProvider; })[0] || providers[0]; }
    function rows() { return provider() ? provider().rows : []; }
    function filtered() { return DbrCore.sort(DbrCore.select(rows(), selection), order); }
    function countFilters() { return Object.keys(selection).reduce(function (sum, key) { return sum + selection[key].length; }, 0); }
    function image(path, size) {
        if (!path) return '';
        if (DbrCore.httpUrl(path)) return path;
        return Lampa.TMDB && Lampa.TMDB.image ? Lampa.TMDB.image('t/p/' + (size || 'w780') + path) : '';
    }
    function bind(element, key, enter) {
        element.attr('data-dbr-key', key).on('hover:enter', enter).on('hover:focus', function () {
            lastKey = key;
            var group = element.attr('data-dbr-group') || 'list';
            focusMemory[group] = navigationIndexes[key] || 0;
            reveal(element, group);
        });
        return element;
    }
    function button(text, key, action, className) {
        return bind($('<div class="selector dbr3-button ' + (className || '') + '"></div>').text(text), key, action).attr('data-dbr-group', 'list');
    }
    function choose(titleText, items, onSelect) {
        var safeItems = items.map(function (item) {
            var safe = $.extend({}, item, { title: DbrCore.escape(item.title), originalItem: item });
            if (item.subtitle) safe.subtitle = DbrCore.escape(item.subtitle);
            return safe;
        });
        Lampa.Select.show({ title: titleText, items: safeItems, onSelect: function (item) {
            Lampa.Select.close();
            onSelect(item.originalItem);
        }, onBack: function () { self.start(); } });
    }
    function filterMenu() {
        var items = [];
        if (DbrCore.type(movie) === 'series') {
            items.push({ title: t('Сезон ') + season, action: 'season' });
            if (mode === 'streams') items.push({ title: t('Выбрать серию'), action: 'episodes' });
        }
        DbrCore.fields.forEach(function (key) { items.push({ title: labels[key], action: key }); });
        items.push({ title: t('Сортировка'), action: 'sort' });
        if (countFilters()) items.push({ title: t('Сбросить фильтры'), action: 'reset' });
        choose(t('Фильтры'), items, function (item) {
            if (item.action === 'season') showSeasons();
            else if (item.action === 'episodes') { api.cancel(); mode = 'episodes'; lastKey = 'episode-' + episode; render(); }
            else if (item.action === 'reset') { selection = {}; render(); }
            else if (item.action === 'sort') choose(t('Сортировка'), [{ title: t('Как у источника'), value: 'source' }, { title: t('Качество: выше'), value: 'quality' }, { title: t('Размер: меньше'), value: 'size' }], function (item) { order = item.value; render(); });
            else showFilter(item.action);
        });
    }
    function loading() {
        scroll.append($('<div class="dbr3-loading"></div>').text(mode === 'episodes' ? t('Загружаем серии…') : t('Ищем потоки…')));
        for (var index = 0; index < 4; index++) {
            scroll.append($('<div class="dbr3-skeleton" aria-hidden="true"><div class="dbr3-skeleton-preview"></div><div class="dbr3-skeleton-body"><div></div><div></div><div></div></div><div class="dbr3-skeleton-end"></div></div>'));
        }
    }
    function empty(message, action) {
        scroll.append($('<div class="dbr3-empty"></div>').text(message));
        if (action) scroll.append(button(t('Повторить'), 'retry', action));
    }
    function loadQualityOptions(done) {
        var pending = rows().filter(function (row) { return row.method === 'call' && !row.qualityOptions; });
        var ticket = ++qualityRequest;
        if (!pending.length) { done(); return; }
        Lampa.Noty.show(t('Загружаем качество…'));
        function next() {
            if (dead || ticket !== qualityRequest) return;
            var row = pending.shift();
            if (!row) { done(); return; }
            api.resolveStream(row, function (error, stream) {
                if (dead || ticket !== qualityRequest) return;
                if (!error) {
                    var keys = DbrCore.qualityKeys(stream.quality || stream.qualitys || {});
                    row.qualityOptions = keys.map(DbrCore.qualityValue);
                    if (keys.length) row.quality = DbrCore.qualityValue(keys[0]);
                }
                next();
            });
        }
        next();
    }
    function showFilter(key, resolved) {
        if (key === 'quality' && !resolved) { loadQualityOptions(function () { showFilter(key, true); }); return; }
        var values = (selection[key] || []).slice();
        function show() {
            var temporary = {};
            Object.keys(selection).forEach(function (field) { temporary[field] = selection[field]; });
            temporary[key] = values;
            var items = [
                { title: t('Готово · ') + DbrCore.select(rows(), temporary).length + t(' потоков'), done: true },
                { title: t('Все варианты'), reset: true, selected: !values.length }
            ];
            DbrCore.facet(rows(), temporary, key).forEach(function (option) {
                items.push({ title: (values.indexOf(option.value) !== -1 ? '✓ ' : '') + label(key, option.value), subtitle: option.count + t(' потоков'), value: option.value });
            });
            choose(labels[key], items, function (item) {
                if (item.done) { selection[key] = values; render(); return; }
                if (item.reset) values = [];
                else if (values.indexOf(item.value) === -1) values.push(item.value);
                else values.splice(values.indexOf(item.value), 1);
                show();
            });
        }
        show();
    }
    function showSeasons() {
        choose(t('Сезон'), seasons.map(function (item) { return { title: item.name || t('Сезон ') + item.season_number, number: item.season_number, selected: item.season_number === season }; }), function (item) {
            season = item.number;
            episode = 1;
            loadEpisodes();
        });
    }
    function loadEpisodes() {
        api.cancel();
        advancing = false;
        nextRequest = undefined;
        playbackRequest++;
        mode = 'episodes';
        initializing = true;
        metadataError = '';
        render();
        api.episodes(season, function (error, items) {
            episodes = items;
            initializing = false;
            metadataError = error;
            render();
        });
    }
    function nextEpisode() {
        if (advancing) return;
        var preference = lastPlayback && lastPlayback.season === season && lastPlayback.episode === episode ? lastPlayback : undefined;
        var next = episodes.filter(function (item) { return item.episode_number === episode + 1; })[0];
        function start(item) {
            advancing = false;
            if (!item || (item.air_date && item.air_date > new Date().toISOString().slice(0, 10))) { Lampa.Noty.show(t('Следующая серия пока недоступна')); return; }
            episode = item.episode_number;
            beginStreams(preference);
        }
        if (next) return start(next);
        var later = seasons.filter(function (item) { return item.season_number > season; }).sort(function (a, b) { return a.season_number - b.season_number; })[0];
        if (!later) { Lampa.Noty.show(t('Это последняя доступная серия')); return; }
        advancing = true;
        api.episodes(later.season_number, function (error, items) {
            advancing = false;
            var first = items.filter(function (item) { return item.episode_number === 1; })[0];
            if (error || !first || (first.air_date && first.air_date > new Date().toISOString().slice(0, 10))) { Lampa.Noty.show(t('Следующая серия пока недоступна')); return; }
            season = later.season_number;
            episodes = items;
            start(first);
        });
    }
    function addFilterHeader() {
      var bar = $('<div class="dbr4-tabs"></div>');
      bar.append(
        button(
          t("Потоки"),
          "tab-streams",
          function () {
            if (mode !== "streams") beginStreams();
          },
          mode === "streams" ? "dbr4-tab selected" : "dbr4-tab",
        ).attr("data-dbr-group", "tabs"),
      );
      if (DbrCore.type(movie) === "series")
        bar.append(
          button(
            t("Серии"),
            "tab-episodes",
            function () {
              api.cancel();
              nextRequest = undefined;
              mode = "episodes";
              lastKey = "tab-episodes";
              render();
            },
            mode === "episodes" ? "dbr4-tab selected" : "dbr4-tab",
          ).attr("data-dbr-group", "tabs"),
        );
      var tools = $('<div class="dbr4-tools"></div>');
      if (DbrCore.type(movie) === "series")
        tools.append(
          button(t("Сезон ") + season, "season", showSeasons, "dbr4-dropdown")
            .attr("data-dbr-group", "tabs")
            .append(chevron),
        );
      tools.append(
        button(
          t("Фильтры") + (countFilters() ? " · " + countFilters() : ""),
          "filters",
          filterMenu,
        ).attr("data-dbr-group", "tabs"),
      );
      bar.append(tools);
      toolbar.empty().append(bar);
    }
    function episodeList() {
      if (initializing) {
        loading();
        return;
      }
      if (!episodes.length) {
        empty(
          errors[metadataError] || t("Список серий пока недоступен"),
          loadEpisodes,
        );
        return;
      }
      episodes.forEach(function (item) {
        var row = $('<div class="selector dbr3-episode"></div>').attr(
          "data-dbr-group",
          "list",
        );
        var picture = $('<div class="dbr3-preview dbr4-shimmer"></div>');
        var preview = image(item.still_path, "w300");
        if (preview)
          picture.append(
            $('<img alt="">')
              .attr("src", preview)
              .on("load", function () {
                picture.removeClass("dbr4-shimmer");
              })
              .on("error", function () {
                $(this).remove();
                picture.removeClass("dbr4-shimmer").text(t("Нет превью"));
              }),
          );
        else picture.removeClass("dbr4-shimmer").text(t("Нет превью"));
        row
          .append(
            $('<div class="dbr4-episode-number"></div>').text(item.episode_number),
          )
          .append(picture);
        var content = $('<div class="dbr3-episode-copy"></div>');
        content.append(
          $("<strong></strong>").text(
            item.name || t("Серия ") + item.episode_number,
          ),
        );
        content.append(
          $("<p></p>").text(item.overview || t("Описание отсутствует")),
        );
        var progress = history.timeline(season, item.episode_number);
        content.append(Lampa.Timeline.render(progress));
        row.append(content).append(
          $('<div class="dbr4-episode-status"></div>')
            .append(
              $("<span></span>").text(item.runtime ? item.runtime + t(" мин") : ""),
            )
            .append(
              $("<small></small>").text(
                progress.percent >= 90
                  ? "✓"
                  : progress.percent > 0
                    ? Math.round(progress.percent) + "%"
                    : "",
              ),
            ),
        );
        bind(row, "episode-" + item.episode_number, function () {
          episode = item.episode_number;
          beginStreams();
        });
        row.on("hover:focus", function () {
          previewEpisode = item.episode_number;
          clearTimeout(detailTimer);
          detailTimer = setTimeout(function () { if (!dead && mode === "episodes") detail(item); }, 80);
        });
        scroll.append(row);
      });
    }
    function renderSources() {
      side.empty();
      providers
        .filter(function (item) {
          return (
            item.id === "aio" || item.id === "anime" || (item.state === "ready" && item.rows.length > 0)
          );
        })
        .forEach(function (item) {
          var node = button(
            item.name,
            "source-" + item.id,
            function () {
              nextRequest = undefined;
              qualityRequest++;
              selection = {};
              selectedProvider = item.id;
              render();
            },
            "dbr3-source",
          ).attr("data-dbr-group", "sources");
          node.toggleClass("selected", item.id === selectedProvider);
          node.append(
            $("<b></b>").text(item.state === "ready" ? item.rows.length : ""),
          );
          side.append(node);
        });
      if (
        providers.some(function (item) {
          return item.state === "queued" || item.state === "loading";
        })
      )
        side.append(
          '<div class="dbr4-source-placeholder dbr4-shimmer" aria-hidden="true"></div>',
        );
      var source = provider();
      var voiceKey = [season, episode, source && source.id, source && source.state, source && source.voiceName, source && source.rows.length, JSON.stringify(selection.audio || [])].join('|');
      if (voiceKey === voiceRenderKey) return;
      voiceRenderKey = voiceKey;
      voicebar.empty();
      voicebar.append(
        $('<span class="dbr4-voice-label"></span>').text(t("Озвучка")),
      );
      if (!source || source.state === "loading" || source.state === "queued") {
        for (var n = 0; n < 3; n++)
          voicebar.append(
            '<div class="dbr4-voice-placeholder dbr4-shimmer" aria-hidden="true"></div>',
          );
        return;
      }
      function selectVoice(item) {
        nextRequest = undefined;
        source.voiceUrl = item.url;
        source.voiceName = item.name || item.title;
        fetchProvider(source);
      }
      if (source.voices && source.voices.length) {
        var visibleVoices = source.voices.slice(0, 3);
        var selectedVoice = source.voices.filter(function (item) { return (item.name || item.title) === source.voiceName; })[0];
        if (selectedVoice && visibleVoices.indexOf(selectedVoice) === -1) visibleVoices = [selectedVoice].concat(visibleVoices.slice(0, 2));
        visibleVoices.forEach(function (item) {
          voicebar.append(
            button(
              item.name || item.title || t("Перевод"),
              "voice-" + source.voices.indexOf(item),
              function () {
                selectVoice(item);
              },
              (source.voiceName === (item.name || item.title) ? "selected " : "") +
                "dbr4-voice",
            ).attr("data-dbr-group", "voices"),
          );
        });
        if (source.voices.length > 3)
          voicebar.append(
            button(
              "+" + (source.voices.length - 3),
              "voices-more",
              function () {
                choose(
                  t("Озвучка"),
                  source.voices.map(function (item) {
                    return { title: item.name || item.title, url: item.url };
                  }),
                  selectVoice,
                );
              },
              "dbr4-voice",
            ).attr("data-dbr-group", "voices"),
          );
      } else {
        var options = DbrCore.facet(source.rows, selection, "audio");
        voicebar.find(".dbr4-voice-label").text(t("Язык"));
        options.filter(function (item) { return ["ru", "en", "pl"].indexOf(item.value) >= 0; }).sort(function (a, b) { return ["ru", "en", "pl"].indexOf(a.value) - ["ru", "en", "pl"].indexOf(b.value); }).forEach(function (item, index) {
          voicebar.append(
            button(
              label("audio", item.value),
              "audio-" + index,
              function () {
                selection.audio =
                  (selection.audio || []).indexOf(item.value) >= 0
                    ? []
                    : [item.value];
                render();
              },
              ((selection.audio || []).indexOf(item.value) >= 0
                ? "selected "
                : "") + "dbr4-voice",
            ).attr("data-dbr-group", "voices"),
          );
        });
        var hiddenLanguages = options.filter(function (item) { return ["ru", "en", "pl"].indexOf(item.value) < 0; }).length;
        if (hiddenLanguages)
          voicebar.append(
            button(
              "+" + (hiddenLanguages),
              "audio-more",
              function () {
                showFilter("audio");
              },
              "dbr4-voice",
            ).attr("data-dbr-group", "voices"),
          );
        voicebar.find('[data-dbr-key^="audio-"]').each(function () {
            var node = $(this), text = node.text();
            ['ru', 'en', 'pl'].some(function (code) { if (label('audio', code) !== text) return false; node.prepend(DbrPresentation.flag(code)); return true; });
        });
        if (!options.length)
          voicebar.append(
            $('<span class="dbr4-muted"></span>').text(t("Не указаны")),
          );
      }
    }
    function streamList() {
        var source = provider();
        if (!source) { loading(); return; }
        if (source.state === 'loading' || source.state === 'queued') { loading(); return; }
        if (source.error) empty(source.error.indexOf('anime:') === 0 ? 'Anime 4.3.2 · ' + source.error.slice(6).split(':').join(' · ') : errors[source.error] || t('Источник недоступен'), function () { fetchProvider(source); });
        else if (!source.rows.length) empty(t('В ') + source.name + t(' потоков нет. Выберите другой источник слева.'), function () { fetchProvider(source); });
        else if (!filtered().length) {
            empty(t('Потоки найдены, но не подходят под выбранные фильтры.'));
            scroll.append(button(t('Сбросить фильтры'), 'clear', function () { selection = {}; render(); }));
        } else {
            scroll.append($('<div class="dbr3-count"></div>').text(source.name + t(' · показано ') + filtered().length + t(' из ') + source.rows.length));
            filtered().forEach(function (row) {
                var item = $('<div class="selector dbr3-stream"></div>');
                var qualityBadge = $('<div class="dbr3-quality"></div>');
                if (row.quality === 'unknown' && row.method === 'call') qualityBadge.append('<svg class="dbr4-play-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z" fill="currentColor"/></svg>');
                else {
                    var displayedQuality = row.quality;
                    if ((row.method === 'call' || row.provider === 'anime') && selection.quality && row.qualityOptions) displayedQuality = row.qualityOptions.filter(function (value) { return selection.quality.indexOf(value) >= 0; }).sort(function (a, b) { return Number(b) - Number(a); })[0] || row.quality;
                    qualityBadge.text(label('quality', displayedQuality));
                }
                item.append(qualityBadge);
                var details = DbrPresentation.stream(row, t, label);
                item.append(details);
                if (row.provider === 'aio' || row.size !== undefined) item.append($('<div class="dbr3-size"></div>').text(row.size === undefined ? '—' : row.size.toFixed(2) + t(' ГБ')).append($('<small></small>').text(row.external && !row.url ? t('Веб-страница') : row.cached ? t('В кэше RD') : '')));
                item.attr('data-dbr-group', 'list');
                bind(item, 'stream-' + row.id, function () { play(row); });
                item.on('hover:long', function () {
                    choose(t('Информация о потоке'), [{ title: row.title, subtitle: row.source, detail: true }, { title: t('Смотреть'), play: true }], function (value) { if (value.play) play(row); else self.start(); });
                });
                scroll.append(item);
            });
        }
        if (source.error || !source.rows.length) providers.filter(function (item) { return item.id !== source.id && item.rows.length; }).forEach(function (item) {
            scroll.append(button(t('Найдено в ') + item.name + ' · ' + item.rows.length + t(' потоков'), 'alternative-' + item.id, function () { selectedProvider = item.id; render(); }));
        });
    }
    function render() {
      if (dead) return;
      clearTimeout(detailTimer);
      header.empty();
      buildDetail();
      addFilterHeader();
      var listKey = [mode, season, episode, selectedProvider, JSON.stringify(selection), order].join('|');
      if (listKey !== renderedListKey) { scroll.reset(); renderedListKey = listKey; }
      scroll.clear();
      side.toggle(mode === "streams");
      voicebar.toggle(mode === "streams");
      if (mode === "episodes") episodeList();
      else {
        renderSources();
        streamList();
      }
      if (self.activity) self.activity.loader(false);
      self.start(true);
    }
    function refreshSource(source) {
        if (dead) return;
        if (mode === 'streams' && source.id !== selectedProvider) {
            renderSources();
            self.start(true);
        } else render();
    }
    function fetchProvider(source, done) {
        source.state = 'loading';
        source.error = '';
        refreshSource(source);
        function finish(error, data, voices) {
            source.error = error;
            source.state = error ? 'error' : 'ready';
            source.rows = data || [];
            source.voices = voices || [];
            refreshSource(source);
            if (nextRequest && source.name === nextRequest.sourceName) {
                var wanted = nextRequest;
                if (!error && wanted.voiceName && source.voiceName !== wanted.voiceName) {
                    var voice = source.voices.filter(function (item) { return (item.name || item.title) === wanted.voiceName; })[0];
                    if (voice) { source.voiceName = wanted.voiceName; source.voiceUrl = voice.url; fetchProvider(source, done); return; }
                }
                nextRequest = undefined;
                selectedProvider = source.id;
                render();
                var candidate = source.id === 'aio' ? DbrCore.nextVariant(filtered(), wanted.row) : wanted.voiceName && source.voiceName === wanted.voiceName && filtered().length === 1 ? filtered()[0] : undefined;
                if (source.id === 'anime') {
                    var group = wanted.row.raw.behaviorHints.bingeGroup;
                    var matches = source.rows.filter(function (row) { return row.raw.behaviorHints.bingeGroup === group && (!wanted.quality || row.raw.quality[wanted.quality]); });
                    candidate = matches.length === 1 ? matches[0] : undefined;
                }
                if (candidate) play(candidate, wanted.quality);
                else if (!error) Lampa.Noty.show(t('Выберите поток следующей серии'));
            }
            if (done) done();
        }
        if (source.id === 'aio') api.aio(season, episode, finish);
        else if (source.id === 'anime') api.anime(season, episode, finish);
        else api.lampac(source, season, episode, finish);
    }
    function pump() {
        while (runningProviders < 3 && pendingProviders.length) {
            runningProviders++;
            fetchProvider(pendingProviders.shift(), function () { runningProviders--; pump(); });
        }
    }
    function beginStreams(preference) {
        api.cancel();
        playbackRequest++;
        qualityRequest++;
        advancing = false;
        nextRequest = preference;
        mode = 'streams';
        initializing = false;
        discoveryError = '';
        pendingProviders = [];
        runningProviders = 0;
        providers = [{ id: 'aio', name: 'AIOStreams', state: 'loading', rows: [] }];
        selectedProvider = 'aio';
        lastKey = '';
        render();
        fetchProvider(providers[0]);
        if (movie.original_language === 'ja' && DbrCore.type(movie) === 'series') {
            var anime={id:'anime',name:t('Лучшее'),state:'queued',rows:[]};
            providers.push(anime); pendingProviders.push(anime); pump();
        }
        api.providers(function (error, list) {
            discoveryError = error;
            list.forEach(function (source) { if (nextRequest && source.name === nextRequest.sourceName) selectedProvider = source.id; source.state = 'queued'; source.rows = []; providers.push(source); pendingProviders.push(source); });
            renderSources();
            self.start(true);
            pump();
        });
    }
    function playbackFailed(row, error) {
        lastPlayback = undefined;
        nextRequest = undefined;
        var failed = providers.filter(function (item) { return item.id === row.provider; })[0];
        if (failed) {
            failed.rows = failed.rows.filter(function (item) { return item.id !== row.id; });
            if (!failed.rows.length) { failed.state = 'error'; failed.error = error; }
        }
        if (failed && !failed.rows.length) {
            var alternative = providers.filter(function (item) { return item.id !== failed.id && item.state === 'ready' && item.rows.length; })[0];
            if (alternative) selectedProvider = alternative.id;
        }
        Lampa.Noty.show(errors[error] || t('Не удалось получить видео'));
        render();
    }
    function play(row, preferredQuality) {
        if (!row.url) { Lampa.Noty.show(row.external ? t('Источник вернул веб-страницу вместо прямого видео') : t('Прямая ссылка на видео отсутствует')); return; }
        var request = ++playbackRequest;
        api.resolveStream(row, function (error, stream) {
            if (request !== playbackRequest || dead) return;
            if (error) { playbackFailed(row, error); return; }
            var qualities = stream.quality || stream.qualitys || {};
            function launch(url, chosenQuality) {
                url = DbrCore.httpUrl(String(url || '').split(' or ')[0]);
                if (!url) { Lampa.Noty.show(t('Прямая ссылка на видео отсутствует')); return; }
                var timeline = history.timeline(season, episode);
                var playbackQualities = {};
                if (chosenQuality) playbackQualities[chosenQuality] = url;
                var player = { title: title() + (DbrCore.type(movie) === 'series' ? ' · S' + season + 'E' + episode : ''), url: url, card: movie, timeline: timeline, quality: chosenQuality ? playbackQualities : qualities };
                player.error = function () {
                    setTimeout(function () {
                        if (dead || !Lampa.Player.playdata || Lampa.Player.playdata() !== player) return;
                        Lampa.Player.close();
                        playbackFailed(row, 'playback');
                    }, 0);
                };
                var hints = stream.behaviorHints || row.raw.behaviorHints || {};
                if (stream.headers) player.headers = stream.headers;
                else if (hints.proxyHeaders && hints.proxyHeaders.request) player.headers = hints.proxyHeaders.request;
                if (Array.isArray(stream.subtitles)) player.subtitles = stream.subtitles.filter(function (sub) { return DbrCore.httpUrl(sub.url); }).map(function (sub) { return { label: sub.label || sub.title || sub.lang || t('Субтитры'), url: sub.url }; });
                if (DbrCore.type(movie) === 'series') { player.season = season; player.episode = episode; }
                if (stream.hls_manifest_timeout) player.hls_manifest_timeout = stream.hls_manifest_timeout;
                if (stream.segments) player.segments = stream.segments;
                lastPlayback = { season: season, episode: episode, sourceName: provider().name, voiceName: provider().voiceName, row: row, quality: chosenQuality };
                history.save(season, episode);
                clearInterval(progressTimer);
                releasePlayback();
                if (row.provider === 'aio') releasePlayback = DbrDirectPlayback(player);
                else if (row.provider === 'anime') releasePlayback = DbrNativeHls(player);
                releaseAutoplay();
                if (DbrCore.type(movie) === 'series') releaseAutoplay = DbrAutoplay(player, function () { if (!dead && request === playbackRequest) nextEpisode(); });
                releasePlayerControls();
                releasePlayerControls = DbrPlayerControls(player, {
                    qualities: qualities,
                    onQuality: function (quality) { if (lastPlayback) lastPlayback.quality = quality; },
                    loadSubtitles: row.provider === 'aio' ? function (done) { api.subtitles(row, player.season || season, player.episode || episode, done); } : undefined
                });
                showPlayerChoiceDialog(player, movie);
                progressTimer = setInterval(function () {
                    var active = Lampa.Player.playdata && Lampa.Player.playdata();
                    if (!Lampa.Player.opened() || !active || active.timeline !== timeline) { clearInterval(progressTimer); return; }
                    if (!timeline.waiting_for_user && !timeline.stop_recording && timeline.duration > 0 && timeline.time > 0) {
                        timeline.handler(timeline.percent, timeline.time, timeline.duration);
                    }
                }, 10000);
                Lampa.Player.playlist([player]);
            }
            var keys = DbrCore.qualityKeys(qualities);
            row.qualityOptions = keys.map(DbrCore.qualityValue);
            if (keys.length) row.quality = DbrCore.qualityValue(keys[0]);
            var allowed = (selection.quality || []).filter(function (value) { return value !== 'unknown'; });
            var matching = allowed.length ? keys.filter(function (key) { return allowed.indexOf(DbrCore.qualityValue(key)) !== -1; }) : keys;
            if (allowed.length && row.method === 'call' && !matching.length) { Lampa.Noty.show(t('Выбранное качество недоступно')); render(); return; }
            if (row.provider === 'anime' && preferredQuality && keys.indexOf(preferredQuality) < 0) { Lampa.Noty.show(t('Выбранное качество недоступно')); return; }
            if (row.provider === 'anime' && preferredQuality) matching = [preferredQuality];
            var chosen = preferredQuality && matching.indexOf(preferredQuality) >= 0 ? preferredQuality : matching[0];
            if (chosen) launch(qualities[chosen], chosen);
            else launch(row.method === 'call' ? stream.url : row.url);
        });
    }
    this.create = function () {
        if (!$('#dbr3-style').length) $('head').append($('<style id="dbr3-style"></style>').text(DbrStyles));
        window.addEventListener("resize", viewportChanged);
        files.render().addClass('dbr3').toggleClass('dbr4-tv', Lampa.Platform.is('android') || Lampa.Platform.is('tizen') || Lampa.Platform.is('webos') || Lampa.Platform.is('apple_tv'));
        rightPanel.append(toolbar).append(side).append(voicebar).append(scroll.render());
        layout.append(detailPanel).append(rightPanel);
        files.appendHead(header);
        files.appendFiles(layout);

        render();
        api.resolveMovie(function (error) {
            metadataError = error;
            seasons = Array.isArray(movie.seasons) ? movie.seasons.filter(function (item) { return typeof item.season_number === 'number'; }) : [];
            if (!seasons.length && movie.number_of_seasons) {
                for (var n = 1; n <= movie.number_of_seasons; n++) seasons.push({ season_number: n, name: t('Сезон ') + n });
            }
            if (seasons.length) season = seasons.filter(function (item) { return item.season_number > 0; })[0] ? seasons.filter(function (item) { return item.season_number > 0; })[0].season_number : seasons[0].season_number;
            history = new DbrHistory(movie);
            var last = history.last();
            if (last && seasons.some(function (item) { return item.season_number === last.season; })) {
                season = last.season;
                episode = last.episode;
                lastKey = 'episode-' + episode;
            }
            if (DbrCore.type(movie) === 'series') loadEpisodes();
            else beginStreams();
        });
        return files.render();
    };
    this.start = function (passive) {
        $("body").addClass("dbr-active");
        if (dead || !self.activity) return;
        var active = Lampa.Activity.active && Lampa.Activity.active();
        if (active && active.activity !== self.activity) return;
        if (Lampa.Player.opened && Lampa.Player.opened()) return;
        var current = Lampa.Controller.enabled && Lampa.Controller.enabled();
        var controllerName = typeof current === 'string' ? current : current && current.name;
        var takeFocus = !passive || !controllerName || ['content', 'activity', 'loading'].indexOf(controllerName) !== -1;
        resize();
        cacheControls();
        var root = files.render();
        Lampa.Controller.add('content', {
            toggle: function () {
                var controls = layout.find('.selector').add(header.find('.selector')).filter(':visible');
                var last = controls.filter(function () { return $(this).attr('data-dbr-key') === lastKey; }).first();
                if (!last.length) last = controls.filter('.dbr3-episode,.dbr3-stream').first();
                if (!last.length) last = controls.first();
                Lampa.Controller.collectionSet(layout, header, true);
                if (last.length) Lampa.Controller.collectionFocus(last, layout);
            },
            left: function () { move('left'); },
            right: function () { move('right'); },
            up: function () { move('up'); },
            down: function () { move('down'); },
            back: function () { self.back(); }
        });
        if (takeFocus && !$('body').hasClass('selectbox--open')) Lampa.Controller.toggle('content');
    };
    this.back = function () {
        if (mode === 'streams' && DbrCore.type(movie) === 'series') { api.cancel(); mode = 'episodes'; lastKey = 'episode-' + episode; render(); }
        else { $("body").removeClass("dbr-active"); Lampa.Activity.backward(); }
    };
    this.render = function () { return files.render(); };
    this.destroy = function () { $("body").removeClass("dbr-active"); dead = true; releasePlayerControls(); clearTimeout(detailTimer); clearTimeout(backdropTimer); releaseAutoplay(); window.removeEventListener("resize", viewportChanged); releasePlayback(); clearInterval(progressTimer); api.cancel(); scroll.destroy(); files.destroy(); pendingProviders = []; };
}

var DbrTraktHome = (function () {
  var cache = {},
    account;
  function api() {
    return window.TraktTV && window.TraktTV.api;
  }
  function cached(key, load) {
    var current = Lampa.Storage.get("trakt_token", "");
    if (current !== account) {
      account = current;
      cache = {};
    }
    var entry = cache[key];
    if (!entry || Date.now() - entry.time > 60000) {
      entry = { time: Date.now(), value: Promise.resolve().then(load) };
      cache[key] = entry;
      entry.value.catch(function () {
        if (cache[key] === entry) delete cache[key];
      });
    }
    return entry.value;
  }
  function cards(data) {
    return ((data && data.results) || [])
      .filter(function (item) {
        return item && item.id;
      })
      .map(function (item) {
        var card = Object.assign({}, item);
        var tv =
          /^(tv|show|series)$/.test(
            item.method || item.type || item.card_type || "",
          ) || !!item.name;
        card.type = card.card_type = tv ? "tv" : "movie";
        if (tv) {
          card.name = item.name || item.title;
          card.first_air_date = item.first_air_date || item.release_date;
        }
        return card;
      });
  }
  function loader(kind, title) {
    return function (done) {
      var service = api();
      if (!service || !Lampa.Storage.get("trakt_token", "")) return done();
      var work;
      if (kind === "upnext")
        work = cached(kind, function () {
          return service.upnext({ limit: 100, page: 1 });
        }).then(cards);
      else if (kind === "liked")
        work = cached(kind, function () {
          return service
            .likesLists({ limit: 100, page: 1 })
            .then(function (data) {
              var result = [],
                chain = Promise.resolve();
              (data.results || []).forEach(function (list) {
                chain = chain
                  .then(function () {
                    return service.list({ id: list.id, limit: 100, page: 1 });
                  })
                  .then(function (contents) {
                    result = result.concat(cards(contents));
                  });
              });
              return chain.then(function () {
                var seen = {};
                return result.filter(function (card) {
                  var key = card.type + ":" + card.id;
                  if (seen[key]) return false;
                  seen[key] = true;
                  return true;
                });
              });
            });
        });
      else
        work = cached("watchlist", function () {
          return service.watchlist({ limit: 10000, page: 1 });
        }).then(function (data) {
          return cards(data).filter(function (card) {
            return card.type === kind;
          });
        });
      work
        .then(function (results) {
          done(results.length ? { title: title, results: results } : undefined);
        })
        .catch(function () {
          done();
        });
    };
  }
  function init() {
    if (window.dbrTraktHomeInstalled || !Lampa.ContentRows) return;
    window.dbrTraktHomeInstalled = true;
    Lampa.ContentRows.add({
      name: "DbrTraktHome",
      title: "Trakt: Up Next / Watchlist / Liked",
      index: 0,
      screen: ["main"],
      call: function () {
        if (!api() || !Lampa.Storage.get("trakt_token", "")) return;
        var ru = Lampa.Storage.get("language", "ru") === "ru";
        return [
          loader("upnext", "Trakt · Up Next"),
          loader(
            "movie",
            ru ? "Trakt · Смотреть позже: фильмы" : "Trakt · Watchlist: movies",
          ),
          loader(
            "tv",
            ru
              ? "Trakt · Смотреть позже: сериалы"
              : "Trakt · Watchlist: series",
          ),
          loader(
            "liked",
            ru
              ? "Trakt · Из понравившихся списков"
              : "Trakt · From liked lists",
          ),
        ];
      },
    });
  }
  if (window.appready) init();
  else
    Lampa.Listener.follow("app", function (event) {
      if (event.type === "ready") init();
    });
  return { cards: cards };
})();

    // ==================== PLUGIN REGISTRATION ====================

    function addTemplates() {
        Lampa.Template.add('debrid_item', '<div class="online selector">\
            <div class="online__body">\
                <div style="position: absolute;left: 0;top: -0.3em;width: 2.4em;height: 2.4em; padding: 0.4em; box-sizing: border-box;">\
                    <img src="' + PLUGIN_LOGO + '" style="width: 100%; height: 100%; object-fit: contain; border-radius: 50%;">\
                </div>\
                <div class="online__title" style="padding-left: 2.1em;">{title}</div>\
                <div class="online__quality" style="padding-left: 3.4em;">{info}</div>\
            </div>\
        </div>');

        Lampa.Template.add('debrid_folder', '<div class="online selector">\
            <div class="online__body">\
                <div style="position: absolute;left: 0;top: -0.3em;width: 2.4em;height: 2.4em; padding: 0.4em; box-sizing: border-box;">\
                   <svg style="height: 100%; width: 100%;" viewBox="0 0 128 112" fill="none" xmlns="http://www.w3.org/2000/svg">\
                        <rect y="20" width="128" height="92" rx="13" fill="white"/>\
                        <path d="M29.9963 8H98.0037C96.0446 3.3021 91.4079 0 86 0H42C36.5921 0 31.9555 3.3021 29.9963 8Z" fill="white" fill-opacity="0.23"/>\
                        <rect x="11" y="8" width="106" height="76" rx="13" fill="white" fill-opacity="0.51"/>\
                    </svg>\
                </div>\
                <div class="online__title" style="padding-left: 2.1em;">{title}</div>\
                <div class="online__quality" style="padding-left: 3.4em;">{info}</div>\
            </div>\
        </div>');
    }

    function initPlugin() {
        addTemplates();

        Lampa.Lang.add({
            debrid_title: {
                ru: 'AIOStreams',
                en: 'AIOStreams',
                uk: 'AIOStreams'
            },
            debrid_title_short: {
                ru: 'AIOS',
                en: 'AIOS',
                uk: 'AIOS'
            },
            debrid_settings_title: {
                ru: 'Настройки AIOStreams',
                en: 'AIOStreams Settings',
                uk: 'Налаштування AIOStreams'
            },
            debrid_aiostreams_url: {
                ru: 'URL манифеста AIOStreams',
                en: 'AIOStreams manifest URL',
                uk: 'URL маніфесту AIOStreams'
            },
            debrid_aiostreams_url_descr: {
                ru: 'Вставьте URL манифеста AIOStreams',
                en: 'Paste AIOStreams manifest URL',
                uk: 'Вставте URL маніфесту AIOStreams'
            },
            debrid_watch: {
                ru: 'Смотреть через AIOStreams',
                en: 'Watch via AIOStreams',
                uk: 'Дивитись через AIOStreams'
            }
        });

        // Initialize parameters
        Lampa.Params.select('debrid_aiostreams_url', '', '');
        Lampa.Params.select('debrid_lampac_url', '', '');

        Lampa.Template.add('settings_debrid', '\
            <div>\
                <div class="settings-param selector" data-name="debrid_lampac_url" data-type="input" placeholder="https://rc.bwa.ad">\
                    <div class="settings-param__name">Сервер балансеров (Lampac)</div>\
                    <div class="settings-param__value"></div>\
                    <div class="settings-param__descr">Пустое значение: rc.bwa.ad. Можно указать другой сервер Lampac.</div>\
                </div>\
                <div class="settings-param selector" data-name="debrid_aiostreams_url" data-type="input" placeholder="https://...">\
                    <div class="settings-param__name">#{debrid_aiostreams_url}</div>\
                    <div class="settings-param__value"></div>\
                    <div class="settings-param__descr">#{debrid_aiostreams_url_descr}</div>\
                </div>\
            </div>\
        ');

        function addSettings() {
            if (Lampa.Settings.main && Lampa.Settings.main() && !Lampa.Settings.main().render().find('[data-component="debrid"]').length) {
                var field = $('\
                    <div class="settings-folder selector" data-component="debrid">\
                        <div class="settings-folder__icon">\
                            <img src="' + PLUGIN_LOGO + '" style="width: 1.2em; height: 1.2em; border-radius: 50%;">\
                        </div>\
                        <div class="settings-folder__name">AIOStreams</div>\
                    </div>\
                ');

                Lampa.Settings.main().render().find('[data-component="more"]').after(field);
                Lampa.Settings.main().update();
            }
        }

        if (window.appready) {
            addSettings();
        } else {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') addSettings();
            });
        }

        // Add styles for logo on focus and multiline functionality
        $('body').append('<style>.view--debrid.focus img { filter: brightness(0); } .online__quality { white-space: pre-wrap; } .online__title { white-space: pre-wrap; }</style>');

        Lampa.Component.add(PLUGIN_NAME, DebridComponent);

        var buttonHtml = '\
            <div class="full-start__button selector view--debrid" data-subtitle="Stremio Aggregator">\
                <img src="' + PLUGIN_LOGO + '" style="width:1.3em;height:1.3em;border-radius:50%;margin-right:0.4em;">\
                <span>#{title_key}</span>\
            </div>\
        ';

        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                var btnShort = $(buttonHtml.replace('#{title_key}', (Lampa.Storage.get('language', 'ru') === 'ru' ? 'Смотреть' : 'Play')));

                var enterPlugin = function () {
                    var movie = e.data.movie;
                    Lampa.Activity.push({
                        url: '',
                        title: PLUGIN_TITLE,
                        component: PLUGIN_NAME,
                        movie: movie,
                        page: 1
                    });
                };

                btnShort.on('hover:enter', enterPlugin);

                var card = e.object.activity.render();
                card.find('.view--debrid').remove();
                var watchButtons = card.find('.button--play, .view--play');
                if (watchButtons.length) watchButtons.first().before(btnShort);
                else card.find('.full-start__buttons').prepend(btnShort);
                watchButtons.hide().removeClass('selector');

            }
        });

        console.log('AIOStreams Plugin v' + PLUGIN_VERSION + ' loaded');

        // Initialize dynamic catalogs
        initDynamicCatalogs();
    }

    // ==================== DYNAMIC CATALOGS ====================

    var catalogsCache = null;
    var catalogsCacheTime = 0;
    var CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    /**
     * Get base URL from manifest URL
     */
    function getCatalogBaseUrl() {
        var url = Lampa.Storage.get('debrid_aiostreams_url', DEFAULT_SETTINGS.aiostreams_url);
        return extractBaseUrl(url);
    }

    /**
     * Load manifest and extract catalogs
     */
    function loadManifestCatalogs() {
        return new Promise(function (resolve, reject) {
            var baseUrl = getCatalogBaseUrl();
            if (!baseUrl) {
                return reject(new Error('AIOStreams URL not configured'));
            }

            // Check cache
            var now = Date.now();
            if (catalogsCache && (now - catalogsCacheTime) < CACHE_DURATION) {
                return resolve(catalogsCache);
            }

            var manifestUrl = baseUrl + '/manifest.json';
            var network = new Lampa.Reguest();

            network.silent(manifestUrl, function (manifest) {
                if (manifest && Array.isArray(manifest.catalogs)) {
                    catalogsCache = manifest.catalogs;
                    catalogsCacheTime = now;
                    resolve(manifest.catalogs);
                } else {
                    reject(new Error('Invalid manifest format'));
                }
            }, function (error) {
                reject(error);
            });
        });
    }

    /**
     * Fetch catalog content
     */
    function fetchCatalogContent(catalogId, type, options) {
        return new Promise(function (resolve, reject) {
            var baseUrl = getCatalogBaseUrl();
            if (!baseUrl) {
                return reject(new Error('AIOStreams URL not configured'));
            }

            // Build URL
            var url = baseUrl + '/catalog/' + type + '/' + catalogId;

            // Add options (genre, skip)
            var params = [];
            if (options && options.genre) {
                params.push('genre=' + encodeURIComponent(options.genre));
            }
            if (options && options.skip) {
                params.push('skip=' + options.skip);
            }

            if (params.length > 0) {
                url += '/' + params.join('&');
            }

            url += '.json';

            var network = new Lampa.Reguest();
            network.timeout(Lampa.Storage.get('debrid_timeout', DEFAULT_SETTINGS.timeout));

            network.silent(url, function (response) {
                if (response && response.metas && Array.isArray(response.metas)) {
                    // Convert Stremio meta format to Lampa format
                    var results = response.metas.map(function (meta) {
                        return convertStremioMetaToLampa(meta, type);
                    });
                    resolve(results);
                } else {
                    resolve([]);
                }
            }, function (error) {
                reject(error);
            });
        });
    }

    /**
     * Convert Stremio meta format to Lampa card format
     */
    function convertStremioMetaToLampa(meta, type) {
        var lampaType = type === 'series' ? 'tv' : (type === 'movie' ? 'movie' : type);

        // Extract TMDB ID from Stremio ID (format: tt1234567 or tmdb:12345)
        var tmdbId = null;
        var imdbId = null;

        if (meta.id) {
            if (meta.id.startsWith('tt')) {
                imdbId = meta.id;
            } else if (meta.id.startsWith('tmdb:')) {
                tmdbId = meta.id.replace('tmdb:', '');
            }
        }

        var card = {
            id: tmdbId || meta.id,
            imdb_id: imdbId,
            title: meta.name || meta.title,
            name: lampaType === 'tv' ? (meta.name || meta.title) : undefined,
            original_title: meta.name || meta.title,
            poster_path: meta.poster,
            poster: meta.poster,
            backdrop_path: meta.background || meta.poster,
            vote_average: meta.imdbRating ? parseFloat(meta.imdbRating) : 0,
            release_date: meta.releaseInfo || meta.year,
            overview: meta.description,
            method: lampaType,
            type: lampaType,
            card_type: lampaType,
            source: 'aiostreams'
        };

        // Add params.emit for Lampa 3.0+ modular system
        card.params = {
            emit: {
                onlyEnter: function () {
                    Lampa.Activity.push({
                        url: card.url || '',
                        component: 'full',
                        id: card.id,
                        method: card.method,
                        card: card,
                        source: 'tmdb'
                    });
                }
            }
        };

        return card;
    }

    /**
     * Get translated catalog name
     */
    function getCatalogTranslatedName(catalog) {
        var lang = Lampa.Storage.get('language', 'ru');

        // Mapping for common catalog names
        var translations = {
            'Popular': { ru: 'Популярное', uk: 'Популярне', en: 'Popular' },
            'Trending': { ru: 'В тренде', uk: 'У тренді', en: 'Trending' },
            'Top Rated': { ru: 'Лучшие', uk: 'Найкращі', en: 'Top Rated' },
            'Year': { ru: 'По годам', uk: 'За роками', en: 'Year' },
            'Language': { ru: 'По языкам', uk: 'За мовами', en: 'Language' },
            'Top seeded': { ru: 'Топ раздач', uk: 'Топ роздач', en: 'Top seeded' },
            'New Releases': { ru: 'Новинки', uk: 'Новинки', en: 'New Releases' },
            'Kitsu Trending': { ru: 'Kitsu В тренде', uk: 'Kitsu У тренді', en: 'Kitsu Trending' },
            'Kitsu Top Airing': { ru: 'Kitsu Сейчас выходит', uk: 'Kitsu Зараз виходить', en: 'Kitsu Top Airing' },
            'Kitsu Most Popular': { ru: 'Kitsu Популярное', uk: 'Kitsu Популярне', en: 'Kitsu Most Popular' },
            'Kitsu Highest Rated': { ru: 'Kitsu Лучшие', uk: 'Kitsu Найкращі', en: 'Kitsu Highest Rated' },
            'RealDebrid': { ru: 'RealDebrid', uk: 'RealDebrid', en: 'RealDebrid' }
        };

        if (translations[catalog.name] && translations[catalog.name][lang]) {
            return translations[catalog.name][lang];
        }

        return catalog.name;
    }

    /**
     * Get type display name
     */
    function getTypeDisplayName(type) {
        var lang = Lampa.Storage.get('language', 'ru');
        var types = {
            'movie': { ru: 'Фильмы', uk: 'Фільми', en: 'Movies' },
            'series': { ru: 'Сериалы', uk: 'Серіали', en: 'Series' },
            'anime': { ru: 'Аниме', uk: 'Аніме', en: 'Anime' },
            'collections': { ru: 'Коллекции', uk: 'Колекції', en: 'Collections' },
            'other': { ru: 'Другое', uk: 'Інше', en: 'Other' }
        };

        return types[type] && types[type][lang] ? types[type][lang] : type;
    }

    /**
     * Register ContentRow for a catalog
     */
    /**
     * Create AIOStreams title with icon (DOM element)
     */
    function createAIOTitle(text) {
        var root = document.createElement('span');
        root.className = 'aiostreams-line-title'; // Added class for identification
        root.style.cssText = 'display:inline-flex;align-items:center;gap:0.4em;';

        var img = document.createElement('img');
        img.src = PLUGIN_LOGO;
        img.style.cssText = 'width:1.1em;height:1.1em;border-radius:50%;';

        var label = document.createElement('span');
        label.textContent = text;

        root.appendChild(img);
        root.appendChild(label);

        return root;
    }

    /**
     * Register ContentRow for a catalog
     */
    function registerCatalogContentRow(catalog, index) {
        var rowName = 'AIOCatalog_' + catalog.id.replace(/[^a-zA-Z0-9]/g, '_');
        var titleText = getCatalogTranslatedName(catalog) + ' (' + getTypeDisplayName(catalog.type) + ')';

        // Skip search catalogs
        if (catalog.name === 'Search') return;

        // Skip RealDebrid/other type catalogs for main page
        if (catalog.type === 'other') return;

        Lampa.ContentRows.add({
            name: rowName,
            title: titleText, // Fallback title
            index: 10 + index, // Leave room for the standard catalog rows.
            screen: ['main'],
            call: function (params, screen) {
                var baseUrl = getCatalogBaseUrl();
                if (!baseUrl) return;

                return function (call) {
                    fetchCatalogContent(catalog.id, catalog.type, { skip: 0 })
                        .then(function (results) {
                            if (!results || results.length === 0) {
                                return call();
                            }

                            call({
                                title: createAIOTitle(titleText),
                                results: results,
                                onMore: function () {
                                    // Open category view with pagination
                                    Lampa.Activity.push({
                                        title: titleText,
                                        component: 'aiostreams_catalog',
                                        catalog_id: catalog.id,
                                        catalog_type: catalog.type,
                                        catalog_name: catalog.name,
                                        page: 1
                                    });
                                }
                            });
                        })
                        .catch(function (error) {
                            console.error('AIOStreams', 'Catalog load error:', catalog.name, error);
                            call();
                        });
                };
            }
        });
    }

    /**
     * Catalog component for "More" view
     */
    function AIOStreamsCatalogComponent(object) {
        var _this = this;
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var items = [];
        var page = object.page || 1;
        var loading = false;

        this.create = function () {
            this.activity.loader(true);
            scroll.minus();
            scroll.body().addClass('category-full');

            this.loadContent();

            return scroll.render();
        };

        this.loadContent = function () {
            if (loading) return;
            loading = true;

            var skip = (page - 1) * 20;

            fetchCatalogContent(object.catalog_id, object.catalog_type, { skip: skip })
                .then(function (results) {
                    _this.activity.loader(false);
                    loading = false;

                    if (results && results.length > 0) {
                        results.forEach(function (card) {
                            _this.appendCard(card);
                        });
                        page++;
                    }

                    _this.start(items.length === 0);
                })
                .catch(function (error) {
                    _this.activity.loader(false);
                    loading = false;
                    console.error('AIOStreams', 'Catalog component error:', error);
                });
        };

        this.appendCard = function (card) {
            var element = Lampa.Template.get('card', {
                title: card.title || card.name,
                release_year: card.release_date
            });

            var img = element.find('.card__img')[0];
            if (img && card.poster) {
                img.src = card.poster;
            }

            element.on('hover:focus', function () {
                scroll.update(element, true);
            });

            element.on('hover:enter', function () {
                Lampa.Activity.push({
                    component: 'full',
                    id: card.id,
                    method: card.method,
                    card: card,
                    source: 'tmdb'
                });
            });

            scroll.append(element);
            items.push(element);
        };

        this.start = function (firstFocus) {
            var _self = this;

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(firstFocus ? items[0] : false, scroll.render());
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () {
                    if (Navigator.canmove('down')) Navigator.move('down');
                    else _self.loadContent(); // Load more on scroll down at bottom
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('content');
        };

        this.render = function () {
            return scroll.render();
        };

        this.destroy = function () {
            scroll.destroy();
            items = [];
        };
    }

    /**
     * Initialize dynamic catalogs
     */
    function initDynamicCatalogs() {
        // Register catalog component
        Lampa.Component.add('aiostreams_catalog', AIOStreamsCatalogComponent);

        // Load and register catalog rows
        loadManifestCatalogs()
            .then(function (catalogs) {
                console.log('AIOStreams', 'Loaded', catalogs.length, 'catalogs from manifest');

                // Filter and register catalogs
                catalogs.forEach(function (catalog, index) {
                    registerCatalogContentRow(catalog, index);
                });

                console.log('AIOStreams', 'Dynamic catalog rows registered');
            })
            .catch(function (error) {
                console.log('AIOStreams', 'Failed to load catalogs:', error.message || error);
            });
    }

    // ==================== INIT ====================

    if (window.appready) {
        if (!window.plugin_aiostreams_ready) {
            window.plugin_aiostreams_ready = true;
            initPlugin();
        }
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready' && !window.plugin_aiostreams_ready) {
                window.plugin_aiostreams_ready = true;
                initPlugin();
            }
        });
    }

})();
