// one-off: print the shape of the open SAR catalogues (run in GitHub Actions)
const urls = process.argv.slice(2);
for (const u of urls) {
  try {
    const r = await fetch(u); const t = await r.text();
    console.log(`\n### ${u} → ${r.status} ${r.headers.get('content-type')} cors=${r.headers.get('access-control-allow-origin')} ${t.length} bytes`);
    console.log(t.slice(0, 2500));
  } catch (e) { console.log(`\n### ${u} → ${e.message}`); }
}
