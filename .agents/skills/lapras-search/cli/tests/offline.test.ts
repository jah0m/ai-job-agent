import{expect,test}from"bun:test";import{BASE_URL,detailUrl,parseDetail,sitemapEntries}from"../src/cli.ts";
const syntheticId="999999999999001";const syntheticUrl=`${BASE_URL}/jobs/${syntheticId}`;
test("parses public sitemap",()=>{expect(sitemapEntries(`<url><loc>${syntheticUrl}</loc><lastmod>2026-08-25</lastmod></url>`)[0]).toEqual({id:syntheticId,url:syntheticUrl,updatedAt:"2026-08-25"})});
test("parses public detail and restricts URLs",()=>{const j=parseDetail('<title>Backend Engineer | LAPRAS</title><body><h1>Backend Engineer</h1>Python role</body>',syntheticUrl);expect(j.title).toBe("Backend Engineer");expect(j.contentAvailable).toBe(true);expect(detailUrl(syntheticId)).toBe(syntheticUrl);expect(detailUrl("https://example.invalid/jobs/test-job")).toBeNull()});
test("marks the client-only shell honestly",()=>{expect(parseDetail('<html><div id="app"></div></html>',syntheticUrl).contentAvailable).toBe(false)});
