/**
 * TraktTV Extended Lists - Lampa Plugin
 * Version: 1.4.0
 *
 * Adds Watchlist and Liked Lists rows to main page
 * Enforces strict ordering: Trakt Lists > AIO Lists > Others
 * Requires: trakttv.js plugin
 */

(function () {
    'use strict';

    var PLUGIN_NAME = 'trakttv-extended-lists';
    var PLUGIN_VERSION = '1.4.0';

    // ==================== ICONS & STYLES ====================

    // Trakt Main Icon (Red Circle)
    var TRAKT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" id="Layer_2" viewBox="0 0 48 48" fill="currentColor"><g id="_x2D_-production"><path id="logomark.square.white" class="cls-1" d="M30.17,30.22l-1.46-1.46,19.16-19.17c-.05-.39-.13-.77-.23-1.15l-20.31,20.33,2.16,2.16-1.46,1.46-3.62-3.62L46.85,6.29c-.15-.3-.31-.6-.5-.88l-23.33,23.35,4.31,4.31-1.46,1.46-14.39-14.4,1.46-1.46,8.62,8.62L45.1,3.72c-2.07-2.29-5.05-3.72-8.37-3.72H11.27C5.05,0,0,5.05,0,11.27v25.48c0,6.22,5.05,11.26,11.27,11.26h25.47c6.22,0,11.27-5.04,11.27-11.26V12.38l-17.83,17.84ZM21.54,25.91l-7.91-7.93,1.46-1.46,7.91,7.92-1.46,1.47ZM23.69,23.74l-7.91-7.92,1.46-1.46,7.92,7.92-1.47,1.46ZM43.4,35.12c0,4.57-3.71,8.28-8.28,8.28H12.88c-4.56,0-8.28-3.71-8.28-8.28V12.88c0-4.57,3.71-8.28,8.28-8.28h20.78v2.08H12.88c-3.42,0-6.2,2.78-6.2,6.2v22.23c0,3.42,2.78,6.21,6.2,6.21h22.24c3.42,0,6.2-2.79,6.2-6.21v-3.51h2.08v3.51Z"/></g></svg>';

    // Watchlist Icon (List) - Copied from trakttv.js
    var WATCHLIST_ICON = '<svg fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M152.1 38.2c9.9 8.9 10.7 24 1.8 33.9l-72 80c-4.4 4.9-10.6 7.8-17.2 7.9s-12.9-2.4-17.6-7L7 113C-2.3 103.6-2.3 88.4 7 79s24.6-9.4 33.9 0l22.1 22.1 55.1-61.2c8.9-9.9 24-10.7 33.9-1.8zm0 160c9.9 8.9 10.7 24 1.8 33.9l-72 80c-4.4 4.9-10.6 7.8-17.2 7.9s-12.9-2.4-17.6-7L7 273c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l22.1 22.1 55.1-61.2c8.9-9.9 24-10.7 33.9-1.8zM224 96c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zm0 160c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zM160 416c0-17.7 14.3-32 32-32l288 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-288 0c-17.7 0-32-14.3-32-32zM48 368a48 48 0 1 1 0 96 48 48 0 1 1 0-96z"/></svg>';

    // Heart Icon (for Liked Lists)
    var HEART_ICON = '<svg fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M47.6 300.4L228.3 469.1c7.5 7 17.4 10.9 27.7 10.9s20.2-3.9 27.7-10.9L464.4 300.4c30.4-28.3 47.6-68 47.6-109.5v-5.8c0-69.9-50.5-129.5-119.4-141C347 36.5 300.6 51.4 268 84L256 96 244 84c-32.6-32.6-79-47.5-124.6-39.9C50.5 55.6 0 115.2 0 185.1v5.8c0 41.5 17.2 81.2 47.6 109.5z"/></svg>';

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
     * Create title as DOM element with proper Icon
     */
    function createLineTitle(text, iconSvg) {
        var root = document.createElement('span');
        root.className = 'trakt-line-title';
        root.setAttribute('style', LINE_TITLE_STYLE);

        var iconWrap = document.createElement('span');
        iconWrap.className = 'trakt-line-title__icon';
        iconWrap.setAttribute('style', LINE_ICON_STYLE);

        // Use supplied icon or default Trakt icon
        var svg = iconSvg || TRAKT_ICON;
        // Inject style into SVG
        iconWrap.innerHTML = svg.replace('<svg', '<svg style="width:100%; height:100%; display:block;"');

        var label = document.createElement('span');
        label.textContent = text;

        root.appendChild(iconWrap);
        root.appendChild(label);

        return root;
    }

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
            trakttv_watchlist_row: { ru: 'Список желаний', en: 'Watchlist', uk: 'Список бажань' },
            trakttv_liked_lists_row: { ru: 'Понравившиеся списки', en: 'Liked Lists', uk: 'Вподобані списки' }
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
                            title: createLineTitle(Lampa.Lang.translate('trakttv_watchlist_row'), WATCHLIST_ICON),
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
                                title: createLineTitle(Lampa.Lang.translate('trakttv_liked_lists_row'), HEART_ICON),
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

    // ==================== STRICT LAYOUT ENFORCEMENT ====================

    // Desired order of Trakt categories
    // "Up Next" is always first.
    function getTraktOrder() {
        return [
            Lampa.Lang.translate('trakttv_upnext'),          // 1
            Lampa.Lang.translate('trakttv_watchlist_row'),   // 2
            Lampa.Lang.translate('trakttv_liked_lists_row'), // 3
            Lampa.Lang.translate('trakttv_recommendations')  // 4
        ];
    }

    /**
     * The Master Sorter
     * Ensures: Trakt Rows > AIO Rows > Others
     */
    function enforceLayout() {
        var container = $('.scroll__body');
        if (!container.length) return;

        var rows = container.children();
        if (rows.length === 0) return;

        // Check if the first row is NOT "Up Next" (or one of our Trakt rows)
        // If the first row is something else (like "Now Watching"), we must act.

        var traktTitles = getTraktOrder();
        var firstTitle = rows.first().find('.items-line__title').text();

        var isTraktFirst = false;
        // Check if first title roughly matches any of our top Trakt titles
        for (var t = 0; t < traktTitles.length; t++) {
            if (firstTitle && firstTitle.indexOf(traktTitles[t]) !== -1) {
                isTraktFirst = true;
                break;
            }
        }

        // If sorting seems correct-ish (just checking first item for perf), maybe return?
        // But better to be thorough if we want strict order.

        // BUCKETS
        var traktBucket = [];
        var aioBucket = [];
        var otherBucket = [];

        rows.each(function () {
            var el = $(this);
            var text = el.text();

            // Is Trakt?
            var isTrakt = false;
            for (var i = 0; i < traktTitles.length; i++) {
                if (text.indexOf(traktTitles[i]) !== -1) {
                    // Store with index to sort internally later
                    traktBucket.push({ el: el, index: i });
                    isTrakt = true;
                    break;
                }
            }
            if (isTrakt) return;

            // Is AIO? (Check for class aiostreams-line-title)
            if (el.find('.aiostreams-line-title').length > 0) {
                aioBucket.push(el);
                return;
            }

            // Other (Now Watching, etc)
            otherBucket.push(el);
        });

        // If we found NO Trakt rows, abor (maybe not loaded yet)
        if (traktBucket.length === 0 && aioBucket.length === 0) return;

        // DETACH ALL
        // We only detach if the order is WRONG to avoid flicker.
        // But checking order is complex. Let's just do it if the FIRST element is 'wrong'.
        if (isTraktFirst && traktBucket[0].index === 0) {
            // Up Next is already first.
            // Maybe check if AIO is after Trakt?
            // Too complex. Let's FORCE it. If it causes flicker, we'll debounce.
        }

        // Sort Trakt Bucket by desired order
        traktBucket.sort(function (a, b) {
            return a.index - b.index;
        });

        // Determine correct DOM order: Trakt -> AIO -> Other
        // We will move elements to end or use prepend?
        // Let's use PREPEND in REVERSE order to build the top stack.

        // Strategy:
        // 1. Leave Other bucket alone (they are likely at bottom or mixed).
        // 2. Detach Trakt and AIO.
        // 3. Prepend AIO (reverse).
        // 4. Prepend Trakt (reverse).

        // Detach Trakt
        traktBucket.forEach(function (item) { item.el.detach(); });
        // Detach AIO
        aioBucket.forEach(function (el) { el.detach(); });

        // Prepend AIO (so they end up below Trakt)
        // We want AIO order preserved? Or just dump them.
        // Assuming AIO bucket is in DOM order (original order). Reverse to prepend correctly.
        for (var i = aioBucket.length - 1; i >= 0; i--) {
            container.prepend(aioBucket[i]);
        }

        // Prepend Trakt (Reverse of desired order 0..3)
        for (var i = traktBucket.length - 1; i >= 0; i--) {
            container.prepend(traktBucket[i].el);
        }
    }

    // Observer setup
    var observer = null;
    var isSorting = false;

    function startObserver() {
        var container = $('.scroll__body')[0];
        if (!container) return; // Wait until container exists?

        if (observer) observer.disconnect();

        observer = new MutationObserver(function (mutations) {
            if (isSorting) return;

            // Check if significant change (added nodes)
            var shouldSort = false;
            mutations.forEach(function (m) {
                if (m.addedNodes.length > 0) shouldSort = true;
            });

            if (shouldSort) {
                isSorting = true;
                // Defer sort to allow batch updates
                setTimeout(function () {
                    enforceLayout();
                    isSorting = false;
                }, 100);
            }
        });

        observer.observe(container, { childList: true });

        // Initial sort
        enforceLayout();
    }

    // ==================== INITIALIZATION ====================

    function initPlugin() {
        addTranslations();
        registerContentRows();

        Lampa.Listener.follow('main', function (e) {
            if (e.type === 'complite') {
                // Wait for scroll__body to appear
                setTimeout(startObserver, 500);
            }
        });

        if (Lampa.Activity.active() && Lampa.Activity.active().component === 'main') {
            setTimeout(startObserver, 500);
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
