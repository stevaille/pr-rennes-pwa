import fs from 'node:fs';

const ENDPOINTS = [
  'https://data.rennesmetropole.fr/api/explore/v2.1/catalog/datasets/tco-parcsrelais-star-etat-tr/records?limit=40',
  'https://data.explore.star.fr/api/explore/v2.1/catalog/datasets/tco-parcsrelais-star-etat-tr/records?limit=40'
];

const OUTPUT_DIR = process.env.OUTPUT_DIR || 'data';

function pick(row, keys) {
  const rowKeys = Object.keys(row);
  for (const k of keys) {
    const found = rowKeys.find((rk) => rk.toLowerCase() === k.toLowerCase());
    if (found !== undefined && row[found] !== null && row[found] !== '') return row[found];
  }
  return undefined;
}

async function fetchRows() {
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      const rows = Array.isArray(json.results)
        ? json.results
        : Array.isArray(json.records)
        ? json.records.map((r) => r.fields || r)
        : Array.isArray(json)
        ? json
        : [];
      if (rows.length) return rows;
      throw new Error('Réponse vide');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Aucune source disponible');
}

function normalize(row) {
  const dispoTypes = ['jrdinfosoliste', 'jrdinfopmr', 'jrdinfocovoiturage', 'jrdinfoelectrique'];
  const dispoValues = dispoTypes.map((k) => row[k]).filter((v) => v !== null && v !== undefined && v !== '');
  const dispoSum = dispoValues.length ? dispoValues.reduce((a, b) => a + Number(b), 0) : null;
  const dispoDirect = pick(row, ['dispotot', 'dispo_tot', 'disponibilite', 'disponible', 'dispo']);
  const dispo = dispoDirect !== undefined ? Number(dispoDirect) : dispoSum;

  return {
    ts: pick(row, ['lastupdate', 'last_update', 'derniere_maj']) || new Date().toISOString(),
    idparc: pick(row, ['idparc', 'id_parc', 'id']) || null,
    nom: pick(row, ['nom', 'nomparc', 'nom_parc', 'name', 'libelle']) || 'Parc relais',
    etatouverture: String(pick(row, ['etatouverture', 'etat_ouverture', 'etat']) || '').toUpperCase(),
    capacite: Number(pick(row, ['capaciteparking', 'capacitetotale', 'capacite_totale', 'capacite'])) || null,
    dispo: dispo !== null && !Number.isNaN(dispo) ? dispo : null
  };
}

try {
  const rows = await fetchRows();
  const parcs = rows.map(normalize);

  const day = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const lines = parcs.map((p) => JSON.stringify(p)).join('\n') + '\n';
  fs.appendFileSync(`${OUTPUT_DIR}/${day}.ndjson`, lines);

  console.log(`Journalisé ${parcs.length} parcs pour ${day}`);
} catch (e) {
  console.warn('Relevé ignoré, source indisponible :', e.message);
}
