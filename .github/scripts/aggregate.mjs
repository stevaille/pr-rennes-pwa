import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || 'datastore/data';
const OUTPUT_FILE = process.env.OUTPUT_FILE || 'predictions.json';

function floor15(minute) {
  return Math.floor(minute / 15) * 15;
}

function bucketKeyFromTs(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(d);

  const map = {};
  for (const p of parts) map[p.type] = p.value;

  const weekdayShort = map.weekday.toLowerCase().slice(0, 3);
  const hour = parseInt(map.hour, 10);
  const minute = floor15(parseInt(map.minute, 10));
  return `${weekdayShort}-${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

const files = fs.existsSync(DATA_DIR)
  ? fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.ndjson'))
  : [];

const byParc = {};

for (const file of files) {
  const content = fs.readFileSync(`${DATA_DIR}/${file}`, 'utf8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!row.idparc || row.dispo === null || row.dispo === undefined) continue;
    if (row.etatouverture === 'FERME') continue;

    const slot = bucketKeyFromTs(row.ts);
    if (!slot) continue;

    byParc[row.idparc] ||= { nom: row.nom, capacite: row.capacite, slots: {} };
    byParc[row.idparc].slots[slot] ||= [];
    byParc[row.idparc].slots[slot].push(row.dispo);
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  daysOfHistory: files.length,
  byParc: {}
};

for (const [idparc, parc] of Object.entries(byParc)) {
  out.byParc[idparc] = { nom: parc.nom, capacite: parc.capacite, slots: {} };
  for (const [slot, values] of Object.entries(parc.slots)) {
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    out.byParc[idparc].slots[slot] = {
      avg,
      min: Math.min(...values),
      max: Math.max(...values),
      samples: values.length
    };
  }
}

fs.mkdirSync(path.dirname(OUTPUT_FILE) || '.', { recursive: true });
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out));
console.log(`predictions.json généré (${files.length} jour(s) de données, ${Object.keys(out.byParc).length} parcs)`);
