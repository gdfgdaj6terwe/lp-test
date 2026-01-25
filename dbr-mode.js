/**
 * AIOStreams - Lampa Plugin
 * Version: 2.0.0
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
    var PLUGIN_VERSION = '2.0.0';
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
            showSyncModal(movie);
            if (movie) Lampa.Timeline.update(movie);
            return;
        }

        // On web platform, default to external player (torrent player)
        var torrentPlayer = Lampa.Storage.get('player_torrent', '');
        if (torrentPlayer) {
            playerData.player = torrentPlayer;
        }

        console.log('AIOStreams: Opening in external player:', torrentPlayer || 'default');
        Lampa.Player.play(playerData);
        showSyncModal(movie);
        if (movie) Lampa.Timeline.update(movie);
    }

    // ==================== AIOSTREAMS SOURCE ====================

    function AIOStreamsSource(component, _object) {
        var network = new Lampa.Reguest();
        var object = _object;
        var streams_data = [];
        var filter_items = {};
        var current_season = null;
        var current_episode = null;
        var navStack = []; // Navigation stack for back navigation
        var choice = {
            quality: 0
        };

        function getBaseUrl() {
            var url = Lampa.Storage.get('debrid_aiostreams_url', DEFAULT_SETTINGS.aiostreams_url);
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
                component.emptyForQuery('AIOStreams URL not configured. Go to Settings -> AIOStreams');
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
            // Push navigation state
            navStack = [{ type: 'seasons', imdbId: imdbId }];

            var seasons = object.movie.number_of_seasons || (object.movie.seasons && object.movie.seasons.length) || 1;
            var items = [];

            for (var s = 1; s <= seasons; s++) {
                items.push({
                    title: 'Season ' + s,
                    season: s,
                    imdb_id: imdbId
                });
            }

            // Clear filter info when on seasons
            component.updateFilterInfo(null);

            component.reset();
            component.loading(false);

            items.forEach(function (item) {
                var info = '';

                // Check watched status for season
                if (object.trakt_history && Array.isArray(object.trakt_history)) {
                    var seasonEpisodes = object.trakt_history.filter(function (h) {
                        return h.episode && h.episode.season === item.season;
                    });
                    if (seasonEpisodes.length > 0) {
                        item.title += ' ✓';
                        info = seasonEpisodes.length + ' смотрели';
                    }
                }

                var element = Lampa.Template.get('debrid_folder', {
                    title: item.title,
                    info: info
                });

                element.on('hover:enter', function () {
                    showEpisodeSelect(item.imdb_id, item.season);
                });

                component.append(element);
            });

            component.start(true);
        }

        function showEpisodeSelect(imdbId, season) {
            // Push navigation state
            navStack.push({ type: 'episodes', imdbId: imdbId, season: season });

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

            // Update filter info with current season
            component.updateFilterInfo('S' + season);

            component.reset();
            component.loading(false);

            items.forEach(function (item) {
                // Check watched status
                var isWatched = false;
                if (object.trakt_history && Array.isArray(object.trakt_history)) {
                    var found = object.trakt_history.find(function (h) {
                        return h.episode && h.episode.season === item.season && h.episode.number === item.episode;
                    });
                    if (found) isWatched = true;
                }

                var element = Lampa.Template.get('debrid_folder', {
                    title: 'S' + String(item.season).padStart(2, '0') + 'E' + String(item.episode).padStart(2, '0') + (isWatched ? ' ✓' : ''),
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

            // Store current season/episode for filter display
            current_season = season || null;
            current_episode = episode || null;

            // Push navigation state for streams
            if (season && episode) {
                navStack.push({ type: 'streams', imdbId: imdbId, season: season, episode: episode });
            }

            // Update filter display with current season/episode
            if (current_season && current_episode) {
                component.updateFilterInfo('S' + current_season + 'E' + current_episode);
            } else {
                component.updateFilterInfo(null);
            }

            console.log('AIOStreams: Fetching:', url);

            component.loading(true);
            network.clear();
            network.timeout(Lampa.Storage.get('debrid_timeout', DEFAULT_SETTINGS.timeout));

            network.silent(url, function (response) {
                component.loading(false);
                console.log('AIOStreams: Response received:', response);

                if (response && response.streams && response.streams.length > 0) {
                    console.log('AIOStreams: Found', response.streams.length, 'streams');
                    streams_data = response.streams;
                    displayStreams(streams_data);
                } else {
                    console.log('AIOStreams: No streams found');
                    component.emptyForQuery('Streams not found');
                }
            }, function (error) {
                component.loading(false);
                console.log('AIOStreams: Error:', error);
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
                    var infoParts = ['[AIOS]'];
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

                    // DEBUG: Log stream processing
                    console.log('AIOStreams: Stream processing:', {
                        title: stream.title || stream.name,
                        parsed: parsed,
                        generated_info: info,
                        url_found: hasUrl
                    });

                    var element = Lampa.Template.get('debrid_item', {
                        title: stream.title || stream.name || 'Stream ' + (item.index + 1),
                        info: info + (hasUrl ? '' : ' [NO URL]')
                    });

                    element.on('hover:enter', function () {
                        playStream(stream);
                    });

                    element.on('hover:long', function () {
                        showStreamDetails(stream, parsed);
                    });

                    component.append(element);
                });
            });

            component.start(true);
        }

        function playStream(stream) {
            console.log('AIOStreams: Playing stream:', JSON.stringify(stream, null, 2));

            var url = getStreamUrl(stream);

            if (!url) {
                console.log('AIOStreams: No URL found in stream object');
                Lampa.Noty.show('Stream URL not found');
                return;
            }

            console.log('AIOStreams: Stream URL:', url);

            var title = object.movie.title || object.movie.name || 'Video';
            var parsed = parseStreamTitle(stream);

            // Build player object
            var playerData = {
                title: title + (parsed.quality ? ' [' + parsed.quality + ']' : ''),
                url: url,
                timeline: object.movie
            };

            // Handle proxy headers
            if (stream.behaviorHints && stream.behaviorHints.proxyHeaders && stream.behaviorHints.proxyHeaders.request) {
                playerData.headers = stream.behaviorHints.proxyHeaders.request;
            }

            if (!Lampa.Platform.is('web')) {
                playerData.headers = playerData.headers || {};
                var domainMatch = url.match(/^(https?:\/\/[^\/]+)/);
                if (domainMatch && !playerData.headers['Referer']) {
                    playerData.headers['Referer'] = domainMatch[1] + '/';
                }
                if (!playerData.headers['User-Agent']) {
                    playerData.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
                }
            }

            showPlayerChoiceDialog(playerData, object.movie);
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
            navStack = [];
        };

        /**
         * Go back in navigation hierarchy
         */
        this.goBack = function () {
            if (navStack.length > 1) {
                var current = navStack.pop();
                var prev = navStack[navStack.length - 1];

                if (prev.type === 'seasons') {
                    navStack = []; // Reset and show seasons
                    showSeasonSelect(prev.imdbId);
                    return true;
                } else if (prev.type === 'episodes') {
                    navStack.pop(); // Remove episodes from stack
                    showEpisodeSelect(prev.imdbId, prev.season);
                    return true;
                }
            }
            return false; // Exit activity
        };
    }

    // ==================== MAIN COMPONENT ====================

    function DebridComponent(object) {
        var _this = this;
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);

        var source = null;
        var initialized = false;

        var filter_sources = [];
        var choice = {
            source: 0
        };

        function initSources() {
            if (initialized) return;
            initialized = true;

            source = new AIOStreamsSource(_this, object);
        }

        this.create = function () {
            initSources();

            this.activity.loader(true);

            scroll.minus();
            scroll.body().addClass('torrent-list');

            filter.onSelect = function (type, a, b) {
                if (type === 'filter') {
                    if (source && source.filter) {
                        source.filter(type, a, b);
                    }
                }
            };

            filter.onBack = function () {
                _this.start();
            };

            filter.render().find('.filter--sort span').text('Filter');

            files.appendHead(filter.render());
            files.appendFiles(scroll.render());

            this.searchStremio();

            return files.render();
        };

        this.searchStremio = function () {
            this.activity.loader(true);

            // Show loading text
            scroll.clear();
            var loading = $('<div class="empty"><div class="empty__title">Загрузка стримов...</div></div>');
            scroll.append(loading);

            // Initialize filter (only quality now)
            this.updateFilter();

            this.reset();

            if (source) {
                var imdb_id = object.movie.imdb_id;
                var kp_id = object.movie.kinopoisk_id || object.movie.kp_id;
                source.search(object, imdb_id || kp_id);
            } else {
                this.emptyForQuery('Source not initialized');
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
                } catch (error) { }
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
                        if (Navigator.canmove('left')) Navigator.move('left');
                        else Lampa.Controller.toggle('menu');
                    },
                    right: function () {
                        if (Navigator.canmove('right')) Navigator.move('right');
                        else filter.show(Lampa.Lang.translate('title_filter'), 'filter');
                    },
                    up: function () {
                        if (Navigator.canmove('up')) Navigator.move('up');
                        else filter.show(Lampa.Lang.translate('title_filter'), 'filter');
                    },
                    down: function () {
                        if (Navigator.canmove('down')) Navigator.move('down');
                    },
                    back: function () {
                        _self.back();
                    }
                });
                Lampa.Controller.toggle('content');
            } else {
                Lampa.Controller.add('content', {
                    toggle: function () { },
                    left: function () { Lampa.Controller.toggle('menu'); },
                    right: function () { },
                    up: function () { Lampa.Controller.toggle('head'); },
                    down: function () { },
                    back: function () { _self.back(); }
                });
                Lampa.Controller.toggle('content');
            }
        };

        this.back = function () {
            if (source && source.goBack && source.goBack()) {
                return;
            }
            Lampa.Activity.backward();
        };


        this.updateFilter = function (items) {
            var filters = [];

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

        this.updateFilterInfo = function (info) {
            var select = [];
            if (info) select.push(info);
            filter.chosen('filter', select);
        };

        this.saveChoice = function (ch) { };

        this.render = function () {
            return files.render();
        };

        this.destroy = function () {
            scroll.destroy();
            if (source && source.destroy) source.destroy();
        };
    }

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

        Lampa.Template.add('settings_debrid', '\
            <div>\
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

        // Add styles for logo on focus
        $('body').append('<style>.view--debrid.focus img { filter: brightness(0); }</style>');

        Lampa.Component.add(PLUGIN_NAME, DebridComponent);

        var buttonHtml = '\
            <div class="full-start__button selector view--debrid" data-subtitle="Stremio Aggregator">\
                <img src="' + PLUGIN_LOGO + '" style="width:1.3em;height:1.3em;border-radius:50%;margin-right:0.4em;">\
                <span>#{title_key}</span>\
            </div>\
        ';

        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                var btnShort = $(buttonHtml.replace('#{title_key}', Lampa.Lang.translate('debrid_title_short')));
                var btnFull = $(buttonHtml.replace('#{title_key}', Lampa.Lang.translate('debrid_title')));

                var enterPlugin = function () {
                    var movie = e.data.movie;
                    var url = Lampa.Storage.get('debrid_aiostreams_url', '');

                    if (!url) {
                        Lampa.Noty.show('Configure URL in Settings -> AIOStreams');
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
                };

                btnShort.on('hover:enter', enterPlugin);
                btnFull.on('hover:enter', enterPlugin);

                var watchBtn = e.object.activity.render().find('.button--play, .view--play').first();
                if (watchBtn.length) watchBtn.after(btnShort);
                else e.object.activity.render().find('.full-start__buttons').append(btnShort);

                var torrentBtn = e.object.activity.render().find('.view--torrent').last();
                if (torrentBtn.length) torrentBtn.after(btnFull);
                else e.object.activity.render().find('.full-start__buttons').append(btnFull);
            }
        });

        // Move TraktTV menu item to top
        setTimeout(function () {
            try {
                var menuList = $('.menu .menu__list').eq(0);
                if (menuList.length) {
                    var traktItem = menuList.find('.menu__item').filter(function () {
                        return $(this).find('.menu__text').text().toLowerCase().indexOf('trakt') !== -1;
                    });
                    if (traktItem.length) {
                        menuList.prepend(traktItem);
                        console.log('AIOStreams: Moved TraktTV menu item to top');
                    }
                }
            } catch (e) { }
        }, 2000);

        console.log('AIOStreams Plugin v' + PLUGIN_VERSION + ' loaded');
    }

    // ==================== TRAKT SYNC ====================

    function showSyncModal(item) {
        if (!item || !window.TraktTV || !window.TraktTV.api) return;

        var enabled = Lampa.Controller.enabled().name;
        var title = (item.title || item.name || 'Video');

        Lampa.Select.show({
            title: 'Trakt TV',
            items: [
                {
                    title: 'Да, отметить как просмотренное',
                    subtitle: title,
                    mark: true
                },
                {
                    title: 'Нет',
                    subtitle: 'Закрыть',
                    mark: false
                }
            ],
            onSelect: function (a) {
                Lampa.Controller.toggle(enabled);
                if (a.mark) markAsWatched(item);
            },
            onBack: function () {
                Lampa.Controller.toggle(enabled);
            }
        });
    }

    function markAsWatched(item) {
        if (!window.TraktTV || !window.TraktTV.api) {
            Lampa.Noty.show('Trakt API не доступен');
            return;
        }

        var isTV = item.first_air_date || item.number_of_seasons || item.seasons;
        var method = isTV ? 'show' : 'movie';
        var data = { method: method, id: item.id };
        if (item.ids) data.ids = item.ids;

        window.TraktTV.api.addToHistory(data).then(function () {
            Lampa.Noty.show('Отмечено в Trakt');
        }).catch(function (e) {
            Lampa.Noty.show('Ошибка: ' + (e.message || 'Error'));
        });
    }

    function getTraktHistory(tmdbId, type) {
        return new Promise(function (resolve) {
            if (!window.TraktTV || !window.TraktTV.api) return resolve(null);
            var api = window.TraktTV.api;
            api.get('/search/tmdb/' + tmdbId + '?type=' + (type === 'series' ? 'show' : 'movie'))
                .then(function (res) {
                    if (res && res[0] && res[0][type === 'series' ? 'show' : 'movie']) {
                        var traktId = res[0][type === 'series' ? 'show' : 'movie'].ids.trakt;
                        return api.get('/sync/history/' + (type === 'series' ? 'shows' : 'movies') + '/' + traktId + '?extended=full&limit=1000');
                    }
                    return null;
                })
                .then(function (history) {
                    resolve(history);
                })
                .catch(function (e) {
                    resolve(null);
                });
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
