import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 1,
  duration: '5s',
};

export default function () {
  const res = http.get('http://api:3000/health');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'body has status ok': (r) => typeof r.body === 'string' && r.body.includes('"status":"ok"'),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSummary(data: any) {
  return {
    '/reports/smoke-report.html': buildHtml(data),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildHtml(data: any): string {
  const metrics = data.metrics ?? {};
  const checks: Record<string, { name: string; passes: number; fails: number }> =
    data.root_group?.checks ?? {};
  const durationMs: number = data.state?.testRunDurationMs ?? 0;

  const httpReqs = metrics['http_reqs']?.values?.count ?? 0;
  const reqRate = ((metrics['http_reqs']?.values?.rate ?? 0) as number).toFixed(2);
  const p95 = ((metrics['http_req_duration']?.values?.['p(95)'] ?? 0) as number).toFixed(2);
  const avg = ((metrics['http_req_duration']?.values?.avg ?? 0) as number).toFixed(2);
  const errorRate = (((metrics['http_req_failed']?.values?.rate ?? 0) as number) * 100).toFixed(2);
  const checkRate = (((metrics['checks']?.values?.rate ?? 0) as number) * 100).toFixed(2);

  const checkRows = Object.values(checks)
    .map((c) => {
      const total = c.passes + c.fails;
      const pass = c.fails === 0;
      const color = pass ? '#2d6a4f' : '#c0392b';
      return `    <tr><td>${c.name}</td><td style="color:${color};font-weight:bold">${pass ? 'PASS' : 'FAIL'}</td><td>${c.passes}/${total}</td></tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>k6 Smoke Report</title>
  <style>
    body{font-family:sans-serif;max-width:720px;margin:40px auto;color:#222}
    h1{font-size:1.4rem;margin-bottom:.25rem}
    p.meta{color:#666;font-size:.9rem;margin-top:0}
    h2{font-size:1.1rem;margin-top:2rem}
    table{border-collapse:collapse;width:100%;margin-top:1rem}
    th{text-align:left;background:#f4f4f4;padding:8px 12px;border-bottom:2px solid #ddd}
    td{padding:7px 12px;border-bottom:1px solid #eee}
  </style>
</head>
<body>
  <h1>k6 Smoke Test Report</h1>
  <p class="meta">Duration: ${(durationMs / 1000).toFixed(1)}s &nbsp;|&nbsp; VUs: 1</p>
  <h2>HTTP Metrics</h2>
  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Total requests</td><td>${httpReqs}</td></tr>
    <tr><td>Request rate</td><td>${reqRate} req/s</td></tr>
    <tr><td>Avg response time</td><td>${avg} ms</td></tr>
    <tr><td>p95 response time</td><td>${p95} ms</td></tr>
    <tr><td>Error rate</td><td>${errorRate}%</td></tr>
    <tr><td>Check pass rate</td><td>${checkRate}%</td></tr>
  </table>
  <h2>Checks</h2>
  <table>
    <tr><th>Check</th><th>Result</th><th>Passes / Total</th></tr>
${checkRows}
  </table>
</body>
</html>`;
}
