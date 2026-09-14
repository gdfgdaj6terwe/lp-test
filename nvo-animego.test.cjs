const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup(options = {}) {
  const calls = [];
  const source = { '@type': 'TVSeries', name: 'Fixture 3', alternateName: 'Fixture Season 3', datePublished: '2024-04-05', numberOfEpisodes: 2, ...options.source };
  const escape = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  function players(ep) {
    return `<button data-player="//aniboom.one/embed/fixture?episode=${ep}&amp;translation=30" data-provider-title="AniBoom" data-translation-title="${options.voice || 'AniLibria'}"></button>`;
  }
  const context = {
    module: { exports: {} }, SCRAPER_ID: options.scraperId || 'repo:nvo1~aniboom~AniLibria~1080', TMDB_API_KEY: 'fixture',
    console: { log() {}, warn() {}, error() {} },
    fetch: async (url, requestOptions) => {
      calls.push({ url, options: requestOptions });
      const u = new URL(url); let data;
      if (u.pathname === '/3/tv/42') data = { name: 'Fixture', original_name: 'Fixture', original_language: 'ja', ...options.movie };
      else if (u.pathname === '/3/tv/42/season/3') data = { episodes: [{ episode_number: 1, air_date: '2024-04-05' }, { episode_number: 2, air_date: '2024-04-12' }] };
      else if (u.pathname === '/search/anime') data = '<a title="' + (options.searchTitle || options.movie?.name || 'Fixture 3') + '" href="/anime/fixture-123">Fixture 3</a><a title="Unrelated" href="/anime/unrelated-456">Unrelated</a>';
      else if (u.pathname === '/anime/fixture-123') data = `<script type="application/ld+json">${JSON.stringify(source)}</script>`;
      else if (u.pathname === '/player/123') data = { data: { content: players(1) + '<button data-episode="9002" data-episode-number="2"></button>' } };
      else if (u.pathname === '/player/videos/9002') data = { data: { content: players(2) } };
      else if (u.pathname === '/embed/fixture') data = `<video data-parameters="${escape(JSON.stringify({ qualityVideo: 1080, hls: JSON.stringify({ src: `https://cdn.example/master-${u.searchParams.get('episode')}.m3u8` }) }))}"></video>`;
      else if (/^\/master-\d.m3u8$/.test(u.pathname)) data = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=' + (options.resolution || '1920x1080') + ',AUDIO="audio"\nvideo.m3u8\n';
      else throw Error('Unexpected request ' + u.pathname);
      return { ok: true, json: async () => data, text: async () => typeof data === 'string' ? data : JSON.stringify(data) };
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'nvo-mode.js'), 'utf8'), context);
  return { run: ep => context.module.exports.getStreams('42', 'tv', 3, ep), calls };
}
test('AniBoom returns the master with its external audio and playback headers', async () => {
  const r = setup(); const streams = await r.run(1);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/master-1.m3u8');
  assert.equal(streams[0].headers.Referer, 'https://aniboom.one/');
  assert.equal(streams[0].quality, '1080p');
});
test('next episode resolves its own player and preserves the exact dub', async () => {
  const r = setup(); const rows = await r.run(2);
  assert.equal(rows.length, 1); assert.equal(rows[0].url, 'https://cdn.example/master-2.m3u8');
  assert.ok(r.calls.some(c => c.url.includes('/player/videos/9002')));
});
test('a lower-resolution master is not advertised as 1080p', async () => {
  assert.equal((await setup({ resolution: '1280x720' }).run(1)).length, 0);
});
test('a missing dub cannot substitute another studio', async () => {
  assert.equal((await setup({ voice: 'JAM CLUB' }).run(1)).length, 0);
});
test('a same-name release from the wrong year cannot supply episodes', async () => {
  const r = setup({ source: { datePublished: '2021-04-05' } });
  assert.equal((await r.run(1)).length, 0);
  assert.equal(r.calls.some(c => c.url.includes('/player/')), false);
});
test('a split season maps by the matching episode air date', async () => {
  const r = setup({ source: { datePublished: '2024-04-12', numberOfEpisodes: 1 } });
  const rows = await r.run(2);
  assert.equal(rows.length, 1); assert.equal(rows[0].url, 'https://cdn.example/master-1.m3u8');
});
test('an unrelated same-date show is rejected', async () => {
  assert.equal((await setup({ source: { name: 'Unrelated', alternateName: 'Other Show' } }).run(1)).length, 0);
});
test('a bilingual TMDB title can match its full localized half', async () => {
  const r = setup({ movie: { name: 'Other Language: Localized Fixture', original_name: '原題' }, source: { name: 'Localized Fixture 3', alternateName: 'Localized Fixture Season 3' } });
  assert.equal((await r.run(1)).length, 1);
});
test('unrelated search cards do not trigger page fetches', async () => {
  const r = setup(); await r.run(1);
  assert.equal(r.calls.some(c => c.url.includes('/anime/unrelated-456')), false);
});
test('every published AnimeGO profile executes using its actual manifest ID', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
  const scrapers = manifest.scrapers.filter(s => s.id.startsWith('nvo1~aniboom~'));
  assert.ok(scrapers.length >= 2);
  for (const s of scrapers) {
    const voice = decodeURIComponent(s.id.split('~')[2]);
    const r = setup({ scraperId: 'installed:' + s.id, voice });
    const rows = await r.run(1);
    assert.equal(rows.length, 1); assert.equal(rows[0].name, 'AniBoom | ' + voice);
    assert.equal(s.filename, 'nvo-mode.js');
  }
});
