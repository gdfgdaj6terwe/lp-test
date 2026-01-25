/**
 * TraktTV Extended Lists - Lampa Plugin
 * Version: 1.0.0
 *
 * Adds Watchlist and Liked Lists rows to main page
 * Requires: trakttv.js plugin to be loaded first
 */

(function () {
    'use strict';

    var PLUGIN_NAME = 'trakttv-extended-lists';
    var PLUGIN_VERSION = '1.0.0';

    // Trakt icon (same as in trakttv.js)
    var TRAKT_ICON = '<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 239 239" style="enable-background:new 0 0 239 239;" xml:space="preserve"> <style type="text/css"> .st0{fill:#ED1C24;} .st1{fill:#FFFFFF;} </style> <circle class="st0" cx="119.5" cy="119.5" r="119.5"/> <path class="st1" d="M49.6,113.6L48,115.2c-2.4,2.4-2.4,6.4,0,8.8l11.3,11.3l15.7,15.7l49.7,49.6c2.4,2.4,6.4,2.4,8.8,0l4.9-4.9 L52.4,109C50.1,111,49.6,113.6,49.6,113.6z"/> <polygon class="st1" points="191,115.7 191,115.6 191,115.6 118.6,43.4 103,59 103.1,59 157.5,113.4 79.5,113.4 79.5,127.5 171.5,127.5 171.5,127.5 79,220 93.3,234.3 189.6,138 191.6,135.9 "/> <polygon class="st1" points="62.9,135.1 74.5,146.7 109,182.2 123.3,196.5 189.5,130.4 175.2,116.1 118.8,172.5 75.5,129.2 62.9,116.6 "/> </svg>';

    // ==================== UTILITIES ====================

    /**
     * Get API from TraktTV global
     */
    function getApi() {
        return window.TraktTV && window.TraktTV.api ? window.TraktTV.api : null;
    }

    /**
     * Check if user is logged in to Trakt
     */
    function isLoggedIn() {
        return !!Lampa.Storage.get('trakt_token');
    }

    /**
     * Create line title with Trakt icon
     */
    function createLineTitle(title) {
        return '<span style="display:inline-flex;align-items:center;gap:0.4em;">' +
            '<span style="width:1.1em;height:1.1em;display:inline-block;">' + TRAKT_ICON + '</span>' +
            '<span>' + title + '</span>' +
            '</span>';
    }

    /**
     * Normalize content data for display (same as in trakttv.js)
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

            // Add params.emit for Lampa 3.0+ modular system
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

    /**
     * Register Watchlist content row
     * Shows on: Main screen only
     * Index: 1.3 (after Up Next, before Liked Lists)
     */
    function registerWatchlistRow() {
        Lampa.ContentRows.add({
            name: 'TraktWatchlistRow',
            title: 'Trakt Watchlist',
            index: 1.3,
            screen: ['main'],
            call: function (params, screen) {
                // Check if logged in
                if (!isLoggedIn()) return;

                return function (call) {
                    var Api = getApi();
                    if (!Api) {
                        console.error('TraktTV Extended Lists', 'API not available for Watchlist');
                        return call();
                    }

                    Api.watchlist({
                        limit: 20,
                        page: 1
                    }).then(function (data) {
                        if (!data || !Array.isArray(data.results) || data.results.length === 0) {
                            return call();
                        }

                        // Normalize data for display
                        var normalizedResults = normalizeContentData(data.results);

                        call({
                            title: createLineTitle(Lampa.Lang.translate('trakttv_watchlist_row')),
                            results: normalizedResults,
                            onMore: function () {
                                Lampa.Activity.push({
                                    title: Lampa.Lang.translate('trakttv_watchlist_row'),
                                    component: 'trakt_watchlist',
                                    page: 1
                                });
                            }
                        });
                    }).catch(function (error) {
                        console.error('TraktTV Extended Lists', 'Watchlist load error:', error);
                        call();
                    });
                };
            }
        });
    }

    /**
     * Register Liked Lists content row
     * Shows content from user's liked Trakt lists as standard cards
     * Index: 1.6 (after Watchlist, before Recommendations)
     */
    function registerLikedListsRow() {
        Lampa.ContentRows.add({
            name: 'TraktLikedListsRow',
            title: 'Trakt Liked Lists',
            index: 1.6,
            screen: ['main'],
            call: function (params, screen) {
                // Check if logged in
                if (!isLoggedIn()) return;

                return function (call) {
                    var Api = getApi();
                    if (!Api) {
                        console.error('TraktTV Extended Lists', 'API not available for Liked Lists');
                        return call();
                    }

                    // First get the user's liked lists
                    Api.likesLists({
                        limit: 5,
                        page: 1
                    }).then(function (listsData) {
                        if (!listsData || !Array.isArray(listsData.results) || listsData.results.length === 0) {
                            return call();
                        }

                        // Get content from the first liked list
                        var firstList = listsData.results[0];
                        var listId = firstList.id;

                        if (!listId) {
                            return call();
                        }

                        // Load items from the first liked list
                        return Api.list({
                            id: listId,
                            limit: 20,
                            page: 1
                        }).then(function (listContent) {
                            if (!listContent || !Array.isArray(listContent.results) || listContent.results.length === 0) {
                                return call();
                            }

                            // Normalize data for display
                            var normalizedResults = normalizeContentData(listContent.results);

                            call({
                                title: createLineTitle(Lampa.Lang.translate('trakttv_liked_lists_row')),
                                results: normalizedResults,
                                onMore: function () {
                                    Lampa.Activity.push({
                                        title: Lampa.Lang.translate('trakttv_liked_lists_row'),
                                        component: 'trakt_lists',
                                        page: 1
                                    });
                                }
                            });
                        });
                    }).catch(function (error) {
                        console.error('TraktTV Extended Lists', 'Liked Lists load error:', error);
                        call();
                    });
                };
            }
        });
    }

    // ==================== INITIALIZATION ====================

    function initPlugin() {
        console.log('TraktTV Extended Lists', 'Initializing plugin v' + PLUGIN_VERSION);

        // Add translations
        addTranslations();

        // Check if TraktTV API is available
        if (!getApi()) {
            console.warn('TraktTV Extended Lists', 'TraktTV API not available yet, waiting...');

            // Wait for TraktTV to be ready
            var checkInterval = setInterval(function () {
                if (getApi()) {
                    clearInterval(checkInterval);
                    registerContentRows();
                }
            }, 500);

            // Timeout after 10 seconds
            setTimeout(function () {
                clearInterval(checkInterval);
                if (!getApi()) {
                    console.error('TraktTV Extended Lists', 'TraktTV API not available after timeout');
                }
            }, 10000);
        } else {
            registerContentRows();
        }
    }

    function registerContentRows() {
        try {
            // Register Watchlist row
            registerWatchlistRow();
            console.log('TraktTV Extended Lists', 'Watchlist row registered');

            // Register Liked Lists row
            registerLikedListsRow();
            console.log('TraktTV Extended Lists', 'Liked Lists row registered');

            console.log('TraktTV Extended Lists', 'All content rows registered successfully');
        } catch (error) {
            console.error('TraktTV Extended Lists', 'Failed to register content rows:', error);
        }
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
