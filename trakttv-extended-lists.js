/**
 * TraktTV Extended Lists - Lampa Plugin
 * Version: 1.3.0
 *
 * Adds Watchlist and Liked Lists rows to main page
 * Reorders Trakt rows to top and hides unwanted rows
 * Requires: trakttv.js plugin
 */

(function () {
    'use strict';

    var PLUGIN_NAME = 'trakttv-extended-lists';
    var PLUGIN_VERSION = '1.3.0';

    // SVG Icons (from trakttv.js) - Ensure this is on one line or properly escaped
    var TRAKT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" id="Layer_2" viewBox="0 0 48 48" fill="currentColor"><g id="_x2D_-production"><path id="logomark.square.white" class="cls-1" d="M30.17,30.22l-1.46-1.46,19.16-19.17c-.05-.39-.13-.77-.23-1.15l-20.31,20.33,2.16,2.16-1.46,1.46-3.62-3.62L46.85,6.29c-.15-.3-.31-.6-.5-.88l-23.33,23.35,4.31,4.31-1.46,1.46-14.39-14.4,1.46-1.46,8.62,8.62L45.1,3.72c-2.07-2.29-5.05-3.72-8.37-3.72H11.27C5.05,0,0,5.05,0,11.27v25.48c0,6.22,5.05,11.26,11.27,11.26h25.47c6.22,0,11.27-5.04,11.27-11.26V12.38l-17.83,17.84ZM21.54,25.91l-7.91-7.93,1.46-1.46,7.91,7.92-1.46,1.47ZM23.69,23.74l-7.91-7.92,1.46-1.46,7.92,7.92-1.47,1.46ZM43.4,35.12c0,4.57-3.71,8.28-8.28,8.28H12.88c-4.56,0-8.28-3.71-8.28-8.28V12.88c0-4.57,3.71-8.28,8.28-8.28h20.78v2.08H12.88c-3.42,0-6.2,2.78-6.2,6.2v22.23c0,3.42,2.78,6.21,6.2,6.21h22.24c3.42,0,6.2-2.79,6.2-6.21v-3.51h2.08v3.51Z"/></g></svg>';

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
     * Create title as DOM element
     */
    function createLineTitle(text) {
        var root = document.createElement('span');
        root.className = 'trakt-line-title';
        root.setAttribute('style', LINE_TITLE_STYLE);

        var iconWrap = document.createElement('span');
        iconWrap.className = 'trakt-line-title__icon';
        iconWrap.setAttribute('style', LINE_ICON_STYLE);
        // Ensure the replaced style is correct
        iconWrap.innerHTML = TRAKT_ICON.replace('<svg', '<svg style="width:100%; height:100%; display:block;"');

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
                    }).catch(function (e) {
                        console.error('TraktWatchlistRow', e);
                        call();
                    });
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
                    }).catch(function (e) {
                        console.error('TraktLikedListsRow', e);
                        call();
                    });
                };
            }
        });
    }

    // ==================== LAYOUT MANIPULATION ====================

    var layoutTimer = null;

    function cleanupLayout() {
        var container = $('.scroll__body');
        if (!container.length) return;

        // 1. Hide unwanted rows
        var unwantedTexts = ['Сейчас смотрят', 'Shots'];

        container.find('.items-line').each(function () {
            var row = $(this);
            var titleEl = row.find('.items-line__title');
            var titleText = titleEl.text();

            // Check if title contains any unwanted text
            for (var i = 0; i < unwantedTexts.length; i++) {
                // Determine checking method: 'Сейчас смотрят' matches standard category
                // 'Shots' matches another. Using generic indexOf.
                if (titleText && titleText.indexOf(unwantedTexts[i]) !== -1) {
                    row.hide();
                    // Optional: remove them completely to prevent interference
                    // row.remove();
                    break;
                }
            }
        });

        // 2. Reorder Trakt Rows to Top
        // Order: Up Next, Watchlist, Liked, Recommendations
        var targets = [
            Lampa.Lang.translate('trakttv_recommendations'),
            Lampa.Lang.translate('trakttv_liked_lists_row'),
            Lampa.Lang.translate('trakttv_watchlist_row'),
            Lampa.Lang.translate('trakttv_upnext')
        ];

        var rows = container.children();

        targets.forEach(function (targetTitle) {
            var row = rows.filter(function () {
                // Robust matching: Check if text contains the title
                return $(this).text().indexOf(targetTitle) !== -1;
            });

            if (row.length) {
                container.prepend(row);
            }
        });
    }

    function startLayoutService() {
        if (layoutTimer) clearInterval(layoutTimer);

        var attempts = 0;
        layoutTimer = setInterval(function () {
            cleanupLayout();
            attempts++;
            if (attempts > 20) clearInterval(layoutTimer); // 10 seconds check
        }, 500);
    }

    // ==================== INITIALIZATION ====================

    function initPlugin() {
        addTranslations();
        registerContentRows();

        // Listen for main page rendering
        Lampa.Listener.follow('main', function (e) {
            if (e.type === 'complite') {
                startLayoutService();
            }
        });

        if (Lampa.Activity.active() && Lampa.Activity.active().component === 'main') {
            startLayoutService();
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
