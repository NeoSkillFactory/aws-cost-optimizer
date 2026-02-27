'use strict';

const { formatCurrency, formatMonthlyCost } = require('./utils');

/**
 * Generate a report from analysis results.
 * @param {object} results - The analysis results from analyzeTemplate
 * @param {string} format - Output format: 'text', 'json', or 'html'
 * @returns {string} Formatted report
 */
function generateReport(results, format = 'text') {
  switch (format.toLowerCase()) {
    case 'json':
      return generateJSONReport(results);
    case 'html':
      return generateHTMLReport(results);
    case 'text':
    default:
      return generateTextReport(results);
  }
}

/**
 * Generate a plain-text report.
 */
function generateTextReport(results) {
  const lines = [];
  const hr = '='.repeat(70);
  const thinHr = '-'.repeat(70);

  lines.push(hr);
  lines.push('  AWS CloudFormation Cost Optimization Report');
  lines.push(hr);
  lines.push('');

  if (!results.success) {
    lines.push('ANALYSIS FAILED');
    lines.push('');
    for (const err of results.errors) {
      lines.push(`  ERROR: ${err}`);
    }
    return lines.join('\n');
  }

  // Template info
  lines.push(`Template: ${results.templatePath}`);
  lines.push(`Description: ${results.templateDescription}`);
  lines.push(`Region: ${results.region} (pricing multiplier: ${results.regionMultiplier}x)`);
  lines.push('');

  // Summary
  const s = results.summary;
  lines.push(thinHr);
  lines.push('  SUMMARY');
  lines.push(thinHr);
  lines.push(`  Total Resources:         ${s.totalResources}`);
  lines.push(`  Estimated Monthly Cost:  ${formatMonthlyCost(s.totalMonthlyCost)}`);
  lines.push(`  Potential Savings:       ${formatMonthlyCost(s.totalPotentialSavings)}`);
  lines.push(`  Savings Percentage:      ${s.savingsPercentage.toFixed(1)}%`);
  lines.push('');

  // Resources by type
  lines.push('  Resources by Type:');
  for (const [type, count] of Object.entries(s.resourcesByType)) {
    const shortType = type.split('::').slice(-1)[0];
    lines.push(`    ${shortType}: ${count}`);
  }
  lines.push('');

  // Issues by category
  if (Object.keys(s.issuesByCategory).length > 0) {
    lines.push('  Issues by Category:');
    for (const [cat, info] of Object.entries(s.issuesByCategory)) {
      lines.push(`    ${cat}: ${info.count} issue(s), ${formatMonthlyCost(info.totalSavings)} potential savings`);
    }
    lines.push('');
  }

  // Recommendations
  if (results.recommendations.length > 0) {
    lines.push(thinHr);
    lines.push('  RECOMMENDATIONS');
    lines.push(thinHr);
    lines.push('');

    for (let i = 0; i < results.recommendations.length; i++) {
      const rec = results.recommendations[i];
      const severityIcon = getSeverityIcon(rec.severity);

      lines.push(`  ${i + 1}. [${severityIcon}] ${rec.title}`);
      lines.push(`     Resource: ${rec.resource} (${rec.resourceType})`);
      lines.push(`     ${rec.description}`);
      lines.push(`     Action: ${rec.recommendation}`);
      if (rec.estimatedSavings > 0) {
        lines.push(`     Estimated Savings: ${formatMonthlyCost(rec.estimatedSavings)}`);
      }
      lines.push('');
    }
  } else {
    lines.push('  No optimization recommendations found. Template looks well-optimized!');
    lines.push('');
  }

  // Resource details
  lines.push(thinHr);
  lines.push('  RESOURCE DETAILS');
  lines.push(thinHr);
  lines.push('');

  for (const res of results.resources) {
    const shortType = res.type.split('::').slice(-1)[0];
    lines.push(`  ${res.name} (${shortType})`);
    lines.push(`    Cost: ${formatMonthlyCost(res.cost.monthly)} (${res.cost.details})`);
    lines.push(`    Referenced: ${res.isReferenced ? 'Yes' : 'No'}`);
    if (res.issues.length > 0) {
      lines.push(`    Issues: ${res.issues.length}`);
    }
    lines.push('');
  }

  lines.push(hr);
  lines.push(`  Report generated at ${new Date().toISOString()}`);
  lines.push(hr);

  return lines.join('\n');
}

/**
 * Generate a JSON report.
 */
function generateJSONReport(results) {
  return JSON.stringify(results, null, 2);
}

/**
 * Generate an HTML report.
 */
function generateHTMLReport(results) {
  const lines = [];

  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="en">');
  lines.push('<head>');
  lines.push('  <meta charset="UTF-8">');
  lines.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
  lines.push('  <title>AWS CloudFormation Cost Optimization Report</title>');
  lines.push('  <style>');
  lines.push('    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; background: #f5f5f5; }');
  lines.push('    .header { background: #232f3e; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }');
  lines.push('    .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }');
  lines.push('    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }');
  lines.push('    .metric { text-align: center; padding: 16px; background: #f8f9fa; border-radius: 8px; }');
  lines.push('    .metric-value { font-size: 24px; font-weight: bold; color: #232f3e; }');
  lines.push('    .metric-label { color: #666; font-size: 14px; }');
  lines.push('    .savings { color: #2e7d32; }');
  lines.push('    table { width: 100%; border-collapse: collapse; }');
  lines.push('    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }');
  lines.push('    th { background: #f8f9fa; font-weight: 600; }');
  lines.push('    .severity-high { color: #c62828; font-weight: bold; }');
  lines.push('    .severity-medium { color: #f57f17; font-weight: bold; }');
  lines.push('    .severity-low { color: #2e7d32; font-weight: bold; }');
  lines.push('    .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; }');
  lines.push('    .tag-idle { background: #ffcdd2; color: #c62828; }');
  lines.push('    .tag-overprovisioned { background: #fff9c4; color: #f57f17; }');
  lines.push('    .tag-optimization { background: #c8e6c9; color: #2e7d32; }');
  lines.push('  </style>');
  lines.push('</head>');
  lines.push('<body>');

  // Header
  lines.push('  <div class="header">');
  lines.push('    <h1>AWS CloudFormation Cost Optimization Report</h1>');

  if (!results.success) {
    lines.push('    <p>Analysis failed</p>');
    lines.push('  </div>');
    for (const err of results.errors) {
      lines.push(`  <div class="card"><p style="color:red;">${escapeHtml(err)}</p></div>`);
    }
    lines.push('</body></html>');
    return lines.join('\n');
  }

  lines.push(`    <p>${escapeHtml(results.templateDescription)}</p>`);
  lines.push(`    <p>Region: ${escapeHtml(results.region)}</p>`);
  lines.push('  </div>');

  // Summary cards
  const s = results.summary;
  lines.push('  <div class="card">');
  lines.push('    <h2>Summary</h2>');
  lines.push('    <div class="summary">');
  lines.push(`      <div class="metric"><div class="metric-value">${s.totalResources}</div><div class="metric-label">Total Resources</div></div>`);
  lines.push(`      <div class="metric"><div class="metric-value">${formatCurrency(s.totalMonthlyCost)}</div><div class="metric-label">Est. Monthly Cost</div></div>`);
  lines.push(`      <div class="metric"><div class="metric-value savings">${formatCurrency(s.totalPotentialSavings)}</div><div class="metric-label">Potential Savings</div></div>`);
  lines.push(`      <div class="metric"><div class="metric-value savings">${s.savingsPercentage.toFixed(1)}%</div><div class="metric-label">Savings %</div></div>`);
  lines.push('    </div>');
  lines.push('  </div>');

  // Recommendations table
  if (results.recommendations.length > 0) {
    lines.push('  <div class="card">');
    lines.push('    <h2>Recommendations</h2>');
    lines.push('    <table>');
    lines.push('      <thead><tr><th>#</th><th>Severity</th><th>Category</th><th>Resource</th><th>Title</th><th>Savings</th></tr></thead>');
    lines.push('      <tbody>');

    for (let i = 0; i < results.recommendations.length; i++) {
      const rec = results.recommendations[i];
      const sevClass = `severity-${rec.severity}`;
      const tagClass = `tag-${rec.category}`;

      lines.push('        <tr>');
      lines.push(`          <td>${i + 1}</td>`);
      lines.push(`          <td class="${sevClass}">${rec.severity.toUpperCase()}</td>`);
      lines.push(`          <td><span class="tag ${tagClass}">${escapeHtml(rec.category)}</span></td>`);
      lines.push(`          <td>${escapeHtml(rec.resource)}</td>`);
      lines.push(`          <td>${escapeHtml(rec.title)}<br><small>${escapeHtml(rec.recommendation)}</small></td>`);
      lines.push(`          <td class="savings">${formatCurrency(rec.estimatedSavings || 0)}/mo</td>`);
      lines.push('        </tr>');
    }

    lines.push('      </tbody>');
    lines.push('    </table>');
    lines.push('  </div>');
  }

  // Resource details
  lines.push('  <div class="card">');
  lines.push('    <h2>Resource Details</h2>');
  lines.push('    <table>');
  lines.push('      <thead><tr><th>Name</th><th>Type</th><th>Monthly Cost</th><th>Issues</th></tr></thead>');
  lines.push('      <tbody>');

  for (const res of results.resources) {
    const shortType = res.type.split('::').slice(-1)[0];
    lines.push('        <tr>');
    lines.push(`          <td>${escapeHtml(res.name)}</td>`);
    lines.push(`          <td>${escapeHtml(shortType)}</td>`);
    lines.push(`          <td>${formatCurrency(res.cost.monthly)}</td>`);
    lines.push(`          <td>${res.issues.length}</td>`);
    lines.push('        </tr>');
  }

  lines.push('      </tbody>');
  lines.push('    </table>');
  lines.push('  </div>');

  // Footer
  lines.push(`  <p style="text-align:center;color:#666;font-size:12px;">Report generated at ${new Date().toISOString()} by aws-cost-optimizer</p>`);
  lines.push('</body>');
  lines.push('</html>');

  return lines.join('\n');
}

function getSeverityIcon(severity) {
  switch (severity) {
    case 'high': return 'HIGH';
    case 'medium': return 'MEDIUM';
    case 'low': return 'LOW';
    default: return 'INFO';
  }
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  generateReport,
  generateTextReport,
  generateJSONReport,
  generateHTMLReport,
  escapeHtml
};
