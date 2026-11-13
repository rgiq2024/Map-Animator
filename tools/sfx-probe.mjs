const api = 'https://commons.wikimedia.org/w/api.php?format=json&';
const UA = { 'User-Agent': 'GIS-One-Map-Animator (github.com/rgiq2024/Map-Animator)' };
const j = async (q) => { await new Promise((r) => setTimeout(r, 1500)); const r = await fetch(api + q, { headers: { ...UA, 'Api-User-Agent': UA['User-Agent'] } }); const t = await r.text(); try { return JSON.parse(t); } catch { console.log('NOTJSON', r.status, t.slice(0, 300)); return {}; } };
const titles = new Set();
for (const c of ['Category:Sounds of typewriters', 'Category:Typewriter sounds', 'Category:Audio files of typewriters', 'Category:Sounds of computer keyboards', 'Category:Computer keyboard sounds', 'Category:Keyboard sounds']) {
  const r = await j(`action=query&list=categorymembers&cmtitle=${encodeURIComponent(c)}&cmlimit=100&cmtype=file|subcat`);
  for (const m of r.query?.categorymembers || []) { console.log(c, '→', m.title); if (m.title.startsWith('File:')) titles.add(m.title); }
}
for (const q of ['typewriter filetype:audio', 'typewriter bell', 'keyboard typing filetype:audio', 'typing sound filetype:audio']) {
  const r = await j(`action=query&list=search&srnamespace=6&srlimit=40&srsearch=${encodeURIComponent(q)}`);
  for (const m of r.query?.search || []) titles.add(m.title);
}
const list = [...titles];
for (let i = 0; i < list.length; i += 40) {
  const r = await j(`action=query&prop=imageinfo&iiprop=url|size|mime|extmetadata&titles=${encodeURIComponent(list.slice(i, i + 40).join('|'))}`);
  for (const p of Object.values(r.query?.pages || {})) {
    const ii = p.imageinfo?.[0]; if (!ii || !/audio|ogg|wav|flac|mp3|webm/i.test(ii.mime)) continue;
    const m = ii.extmetadata || {};
    console.log(`AUDIO | ${p.title} | ${ii.mime} | ${Math.round(ii.size / 1024)} kB | ${m.LicenseShortName?.value} | ${(m.ImageDescription?.value || '').replace(/<[^>]+>/g, '').slice(0, 120)} | ${ii.url}`);
  }
}
