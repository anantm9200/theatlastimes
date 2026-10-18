import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server';
import { NewsStore } from '../src/server/news-store';
import { validateArticle } from '../src/server/news-validation';
import { renderPage } from '../src/server/html';
import { parseAnalysis } from '../src/server/ai';

const editorKey = 'test-editor-credential-with-at-least-32-characters';
const ingestKey = 'test-ingest-credential-with-at-least-32-characters';
async function serve(handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

test('HTTP editorial workflow enforces roles, privacy, review, persistence, identity and discovery', async () => {
  process.env.NEWS_API_KEY = editorKey; process.env.NEWS_INGEST_KEY = ingestKey; process.env.SITE_URL = 'https://atlas.example';
  const store = new NewsStore(':memory:');
  const { app } = createApp(store);
  const api = await serve(app);
  const request = async (path: string, method = 'GET', body?: unknown, key?: string) => {
    const response = await fetch(api.base + path, { method, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, response, json: await response.json() as any };
  };
  try {
    for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await request('/api/news' + (method === 'POST' ? '' : '/x'), method, method === 'DELETE' ? undefined : { title: 'Attack' })).status, 401);
    assert.equal((await request('/api/news/x/analyze', 'POST')).status, 401);
    assert.equal((await request('/api/admin/news')).status, 401);
    assert.equal((await request('/api/admin/news', 'GET', undefined, ingestKey)).status, 403);
    assert.equal((await request('/api/news', 'POST', { title: 'Unreviewed', status: 'published' }, ingestKey)).status, 403);
    const created = await request('/api/news', 'POST', { title: 'Integration test & source report', originalUrl: 'https://source.example/report?utm_source=feed', sourceName: 'Test source', summary: 'Source excerpt supplied for the integration test.', fullContent: '<p>Supplied source material.</p><script>steal()</script>', category: 'Technology', sourcePublishedAt: '2020-01-01T00:00:00Z' }, ingestKey);
    assert.equal(created.status, 201); const draft = created.json.data;
    assert.equal(draft.status, 'draft'); assert.equal(draft.publishedAt, ''); assert.doesNotMatch(draft.fullContent, /script/);
    const duplicate = await request('/api/news', 'POST', { title: 'Duplicate headline', originalUrl: 'https://source.example/report#top' }, ingestKey);
    assert.equal(duplicate.json.duplicate, true); assert.equal(duplicate.json.data.id, draft.id);
    assert.equal((await request(`/api/news/${draft.id}`)).status, 404);
    assert.equal((await request('/api/news')).json.data.length, 0);
    assert.equal((await request(`/api/admin/news/${draft.id}`, 'GET', undefined, editorKey)).json.data.title, draft.title);
    assert.equal((await request(`/api/news/${draft.id}`, 'PUT', { status: 'published' }, ingestKey)).status, 403);
    assert.equal((await request(`/api/news/${draft.id}`, 'PUT', { status: 'published' }, editorKey)).status, 400);
    assert.equal((await request(`/api/news/${draft.id}`, 'PUT', { status: 'published', coverage: 'global', authorName: '<b></b>', reviewNote: 'Checked source and rights.' }, editorKey)).status, 400);
    const published = await request(`/api/news/${draft.id}`, 'PUT', { status: 'published', coverage: 'global', authorName: 'Integration test editor', reviewNote: 'Checked the source, dates, facts and image rights.' }, editorKey);
    assert.equal(published.status, 200); assert.ok(Date.parse(published.json.data.publishedAt) > Date.parse(draft.sourcePublishedAt));
    assert.equal((await request(`/api/news/${draft.slug}`)).json.data.id, draft.id);
    assert.equal((await request(`/api/news/${draft.id}`)).json.data.reviewNote, undefined);
    assert.equal((await request(`/api/news/${draft.id}`, 'PUT', {title: 'Stale editor', expectedModifiedAt: '2000-01-01T00:00:00.000Z', reviewNote: 'Checked fixture changes.'}, editorKey)).status, 409);
    assert.equal((await request('/api/news?category=technology&limit=1&page=1')).json.data.length, 1);
    assert.equal((await request('/api/news?limit=-1')).status, 400);
    assert.equal((await request('/api/news?limit=1oops')).status, 400);
    assert.equal((await request('/api/news?search[x]=bad')).status, 400);
    assert.equal((await request('/api/news?search=%25')).json.data.length, 0);
    assert.equal((await request(`/api/news/${draft.id}/analyze`, 'POST', {}, editorKey)).status, 409);
    assert.equal((await request(`/api/news/${draft.id}`, 'PUT', { title: 'Unreviewed change' }, editorKey)).status, 400);
    const sitemap = await (await fetch(api.base + '/sitemaps/articles-1.xml')).text();
    assert.match(sitemap, new RegExp(draft.id)); assert.match(sitemap, /https:\/\/atlas.example\/article\//);
    const newsMap = await (await fetch(api.base + '/news-sitemap.xml')).text(); assert.match(newsMap, /&amp;/);
    const html = await renderPage('<html><head><title>Old</title></head><body><div id="root"></div></body></html>', '/article/' + draft.id, store, 'https://atlas.example');
    assert.equal(html.status, 200); assert.match(html.html, /Integration test &amp; source report/); assert.match(html.html, /application\/ld\+json/); assert.match(html.html, /twitter:card/); assert.match(html.html, /Source published/);
    assert.equal((await renderPage('<div id="root"></div>', '/missing', store, 'https://atlas.example')).status, 404);
    const unpublish = await request(`/api/news/${draft.id}`, 'PUT', { status: 'draft' }, editorKey); assert.equal(unpublish.json.data.status, 'draft');
    assert.equal((await request(`/api/news/${draft.id}`)).status, 404);
    assert.doesNotMatch(await (await fetch(api.base + '/sitemaps/articles-1.xml')).text(), new RegExp(draft.id));
    assert.equal((await request('/api/admin/news/export', 'GET', undefined, editorKey)).json.data.length, 1);
    assert.equal((await request(`/api/news/${draft.id}`, 'DELETE', undefined, editorKey)).status, 200);
    assert.equal((await request(`/api/news/${draft.id}`, 'DELETE', undefined, editorKey)).status, 404);
    assert.equal((await request('/api/admin/audit', 'GET', undefined, editorKey)).json.data[0].action, 'delete');
    assert.equal((await request('/api/not-real')).status, 404);
    assert.equal((await request('/api/market-pulse')).status, 503);
    assert.deepEqual((await request('/api/briefings')).json.data, []);
    assert.equal((await request('/api/health')).json.storage, 'ready');
  } finally { await api.close(); store.close(); }
});

test('AI service returns validated private drafts; malformed output leaves source unchanged', async () => {
  let malformed = false; let calls = 0; let seen: any;
  const inference = await serve((req, res) => {
    let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => {
      calls++; seen = JSON.parse(body); res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: malformed ? '{"keyPoints":"invented"}' : JSON.stringify({ keyPoints: ['The excerpt is limited.'], whyItMatters: 'Interpretation: more source material is needed.', detailedHumanizedSummary: 'A summary based only on the supplied excerpt.' }) } }] }));
    });
  });
  process.env.AI_PROVIDER = 'openai'; process.env.AI_BASE_URL = inference.base + '/v1'; process.env.AI_MODEL = 'test-fixture'; process.env.AI_JSON_MODE = 'true'; process.env.AI_DISABLE_THINKING = 'true'; process.env.NEWS_API_KEY = editorKey;
  const store = new NewsStore(':memory:'); const article = store.save(validateArticle({ title: 'Model test fixture', originalUrl: 'https://source.example/test', summary: 'Only the supplied material may be summarized.' }));
  const api = await serve(createApp(store).app);
  try {
    await fetch(api.base + '/api/news'); assert.equal(calls, 0);
    const generated = await fetch(api.base + `/api/news/${article.id}/analyze`, { method: 'POST', headers: { Authorization: `Bearer ${editorKey}` } });
    assert.equal(generated.status, 200); const saved = (await generated.json() as any).data;
    assert.equal(saved.status, 'draft'); assert.equal(saved.aiGenerated, true); assert.equal(saved.generatedBy, 'test-fixture'); assert.equal(saved.provenance.promptVersion, 'source-summary-v1'); assert.equal(saved.credibilityScore, 0); assert.equal(saved.reviewedAt, undefined);
    assert.equal(seen.response_format.type, 'json_object'); assert.equal(seen.chat_template_kwargs.enable_thinking, false);
    assert.equal((await fetch(api.base + `/api/news/${article.id}`)).status, 404);
    malformed = true;
    const failed = await fetch(api.base + `/api/news/${article.id}/analyze`, { method: 'POST', headers: { Authorization: `Bearer ${editorKey}` } }); assert.equal(failed.status, 502);
    assert.deepEqual(store.get(article.id, true), saved);
    assert.throws(() => parseAnalysis('{"keyPoints": []}'), /invalid analysis/);
  } finally { await api.close(); await inference.close(); store.close(); delete process.env.AI_PROVIDER; }
});

test('public API and server-rendered feed briefs keep the full checking text private', async () => {
  const store = new NewsStore(':memory:');
  const draft = validateArticle({ title: 'A global source brief', originalUrl: 'https://source.example/brief', publisherId: 'approved-source', sourceName: 'Original Publisher', summary: 'An attributed source excerpt.', fullContent: '<p>Internal full source text for the grounding check.</p>', detailedHumanizedSummary: 'The public generated brief.', aiGenerated: true, publicationMode: 'automatic', status: 'published' });
  store.save(draft); const api = await serve(createApp(store).app);
  try {
    const response = await fetch(api.base + `/api/news/${draft.id}`), { data } = await response.json() as any;
    assert.equal(data.fullContent, undefined); assert.equal(data.detailedHumanizedSummary, 'The public generated brief.');
    const html = await renderPage('<html><head></head><body><div id="root"></div></body></html>', '/article/' + draft.id, store, 'https://atlas.example');
    assert.doesNotMatch(html.html, /Internal full source text/); assert.match(html.html, /public generated brief/);
    assert.match(store.get(draft.id, true)!.fullContent!, /Internal full source text/);
  } finally { await api.close(); store.close(); }
});
