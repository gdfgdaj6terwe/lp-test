/**
 * TraktTV Extended Lists - Lampa Plugin
 * Version: 1.1.0
 *
 * Adds Watchlist and Liked Lists rows to main page
 * Reorders Trakt rows to top
 * Requires: trakttv.js plugin
 */

(function () {
    'use strict';

    var PLUGIN_NAME = 'trakttv-extended-lists';
    var PLUGIN_VERSION = '1.1.0';

    // SVG Icons
    var TRAKT_ICON = '<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 239 239" style="enable-background:new 0 0 239 239;" xml:space="preserve"> <style type="text/css"> .st0{fill:#ED1C24;} .st1{fill:#FFFFFF;} </style> <circle class="st0" cx="119.5" cy="119.5" r="119.5"/> <path class="st1" d="M49.6,113.6L48,115.2c-2.4,2.4-2.4,6.4,0,8.8l11.3,11.3l15.7,15.7l49.7,49.6c2.4,2.4,6.4,2.4,8.8,0l4.9-4.9 L52.4,109C50.1,111,49.6,113.6,49.6,113.6z"/> <polygon class="st1" points="191,115.7 191,115.6 191,115.6 118.6,43.4 103,59 103.1,59 157.5,113.4 79.5,113.4 79.5,127.5 171.5,127.5 171.5,127.5 79,220 93.3,234.3 189.6,138 191.6,135.9 "/> <polygon class="st1" points="62.9,135.1 74.5,146.7 109,182.2 123.3,196.5 189.5,130.4 175.2,116.1 118.8,172.5 75.5,129.2 62.9,116.6 "/> </svg>';

    // Styles
    var LINE_TITLE_STYLE = 'display:inline-flex; align-items:center; gap:.4em;';
    var LINE_ICON_STYLE = 'width:1em; height:1em; display:inline-block;';

    // ==================== UTILITIES ====================

    function getApi() {
        return window.TraktTV && window.TraktTV.api ? window.TraktTV.api : null;
    }

    function isLoggedIn() {
        return !!Lampa.Storage.get('trakt_token');
    }

    /**
     * Create title as DOM element (Fixes HTML escaping issue)
     */
    function createLineTitle(text) {
        var root = document.createElement('span');
        root.className = 'trakt-line-title';
        root.setAttribute('style', LINE_TITLE_STYLE);

        var iconWrap = document.createElement('span');
        iconWrap.className = 'trakt-line-title__icon';
        iconWrap.setAttribute('style', LINE_ICON_STYLE);
        iconWrap.innerHTML = TRAKT_ICON.replace('<svg ', '<svg style="width:100%; height:100%; display:block;" ');

        var label = document.createElement('span');
        label.textContent = text;

        root.appendChild(iconWrap);
        root.appendChild(label);

        return root;
    }

    /**
     * Normalize content data
     */
    function normalizeContentData(items) {
        return items.map(function (item) {
            var normalized = Object.assign({}, item);
            var contentType = item.method || item.type || item.card_type || (item.name ? 'tv' : 'movie');

            if (contentType === 'tv' || contentType === 'show') {
                normalized.name = item.title || item.original_title;
                normalized.first_air_date = item.release_date;
                normalized.type = 'tv';
                normalized.card_type = 'tv';
            }

            if (contentType === 'movie') {
                delete normalized.name;
                normalized.release_date = item.release_date;
                normalized.title = item.title || item.original_title;
                normalized.type = 'movie';
                normalized.card_type = 'movie';
            }

            normalized.params = {
                emit: {
                    onlyEnter: function () {
                        var fixedMethod = normalized.method || normalized.card_type || normalized.type;
                        Lampa.Activity.push({
                            url: this.data && this.data.url || normalized.url,
                            component: 'full',
                            id: normalized.id,
                            method: fixedMethod,
                            card: normalized,
                            source: normalized.source || 'tmdb'
                        });
                    }
                }
            };

            return normalized;
        });
    }

    // ==================== TRANSLATIONS ====================

    function addTranslations() {
        Lampa.Lang.add({
            trakttv_watchlist_row: {
                ru: 'Список желаний',
                en: 'Watchlist',
                uk: 'Список бажань'
            },
            trakttv_liked_lists_row: {
                ru: 'Понравившиеся списки',
                en: 'Liked Lists',
                uk: 'Вподобані списки'
            }
        });
    }

    // ==================== CONTENT ROWS ====================

    function registerWatchlistRow() {
        Lampa.ContentRows.add({
            name: 'TraktWatchlistRow',
            title: 'Trakt Watchlist',
            index: 1.3,
            screen: ['main'],
            call: function (params, screen) {
                if (!isLoggedIn()) return;

                return function (call) {
                    var Api = getApi();
                    if (!Api) return call();

                    Api.watchlist({ limit: 20, page: 1 }).then(function (data) {
                        if (!data || !Array.isArray(data.results) || data.results.length === 0) return call();

                        call({
                            title: createLineTitle(Lampa.Lang.translate('trakttv_watchlist_row')),
                            results: normalizeContentData(data.results),
                            onMore: function () {
                                Lampa.Activity.push({
                                    title: Lampa.Lang.translate('trakttv_watchlist_row'),
                                    component: 'trakt_watchlist',
                                    page: 1
                                });
                            }
                        });
                    }).catch(function () { call(); });
                };
            }
        });
    }

    function registerLikedListsRow() {
        Lampa.ContentRows.add({
            name: 'TraktLikedListsRow',
            title: 'Trakt Liked Lists',
            index: 1.6,
            screen: ['main'],
            call: function (params, screen) {
                if (!isLoggedIn()) return;

                return function (call) {
                    var Api = getApi();
                    if (!Api) return call();

                    Api.likesLists({ limit: 5, page: 1 }).then(function (listsData) {
                        if (!listsData || !Array.isArray(listsData.results) || listsData.results.length === 0) return call();

                        var listId = listsData.results[0].id;
                        if (!listId) return call();

                        return Api.list({ id: listId, limit: 20, page: 1 }).then(function (listContent) {
                            if (!listContent || !Array.isArray(listContent.results) || listContent.results.length === 0) return call();

                            call({
                                title: createLineTitle(Lampa.Lang.translate('trakttv_liked_lists_row')),
                                results: normalizeContentData(listContent.results),
                                onMore: function () {
                                    Lampa.Activity.push({
                                        title: Lampa.Lang.translate('trakttv_liked_lists_row'),
                                        component: 'trakt_lists',
                                        page: 1
                                    });
                                }
                            });
                        });
                    }).catch(function () { call(); });
                };
            }
        });
    }

    // ==================== REORDERING LOGIC ====================

    var reorderTimer = null;

    /**
     * Finds and moves Trakt rows to the top of scroll__body
     */
    function reorderTraktRows() {
        var container = $('.scroll__body');
        if (!container.length) return;

        // Target titles in order (bottom to top for prepending)
        // Order we want at TOP: Up Next, Watchlist, Liked Lists, Recommendations
        // So we prepend Recommendations first (it goes to top), then Watchlist, then Liked Lists.
        var targets = [
            Lampa.Lang.translate('trakttv_upnext'),
            Lampa.Lang.translate('trakttv_watchlist_row'),
            Lampa.Lang.translate('trakttv_liked_lists_row'),
            Lampa.Lang.translate('trakttv_recommendations')
        ];

        var rows = container.children();

        targets.forEach(function (targetTitle) {
            // Find row containing the title
            var row = rows.filter(function () {
                var text = $(this).text();
                return text.indexOf(targetTitle) !== -1;
            });

            if (row.length) {
                // Move to top
                container.prepend(row);
                // console.log('TraktTV Extended Lists', 'Moved row to top:', targetTitle);
            }
        });
    }

    function startReorderService() {
        if (reorderTimer) clearInterval(reorderTimer);

        // Check every 500ms for 5 seconds after main page load
        var attempts = 0;
        reorderTimer = setInterval(function () {
            reorderTraktRows();
            attempts++;
            if (attempts > 10) clearInterval(reorderTimer);
        }, 500);
    }

    // ==================== INITIALIZATION ====================

    function initPlugin() {
        addTranslations();
        registerContentRows();

        // Listen for main page render to trigger reordering
        Lampa.Listener.follow('main', function (e) {
            if (e.type === 'complite') {
                startReorderService();
            }
        });

        // Also try immediately if main is already active
        if (Lampa.Activity.active() && Lampa.Activity.active().component === 'main') {
            startReorderService();
        }
    }

    function registerContentRows() {
        if (!getApi()) {
            setTimeout(registerContentRows, 500);
            return;
        }
        registerWatchlistRow();
        registerLikedListsRow();
    }

    // ==================== ENTRY POINT ====================

    if (window.appready) {
        if (!window.plugin_trakttv_extended_lists_ready) {
            window.plugin_trakttv_extended_lists_ready = true;
            initPlugin();
        }
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready' && !window.plugin_trakttv_extended_lists_ready) {
                window.plugin_trakttv_extended_lists_ready = true;
                initPlugin();
            }
        });
    }

})();
