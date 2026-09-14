/* NuvioTV 0.9.2-beta provider. Install through nvo-manifest.json. */
(function () {
  "use strict";
  var SERVER = "http://smotret24.com";
  var VERSION = "0.1.0";

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
