/**
 * Parse the dashboard's GENERATED inline script.
 *
 * The dashboard markup (and its inline <script>) is built inside a template
 * literal in src/dashboard.js, so `node --check src/dashboard.js` CANNOT see a
 * break inside that script - a single backslash-n in the source becomes a real
 * newline in the output and kills every handler on the page.
 * This renders the page with mock data and parses what actually ships.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { dashboardPage } from '../src/dashboard.js';

const mock = {
  stats: { total: 2, fresh: 1, contacted: 1, closed: 0, qualified: 0, lost: 0, spam: 0, dupes: 0, hot: 1, week: 2 },
  views: { total: 10, week: 5 },
  funnel: { starts: 4, completes: 2 },
  rows: [
    {
      id: 1, created_at: '2026-11-12 10:00:00', name: 'Test "Name" & <tag>', email: 'a@example.com', phone: '908-555-0100',
      capital: '$50,000', timeline: 'Immediately', experience: 'Beginner', interest: 'Brand', decision: 'Yes',
      stage: 'new', score: 90, owner: '', spam: 0, notes: '', source: 'funnel', page_url: '', referrer: '',
      utm_source: 'instagram', utm_campaign: 'spring', duplicate_of: null, visitor_id: 'v1', device: 'desktop',
      country: 'US', delete_token: 'tok', source_label: 'instagram', last_contacted_at: null,
    },
  ],
  content: { headline: '', subheadline: '', cta_label: '', specialties: '' },
  daily: [{ day: '2026-11-12', views: 10, leads: 2 }],
  sources: [{ src: 'instagram', n: 2 }],
  activity: [], errors: [], admins: [{ id: 1, email: 'a@b.c', created_at: '', last_login_at: '' }],
  settings: {}, reminders: [], listed: 1, totalRows: 1,
};

const html = dashboardPage(mock, 'csrf-token');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!blocks.length) {
  console.error('FAIL - the dashboard rendered no inline script');
  process.exit(1);
}
let bad = 0;
blocks.forEach((b, i) => {
  const f = `/tmp/dashboard-generated-${i}.js`;
  fs.writeFileSync(f, b);
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    console.log(`  generated script ${i}: OK (${b.length} chars)`);
  } catch (e) {
    bad++;
    console.error(`  generated script ${i}: SYNTAX ERROR`);
    console.error((e.stderr || '').toString().split('\n').slice(0, 8).join('\n'));
  }
});
if (bad) {
  console.error('\nThe dashboard script does not parse - a single \\n inside the template literal becomes a real newline.');
  process.exit(1);
}
console.log('the generated dashboard script parses cleanly');
