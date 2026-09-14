const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function runtime(id, handler) {
  const calls = [];
  const context = {
    module: { exports: {} }, SCRAPER_ID: id, TMDB_API_KEY: 'fixture-key',
    console: { warn() {}, log() {}, error() {} },
    fetch: async (url) => {
      calls.push(url);
      const parsed = new URL(url);
      const data = parsed.hostname === 'api.themoviedb.org'
        ? { name: 'Fixture', original_name: 'Fixture', original_language: 'ja', external_ids: { imdb_id: 'tt123' } }
        : await handler(parsed);
      return { ok: true, json: async () => data };
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'nvo-mode.js'), 'utf8'), context);
  return { getStreams: context.module.exports.getStreams, calls };
}
const profile = 'nvo1~kodik~AniLibria~720';
const stream = (e, voice = 'AniLibria', quality = '720p') => ({ method: 'play', s: 1, e, translate: voice, quality: { [quality]: `https://cdn.example/${encodeURIComponent(voice)}/${e}/${quality}` } });

test('adjacent episodes keep the exact voice and quality under one scraper ID', async () => {
  const r = runtime(profile, u => ({ type: 'episode', data: [stream(1), stream(2), stream(2, 'AniDUB'), stream(2, 'AniLibria', '480p')] }));
  const first = await r.getStreams('42', 'tv', 1, 1);
  const second = await r.getStreams('42', 'tv', 1, 2);
  assert.equal(first.length, 1); assert.equal(second.length, 1);
  assert.match(second[0].url, /AniLibria\/2\/720p/);
});
test('missing voice or quality returns no substitute', async () => {
  const r = runtime(profile, () => ({ type: 'episode', data: [stream(2, 'AniDUB'), stream(2, 'AniLibria', '480p')] }));
  assert.equal((await r.getStreams('42', 'tv', 1, 2)).length, 0);
});
test('follows the requested season and voice menu, then resolves call headers', async () => {
  const r = runtime(profile, u => {
    if (u.pathname.endsWith('/video')) return { url: 'https://cdn.example/play', quality: { '720p': 'https://cdn.example/720' }, headers: { Referer: 'https://source.example/' } };
    if (u.searchParams.get('voice') === '7') return { type: 'episode', data: [{ method: 'call', s: 1, e: 2, url: '/lite/kodik/video' }] };
    if (u.searchParams.get('selected')) return { type: 'episode', voice: [{ name: 'AniLibria', url: '/lite/kodik?voice=7' }], data: [stream(2, 'AniDUB')] };
    return { type: 'season', data: [{ id: 0, url: '/lite/kodik?selected=wrong' }, { id: 1, url: '/lite/kodik?selected=right' }] };
  });
  const rows = await r.getStreams('42', 'tv', 1, 2);
  assert.equal(rows.length, 1); assert.equal(rows[0].headers.Referer, 'https://source.example/');
  assert.equal(rows[0].url, 'https://cdn.example/720');
  assert.equal(r.calls.some(u => u.includes('selected=wrong')), false);
});
test('does not follow foreign resolver links or cycles', async () => {
  const r = runtime(profile, () => ({ type: 'movie', data: [{ method: 'call', url: 'https://foreign.example/collect' }] }));
  assert.equal((await r.getStreams('42', 'movie')).length, 0);
  assert.equal(r.calls.some(u => u.includes('foreign.example')), false);
});
test('challenge responses remain explicit compatibility failures', async () => {
  const r = runtime(profile, () => ({ rch: true, nws: 'wss://example/nws' }));
  await assert.rejects(r.getStreams('42', 'tv', 1, 1), /WebSocket/);
});
test('series requests without a concrete episode fail before fetching', async () => {
  const r = runtime(profile, () => ({}));
  await assert.rejects(r.getStreams('42', 'tv'), /episode/);
  assert.equal(r.calls.length, 0);
});
test('accepts the repository prefix Nuvio adds to SCRAPER_ID', async () => {
  const r = runtime('repository-hash:' + profile, () => ({ type: 'episode', data: [stream(2)] }));
  assert.equal((await r.getStreams('42', 'tv', 1, 2)).length, 1);
});
test('ambiguous same-voice matches cannot silently select a different edition', async () => {
  const other = stream(2); other.quality['720p'] = 'https://cdn.example/other-edition';
  const r = runtime(profile, () => ({ type: 'episode', data: [stream(2), other] }));
  assert.equal((await r.getStreams('42', 'tv', 1, 2)).length, 0);
});
test('season zero is a valid exact season', async () => {
  const row = stream(1); row.s = 0;
  const r = runtime(profile, () => ({ type: 'episode', data: [row, stream(1)] }));
  assert.equal((await r.getStreams('42', 'tv', 0, 1)).length, 1);
});
test('manifest profiles execute with the installed repository-prefixed IDs', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
  assert.equal(new Set(manifest.scrapers.map(s => s.id)).size, manifest.scrapers.length);
  for (const scraper of manifest.scrapers) {
    assert.equal(scraper.filename, 'nvo-mode.js');
    const parts = scraper.id.split('~');
    const voice = decodeURIComponent(parts[2]);
    if (scraper.enabled) { assert.notEqual(voice, '*'); assert.notEqual(parts[3], 'any'); }
    if (parts[1] === 'aniboom' || parts[1] === 'cvh') continue; // Covered by the AnimeGO manifest execution test.
    const r = runtime('installed:' + scraper.id, () => ({ type: 'episode', data: [stream(2, voice)] }));
    assert.equal((await r.getStreams('42', 'tv', 1, 2)).length, 1);
  }
});
test('a mismatched voice returned by a call resolver is rejected', async () => {
  const r = runtime(profile, u => u.pathname.endsWith('/video')
    ? { ...stream(2, 'AniDUB'), url: 'https://cdn.example/wrong' }
    : { type: 'episode', data: [{ method: 'call', s: 1, e: 2, translate: 'AniLibria', url: '/lite/kodik/video' }] });
  assert.equal((await r.getStreams('42', 'tv', 1, 2)).length, 0);
});
test('cyclic navigation terminates without repeated requests', async () => {
  const r = runtime(profile, () => ({ type: 'search', data: [{ method: 'link', url: '/lite/kodik?loop=1' }] }));
  assert.equal((await r.getStreams('42', 'tv', 1, 2)).length, 0);
  assert.equal(r.calls.length, 3);
});
