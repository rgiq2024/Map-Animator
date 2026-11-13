// one-off: walk each open SAR STAC catalogue down to its first items and print their assets
const roots = { capella: 'https://capella-open-data.s3.us-west-2.amazonaws.com/stac/capella-open-data-by-datetime/catalog.json', iceye: 'https://iceye-open-data-catalog.s3.amazonaws.com/collections/iceye-sar.json', umbra: 'https://umbra-open-data-catalog.s3.us-west-2.amazonaws.com/stac/2025/catalog.json' };
const get = async (u) => (await fetch(u)).json();
for (const [name, root] of Object.entries(roots)) {
  console.log(`\n######## ${name}`);
  let url = root, depth = 0;
  try {
    while (depth++ < 8) {
      const j = await get(url);
      const links = (j.links || []).filter((l) => l.rel === 'child' || l.rel === 'item');
      console.log(`${j.type} ${j.id} — ${links.length} children/items; first: ${links.slice(0, 3).map((l) => l.rel + ':' + l.href).join(' , ')}`);
      if (j.type === 'Feature') {
        console.log(JSON.stringify({ id: j.id, bbox: j.bbox, geom: j.geometry?.type, props: Object.fromEntries(Object.entries(j.properties || {}).slice(0, 25)) }, null, 0).slice(0, 2000));
        for (const [k, a] of Object.entries(j.assets || {})) console.log(`  asset ${k}: ${a.type} roles=${(a.roles || []).join('|')} ${a.href}`);
        break;
      }
      const nx = links.find((l) => l.rel === 'item') || links[0];
      if (!nx) break;
      url = new URL(nx.href, url).href;
    }
  } catch (e) { console.log('ERR', e.message, url); }
}
