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
    var PLUGIN_VERSION = '3.0.5';
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
    }

    // ==================== AIOSTREAMS SOURCE ====================


var DbrStyles = ".dbr3{color:#f3f4f5}.dbr3-header{padding:.6em .4em 1em}.dbr3-header h2{font-size:1.65em;margin:0 0 .8em}.dbr3-filters{display:flex;flex-wrap:wrap;gap:.55em}.dbr3-button{display:inline-block;padding:.65em .9em;border-radius:.45em;background:#292c32;font-size:.95em;cursor:pointer}.dbr3-button small{display:block;color:#b6bdc9;font-size:.72em;margin-bottom:.2em}.dbr3-button.active{box-shadow:inset 0 -.15em #d8e6ad}.dbr3-button.active span{color:#d8e6ad}.dbr3 .selector.focus{outline:.17em solid #fff;outline-offset:.13em;background:#353a43}.dbr3-layout{display:flex;height:100%;min-height:0}.dbr3-layout>.scroll{flex:1;min-width:0}.dbr3-sources{display:none}.dbr3-with-sources .dbr3-sources{display:block;flex:0 0 12em;padding:.3em 1.2em .7em .3em;margin-right:1em;border-right:1px solid #414651;overflow-y:auto}.dbr3-source{display:block;margin-bottom:.45em;background:transparent;padding:.7em}.dbr3-source b{float:right;font-size:.8em;font-weight:400}.dbr3-source.selected{background:#e9ecdf;color:#1b2019}.dbr3-source.selected small{color:#51594a}.dbr3-source small{white-space:normal;line-height:1.4}.dbr3-source-error{font-size:.8em;color:#cbbbaa;line-height:1.5;padding:.7em}.dbr3-count{color:#b7bdc9;padding:.6em .8em;font-size:.9em}.dbr3-stream{display:flex;align-items:center;padding:1em .85em;border-bottom:1px solid #363b45;border-radius:.35em;gap:1em;margin:.25em .2em}.dbr3-stream-copy{flex:1;min-width:0}.dbr3-stream-copy strong{font-size:1.1em;display:block}.dbr3-stream-copy small{display:block;font-size:.78em;color:#bac1cd;margin-top:.35em;white-space:pre-line}.dbr3-stream-copy p{font-size:.82em;color:#c2c8d2;white-space:pre-line;margin:.5em 0;max-height:4.3em;overflow:hidden;overflow-wrap:anywhere}.dbr3-quality{flex:0 0 4em;font-size:1.15em;font-weight:600}.dbr3-size{flex:0 0 5.5em;text-align:right;font-size:.9em}.dbr3-size small{display:block;color:#d8e6ad;font-size:.75em;margin-top:.5em}.dbr3-episode{display:flex;align-items:center;gap:1.2em;padding:.8em;border-radius:.5em;margin:.25em .2em}.dbr3-preview{width:11em;height:6.2em;flex-shrink:0;border-radius:.35em;overflow:hidden;background:#282f38;color:#b2bbc8;font-size:.9em;display:flex;align-items:center;justify-content:center}.dbr3-preview img{width:100%;height:100%;object-fit:cover}.dbr3-episode-copy{flex:1;min-width:0}.dbr3-episode-copy strong{font-size:1.2em;display:block;margin:.2em 0}.dbr3-episode-copy small{color:#b8c0cc;font-size:.8em}.dbr3-episode-copy p{color:#c0c7d2;font-size:.88em;line-height:1.5;max-height:3em;overflow:hidden}.dbr3-enter{color:#d8e6ad;font-size:.85em;white-space:nowrap}.dbr3-empty{padding:2em 1em;font-size:1.1em;color:#c3cbd8;line-height:1.5}.dbr3-loading{padding:1.2em;color:#bac1cd}.dbr3-skeleton{height:6em;border-radius:.5em;background:#2a2e36;margin:.8em;position:relative;overflow:hidden}.dbr3-skeleton:after{content:'';position:absolute;inset:0;background:linear-gradient(105deg,transparent 25%,#ffffff10 50%,transparent 75%);transform:translateX(-100%);animation:dbr3-shimmer 1.6s infinite}@keyframes dbr3-shimmer{to{transform:translateX(100%)}}@media(prefers-reduced-motion:reduce){.dbr3-skeleton:after{animation:none}}@media(max-width:700px){.dbr3-with-sources .dbr3-sources{flex-basis:8em;padding-right:.5em;margin-right:.5em}.dbr3-preview{width:7em;height:4.5em}.dbr3-enter{display:none}.dbr3-quality{flex-basis:3em;font-size:.9em}.dbr3-size{flex-basis:4em}.dbr3-stream{gap:.6em;padding:.8em .5em}}\n\n.dbr3-skeleton{display:flex;align-items:center;gap:1em;padding:1em;background:transparent;height:7em}.dbr3-skeleton:after{display:none}.dbr3-skeleton-preview,.dbr3-skeleton-body div,.dbr3-skeleton-end{position:relative;overflow:hidden;background:#2b3039;border-radius:.3em}.dbr3-skeleton-preview{width:8em;height:5em;flex-shrink:0}.dbr3-skeleton-body{flex:1}.dbr3-skeleton-body div{height:.7em;margin:.8em 0;width:75%}.dbr3-skeleton-body div:first-child{width:55%;height:1em}.dbr3-skeleton-body div:last-child{width:40%}.dbr3-skeleton-end{width:4em;height:1em}.dbr3-skeleton-preview:after,.dbr3-skeleton-body div:after,.dbr3-skeleton-end:after{content:\"\";position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(105deg,transparent 20%,rgba(255,255,255,.1) 50%,transparent 80%);transform:translateX(-100%);animation:dbr3-shimmer 1.6s ease-in-out infinite}@media(prefers-reduced-motion:reduce){.dbr3-skeleton *:after{animation:none}}\n";

var DbrCore = (function () {
    'use strict';
    var fields = ['audio', 'subtitles', 'quality', 'voice', 'range'];
    var languageNames = { ru: 'Русский', en: 'English', uk: 'Українська', pl: 'Polski', ja: '日本語', de: 'Deutsch', fr: 'Français', es: 'Español', unknown: 'Не указаны', none: 'Не предоставлены' };
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
            ['es', /🇪🇸|(^|[^a-z])(spa|spanish)([^a-z]|$)/i]
        ];
        return rules.filter(function (rule) { return rule[1].test(text); }).map(function (rule) { return rule[0]; });
    }
    function languageCode(value) {
        var code = String(value || '').toLowerCase();
        var aliases = { rus: 'ru', eng: 'en', ukr: 'uk', pol: 'pl', jpn: 'ja', ger: 'de', deu: 'de', fre: 'fr', fra: 'fr', spa: 'es' };
        return aliases[code] || (languageNames[code] ? code : languages(code)[0]) || 'unknown';
    }
    function normalize(stream, index, provider) {
        var text = [stream.name, stream.description, stream.title].filter(Boolean).join('\n');
        var quality = text.match(/\b(2160|1440|1080|720|576|480|360)p?\b/i);
        var size = text.match(/(\d+(?:[.,]\d+)?)\s*(GB|GiB|MB|MiB|ГБ|МБ)/i);
        var codec = text.match(/\b(HEVC|H\.?265|H\.?264|x265|x264|AV1)\b/i);
        var audioText = text.split('\n').filter(function (line) { return !/subtitles?|субтитр|\bsubs\b/i.test(line); }).join('\n');
        var explicitAudio = stream.audioLanguages || stream.languages;
        var audio = Array.isArray(explicitAudio) ? unique(explicitAudio.map(languageCode)) : languages(audioText);
        var voiceMatch = text.match(/LostFilm|NewStudio|Кубик в Кубе|Дубляж|Многоголосая|Закадровая|AniLibria|AniDUB|JAM|Lektor/ig);
        var subtitles;
        if (Array.isArray(stream.subtitles)) subtitles = unique(stream.subtitles.map(function (sub) { return languageCode(sub.lang || sub.language || sub.label || sub.title); }));
        var hints = stream.behaviorHints || {};
        return {
            id: provider + '-' + index,
            provider: provider,
            raw: stream,
            title: stream.description || stream.title || stream.name || 'Поток ' + (index + 1),
            source: stream.name || provider,
            url: httpUrl(stream.url),
            external: httpUrl(stream.externalUrl),
            method: stream.method || 'play',
            quality: stream.dbr_quality || (quality ? quality[1] : /\b4k\b/i.test(text) ? '2160' : 'unknown'),
            audio: audio,
            subtitles: subtitles,
            voice: stream.dbr_voice ? [stream.dbr_voice] : unique(voiceMatch || []),
            range: /Dolby.?Vision|\bDV\b/i.test(text) ? ['Dolby Vision'] : /HDR10\+/i.test(text) ? ['HDR10+'] : /HDR/i.test(text) ? ['HDR'] : /\bSDR\b/i.test(text) ? ['SDR'] : [],
            codec: codec ? codec[1] : '',
            size: size ? parseFloat(size[1].replace(',', '.')) / (/^(M|М)/i.test(size[2]) ? 1024 : 1) : undefined,
            cached: hints.cached === true || /RD\+|Real.?Debrid.*cached/i.test(text)
        };
    }
    function values(row, key) {
        if (row[key] === undefined) return ['unknown'];
        if (Array.isArray(row[key])) return row[key].length ? row[key] : [key === 'subtitles' ? 'none' : 'unknown'];
        return [row[key]];
    }
    function select(rows, selected, except) {
        return rows.filter(function (row) {
            return fields.every(function (key) {
                return key === except || !selected[key] || !selected[key].length || selected[key].some(function (value) { return values(row, key).indexOf(value) !== -1; });
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
    function lampacRows(items, provider) {
        var rows = [];
        items.forEach(function (item) {
            var qualities = item.quality || item.qualitys || {};
            var keys = item.method === 'call' ? [] : Object.keys(qualities);
            if (!keys.length) keys = [''];
            keys.forEach(function (quality) {
                var stream = {};
                Object.keys(item).forEach(function (key) { stream[key] = item[key]; });
                stream.url = String(quality ? qualities[quality] : item.url || '').split(' or ')[0];
                stream.name = provider;
                stream.description = item.title || item.translate || provider;
                stream.dbr_voice = item.translate || item.voice_name || '';
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
    return { nextVariant: nextVariant, fields: fields, escape: escape, httpUrl: httpUrl, baseUrl: baseUrl, streamUrl: streamUrl, type: type, normalize: normalize, values: values, select: select, facet: facet, sort: sort, lampacRows: lampacRows, label: label };
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
    var addon = DbrCore.baseUrl(Lampa.Storage.get('debrid_aiostreams_url', ''));

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
                send('RchRegistry', [{ host: location.host, rchtype: 'web', apkVersion: 0, player: 'inner' }]);
            } else if (message.method === 'RchRegistry') {
                transportReady = true;
                finish('');
            } else if (message.method === 'RchClient') {
                // The server cannot execute code or request arbitrary URLs through this client.
                send('RchResult', [args[0], args[1] === 'ping' ? 'pong' : '']);
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
        if (local && transportReady) url = query(url, { nws_id: transportId, rchtype: 'web' });
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
                callback('', DbrCore.lampacRows(items, provider.id), voices);
            });
        }
        load(provider.voiceUrl || query(provider.url, params), 0);
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
    var files = new Lampa.Explorer($.extend({}, object, { params: $.extend({}, object.params, { noinfo: true }) }));
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var header = $('<div class="dbr3-header"></div>');
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
    var order = 'source';
    var lastKey = '';
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
    var labels = { audio: 'Язык', subtitles: 'Субтитры', quality: 'Качество', voice: 'Озвучка', range: 'Видео' };
    var errors = { network: 'Не удалось подключиться', playback: 'Видео недоступно на этом устройстве', format: 'Источник вернул неподдерживаемый ответ', config: 'Укажите адрес AIOStreams в настройках', imdb: 'Не удалось определить IMDb ID', auth: 'Источник требует авторизацию', device: 'Источник недоступен на этом устройстве', challenge: 'Источник требует проверку в своём плагине', match: 'Источник требует уточнить название', metadata: 'Не удалось загрузить сведения о сериях' };

    function title() { return movie.title || movie.name || 'Видео'; }
    function provider() { return providers.filter(function (item) { return item.id === selectedProvider; })[0] || providers[0]; }
    function rows() { return provider() ? provider().rows : []; }
    function filtered() { return DbrCore.sort(DbrCore.select(rows(), selection), order); }
    function countFilters() { return Object.keys(selection).reduce(function (sum, key) { return sum + selection[key].length; }, 0); }
    function image(path) {
        if (!path) return '';
        if (DbrCore.httpUrl(path)) return path;
        return Lampa.TMDB && Lampa.TMDB.image ? Lampa.TMDB.image('t/p/w300' + path) : '';
    }
    function bind(element, key, enter) {
        element.attr('data-dbr-key', key).on('hover:enter', enter).on('hover:focus', function () {
            lastKey = key;
            if ($.contains(scroll.render()[0], element[0])) scroll.update(element, true);
        });
        return element;
    }
    function button(text, key, action, className) {
        return bind($('<div class="selector dbr3-button ' + (className || '') + '"></div>').text(text), key, action);
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
            items.push({ title: 'Сезон ' + season, action: 'season' });
            if (mode === 'streams') items.push({ title: 'Выбрать серию', action: 'episodes' });
        }
        DbrCore.fields.forEach(function (key) { items.push({ title: labels[key], action: key }); });
        choose('Фильтры', items, function (item) {
            if (item.action === 'season') showSeasons();
            else if (item.action === 'episodes') { api.cancel(); mode = 'episodes'; lastKey = 'episode-' + episode; render(); }
            else showFilter(item.action);
        });
    }
    function loading() {
        scroll.append($('<div class="dbr3-loading"></div>').text(mode === 'episodes' ? 'Загружаем серии…' : 'Ищем потоки…'));
        for (var index = 0; index < 4; index++) {
            scroll.append($('<div class="dbr3-skeleton" aria-hidden="true"><div class="dbr3-skeleton-preview"></div><div class="dbr3-skeleton-body"><div></div><div></div><div></div></div><div class="dbr3-skeleton-end"></div></div>'));
        }
    }
    function empty(message, action) {
        scroll.append($('<div class="dbr3-empty"></div>').text(message));
        if (action) scroll.append(button('Повторить', 'retry', action));
    }
    function showFilter(key) {
        var values = (selection[key] || []).slice();
        function show() {
            var temporary = {};
            Object.keys(selection).forEach(function (field) { temporary[field] = selection[field]; });
            temporary[key] = values;
            var items = [
                { title: 'Готово · ' + DbrCore.select(rows(), temporary).length + ' потоков', done: true },
                { title: 'Все варианты', reset: true, selected: !values.length }
            ];
            DbrCore.facet(rows(), temporary, key).forEach(function (option) {
                items.push({ title: (values.indexOf(option.value) !== -1 ? '✓ ' : '') + DbrCore.label(key, option.value), subtitle: option.count + ' потоков', value: option.value });
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
        choose('Сезон', seasons.map(function (item) { return { title: item.name || 'Сезон ' + item.season_number, number: item.season_number, selected: item.season_number === season }; }), function (item) {
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
            if (!item || (item.air_date && item.air_date > new Date().toISOString().slice(0, 10))) { Lampa.Noty.show('Следующая серия пока недоступна'); return; }
            episode = item.episode_number;
            beginStreams(preference);
        }
        if (next) return start(next);
        var later = seasons.filter(function (item) { return item.season_number > season; }).sort(function (a, b) { return a.season_number - b.season_number; })[0];
        if (!later) { Lampa.Noty.show('Это последняя доступная серия'); return; }
        advancing = true;
        api.episodes(later.season_number, function (error, items) {
            advancing = false;
            var first = items.filter(function (item) { return item.episode_number === 1; })[0];
            if (error || !first || (first.air_date && first.air_date > new Date().toISOString().slice(0, 10))) { Lampa.Noty.show('Следующая серия пока недоступна'); return; }
            season = later.season_number;
            episodes = items;
            start(first);
        });
    }
    function addFilterHeader() {
        var bar = $('<div class="dbr3-filters"></div>');
        if (DbrCore.type(movie) === 'series') bar.append(button('Сезон ' + season + ' ⌄', 'season', showSeasons));
        if (mode === 'streams' && DbrCore.type(movie) === 'series') bar.append(button('Серия ' + episode + ' ⌄', 'episode', function () {
            choose('Серия', episodes.map(function (item) { return { title: item.episode_number + '. ' + item.name, number: item.episode_number }; }), function (item) { episode = item.number; beginStreams(); });
        }));
        if (mode === 'streams' && DbrCore.type(movie) === 'series') bar.append(button('Следующая серия ›', 'next-episode', nextEpisode));
        DbrCore.fields.forEach(function (key) {
            if (mode !== 'streams') return;
            var current = (selection[key] || []).map(function (value) { return DbrCore.label(key, value); }).join(', ');
            var control = button('', 'filter-' + key, function () { showFilter(key); });
            control.toggleClass('active', !!current).append($('<small></small>').text(labels[key])).append($('<span></span>').text(current || 'Все')).append(' ⌄');
            bar.append(control);
        });
        if (countFilters()) bar.append(button('Сбросить', 'reset-filters', function () { selection = {}; render(); }));
        if (mode === 'streams') bar.append(button('Сортировка ⌄', 'sort', function () {
            choose('Сортировка', [{ title: 'Как у источника', value: 'source' }, { title: 'Качество: выше', value: 'quality' }, { title: 'Размер: меньше', value: 'size' }], function (item) { order = item.value; render(); });
        }));
        header.append(bar);
    }
    function episodeList() {
        if (initializing) { loading(); return; }
        if (!episodes.length) { empty(errors[metadataError] || 'Список серий пока недоступен', loadEpisodes); return; }
        var last = history.last();
        if (last && last.season === season && episodes.some(function (item) { return item.episode_number === last.episode; })) {
            var saved = history.timeline(last.season, last.episode);
            scroll.append(button('Последняя серия: ' + last.episode + (saved.time && saved.percent < 90 ? ' · продолжить с ' + Lampa.Utils.secondsToTime(saved.time) : ''), 'resume-episode', function () { episode = last.episode; beginStreams(); }));
        }
        episodes.forEach(function (item) {
            var row = $('<div class="selector dbr3-episode"></div>');
            var preview = image(item.still_path);
            var picture = $('<div class="dbr3-preview"></div>');
            if (preview) {
                var img = $('<img alt="">').attr('src', preview).on('error', function () { $(this).remove(); picture.text('Нет превью'); });
                picture.append(img);
            } else picture.text('Нет превью');
            row.append(picture);
            var content = $('<div class="dbr3-episode-copy"></div>');
            content.append($('<small></small>').text(item.episode_number + ' серия' + (item.runtime ? ' · ' + item.runtime + ' мин' : '')));
            content.append($('<strong></strong>').text(item.name || 'Серия ' + item.episode_number));
            content.append($('<p></p>').text(item.overview || 'Описание отсутствует'));
            var progress = history.timeline(season, item.episode_number);
            if (progress.percent > 0) {
                content.append($('<small></small>').text(progress.percent >= 90 ? 'Просмотрено' : 'Просмотрено ' + Math.round(progress.percent) + '% · ' + Lampa.Utils.secondsToTime(progress.time)));
            }
            content.append(Lampa.Timeline.render(progress));
            row.append(content).append('<span class="dbr3-enter">Выбрать поток ›</span>');
            scroll.append(bind(row, 'episode-' + item.episode_number, function () { episode = item.episode_number; beginStreams(); }));
        });
    }
    function renderSources() {
        side.empty();
        providers.filter(function (item) { return item.id === 'aio' || (item.state === 'ready' && item.rows.length > 0); }).forEach(function (item) {
            var current = DbrCore.select(item.rows, selection).length;
            var label = item.state === 'ready' ? current + (countFilters() ? '/' + item.rows.length : '') : item.state === 'loading' || item.state === 'queued' ? '…' : '—';
            var node = button('', 'source-' + item.id, function () { nextRequest = undefined; selectedProvider = item.id; render(); }, 'dbr3-source');
            node.toggleClass('selected', item.id === selectedProvider);
            node.append($('<span></span>').text(item.name)).append($('<b></b>').text(label));
            node.append($('<small></small>').text(item.error ? errors[item.error] || 'Не удалось загрузить' : item.state === 'ready' && !item.rows.length ? 'Потоков нет' : item.id === 'aio' ? 'Stremio / Debrid' : 'Онлайн'));
            side.append(node);
        });
        if (providers.some(function (item) { return item.id !== 'aio' && (item.state === 'queued' || item.state === 'loading'); })) side.append($('<p class="dbr3-loading"></p>').text('Проверяем другие источники…'));
        if (discoveryError) side.append($('<p class="dbr3-source-error"></p>').text('Сервер балансеров: ' + (errors[discoveryError] || 'ошибка')));
    }
    function streamList() {
        var source = provider();
        if (!source) { loading(); return; }
        if (source.state === 'loading' || source.state === 'queued') { loading(); return; }
        if (source.error) empty(errors[source.error] || 'Источник недоступен', function () { fetchProvider(source); });
        else if (!source.rows.length) empty('В ' + source.name + ' потоков нет. Выберите другой источник слева.', function () { fetchProvider(source); });
        else if (!filtered().length) {
            empty('Потоки найдены, но не подходят под выбранные фильтры.');
            scroll.append(button('Сбросить фильтры', 'clear', function () { selection = {}; render(); }));
        } else {
            scroll.append($('<div class="dbr3-count"></div>').text(source.name + ' · показано ' + filtered().length + ' из ' + source.rows.length));
            if (source.voices && source.voices.length) {
                scroll.append(button('Перевод источника: ' + (source.voiceName || 'текущий') + ' ⌄', 'source-voice', function () {
                    choose('Перевод источника', source.voices.map(function (item) { return { title: item.name || item.title || 'Перевод', url: item.url }; }), function (item) {
                        source.voiceUrl = item.url;
                        source.voiceName = item.title;
                        fetchProvider(source);
                    });
                }));
            }
            filtered().forEach(function (row) {
                var item = $('<div class="selector dbr3-stream"></div>');
                item.append($('<div class="dbr3-quality"></div>').text(DbrCore.label('quality', row.quality)));
                var details = $('<div class="dbr3-stream-copy"></div>');
                var audio = row.audio.map(function (value) { return DbrCore.label('audio', value); }).join(' + ') || 'Язык не указан';
                details.append($('<strong></strong>').text(audio + (row.voice.length ? ' · ' + row.voice.join(', ') : '')));
                details.append($('<small></small>').text([row.codec, row.range.join(' / '), row.source].filter(Boolean).join(' · ')));
                details.append($('<p></p>').text(row.title));
                details.append($('<small></small>').text('CC · ' + DbrCore.values(row, 'subtitles').map(function (value) { return DbrCore.label('subtitles', value); }).join(', ')));
                item.append(details);
                item.append($('<div class="dbr3-size"></div>').text(row.size === undefined ? '—' : row.size.toFixed(2) + ' ГБ').append($('<small></small>').text(row.external && !row.url ? 'Веб-страница' : row.cached ? 'В кэше RD' : '')));
                bind(item, 'stream-' + row.id, function () { play(row); });
                item.on('hover:long', function () {
                    choose('Информация о потоке', [{ title: row.title, subtitle: row.source, detail: true }, { title: 'Смотреть', play: true }], function (value) { if (value.play) play(row); else self.start(); });
                });
                scroll.append(item);
            });
        }
        if (source.error || !source.rows.length) providers.filter(function (item) { return item.id !== source.id && item.rows.length; }).forEach(function (item) {
            scroll.append(button('Найдено в ' + item.name + ' · ' + item.rows.length + ' потоков', 'alternative-' + item.id, function () { selectedProvider = item.id; render(); }));
        });
    }
    function render() {
        if (dead) return;
        header.empty().append($('<h2></h2>').text(title()));
        addFilterHeader();
        scroll.clear();
        side.toggle(mode === 'streams');
        layout.toggleClass('dbr3-with-sources', mode === 'streams');
        if (mode === 'episodes') episodeList();
        else { renderSources(); streamList(); }
        if (self.activity) self.activity.loader(false);
        self.start(true);
    }
    function fetchProvider(source, done) {
        source.state = 'loading';
        source.error = '';
        render();
        function finish(error, data, voices) {
            source.error = error;
            source.state = error ? 'error' : 'ready';
            source.rows = data || [];
            source.voices = voices || [];
            render();
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
                if (candidate) play(candidate, wanted.quality);
                else if (!error) Lampa.Noty.show('Выберите поток следующей серии');
            }
            if (done) done();
        }
        if (source.id === 'aio') api.aio(season, episode, finish);
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
        api.providers(function (error, list) {
            discoveryError = error;
            list.forEach(function (source) { if (nextRequest && source.name === nextRequest.sourceName) selectedProvider = source.id; source.state = 'queued'; source.rows = []; providers.push(source); pendingProviders.push(source); });
            render();
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
        Lampa.Noty.show(errors[error] || 'Не удалось получить видео');
        render();
    }
    function play(row, preferredQuality) {
        if (!row.url) { Lampa.Noty.show(row.external ? 'Источник вернул веб-страницу вместо прямого видео' : 'Прямая ссылка на видео отсутствует'); return; }
        var request = ++playbackRequest;
        api.resolveStream(row, function (error, stream) {
            if (request !== playbackRequest || dead) return;
            if (error) { playbackFailed(row, error); return; }
            var qualities = stream.quality || stream.qualitys || {};
            function launch(url, chosenQuality) {
                url = DbrCore.httpUrl(String(url || '').split(' or ')[0]);
                if (!url) { Lampa.Noty.show('Прямая ссылка на видео отсутствует'); return; }
                var timeline = history.timeline(season, episode);
                var player = { title: title() + (DbrCore.type(movie) === 'series' ? ' · S' + season + 'E' + episode : ''), url: url, card: movie, timeline: timeline, quality: qualities };
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
                if (Array.isArray(stream.subtitles)) player.subtitles = stream.subtitles.filter(function (sub) { return DbrCore.httpUrl(sub.url); }).map(function (sub) { return { label: sub.label || sub.title || sub.lang || 'Субтитры', url: sub.url }; });
                if (DbrCore.type(movie) === 'series') { player.season = season; player.episode = episode; }
                if (stream.hls_manifest_timeout) player.hls_manifest_timeout = stream.hls_manifest_timeout;
                if (stream.segments) player.segments = stream.segments;
                lastPlayback = { season: season, episode: episode, sourceName: provider().name, voiceName: provider().voiceName, row: row, quality: chosenQuality };
                history.save(season, episode);
                clearInterval(progressTimer);
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
            var keys = Object.keys(qualities).filter(function (key) { return DbrCore.httpUrl(String(qualities[key]).split(' or ')[0]); });
            if (preferredQuality && qualities[preferredQuality]) launch(qualities[preferredQuality], preferredQuality);
            else if (row.method === 'call' && keys.length > 1) choose('Качество', keys.map(function (key) { return { title: key, url: qualities[key] }; }), function (item) { launch(item.url, item.title); });
            else launch(row.method === 'call' ? stream.url : row.url);
        });
    }
    this.create = function () {
        if (!$('#dbr3-style').length) $('head').append($('<style id="dbr3-style"></style>').text(DbrStyles));
        files.render().addClass('dbr3');
        layout.append(side).append(scroll.render());
        files.appendHead(header);
        files.appendFiles(layout);
        scroll.minus(header);
        render();
        api.resolveMovie(function (error) {
            metadataError = error;
            seasons = Array.isArray(movie.seasons) ? movie.seasons.filter(function (item) { return typeof item.season_number === 'number'; }) : [];
            if (!seasons.length && movie.number_of_seasons) {
                for (var n = 1; n <= movie.number_of_seasons; n++) seasons.push({ season_number: n, name: 'Сезон ' + n });
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
        if (dead || !self.activity) return;
        var active = Lampa.Activity.active && Lampa.Activity.active();
        if (active && active.activity !== self.activity) return;
        if (Lampa.Player.opened && Lampa.Player.opened()) return;
        var current = Lampa.Controller.enabled && Lampa.Controller.enabled();
        var controllerName = typeof current === 'string' ? current : current && current.name;
        var takeFocus = !passive || !controllerName || ['content', 'activity', 'loading'].indexOf(controllerName) !== -1;
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
            left: function () { if (Navigator.canmove('left')) Navigator.move('left'); else Lampa.Controller.toggle('menu'); },
            right: function () { if (Navigator.canmove('right')) Navigator.move('right'); else filterMenu(); },
            up: function () { if (Navigator.canmove('up')) Navigator.move('up'); else filterMenu(); },
            down: function () { if (Navigator.canmove('down')) Navigator.move('down'); },
            back: function () { self.back(); }
        });
        if (takeFocus && !$('body').hasClass('selectbox--open')) Lampa.Controller.toggle('content');
    };
    this.back = function () {
        if (mode === 'streams' && DbrCore.type(movie) === 'series') { api.cancel(); mode = 'episodes'; lastKey = 'episode-' + episode; render(); }
        else Lampa.Activity.backward();
    };
    this.render = function () { return files.render(); };
    this.destroy = function () { dead = true; clearInterval(progressTimer); api.cancel(); scroll.destroy(); files.destroy(); pendingProviders = []; };
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
                var btnShort = $(buttonHtml.replace('#{title_key}', Lampa.Lang.translate('debrid_title_short')));
                var btnFull = $(buttonHtml.replace('#{title_key}', Lampa.Lang.translate('debrid_title')));

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
            index: 10 + index, // Start after Trakt rows (index 1-2) and standard Lampa rows
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

    function findNextEpisode(history, movie) {
        if (!history || !history.length) return null;

        // Build a set of watched episodes: "S:E"
        var watchedSet = {};
        history.forEach(function (h) {
            if (h.episode && h.episode.season && h.episode.number) {
                var key = h.episode.season + ':' + h.episode.number;
                watchedSet[key] = true;
            }
        });

        console.log('AIOStreams: Watched episodes:', Object.keys(watchedSet).length);

        // Get available seasons from movie data
        var seasons = movie.seasons || [];
        var totalSeasons = movie.number_of_seasons || seasons.length || 1;

        // Find first unwatched episode (iterate through seasons/episodes)
        for (var s = 1; s <= totalSeasons; s++) {
            var seasonData = seasons.find(function (sd) { return sd.season_number === s; });
            var episodeCount = (seasonData && seasonData.episode_count) || 20;

            for (var e = 1; e <= episodeCount; e++) {
                var key = s + ':' + e;
                if (!watchedSet[key]) {
                    console.log('AIOStreams: Next unwatched episode: S' + s + 'E' + e);
                    return { season: s, episode: e };
                }
            }
        }

        console.log('AIOStreams: All episodes watched or no data');
        return null;
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
