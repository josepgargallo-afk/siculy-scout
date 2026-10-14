import { describe, it } from 'vitest';
import { searchCompanies } from '../../src/lib/enrich/search';

const QUERIES = ['Barilla', 'Pastificio Di Martino', 'Pasticceria Cappello Palermo', 'Caffè Borbone', 'Conserve Italia', 'Mercadona', 'Danone', 'Equinor', 'Agrofert', 'Gamberi del Sud'];
describe('sondeo', () => {
  for (const q of QUERIES) {
    it(q, async () => {
      const r = await searchCompanies(q, { fetch: (u, i) => fetch(u, { ...i, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36', Referer: 'https://usuario.github.io/', ...(i?.headers as Record<string, string>) } }) });
      console.log('\n=== ' + q + '\n' + r.sources.map((s) => `${s.id}:${s.status}${s.error ? '(' + s.error + ')' : ''}${s.count ? '×' + s.count : ''}`).join('  '));
      for (const c of r.candidates.slice(0, 6)) console.log(`  ${c.score.toFixed(2)} [${c.source}] ${c.title} — ${c.subtitle}${c.inactive ? ' (INACTIVA)' : ''}\n      ${JSON.stringify(c.fields)}${c.logoUrl ? '\n      logo: ' + c.logoUrl : ''}`);
      await new Promise((ok) => setTimeout(ok, 1200)); // cortesía con Nominatim
    });
  }
});
