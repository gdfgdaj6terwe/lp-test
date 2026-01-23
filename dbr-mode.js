/**
 * Debrid Streams - Lampa Plugin
 * Version: 1.2.5
 *
 * Plugin for integrating Stremio addons (Comet, Torrentio) with Real Debrid in Lampa
 *
 * Installation:
 * 1. Add this plugin URL to Lampa settings
 * 2. Go to Settings -> Debrid Streams
 * 3. Enter manifest URL from Comet or Torrentio
 *
 * Getting manifest URL:
 * - Comet: https://comet.elfhosted.com/ -> configure and copy "Install" link
 * - Torrentio: https://torrentio.strem.fun/ -> configure and copy manifest URL
 */

(function () {
    'use strict';

    var PLUGIN_NAME = 'debrid_streams';
    var PLUGIN_VERSION = '1.2.5';
    var PLUGIN_TITLE = 'Debrid Streams';

    // Default settings
    var DEFAULT_SETTINGS = {
        comet_url: '',      // Comet manifest URL
        torrentio_url: '',  // Torrentio manifest URL
        timeout: 120000     // Request timeout - 2 minutes (debrid can be slow)
    };

    // ==================== UTILITIES ====================

    /**
     * Extract base URL from manifest URL
     * Example: https://comet.elfhosted.com/ABC123/manifest.json -> https://comet.elfhosted.com/ABC123
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
     * Format file size
     */
    function formatSize(bytes) {
        if (!bytes) return '';
        var gb = bytes / (1024 * 1024 * 1024);
        if (gb >= 1) return gb.toFixed(2) + ' GB';
        var mb = bytes / (1024 * 1024);
        return mb.toFixed(0) + ' MB';
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
     * Note: No heavy logging here - called for every stream during display!
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

        // Torrent stream (infoHash) - won't work directly, need debrid
        if (stream.infoHash) {
            return null;
        }

        return null;
    }

    // ==================== COMET SOURCE ====================

    function CometSource(component, _object) {
        var network = new Lampa.Reguest();
        var object = _object;
        var streams_data = [];
        var filter_items = {};
        var choice = {
            quality: 0
        };

        /**
         * Get base URL from settings
         */
        function getBaseUrl() {
            var url = Lampa.Storage.get('debrid_comet_url', '');
            return extractBaseUrl(url);
        }

        /**
         * Build URL for stream request
         */
        function buildStreamUrl(imdbId, type, season, episode) {
            var base = getBaseUrl();
            if (!base) return '';

            var id = imdbId;
            if (type === 'series' && season && episode) {
                id = imdbId + ':' + season + ':' + episode;
            }

            return base + '/stream/' + type + '/' + id + '.json';
        }

        /**
         * Search streams
         */
        this.search = function (_object, kinopoisk_id) {
            object = _object;
            var imdbId = getImdbId(object.movie);
            var type = getContentType(object.movie);

            if (!getBaseUrl()) {
                component.emptyForQuery('Comet URL not configured. Go to Settings -> Debrid Streams');
                return;
            }

            if (!imdbId) {
                component.emptyForQuery('IMDb ID not found for this content');
                return;
            }

            // For series, need to select season/episode
            if (type === 'series') {
                // Fetch history for indicators
                getTraktHistory(object.movie.id, 'series').then(function (history) {
                    object.trakt_history = history;
                    showSeasonSelect(imdbId);
                });
            } else {
                fetchStreams(imdbId, 'movie');
            }
        };

        /**
         * Show season selection for series
         */
        function showSeasonSelect(imdbId) {
            var seasons = object.movie.number_of_seasons || (object.movie.seasons && object.movie.seasons.length) || 1;
            var items = [];

            for (var s = 1; s <= seasons; s++) {
                items.push({
                    title: 'Season ' + s,
                    season: s,
                    imdb_id: imdbId
                });
            }

            component.reset();
            component.loading(false);

            items.forEach(function (item) {
                var element = Lampa.Template.get('debrid_folder', {
                    title: item.title,
                    info: ''
                });

                element.on('hover:enter', function () {
                    showEpisodeSelect(item.imdb_id, item.season);
                });

                component.append(element);
            });

            component.start(true);
        }

        /**
         * Show episode selection
         */
        function showEpisodeSelect(imdbId, season) {
            var seasonData = null;
            if (object.movie.seasons) {
                seasonData = object.movie.seasons.find(function (s) {
                    return s.season_number === season;
                });
            }
            var episodes = (seasonData && seasonData.episode_count) || 20;
            var items = [];

            for (var e = 1; e <= episodes; e++) {
                items.push({
                    title: 'Episode ' + e,
                    season: season,
                    episode: e,
                    imdb_id: imdbId
                });
            }

            component.reset();
            component.loading(false);

            items.forEach(function (item) {
                var element = Lampa.Template.get('debrid_folder', {
                    title: 'S' + String(item.season).padStart(2, '0') + 'E' + String(item.episode).padStart(2, '0'),
                    info: item.title
                });

                element.on('hover:enter', function () {
                    fetchStreams(item.imdb_id, 'series', item.season, item.episode);
                });

                component.append(element);
            });

            component.start(true);
        }

        /**
         * Fetch streams from API
         */
        function fetchStreams(imdbId, type, season, episode) {
            var url = buildStreamUrl(imdbId, type, season, episode);
            if (!url) {
                component.emptyForQuery('URL build error');
                return;
            }

            console.log('Debrid Streams [Comet]: Fetching:', url);

            component.loading(true);
            network.clear();
            network.timeout(Lampa.Storage.get('debrid_timeout', DEFAULT_SETTINGS.timeout));

            network.silent(url, function (response) {
                component.loading(false);
                console.log('Debrid Streams [Comet]: Response received:', response);

                if (response && response.streams && response.streams.length > 0) {
                    console.log('Debrid Streams [Comet]: Found', response.streams.length, 'streams');
                    console.log('Debrid Streams [Comet]: First stream:', JSON.stringify(response.streams[0], null, 2));
                    streams_data = response.streams;
                    displayStreams(streams_data);
                } else {
                    console.log('Debrid Streams [Comet]: No streams found');
                    component.emptyForQuery('Streams not found');
                }
            }, function (error) {
                component.loading(false);
                console.log('Debrid Streams [Comet]: Error:', error);
                component.emptyForQuery('Load error: ' + (error.statusText || 'Unknown'));
            });
        }

        /**
         * Display stream list
         */
        function displayStreams(streams) {
            component.reset();

            // Group by quality
            var qualities = {};
            streams.forEach(function (stream, index) {
                var parsed = parseStreamTitle(stream);
                var q = parsed.quality || 'Unknown';
                if (!qualities[q]) qualities[q] = [];
                qualities[q].push({ stream: stream, index: index, parsed: parsed });
            });

            filter_items.quality = Object.keys(qualities);

            // Update filter with quality options
            component.updateFilter(filter_items);

            // Sort by quality
            var qualityOrder = ['4K', '2160P', '1080P', '720P', '480P', 'UNKNOWN'];
            var sortedQualities = Object.keys(qualities).sort(function (a, b) {
                var aIdx = qualityOrder.indexOf(a.toUpperCase());
                var bIdx = qualityOrder.indexOf(b.toUpperCase());
                if (aIdx === -1) aIdx = 999;
                if (bIdx === -1) bIdx = 999;
                return aIdx - bIdx;
            });

            sortedQualities.forEach(function (quality) {
                qualities[quality].forEach(function (item) {
                    var stream = item.stream;
                    var parsed = item.parsed;

                    // Use stream.description if available (Comet provides rich descriptions)
                    var info;
                    if (stream.description) {
                        // Replace newlines with separator for single-line display
                        info = '[RD+ Comet] ' + stream.description.replace(/\n/g, ' • ');
                    } else {
                        // Fallback to parsed info
                        var infoParts = ['[RD+ Comet]'];
                        if (parsed.quality) infoParts.push(parsed.quality);
                        if (parsed.codec) infoParts.push(parsed.codec);
                        if (parsed.size) infoParts.push(parsed.size);
                        if (parsed.languages && parsed.languages.length > 0) {
                            infoParts.push(parsed.languages.join('/'));
                        }
                        if (parsed.audio) infoParts.push(parsed.audio);
                        info = infoParts.join(' • ');
                    }

                    // Check if stream has valid URL
                    var streamUrl = getStreamUrl(stream);
                    var hasUrl = !!streamUrl;

                    var element = Lampa.Template.get('debrid_item', {
                        title: stream.title || stream.name || 'Stream ' + (item.index + 1),
                        info: info + (hasUrl ? '' : ' [NO URL]')
                    });

                    element.on('hover:enter', function () {
                        try {
                            playStream(stream);
                        } catch (error) {
                            console.error('Debrid Streams [Comet]: playStream error:', error);
                        }
                    });

                    // Long press - show details
                    element.on('hover:long', function () {
                        try {
                            showStreamDetails(stream, parsed);
                        } catch (error) {
                            console.error('Debrid Streams [Comet]: showStreamDetails error:', error);
                        }
                    });

                    component.append(element);
                });
            });

            component.start(true);
        }

        /**
         * Play stream
         */
        function playStream(stream) {
            // Log stream object for debugging (only when user clicks play)
            console.log('Debrid Streams [Comet]: Playing stream:', JSON.stringify(stream, null, 2));

            var url = getStreamUrl(stream);

            if (!url) {
                console.log('Debrid Streams [Comet]: No URL found in stream object');
                Lampa.Noty.show('Stream URL not found. Check console for details.');
                return;
            }

            console.log('Debrid Streams [Comet]: Stream URL:', url);

            var title = object.movie.title || object.movie.name || 'Video';
            var parsed = parseStreamTitle(stream);

            // Build player object
            var playerData = {
                title: title + (parsed.quality ? ' [' + parsed.quality + ']' : ''),
                url: url,
                timeline: object.movie
            };

            // Handle proxy headers if present (some debrid services need this)
            if (stream.behaviorHints && stream.behaviorHints.proxyHeaders && stream.behaviorHints.proxyHeaders.request) {
                playerData.headers = stream.behaviorHints.proxyHeaders.request;
            }

            // Always ensure we have Referer and User-Agent headers
            playerData.headers = playerData.headers || {};

            // Extract domain from URL for Referer
            var domainMatch = url.match(/^(https?:\/\/[^\/]+)/);
            if (domainMatch && !playerData.headers['Referer']) {
                playerData.headers['Referer'] = domainMatch[1] + '/';
            }

            // Add User-Agent if not set
            if (!playerData.headers['User-Agent']) {
                playerData.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            }

            console.log('Debrid Streams [Comet]: Using headers:', playerData.headers);

            Lampa.Player.play(playerData);

            // Show immediate sync modal
            showSyncModal(object.movie);

            // Mark as watched (locally in Lampa)
            Lampa.Timeline.update(object.movie);
        }

        /**
         * Show stream details
         */
        function showStreamDetails(stream, parsed) {
            var items = [];

            items.push({
                title: 'Play',
                subtitle: stream.url ? 'Open in player' : 'URL unavailable',
                action: function () {
                    Lampa.Modal.close();
                    playStream(stream);
                }
            });

            if (stream.url) {
                items.push({
                    title: 'Copy URL',
                    subtitle: 'Copy link to clipboard',
                    action: function () {
                        Lampa.Utils.copyTextToClipboard(stream.url, function () {
                            Lampa.Noty.show('URL copied');
                        }, function () {
                            Lampa.Noty.show('Copy error');
                        });
                        Lampa.Modal.close();
                    }
                });
            }

            items.push({
                title: 'Information',
                subtitle: parsed.full,
                action: function () {
                    Lampa.Modal.close();
                }
            });

            Lampa.Select.show({
                title: 'Actions',
                items: items,
                onSelect: function (item) {
                    if (item.action) item.action();
                },
                onBack: function () {
                    Lampa.Controller.toggle('content');
                }
            });
        }

        this.extendChoice = function (saved) {
            Lampa.Arrays.extend(choice, saved, true);
        };

        this.reset = function () {
            component.reset();
            choice = { quality: 0 };
            if (streams_data.length) {
                displayStreams(streams_data);
            }
            component.saveChoice(choice);
        };

        this.filter = function (type, a, b) {
            choice[a.stype] = b.index;
            component.reset();

            if (filter_items.quality && filter_items.quality[b.index]) {
                var selectedQuality = filter_items.quality[b.index];
                var filtered = streams_data.filter(function (stream) {
                    var parsed = parseStreamTitle(stream);
                    return parsed.quality === selectedQuality;
                });
                displayStreams(filtered.length ? filtered : streams_data);
            }

            component.saveChoice(choice);
        };

        this.destroy = function () {
            network.clear();
            streams_data = [];
        };
    }

    // ==================== TORRENTIO SOURCE ====================

    function TorrentioSource(component, _object) {
        var network = new Lampa.Reguest();
        var object = _object;
        var streams_data = [];
        var filter_items = {};
        var choice = {
            quality: 0
        };

        function getBaseUrl() {
            var url = Lampa.Storage.get('debrid_torrentio_url', '');
            return extractBaseUrl(url);
        }

        function buildStreamUrl(imdbId, type, season, episode) {
            var base = getBaseUrl();
            if (!base) return '';

            var id = imdbId;
            if (type === 'series' && season && episode) {
                id = imdbId + ':' + season + ':' + episode;
            }

            return base + '/stream/' + type + '/' + id + '.json';
        }

        this.search = function (_object, kinopoisk_id) {
            object = _object;
            var imdbId = getImdbId(object.movie);
            var type = getContentType(object.movie);

            if (!getBaseUrl()) {
                component.emptyForQuery('Torrentio URL not configured. Go to Settings -> Debrid Streams');
                return;
            }

            if (!imdbId) {
                component.emptyForQuery('IMDb ID not found for this content');
                return;
            }

            if (type === 'series') {
                // Fetch history
                getTraktHistory(object.movie.id, 'series').then(function (history) {
                    object.trakt_history = history;
                    showSeasonSelect(imdbId);
                });
            } else {
                fetchStreams(imdbId, 'movie');
            }
        };

        function showSeasonSelect(imdbId) {
            var seasons = object.movie.number_of_seasons || (object.movie.seasons && object.movie.seasons.length) || 1;
            var items = [];

            for (var s = 1; s <= seasons; s++) {
                items.push({
                    title: 'Season ' + s,
                    season: s,
                    imdb_id: imdbId
                });
            }

            component.reset();
            component.loading(false);

            items.forEach(function (item) {
                var element = Lampa.Template.get('debrid_folder', {
                    title: item.title,
                    info: ''
                });

                element.on('hover:enter', function () {
                    showEpisodeSelect(item.imdb_id, item.season);
                });

                component.append(element);
            });

            component.start(true);
        }

        function showEpisodeSelect(imdbId, season) {
            var seasonData = null;
            if (object.movie.seasons) {
                seasonData = object.movie.seasons.find(function (s) {
                    return s.season_number === season;
                });
            }
            var episodes = (seasonData && seasonData.episode_count) || 20;
            var items = [];

            for (var e = 1; e <= episodes; e++) {
                items.push({
                    title: 'Episode ' + e,
                    season: season,
                    episode: e,
                    imdb_id: imdbId
                });
            }

            component.reset();
            component.loading(false);

            items.forEach(function (item) {
                var element = Lampa.Template.get('debrid_folder', {
                    title: 'S' + String(item.season).padStart(2, '0') + 'E' + String(item.episode).padStart(2, '0'),
                    info: item.title
                });

                element.on('hover:enter', function () {
                    fetchStreams(item.imdb_id, 'series', item.season, item.episode);
                });

                component.append(element);
            });

            component.start(true);
        }

        function fetchStreams(imdbId, type, season, episode) {
            var url = buildStreamUrl(imdbId, type, season, episode);
            if (!url) {
                component.emptyForQuery('URL build error');
                return;
            }

            console.log('Debrid Streams [Torrentio]: Fetching:', url);

            component.loading(true);
            network.clear();
            network.timeout(Lampa.Storage.get('debrid_timeout', DEFAULT_SETTINGS.timeout));

            network.silent(url, function (response) {
                component.loading(false);
                console.log('Debrid Streams [Torrentio]: Response received:', response);

                if (response && response.streams && response.streams.length > 0) {
                    console.log('Debrid Streams [Torrentio]: Found', response.streams.length, 'streams');
                    console.log('Debrid Streams [Torrentio]: First stream:', JSON.stringify(response.streams[0], null, 2));
                    streams_data = response.streams;
                    displayStreams(streams_data);
                } else {
                    console.log('Debrid Streams [Torrentio]: No streams found');
                    component.emptyForQuery('Streams not found');
                }
            }, function (error) {
                component.loading(false);
                console.log('Debrid Streams [Torrentio]: Error:', error);
                component.emptyForQuery('Load error: ' + (error.statusText || 'Unknown'));
            });
        }

        function displayStreams(streams) {
            component.reset();

            var qualities = {};
            streams.forEach(function (stream, index) {
                var parsed = parseStreamTitle(stream);
                var q = parsed.quality || 'Unknown';
                if (!qualities[q]) qualities[q] = [];
                qualities[q].push({ stream: stream, index: index, parsed: parsed });
            });

            filter_items.quality = Object.keys(qualities);

            // Update filter with quality options
            component.updateFilter(filter_items);

            var qualityOrder = ['4K', '2160P', '1080P', '720P', '480P', 'UNKNOWN'];
            var sortedQualities = Object.keys(qualities).sort(function (a, b) {
                var aIdx = qualityOrder.indexOf(a.toUpperCase());
                var bIdx = qualityOrder.indexOf(b.toUpperCase());
                if (aIdx === -1) aIdx = 999;
                if (bIdx === -1) bIdx = 999;
                return aIdx - bIdx;
            });

            sortedQualities.forEach(function (quality) {
                qualities[quality].forEach(function (item) {
                    var stream = item.stream;
                    var parsed = item.parsed;

                    // Build info line with source tag and languages
                    var infoParts = ['[RD+ Torrentio]'];
                    if (parsed.quality) infoParts.push(parsed.quality);
                    if (parsed.codec) infoParts.push(parsed.codec);
                    if (parsed.size) infoParts.push(parsed.size);
                    if (parsed.languages && parsed.languages.length > 0) {
                        infoParts.push(parsed.languages.join('/'));
                    }
                    if (parsed.audio) infoParts.push(parsed.audio);

                    var info = infoParts.join(' • ');

                    // Check if stream has valid URL
                    var streamUrl = getStreamUrl(stream);
                    var hasUrl = !!streamUrl;

                    var element = Lampa.Template.get('debrid_item', {
                        title: stream.title || stream.name || 'Stream ' + (item.index + 1),
                        info: info + (hasUrl ? '' : ' [NO URL]')
                    });

                    element.on('hover:enter', function () {
                        try {
                            playStream(stream);
                        } catch (error) {
                            console.error('Debrid Streams [Torrentio]: playStream error:', error);
                        }
                    });

                    element.on('hover:long', function () {
                        try {
                            showStreamDetails(stream, parsed);
                        } catch (error) {
                            console.error('Debrid Streams [Torrentio]: showStreamDetails error:', error);
                        }
                    });

                    component.append(element);
                });
            });

            component.start(true);
        }

        function playStream(stream) {
            // Log stream object for debugging (only when user clicks play)
            console.log('Debrid Streams [Torrentio]: Playing stream:', JSON.stringify(stream, null, 2));

            var url = getStreamUrl(stream);

            if (!url) {
                console.log('Debrid Streams [Torrentio]: No URL found in stream object');
                Lampa.Noty.show('Stream URL not found. Check console for details.');
                return;
            }

            console.log('Debrid Streams [Torrentio]: Stream URL:', url);

            var title = object.movie.title || object.movie.name || 'Video';
            var parsed = parseStreamTitle(stream);

            // Build player object
            var playerData = {
                title: title + (parsed.quality ? ' [' + parsed.quality + ']' : ''),
                url: url,
                timeline: object.movie
            };

            // Handle proxy headers if present (some debrid services need this)
            if (stream.behaviorHints && stream.behaviorHints.proxyHeaders && stream.behaviorHints.proxyHeaders.request) {
                playerData.headers = stream.behaviorHints.proxyHeaders.request;
            }

            // Always ensure we have Referer and User-Agent headers
            playerData.headers = playerData.headers || {};

            // Extract domain from URL for Referer
            var domainMatch = url.match(/^(https?:\/\/[^\/]+)/);
            if (domainMatch && !playerData.headers['Referer']) {
                playerData.headers['Referer'] = domainMatch[1] + '/';
            }

            // Add User-Agent if not set
            if (!playerData.headers['User-Agent']) {
                playerData.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            }

            console.log('Debrid Streams [Torrentio]: Using headers:', playerData.headers);

            Lampa.Player.play(playerData);

            // Show immediate sync modal
            showSyncModal(object.movie);

            Lampa.Timeline.update(object.movie);
        }

        function showStreamDetails(stream, parsed) {
            var items = [];
            var streamUrl = getStreamUrl(stream);

            items.push({
                title: 'Play',
                subtitle: streamUrl ? 'Open in player' : 'URL unavailable',
                action: function () {
                    Lampa.Modal.close();
                    playStream(stream);
                }
            });

            if (streamUrl) {
                items.push({
                    title: 'Copy URL',
                    subtitle: 'Copy link to clipboard',
                    action: function () {
                        Lampa.Utils.copyTextToClipboard(streamUrl, function () {
                            Lampa.Noty.show('URL copied');
                        }, function () {
                            Lampa.Noty.show('Copy error');
                        });
                        Lampa.Modal.close();
                    }
                });
            }

            items.push({
                title: 'Information',
                subtitle: parsed.full,
                action: function () {
                    Lampa.Modal.close();
                }
            });

            Lampa.Select.show({
                title: 'Actions',
                items: items,
                onSelect: function (item) {
                    if (item.action) item.action();
                },
                onBack: function () {
                    Lampa.Controller.toggle('content');
                }
            });
        }

        this.extendChoice = function (saved) {
            Lampa.Arrays.extend(choice, saved, true);
        };

        this.reset = function () {
            component.reset();
            choice = { quality: 0 };
            if (streams_data.length) {
                displayStreams(streams_data);
            }
            component.saveChoice(choice);
        };

        this.filter = function (type, a, b) {
            choice[a.stype] = b.index;
            component.reset();

            if (filter_items.quality && filter_items.quality[b.index]) {
                var selectedQuality = filter_items.quality[b.index];
                var filtered = streams_data.filter(function (stream) {
                    var parsed = parseStreamTitle(stream);
                    return parsed.quality === selectedQuality;
                });
                displayStreams(filtered.length ? filtered : streams_data);
            }

            component.saveChoice(choice);
        };

        this.destroy = function () {
            network.clear();
            streams_data = [];
        };
    }

    // ==================== MAIN COMPONENT ====================

    function DebridComponent(object) {
        var _this = this;
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);

        var sources = {};
        var active_source = null;
        var balanser = Lampa.Storage.get('debrid_source', 'comet');
        var initialized = false;

        var filter_sources = [];
        var choice = {
            source: 0
        };

        // Initialize sources after component is ready
        function initSources() {
            if (initialized) return;
            initialized = true;

            var comet_url = Lampa.Storage.get('debrid_comet_url', '');
            var torrentio_url = Lampa.Storage.get('debrid_torrentio_url', '');

            if (comet_url) {
                sources['comet'] = {
                    name: 'comet',
                    title: 'Comet',
                    source: new CometSource(_this, object)
                };
                filter_sources.push('comet');
            }

            if (torrentio_url) {
                sources['torrentio'] = {
                    name: 'torrentio',
                    title: 'Torrentio',
                    source: new TorrentioSource(_this, object)
                };
                filter_sources.push('torrentio');
            }

            // If no sources configured, add comet as default
            if (filter_sources.length === 0) {
                sources['comet'] = {
                    name: 'comet',
                    title: 'Comet',
                    source: new CometSource(_this, object)
                };
                filter_sources.push('comet');
            }

            // Find active source
            if (!sources[balanser]) {
                balanser = filter_sources[0];
            }
            active_source = sources[balanser];

            choice.source = filter_sources.indexOf(balanser);
            if (choice.source < 0) choice.source = 0;
        }

        this.create = function () {
            initSources();

            this.activity.loader(true);

            scroll.minus();
            scroll.body().addClass('torrent-list');

            filter.onSelect = function (type, a, b) {
                if (type === 'filter') {
                    if (a.stype === 'source') {
                        choice.source = b.index;
                        balanser = filter_sources[b.index];
                        active_source = sources[balanser];
                        Lampa.Storage.set('debrid_source', balanser);

                        _this.reset();
                        _this.searchStremio();
                    } else if (active_source && active_source.source && active_source.source.filter) {
                        active_source.source.filter(type, a, b);
                    }
                } else if (type === 'sort') {
                    if (a.source) {
                        balanser = a.source;
                        active_source = sources[balanser];
                        Lampa.Storage.set('debrid_source', balanser);

                        _this.reset();
                        _this.searchStremio();
                    }
                }
            };

            filter.onBack = function () {
                _this.start();
            };

            filter.render().find('.filter--sort span').text('Source');

            files.appendHead(filter.render());
            files.appendFiles(scroll.render());

            this.searchStremio();

            return files.render();
        };

        this.searchStremio = function () {
            this.activity.loader(true);

            var source_items = filter_sources.map(function (name, index) {
                return {
                    title: sources[name].title,
                    source: name,
                    selected: name === balanser,
                    index: index
                };
            });

            filter.set('sort', source_items);
            filter.chosen('sort', [balanser]);

            // Initialize filter with sources
            this.updateFilter();

            this.reset();

            if (active_source && active_source.source) {
                var imdb_id = object.movie.imdb_id;
                var kp_id = object.movie.kinopoisk_id || object.movie.kp_id;
                active_source.source.search(object, imdb_id || kp_id);
            } else {
                this.emptyForQuery('Source not found');
            }
        };

        this.loading = function (status) {
            if (status) {
                this.activity.loader(true);
                scroll.clear();
            } else {
                this.activity.loader(false);
            }
        };

        this.reset = function () {
            scroll.clear();
        };

        this.empty = function () {
            scroll.clear();

            var empty = Lampa.Template.get('list_empty');
            scroll.append(empty);

            this.start();
        };

        this.emptyForQuery = function (message) {
            this.activity.loader(false);
            scroll.clear();

            var empty = $('<div class="empty"><div class="empty__title">' + (message || 'Nothing found') + '</div></div>');
            scroll.append(empty);

            this.start();
        };

        this.append = function (element) {
            element.on('hover:focus', function () {
                try {
                    scroll.update($(this), true);
                } catch (error) {
                    console.error('Debrid Streams: scroll.update error:', error);
                }
            });
            scroll.append(element);
        };

        this.start = function (first_focus) {
            var _self = this;
            var items = scroll.render().find('.selector');

            if (items.length) {
                Lampa.Controller.add('content', {
                    toggle: function () {
                        Lampa.Controller.collectionSet(scroll.render());
                        Lampa.Controller.collectionFocus(first_focus ? items.first() : false, scroll.render());
                    },
                    left: function () {
                        if (Navigator.canmove('left')) {
                            Navigator.move('left');
                        } else {
                            Lampa.Controller.toggle('menu');
                        }
                    },
                    right: function () {
                        if (Navigator.canmove('right')) {
                            Navigator.move('right');
                        } else {
                            filter.show(Lampa.Lang.translate('title_filter'), 'filter');
                        }
                    },
                    up: function () {
                        if (Navigator.canmove('up')) {
                            Navigator.move('up');
                        } else {
                            filter.show(Lampa.Lang.translate('title_filter'), 'filter');
                        }
                    },
                    down: function () {
                        if (Navigator.canmove('down')) {
                            Navigator.move('down');
                        }
                    },
                    back: function () {
                        _self.back();
                    }
                });

                Lampa.Controller.toggle('content');
            } else {
                Lampa.Controller.add('content', {
                    toggle: function () { },
                    left: function () {
                        Lampa.Controller.toggle('menu');
                    },
                    right: function () { },
                    up: function () {
                        Lampa.Controller.toggle('head');
                    },
                    down: function () { },
                    back: function () {
                        _self.back();
                    }
                });

                Lampa.Controller.toggle('content');
            }
        };

        this.back = function () {
            Lampa.Activity.backward();
        };

        this.updateFilter = function (items) {
            var filters = [];

            // Add source filter
            if (filter_sources.length > 1) {
                filters.push({
                    title: 'Source',
                    stype: 'source',
                    items: filter_sources.map(function (name, index) {
                        return {
                            title: sources[name].title,
                            selected: name === balanser,
                            index: index
                        };
                    })
                });
            }

            // Add quality filter
            if (items && items.quality && items.quality.length) {
                filters.push({
                    title: 'Quality',
                    stype: 'quality',
                    items: items.quality.map(function (q, index) {
                        return {
                            title: q,
                            selected: index === 0,
                            index: index
                        };
                    })
                });
            }

            if (filters.length) {
                filter.set('filter', filters);
            }
        };

        this.saveChoice = function (ch) {
            // Save user choice
        };

        this.render = function () {
            return files.render();
        };

        this.destroy = function () {
            network.clear();
            scroll.destroy();

            for (var key in sources) {
                if (sources[key] && sources[key].source && sources[key].source.destroy) {
                    sources[key].source.destroy();
                }
            }
        };
    }

    // ==================== PLUGIN REGISTRATION ====================

    // Add templates
    function addTemplates() {
        Lampa.Template.add('debrid_item', '<div class="online selector">\
            <div class="online__body">\
                <div style="position: absolute;left: 0;top: -0.3em;width: 2.4em;height: 2.4em">\
                    <svg style="height: 2.4em; width: 2.4em;" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">\
                        <circle cx="64" cy="64" r="56" stroke="white" stroke-width="16"/>\
                        <path d="M90.5 64.3827L50 87.7654L50 41L90.5 64.3827Z" fill="white"/>\
                    </svg>\
                </div>\
                <div class="online__title" style="padding-left: 2.1em;">{title}</div>\
                <div class="online__quality" style="padding-left: 3.4em;">{info}</div>\
            </div>\
        </div>');

        Lampa.Template.add('debrid_folder', '<div class="online selector">\
            <div class="online__body">\
                <div style="position: absolute;left: 0;top: -0.3em;width: 2.4em;height: 2.4em">\
                    <svg style="height: 2.4em; width: 2.4em;" viewBox="0 0 128 112" fill="none" xmlns="http://www.w3.org/2000/svg">\
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
        // Add templates first
        addTemplates();

        // Add translations
        Lampa.Lang.add({
            debrid_title: {
                ru: 'Debrid Streams',
                en: 'Debrid Streams',
                uk: 'Debrid Streams'
            },
            debrid_settings_title: {
                ru: 'Настройки Debrid Streams',
                en: 'Debrid Streams Settings',
                uk: 'Налаштування Debrid Streams'
            },
            debrid_comet_url: {
                ru: 'URL манифеста Comet',
                en: 'Comet manifest URL',
                uk: 'URL маніфесту Comet'
            },
            debrid_torrentio_url: {
                ru: 'URL манифеста Torrentio',
                en: 'Torrentio manifest URL',
                uk: 'URL маніфесту Torrentio'
            },
            debrid_comet_url_descr: {
                ru: 'Вставьте URL из настроек Comet (Install ссылка)',
                en: 'Paste URL from Comet settings (Install link)',
                uk: 'Вставте URL з налаштувань Comet (Install посилання)'
            },
            debrid_torrentio_url_descr: {
                ru: 'Вставьте URL из настроек Torrentio',
                en: 'Paste URL from Torrentio settings',
                uk: 'Вставте URL з налаштувань Torrentio'
            },
            debrid_watch: {
                ru: 'Смотреть через Debrid',
                en: 'Watch via Debrid',
                uk: 'Дивитись через Debrid'
            },
            debrid_loading: {
                ru: 'Загрузка стримов...',
                en: 'Loading streams...',
                uk: 'Завантаження стрімів...'
            }
        });

        // Add settings parameters
        Lampa.Params.select('debrid_comet_url', '', '');
        Lampa.Params.select('debrid_torrentio_url', '', '');
        Lampa.Params.select('debrid_source', 'comet', '');

        // Add settings template
        Lampa.Template.add('settings_debrid', '\
            <div>\
                <div class="settings-param selector" data-name="debrid_comet_url" data-type="input" placeholder="https://comet.elfhosted.com/xxx/manifest.json">\
                    <div class="settings-param__name">#{debrid_comet_url}</div>\
                    <div class="settings-param__value"></div>\
                    <div class="settings-param__descr">#{debrid_comet_url_descr}</div>\
                </div>\
                <div class="settings-param selector" data-name="debrid_torrentio_url" data-type="input" placeholder="https://torrentio.strem.fun/xxx/manifest.json">\
                    <div class="settings-param__name">#{debrid_torrentio_url}</div>\
                    <div class="settings-param__value"></div>\
                    <div class="settings-param__descr">#{debrid_torrentio_url_descr}</div>\
                </div>\
            </div>\
        ');

        // Add settings section
        function addSettings() {
            if (Lampa.Settings.main && Lampa.Settings.main() && !Lampa.Settings.main().render().find('[data-component="debrid"]').length) {
                var field = $('\
                    <div class="settings-folder selector" data-component="debrid">\
                        <div class="settings-folder__icon">\
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/>\
                            </svg>\
                        </div>\
                        <div class="settings-folder__name">Debrid Streams</div>\
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

        // Register component
        Lampa.Component.add(PLUGIN_NAME, DebridComponent);

        // Create plugin manifest
        var manifest = {
            type: 'video',
            version: PLUGIN_VERSION,
            name: PLUGIN_TITLE + ' - ' + PLUGIN_VERSION,
            description: Lampa.Lang.translate('debrid_watch'),
            component: PLUGIN_NAME
        };

        // Add button to movie page
        var buttonHtml = '\
            <div class="full-start__button selector view--debrid" data-subtitle="Real Debrid ' + PLUGIN_VERSION + '">\
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:1.3em;height:1.3em">\
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/>\
                </svg>\
                <span>#{debrid_title}</span>\
            </div>\
        ';

        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                var btn = $(Lampa.Lang.translate(buttonHtml));

                btn.on('hover:enter', function () {
                    var movie = e.data.movie;

                    // Check settings availability
                    var comet_url = Lampa.Storage.get('debrid_comet_url', '');
                    var torrentio_url = Lampa.Storage.get('debrid_torrentio_url', '');

                    if (!comet_url && !torrentio_url) {
                        Lampa.Noty.show('Configure URL in Settings -> Debrid Streams');
                        return;
                    }

                    if (!movie.imdb_id) {
                        Lampa.Noty.show('IMDb ID not found. Try another source.');
                        return;
                    }

                    Lampa.Activity.push({
                        url: '',
                        title: PLUGIN_TITLE,
                        component: PLUGIN_NAME,
                        movie: movie,
                        page: 1
                    });
                });

                // Add button after torrents
                var torrentBtn = e.object.activity.render().find('.view--torrent');
                if (torrentBtn.length) {
                    torrentBtn.after(btn);
                } else {
                    e.object.activity.render().find('.full-start__buttons').append(btn);
                }
            }
        });

        // Listen for settings open
        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name === 'debrid') {
                // Real Debrid settings opened
            }
        });

        console.log('Debrid Streams Plugin v' + PLUGIN_VERSION + ' loaded');
    }

    // ==================== TRAKT SYNC HANDLER ====================

    // Listen for app resume (return from external player)
    var syncListenerAttached = false;
    function attachSyncListener() {
        if (syncListenerAttached) return;

        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && window.dbr_last_stream) {
                var last = window.dbr_last_stream;
                var now = Date.now();

                // Should be at least 10 seconds to avoid accidental triggers
                if (now - last.time > 10000) {
                    var item = last.item;
                    var title = (item.title || item.name || 'Video');

                    Lampa.Select.show({
                        title: 'Trakt TV',
                        items: [
                            {
                                title: 'Да, отметить как просмотренное',
                                subtitle: 'Вы закончили просмотр ' + title + '?',
                                action: function () {
                                    markAsWatched(item);
                                    window.dbr_last_stream = null;
                                    Lampa.Modal.close();
                                }
                            },
                            {
                                title: 'Нет, еще смотрю',
                                subtitle: 'Просмотр не окончен',
                                action: function () {
                                    window.dbr_last_stream = null;
                                    Lampa.Modal.close();
                                }
                            }
                        ]
                    });
                } else {
                    // Too short duration, ignore
                    window.dbr_last_stream = null;
                }
            }
        });
        syncListenerAttached = true;
    }

    function markAsWatched(item) {
        if (window.TraktTV && window.TraktTV.api) {
            var data = {
                method: item.first_air_date ? 'show' : 'movie',
                id: item.id,
                ids: item.ids
            };

            // Using the API directly
            window.TraktTV.api.addToHistory(data)
                .then(function () {
                    Lampa.Noty.show('Отмечено как просмотренное в Trakt');
                })
                .catch(function (e) {
                    Lampa.Noty.show('Ошибка Trakt: ' + (e.message || 'Unknown error'));
                });
        } else {
            Lampa.Noty.show('Плагин Trakt TV не активен или старая версия');
        }
    }

    // Initialization
    if (window.appready) {
        initPlugin();
        attachSyncListener();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                initPlugin();
                attachSyncListener();
            }
        });
    }

})();
