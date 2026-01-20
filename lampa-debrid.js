/**
 * Lampa Real Debrid Plugin (Comet/Torrentino)
 * Version: 1.0.0
 *
 * Плагин для интеграции Stremio аддонов (Comet, Torrentino) с Real Debrid в Lampa
 *
 * Установка:
 * 1. Добавь URL этого плагина в настройки Lampa
 * 2. Перейди в Настройки -> Real Debrid
 * 3. Введи URL манифеста от Comet или Torrentino
 *
 * Получение URL манифеста:
 * - Comet: https://comet.elfhosted.com/ -> настрой и скопируй "Install" ссылку
 * - Torrentino: аналогично, скопируй manifest URL
 */

(function () {
    'use strict';

    var PLUGIN_NAME = 'debrid_streams';
    var PLUGIN_VERSION = '1.0.0';
    var PLUGIN_TITLE = 'Real Debrid';

    // Настройки по умолчанию
    var DEFAULT_SETTINGS = {
        comet_url: '',      // URL манифеста Comet
        torrentio_url: '',  // URL манифеста Torrentio
        timeout: 15000      // Таймаут запросов
    };

    // ==================== УТИЛИТЫ ====================

    /**
     * Извлечь base URL из manifest URL
     * Пример: https://comet.elfhosted.com/ABC123/manifest.json -> https://comet.elfhosted.com/ABC123
     */
    function extractBaseUrl(manifestUrl) {
        if (!manifestUrl) return '';
        var url = manifestUrl.trim();
        // Убираем /manifest.json если есть
        url = url.replace(/\/manifest\.json\/?$/i, '');
        // Убираем trailing slash
        url = url.replace(/\/$/, '');
        return url;
    }

    /**
     * Определить тип контента
     */
    function getContentType(movie) {
        if (movie.number_of_seasons || movie.seasons) return 'series';
        if (movie.first_air_date) return 'series';
        return 'movie';
    }

    /**
     * Получить IMDb ID
     */
    function getImdbId(movie) {
        return movie.imdb_id || '';
    }

    /**
     * Форматировать размер файла
     */
    function formatSize(bytes) {
        if (!bytes) return '';
        var gb = bytes / (1024 * 1024 * 1024);
        if (gb >= 1) return gb.toFixed(2) + ' GB';
        var mb = bytes / (1024 * 1024);
        return mb.toFixed(0) + ' MB';
    }

    /**
     * Парсить название стрима для отображения
     */
    function parseStreamTitle(stream) {
        var title = stream.title || stream.name || 'Unknown';

        // Извлекаем качество
        var quality = '';
        var qualityMatch = title.match(/\b(4K|2160p|1080p|720p|480p|HDR|DV|Dolby Vision)\b/i);
        if (qualityMatch) quality = qualityMatch[1].toUpperCase();

        // Извлекаем размер
        var size = '';
        var sizeMatch = title.match(/(\d+\.?\d*)\s*(GB|MB)/i);
        if (sizeMatch) size = sizeMatch[1] + ' ' + sizeMatch[2].toUpperCase();

        // Извлекаем кодек
        var codec = '';
        var codecMatch = title.match(/\b(HEVC|H\.?265|H\.?264|x265|x264|AV1)\b/i);
        if (codecMatch) codec = codecMatch[1].toUpperCase();

        // Извлекаем аудио
        var audio = '';
        var audioMatch = title.match(/\b(Atmos|DTS-HD|DTS|TrueHD|DD\+?5\.1|AAC|AC3)\b/i);
        if (audioMatch) audio = audioMatch[1];

        return {
            full: title,
            quality: quality,
            size: size,
            codec: codec,
            audio: audio
        };
    }

    // ==================== ИСТОЧНИК COMET ====================

    function CometSource(component, _object) {
        var network = new Lampa.Reguest();
        var object = _object;
        var streams_data = [];
        var filter_items = {};
        var choice = {
            quality: 0
        };

        /**
         * Получить base URL из настроек
         */
        function getBaseUrl() {
            var url = Lampa.Storage.get('debrid_comet_url', '');
            return extractBaseUrl(url);
        }

        /**
         * Построить URL для запроса стримов
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
         * Поиск стримов
         */
        this.search = function (_object, kinopoisk_id) {
            object = _object;
            var imdbId = getImdbId(object.movie);
            var type = getContentType(object.movie);

            if (!getBaseUrl()) {
                component.emptyForQuery('Comet URL не настроен. Перейдите в Настройки -> Real Debrid');
                return;
            }

            if (!imdbId) {
                component.emptyForQuery('IMDb ID не найден для этого контента');
                return;
            }

            // Для сериалов нужно выбрать сезон/эпизод
            if (type === 'series') {
                showSeasonSelect(imdbId);
            } else {
                fetchStreams(imdbId, 'movie');
            }
        };

        /**
         * Показать выбор сезона для сериалов
         */
        function showSeasonSelect(imdbId) {
            var seasons = object.movie.number_of_seasons || object.movie.seasons?.length || 1;
            var items = [];

            for (var s = 1; s <= seasons; s++) {
                items.push({
                    title: 'Сезон ' + s,
                    season: s,
                    imdb_id: imdbId
                });
            }

            filter_items.season = items.map(function(i) { return i.title; });

            component.reset();
            component.loading(false);

            items.forEach(function (item) {
                var element = Lampa.Template.get('onlines_item', {
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
         * Показать выбор эпизода
         */
        function showEpisodeSelect(imdbId, season) {
            var seasonData = object.movie.seasons?.find(function(s) {
                return s.season_number === season;
            });
            var episodes = seasonData?.episode_count || 20;
            var items = [];

            for (var e = 1; e <= episodes; e++) {
                items.push({
                    title: 'Эпизод ' + e,
                    season: season,
                    episode: e,
                    imdb_id: imdbId
                });
            }

            component.reset();
            component.loading(false);

            items.forEach(function (item) {
                var element = Lampa.Template.get('onlines_item', {
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
         * Получить стримы с API
         */
        function fetchStreams(imdbId, type, season, episode) {
            var url = buildStreamUrl(imdbId, type, season, episode);
            if (!url) {
                component.emptyForQuery('Ошибка построения URL');
                return;
            }

            component.loading(true);
            network.clear();
            network.timeout(Lampa.Storage.get('debrid_timeout', DEFAULT_SETTINGS.timeout));

            network.silent(url, function (response) {
                component.loading(false);

                if (response && response.streams && response.streams.length > 0) {
                    streams_data = response.streams;
                    displayStreams(streams_data);
                } else {
                    component.emptyForQuery('Стримы не найдены');
                }
            }, function (error) {
                component.loading(false);
                component.emptyForQuery('Ошибка загрузки: ' + (error.statusText || 'Unknown'));
            });
        }

        /**
         * Отобразить список стримов
         */
        function displayStreams(streams) {
            component.reset();

            // Группируем по качеству
            var qualities = {};
            streams.forEach(function (stream, index) {
                var parsed = parseStreamTitle(stream);
                var q = parsed.quality || 'Unknown';
                if (!qualities[q]) qualities[q] = [];
                qualities[q].push({ stream: stream, index: index, parsed: parsed });
            });

            filter_items.quality = Object.keys(qualities);

            // Сортируем по качеству
            var qualityOrder = ['4K', '2160P', '1080P', '720P', '480P', 'UNKNOWN'];
            var sortedQualities = Object.keys(qualities).sort(function(a, b) {
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

                    var info = [parsed.quality, parsed.codec, parsed.size, parsed.audio]
                        .filter(Boolean)
                        .join(' • ');

                    var element = Lampa.Template.get('onlines_item', {
                        title: stream.title || stream.name || 'Stream ' + (item.index + 1),
                        info: info || 'Real Debrid'
                    });

                    // Добавляем иконку качества
                    if (parsed.quality) {
                        element.find('.online__quality').text(parsed.quality);
                    }

                    element.on('hover:enter', function () {
                        playStream(stream);
                    });

                    // Долгое нажатие - показать детали
                    element.on('hover:long', function () {
                        showStreamDetails(stream, parsed);
                    });

                    component.append(element);
                });
            });

            component.start(true);
        }

        /**
         * Воспроизвести стрим
         */
        function playStream(stream) {
            var url = stream.url;

            if (!url) {
                Lampa.Noty.show('URL стрима не найден');
                return;
            }

            // Некоторые стримы могут быть в формате behaviorHints
            if (stream.behaviorHints && stream.behaviorHints.proxyHeaders) {
                // Обработка заголовков прокси если нужно
            }

            var title = object.movie.title || object.movie.name || 'Video';
            var parsed = parseStreamTitle(stream);

            Lampa.Player.play({
                title: title + (parsed.quality ? ' [' + parsed.quality + ']' : ''),
                url: url,
                timeline: object.movie
            });

            // Отмечаем как просмотренное
            Lampa.Timeline.update(object.movie);
        }

        /**
         * Показать детали стрима
         */
        function showStreamDetails(stream, parsed) {
            var items = [];

            items.push({
                title: 'Воспроизвести',
                subtitle: stream.url ? 'Открыть в плеере' : 'URL недоступен',
                action: function() {
                    Lampa.Modal.close();
                    playStream(stream);
                }
            });

            if (stream.url) {
                items.push({
                    title: 'Копировать URL',
                    subtitle: 'Скопировать ссылку в буфер',
                    action: function() {
                        Lampa.Utils.copyTextToClipboard(stream.url, function() {
                            Lampa.Noty.show('URL скопирован');
                        }, function() {
                            Lampa.Noty.show('Ошибка копирования');
                        });
                        Lampa.Modal.close();
                    }
                });
            }

            items.push({
                title: 'Информация',
                subtitle: parsed.full,
                action: function() {
                    Lampa.Modal.close();
                }
            });

            Lampa.Select.show({
                title: 'Действия',
                items: items,
                onSelect: function(item) {
                    if (item.action) item.action();
                },
                onBack: function() {
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
                var filtered = streams_data.filter(function(stream) {
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

    // ==================== ИСТОЧНИК TORRENTIO ====================

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
                component.emptyForQuery('Torrentio URL не настроен. Перейдите в Настройки -> Real Debrid');
                return;
            }

            if (!imdbId) {
                component.emptyForQuery('IMDb ID не найден для этого контента');
                return;
            }

            if (type === 'series') {
                showSeasonSelect(imdbId);
            } else {
                fetchStreams(imdbId, 'movie');
            }
        };

        function showSeasonSelect(imdbId) {
            var seasons = object.movie.number_of_seasons || object.movie.seasons?.length || 1;
            var items = [];

            for (var s = 1; s <= seasons; s++) {
                items.push({
                    title: 'Сезон ' + s,
                    season: s,
                    imdb_id: imdbId
                });
            }

            component.reset();
            component.loading(false);

            items.forEach(function (item) {
                var element = Lampa.Template.get('onlines_item', {
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
            var seasonData = object.movie.seasons?.find(function(s) {
                return s.season_number === season;
            });
            var episodes = seasonData?.episode_count || 20;
            var items = [];

            for (var e = 1; e <= episodes; e++) {
                items.push({
                    title: 'Эпизод ' + e,
                    season: season,
                    episode: e,
                    imdb_id: imdbId
                });
            }

            component.reset();
            component.loading(false);

            items.forEach(function (item) {
                var element = Lampa.Template.get('onlines_item', {
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
                component.emptyForQuery('Ошибка построения URL');
                return;
            }

            component.loading(true);
            network.clear();
            network.timeout(Lampa.Storage.get('debrid_timeout', DEFAULT_SETTINGS.timeout));

            network.silent(url, function (response) {
                component.loading(false);

                if (response && response.streams && response.streams.length > 0) {
                    streams_data = response.streams;
                    displayStreams(streams_data);
                } else {
                    component.emptyForQuery('Стримы не найдены');
                }
            }, function (error) {
                component.loading(false);
                component.emptyForQuery('Ошибка загрузки: ' + (error.statusText || 'Unknown'));
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

            var qualityOrder = ['4K', '2160P', '1080P', '720P', '480P', 'UNKNOWN'];
            var sortedQualities = Object.keys(qualities).sort(function(a, b) {
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

                    var info = [parsed.quality, parsed.codec, parsed.size, parsed.audio]
                        .filter(Boolean)
                        .join(' • ');

                    var element = Lampa.Template.get('onlines_item', {
                        title: stream.title || stream.name || 'Stream ' + (item.index + 1),
                        info: info || 'Real Debrid'
                    });

                    if (parsed.quality) {
                        element.find('.online__quality').text(parsed.quality);
                    }

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
            var url = stream.url;

            if (!url) {
                Lampa.Noty.show('URL стрима не найден');
                return;
            }

            var title = object.movie.title || object.movie.name || 'Video';
            var parsed = parseStreamTitle(stream);

            Lampa.Player.play({
                title: title + (parsed.quality ? ' [' + parsed.quality + ']' : ''),
                url: url,
                timeline: object.movie
            });

            Lampa.Timeline.update(object.movie);
        }

        function showStreamDetails(stream, parsed) {
            var items = [];

            items.push({
                title: 'Воспроизвести',
                subtitle: stream.url ? 'Открыть в плеере' : 'URL недоступен',
                action: function() {
                    Lampa.Modal.close();
                    playStream(stream);
                }
            });

            if (stream.url) {
                items.push({
                    title: 'Копировать URL',
                    subtitle: 'Скопировать ссылку в буфер',
                    action: function() {
                        Lampa.Utils.copyTextToClipboard(stream.url, function() {
                            Lampa.Noty.show('URL скопирован');
                        }, function() {
                            Lampa.Noty.show('Ошибка копирования');
                        });
                        Lampa.Modal.close();
                    }
                });
            }

            Lampa.Select.show({
                title: 'Действия',
                items: items,
                onSelect: function(item) {
                    if (item.action) item.action();
                },
                onBack: function() {
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
                var filtered = streams_data.filter(function(stream) {
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

    // ==================== ОСНОВНОЙ КОМПОНЕНТ ====================

    function DebridComponent(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);

        var sources = [];
        var active_source = null;
        var balanser = Lampa.Storage.get('debrid_source', 'comet');

        var filter_translate = {
            source: 'Источник',
            quality: 'Качество'
        };

        // Инициализация источников
        var comet_url = Lampa.Storage.get('debrid_comet_url', '');
        var torrentio_url = Lampa.Storage.get('debrid_torrentio_url', '');

        if (comet_url) {
            sources.push({
                name: 'comet',
                title: 'Comet',
                source: new CometSource(this, object)
            });
        }

        if (torrentio_url) {
            sources.push({
                name: 'torrentio',
                title: 'Torrentio',
                source: new TorrentioSource(this, object)
            });
        }

        // Если нет настроенных источников
        if (sources.length === 0) {
            sources.push({
                name: 'comet',
                title: 'Comet',
                source: new CometSource(this, object)
            });
        }

        // Найти активный источник
        active_source = sources.find(function(s) { return s.name === balanser; }) || sources[0];

        var filter_items = {
            source: sources.map(function(s) { return s.title; })
        };

        var choice = {
            source: sources.findIndex(function(s) { return s.name === balanser; })
        };
        if (choice.source < 0) choice.source = 0;

        this.create = function () {
            var _this = this;

            this.activity.loader(true);

            scroll.minus();
            scroll.body().addClass('torrent-list');

            filter.onSelect = function (type, a, b) {
                if (a.stype === 'source') {
                    choice.source = b.index;
                    balanser = sources[b.index].name;
                    active_source = sources[b.index];
                    Lampa.Storage.set('debrid_source', balanser);

                    _this.reset();
                    _this.search();
                } else if (active_source && active_source.source) {
                    active_source.source.filter(type, a, b);
                }
            };

            filter.render().find('.filter--sort').remove();

            filter.onBack = function () {
                _this.start();
            };

            filter.onFilter = function (type, a, b) {
                if (active_source && active_source.source) {
                    active_source.source.filter(type, a, b);
                }
            };

            this.search();

            return this.render();
        };

        this.search = function () {
            this.loading(true);
            this.filter();

            var imdb_id = object.movie.imdb_id;
            var kp_id = object.movie.kinopoisk_id || object.movie.kp_id;

            if (active_source && active_source.source) {
                active_source.source.search(object, imdb_id || kp_id);
            } else {
                this.emptyForQuery('Источник не найден');
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

        this.filter = function () {
            filter.set('source', filter_items.source);
            filter.chosen('source', [filter_items.source[choice.source]]);
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
            scroll.clear();

            var empty = $('<div class="empty"><div class="empty__title">' + (message || 'Ничего не найдено') + '</div></div>');
            scroll.append(empty);

            this.start();
        };

        this.append = function (element) {
            element.on('hover:focus', function () {
                scroll.update($(this), true);
            });
            scroll.append(element);
        };

        this.start = function (first_focus) {
            var items = scroll.render().find('.selector');

            if (items.length) {
                Lampa.Controller.add('content', {
                    toggle: function () {
                        Lampa.Controller.collectionSet(scroll.render());
                        Lampa.Controller.collectionFocus(first_focus ? items.first() : false, scroll.render());
                    },
                    left: function () {
                        if (Lampa.Navigator.canmove('left')) {
                            Lampa.Navigator.move('left');
                        } else {
                            Lampa.Controller.toggle('menu');
                        }
                    },
                    right: function () {
                        Lampa.Navigator.move('right');
                    },
                    up: function () {
                        if (Lampa.Navigator.canmove('up')) {
                            Lampa.Navigator.move('up');
                        } else {
                            Lampa.Controller.toggle('head');
                        }
                    },
                    down: function () {
                        Lampa.Navigator.move('down');
                    },
                    back: this.back
                });

                Lampa.Controller.toggle('content');
            } else {
                Lampa.Controller.add('content', {
                    toggle: function () {},
                    left: function () {
                        Lampa.Controller.toggle('menu');
                    },
                    right: function () {},
                    up: function () {
                        Lampa.Controller.toggle('head');
                    },
                    down: function () {},
                    back: this.back
                });

                Lampa.Controller.toggle('content');
            }
        };

        this.back = function () {
            Lampa.Activity.backward();
        };

        this.saveChoice = function (ch) {
            // Сохранение выбора пользователя
        };

        this.render = function () {
            return scroll.render();
        };

        this.destroy = function () {
            network.clear();
            scroll.destroy();

            sources.forEach(function(s) {
                if (s.source && s.source.destroy) {
                    s.source.destroy();
                }
            });
        };
    }

    // ==================== РЕГИСТРАЦИЯ ПЛАГИНА ====================

    function initPlugin() {
        // Добавляем переводы
        Lampa.Lang.add({
            debrid_title: {
                ru: 'Real Debrid',
                en: 'Real Debrid',
                uk: 'Real Debrid'
            },
            debrid_settings_title: {
                ru: 'Настройки Real Debrid',
                en: 'Real Debrid Settings',
                uk: 'Налаштування Real Debrid'
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
                ru: 'Смотреть через Real Debrid',
                en: 'Watch via Real Debrid',
                uk: 'Дивитись через Real Debrid'
            }
        });

        // Добавляем параметры настроек
        Lampa.Params.select('debrid_comet_url', '', '');
        Lampa.Params.select('debrid_torrentio_url', '', '');
        Lampa.Params.select('debrid_source', 'comet', '');

        // Добавляем шаблон настроек
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

        // Добавляем раздел настроек
        function addSettings() {
            if (Lampa.Settings.main && Lampa.Settings.main() && !Lampa.Settings.main().render().find('[data-component="debrid"]').length) {
                var field = $('\
                    <div class="settings-folder selector" data-component="debrid">\
                        <div class="settings-folder__icon">\
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/>\
                            </svg>\
                        </div>\
                        <div class="settings-folder__name">Real Debrid</div>\
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

        // Регистрируем компонент
        Lampa.Component.add(PLUGIN_NAME, DebridComponent);

        // Создаём манифест плагина
        var manifest = {
            type: 'video',
            version: PLUGIN_VERSION,
            name: PLUGIN_TITLE + ' - ' + PLUGIN_VERSION,
            description: Lampa.Lang.translate('debrid_watch'),
            component: PLUGIN_NAME
        };

        // Добавляем кнопку на страницу фильма
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

                    // Проверяем наличие настроек
                    var comet_url = Lampa.Storage.get('debrid_comet_url', '');
                    var torrentio_url = Lampa.Storage.get('debrid_torrentio_url', '');

                    if (!comet_url && !torrentio_url) {
                        Lampa.Noty.show('Настройте URL в Настройки -> Real Debrid');
                        return;
                    }

                    if (!movie.imdb_id) {
                        Lampa.Noty.show('IMDb ID не найден для этого контента');
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

                // Добавляем кнопку после торрентов
                var torrentBtn = e.object.activity.render().find('.view--torrent');
                if (torrentBtn.length) {
                    torrentBtn.after(btn);
                } else {
                    e.object.activity.render().find('.full-start__buttons').append(btn);
                }
            }
        });

        // Слушаем открытие настроек
        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name === 'debrid') {
                // Настройки Real Debrid открыты
            }
        });

        console.log('Real Debrid Plugin', PLUGIN_VERSION, 'loaded');
    }

    // Инициализация
    if (window.appready) {
        initPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') initPlugin();
        });
    }

})();
