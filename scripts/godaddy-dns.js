#!/usr/bin/env node
/**
 * GoDaddy DNS helper — run LOCALLY only. Do not commit API keys.
 *
 * Setup:
 *   1. Create API key: https://developer.godaddy.com/keys
 *   2. Copy .env.example to .env and fill GODADDY_KEY, GODADDY_SECRET
 *   3. In Railway → your service → Custom domains, add www + apex; copy the CNAME target shown.
 *
 * Usage:
 *   node scripts/godaddy-dns.js list
 *   node scripts/godaddy-dns.js domains   (see which domains THIS API key can manage)
 *   node scripts/godaddy-dns.js set-www --target xa07jftc.up.railway.app
 *   node scripts/godaddy-dns.js remove-apex-a          (removes all @ A records — use before new apex setup)
 *   node scripts/godaddy-dns.js set-apex-a --ips 1.2.3.4[,1.2.3.5]   (only if Railway gives you A records for apex)
 *
 * Docs: https://developer.godaddy.com/doc
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const https = require('https');

const DOMAIN = (process.env.GODADDY_DOMAIN || 'urbanhilt.com').trim();
const KEY = (process.env.GODADDY_KEY || '').trim();
const SECRET = (process.env.GODADDY_SECRET || '').trim();
/** Use api.ote-godaddy.com if your key is OTE (test) */
const API_HOST = (process.env.GODADDY_API_HOST || 'api.godaddy.com').trim();

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    if (!KEY || !SECRET) {
      reject(new Error('Set GODADDY_KEY and GODADDY_SECRET in .env (never paste them in chat).'));
      return;
    }
    const opts = {
      hostname: API_HOST,
      port: 443,
      path,
      method,
      headers: {
        Authorization: `sso-key ${KEY}:${SECRET}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data || res.statusMessage}`));
          return;
        }
        if (!data) return resolve(null);
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/** Domains visible to this key (proves account scope; may differ from website if wrong login) */
async function listDomains() {
  const data = await request('GET', '/v1/domains?statuses=ACTIVE&limit=100');
  const list = Array.isArray(data) ? data : [];
  if (list.length === 0) {
    console.log('No domains returned for this API key (empty list or no access).');
    return;
  }
  for (const d of list) {
    console.log(d.domain || d);
  }
  console.log(`\nTotal: ${list.length} (if ${DOMAIN} is missing, DNS API will 403 for that name)`);
}

async function listRecords() {
  const records = await request('GET', `/v1/domains/${encodeURIComponent(DOMAIN)}/records`);
  console.log(JSON.stringify(records, null, 2));
}

/** CNAME target should NOT include https:// — optional trailing dot is OK */
async function setWwwCname(target) {
  if (!target) throw new Error('Pass --target hostname.railway.app');
  const clean = target.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const body = [{ data: clean.endsWith('.') ? clean : `${clean}.`, ttl: 600 }];
  await request(
    'PUT',
    `/v1/domains/${encodeURIComponent(DOMAIN)}/records/CNAME/www`,
    body
  );
  console.log(`OK: www.${DOMAIN} → CNAME → ${clean}`);
}

/** Remove all A records on @ (apex) — e.g. old GitHub Pages */
async function removeApexA() {
  try {
    await request(
      'DELETE',
      `/v1/domains/${encodeURIComponent(DOMAIN)}/records/A/@`
    );
    console.log('OK: removed apex (@) A records.');
  } catch (e) {
    if (String(e.message).includes('404')) {
      console.log('No apex A records to remove (404).');
    } else {
      throw e;
    }
  }
}

/** Set apex A records (comma-separated). Only use IPs Railway shows for root domain. */
async function setApexA(ipsCsv) {
  const ips = ipsCsv.split(',').map((s) => s.trim()).filter(Boolean);
  if (!ips.length) throw new Error('Pass --ips 1.2.3.4');
  const body = ips.map((data) => ({ data, ttl: 600 }));
  await request('PUT', `/v1/domains/${encodeURIComponent(DOMAIN)}/records/A/@`, body);
  console.log(`OK: @ → A → ${ips.join(', ')}`);
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const out = { cmd, target: null, ips: null };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--target' && argv[i + 1]) out.target = argv[++i];
    if (argv[i] === '--ips' && argv[i + 1]) out.ips = argv[++i];
  }
  return out;
}

(async () => {
  const { cmd, target, ips } = parseArgs();
  try {
    switch (cmd) {
      case 'domains':
        await listDomains();
        break;
      case 'list':
        await listRecords();
        break;
      case 'set-www':
        await setWwwCname(target);
        break;
      case 'remove-apex-a':
        await removeApexA();
        break;
      case 'set-apex-a':
        await setApexA(ips);
        break;
      default:
        console.log(`
Commands:
  domains           List domain names this API key can access (debug 403 issues)
  list              List all DNS records
  set-www --target <host>     Point www to Railway CNAME target
  remove-apex-a     Delete apex (@) A records (e.g. old GitHub Pages)
  set-apex-a --ips <ip,ip>    Set apex A records (only if Railway instructs you to)

Domain: ${DOMAIN} (set GODADDY_DOMAIN in .env to override)
`);
        process.exit(cmd ? 1 : 0);
    }
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
})();
