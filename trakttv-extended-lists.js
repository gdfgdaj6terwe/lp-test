/**
 * TraktTV Extended Lists - Lampa Plugin
 * Version: 1.2.0
 *
 * Adds Watchlist and Liked Lists rows to main page
 * Reorders Trakt and AIOStreams rows to top
 * Requires: trakttv.js plugin
 */

(function () {
    'use strict';

    var PLUGIN_NAME = 'trakttv-extended-lists';
    var PLUGIN_VERSION = '1.2.0';

    // SVG Icons (from trakttv.js)
    var TRAKT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" id="Layer_2" viewBox="0 0 48 48" fill="currentColor"> <g id="_x2D_-production"> <path id="logomark.square.white" class="cls-1" d="M30.17,30.22l-1.46-1.46,19.16-19.17c-.05-.39-.13-.77-.23-1.15l-20.31,20.33,2.16,2.16-1.46,1.46-3.62-3.62L46.85,6.29c-.15-.3-.31-.6-.5-.88l-23.33,23.35,4.31,4.31-1.46,1.46-14.39-14.4,1.46-1.46,8.62,8.62L45.1,3.72c-2.07-2.29-5.05-3.72-8.37-3.72H11.27C5.05,0,0,5.05,0,11.27v25.48c0,6.22,5.05,11.26,11.27,11.26h25.47c6.22,0,11.27-5.04,11.27-11.26V12.38l-17.83,17.84ZM21.54,25.91l-7.91-7.93,1.46-1.46,7.91,7.92-1.46,1.47ZM23.69,23.74l-7.91-7.92,1.46-1.46,7.92,7.92-1.47,1.46ZM43.4,35.12c0,4.57-3.71,8.28-8.28,8.28H12.88c-4.56,0-8.28-3.71-8.28-8.28V12.88c0-4.57,3.71-8.28,8.28-8.28h20.78v2.08H12.88c-3.42,0-6.2,2.78-6.2,6.2v22.23c0,3.42,2.78,6.21,6.2,6.21h22.24c3.42,0,6.2-2.79,6.2-6.21v-3.51h2.08v3.51Z"/> </g> </svg>';

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
     * Finds and moves Trakt and AIOStreams rows to the top of scroll__body
     */
    function reorderAllRows() {
        var container = $('.scroll__body');
        if (!container.length) return;

        var rows = container.children();

        // 1. Move AIOStreams rows first (so they are below Trakt rows but above others)
        // We prepend them in reverse order of how we want them to appear (bottom to top)
        // AIO rows are dynamic, so we just find them by class 'aiostreams-line-title'
        var aioRows = rows.filter(function () {
            return $(this).find('.aiostreams-line-title').length > 0;
        });

        // Loop through AIO rows in reverse and prepend them
        // This puts the LAST AIO row at the top initially, but subsequent prepends push it down.
        // Wait, prepend inserts at the START.
        // If we want [A, B, C] at top:
        // Prepend C -> [C, ...]
        // Prepend B -> [B, C, ...]
        // Prepend A -> [A, B, C, ...]
        // So we need to prepend in Reverse order (C, B, A).
        // Since `aioRows` comes from `rows` (DOM order), we should reverse it.
        $(aioRows.get().reverse()).each(function () {
            container.prepend($(this));
        });

        // 2. Move Trakt rows (Up Next, Watchlist, Liked, Recs)
        // They should be ABOVE AIO rows.
        // Order we want: Up Next, Watchlist, Liked Lists, Recommendations
        // So we prepend Recs, then Liked, then Watchlist, then Up Next.
        var traktTargets = [
            'trakttv_recommendations', // Recommendations
            'trakttv_liked_lists_row', // Liked Lists
            'trakttv_watchlist_row',   // Watchlist
            'trakttv_upnext'           // Up Next
        ];

        traktTargets.forEach(function (key) {
            var translated = Lampa.Lang.translate(key);
            // Also account for fallback "Up Next" text if translation fails or differs
            // Or try to match by class if possible, but Trakt items-line__title 
            // has .trakt-line-title so we can check that too.
            var row = rows.filter(function () {
                var text = $(this).text();
                // Check if it's a Trakt row (has trakt-line-title class) AND contains text
                // OR just contains the text
                return $(this).text().indexOf(translated) !== -1;
            });

            if (row.length) {
                container.prepend(row);
            }
        });
    }

    function startReorderService() {
        if (reorderTimer) clearInterval(reorderTimer);

        // Check frequently for 15 seconds to catch lazy loaded rows
        var attempts = 0;
        reorderTimer = setInterval(function () {
            reorderAllRows();
            attempts++;
            if (attempts > 30) clearInterval(reorderTimer); // 15 seconds (30 * 500ms)
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
