const u1 = 'https://umbra-open-data-catalog.s3.us-west-2.amazonaws.com/stac/2025/2025-06/2025-06-22/01e9fe39-3a6e-4458-a5d1-cf92eb21b961/01e9fe39-3a6e-4458-a5d1-cf92eb21b961.json';
const j = await (await fetch(u1)).json();
console.log('PROPS', JSON.stringify(j.properties).slice(0, 2500));
const B = 'https://umbra-open-data-catalog.s3.us-west-2.amazonaws.com/';
for (const q of ['?list-type=2&delimiter=/&prefix=sar-data/', '?list-type=2&delimiter=/&prefix=sar-data/task-data/', '?list-type=2&delimiter=/&prefix=sar-data/tasks/&max-keys=5']) {
  const t = await (await fetch(B + q)).text();
  console.log('\nLIST', q, t.replace(/<LastModified>.*?<\/LastModified>|<ETag>.*?<\/ETag>|<StorageClass>.*?<\/StorageClass>/g, '').slice(0, 1500));
}
const t = await (await fetch(B + '?list-type=2&prefix=' + encodeURIComponent('sar-data/tasks/') + '&max-keys=40')).text();
console.log('\nKEYS', [...t.matchAll(/<Key>(.*?)<\/Key><Size>(\d+)/g)].map((m) => m[1] + ' ' + m[2]).join('\n'));
