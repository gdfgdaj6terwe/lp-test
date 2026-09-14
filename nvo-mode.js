/* NuvioTV 0.9.2-beta provider. Install through manifest.json. */
(function () {
  "use strict";
  var SERVER = "http://smotret24.com";
  var VERSION = "0.3.0";

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
  async function getStreams(tmdbId, mediaType, season, episode) {
    var profile = profileFromId(
      typeof SCRAPER_ID === "string" ? SCRAPER_ID : "",
    );
    var series = mediaType === "tv" || mediaType === "series";
    if (!series && mediaType !== "movie")
      throw new Error("NVO: unsupported media type");
    if (!/^\d+$/.test(String(tmdbId))) throw new Error("NVO: expected TMDB ID");
    if (
      series &&
      (!Number.isInteger(season) ||
        season < 0 ||
        !Number.isInteger(episode) ||
        episode < 1)
    )
      throw new Error("NVO: concrete season and episode required");
    if (typeof TMDB_API_KEY !== "string" || !TMDB_API_KEY)
      throw new Error("NVO: Nuvio TMDB key unavailable");
    var movie = await json(
      query(
        "https://api.themoviedb.org/3/" + (series ? "tv/" : "movie/") + tmdbId,
        {
          api_key: TMDB_API_KEY,
          append_to_response: "external_ids",
          language: "ru-RU",
        },
      ),
    );
    if (!movie || (!movie.title && !movie.name))
      throw new Error("NVO: metadata unavailable");
    if (profile.provider === "aniboom" || profile.provider === "cvh") {
      return series
        ? animeGoStreams(profile, movie, tmdbId, season, episode)
        : [];
    }
    var params = {
      id: tmdbId,
      tmdb_id: tmdbId,
      imdb_id: movie.imdb_id || (movie.external_ids || {}).imdb_id || "",
      title: movie.title || movie.name,
      original_title: movie.original_title || movie.original_name || "",
      year: String(movie.release_date || movie.first_air_date || "").slice(
        0,
        4,
      ),
      anime: movie.original_language === "ja" ? 1 : 0,
      serial: series ? 1 : 0,
      source: "tmdb",
      rjson: "true",
    };
    if (series) {
      params.s = season;
      params.e = episode;
    }
    var visited = {},
      output = [],
      budget = 32;
    async function load(url, inheritedVoice, depth) {
      url = localUrl(url);
      if (!url || depth > 6 || budget <= 0) return;
      url = query(url, { rjson: "true" });
      if (visited[url]) return;
      visited[url] = true;
      budget--;
      var data = await json(url);
      if (!data || !Array.isArray(data.data)) return;
      if (data.type === "season") {
        var selected = data.data.filter(function (row) {
          return Number(row.id) === season;
        });
        if (selected.length === 1)
          await load(selected[0].url, inheritedVoice, depth + 1);
        return;
      }
      var voices = Array.isArray(data.voice) ? data.voice : [];
      // A voice menu is authoritative. Never rename the default voice to the requested one.
      for (var v = 0; v < voices.length; v++) {
        var voice =
          voices[v].name || voices[v].title || voices[v].translate || "";
        if (
          profile.voice === "*" ||
          normalized(voice) === normalized(profile.voice)
        ) {
          await load(voices[v].url, voice, depth + 1);
        }
      }
      for (var i = 0; i < data.data.length; i++) {
        var row = data.data[i];
        if (row.method !== "play" && row.method !== "call") continue;
        if (series && (Number(row.s) !== season || Number(row.e) !== episode))
          continue;
        var rowVoice = row.translate || row.voice_name || inheritedVoice || "";
        if (
          profile.voice !== "*" &&
          normalized(rowVoice) !== normalized(profile.voice)
        )
          continue;
        var resolved = row;
        if (row.method === "call") {
          var resolver = localUrl(row.url);
          if (!resolver || budget <= 0) continue;
          budget--;
          resolved = await json(query(resolver, { rjson: "true" }));
          if (!resolved) continue;
          var resolvedVoice = resolved.translate || resolved.voice_name;
          if (
            resolvedVoice &&
            profile.voice !== "*" &&
            normalized(resolvedVoice) !== normalized(profile.voice)
          )
            continue;
        }
        var qualities =
          resolved.quality &&
          typeof resolved.quality === "object" &&
          !Array.isArray(resolved.quality)
            ? resolved.quality
            : {};
        var keys = Object.keys(qualities);
        if (!keys.length) keys = [""];
        for (var k = 0; k < keys.length; k++) {
          var quality = String(
            parseInt(keys[k] || resolved.maxquality || row.maxquality, 10) ||
              "unknown",
          );
          if (profile.quality !== "any" && quality !== profile.quality)
            continue;
          var media = String(
            keys[k] ? qualities[keys[k]] : resolved.url || "",
          ).split(" or ")[0];
          if (!httpUrl(media)) continue;
          var headers = {},
            sourceHeaders = resolved.headers || row.headers || {};
          Object.keys(sourceHeaders).forEach(function (key) {
            if (typeof sourceHeaders[key] === "string")
              headers[key] = sourceHeaders[key];
          });
          output.push({
            name: profile.provider + " | " + (rowVoice || "Unspecified voice"),
            title:
              (series ? "S" + season + "E" + episode + " | " : "") +
              (rowVoice || "Unspecified voice") +
              (profile.strict ? "" : " | Manual selection"),
            url: media,
            quality: quality === "unknown" ? "" : quality + "p",
            headers: headers,
            subtitles: Array.isArray(resolved.subtitles)
              ? resolved.subtitles.filter(function (s) {
                  return s && httpUrl(s.url);
                })
              : [],
          });
        }
      }
      var links = data.data.filter(function (row) {
        return row.method === "link" && !row.similar;
      });
      if (
        links.length === 1 &&
        !data.data.some(function (row) {
          return row.method === "play" || row.method === "call";
        })
      ) {
        await load(links[0].url, inheritedVoice, depth + 1);
      }
    }
    await load(query(SERVER + "/lite/" + profile.provider, params), "", 0);
    var unique = [];
    output.forEach(function (row) {
      if (
        !unique.some(function (other) {
          return (
            other.url === row.url &&
            other.name === row.name &&
            JSON.stringify(other.headers) === JSON.stringify(row.headers)
          );
        })
      )
        unique.push(row);
    });
    // Multiple distinct matches cannot preserve the exact selected variant safely.
    return profile.strict && unique.length > 1 ? [] : unique;
  }
  if (typeof module !== "undefined")
    module.exports = { getStreams: getStreams, version: VERSION };
  else globalThis.getStreams = getStreams;
})();
