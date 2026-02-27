'use strict';

const path = require('path');
const { analyzeTemplate } = require('../scripts/analyze');

const TEMPLATES_DIR = path.join(__dirname, '..', 'assets', 'templates');

describe('analyzeTemplate', () => {
  test('analyzes YAML template successfully', () => {
    const results = analyzeTemplate(path.join(TEMPLATES_DIR, 'sample-overprovisioned.yaml'));
    expect(results.success).toBe(true);
    expect(results.errors).toHaveLength(0);
    expect(results.resources.length).toBeGreaterThan(0);
    expect(results.recommendations.length).toBeGreaterThan(0);
    expect(results.summary).toBeDefined();
  });

  test('analyzes JSON template successfully', () => {
    const results = analyzeTemplate(path.join(TEMPLATES_DIR, 'sample-overprovisioned.json'));
    expect(results.success).toBe(true);
    expect(results.resources.length).toBeGreaterThan(0);
  });

  test('detects idle resources', () => {
    const results = analyzeTemplate(path.join(TEMPLATES_DIR, 'sample-overprovisioned.yaml'));
    const idleIssues = results.recommendations.filter(r => r.category === 'idle');
    expect(idleIssues.length).toBeGreaterThan(0);

    // Should detect unattached volumes
    const volumeIssues = idleIssues.filter(r => r.resourceType === 'AWS::EC2::Volume');
    expect(volumeIssues.length).toBeGreaterThan(0);

    // Should detect unassociated EIPs
    const eipIssues = idleIssues.filter(r => r.resourceType === 'AWS::EC2::EIP');
    expect(eipIssues.length).toBeGreaterThan(0);
  });

  test('detects over-provisioned resources', () => {
    const results = analyzeTemplate(path.join(TEMPLATES_DIR, 'sample-overprovisioned.yaml'));
    const overIssues = results.recommendations.filter(r => r.category === 'overprovisioned');
    expect(overIssues.length).toBeGreaterThan(0);

    // Should detect over-provisioned EC2
    const ec2Issues = overIssues.filter(r => r.resourceType === 'AWS::EC2::Instance');
    expect(ec2Issues.length).toBeGreaterThan(0);

    // Should detect over-provisioned RDS
    const rdsIssues = overIssues.filter(r => r.resourceType === 'AWS::RDS::DBInstance');
    expect(rdsIssues.length).toBeGreaterThan(0);
  });

  test('detects optimization opportunities', () => {
    const results = analyzeTemplate(path.join(TEMPLATES_DIR, 'sample-overprovisioned.yaml'));
    const optIssues = results.recommendations.filter(r => r.category === 'optimization');
    expect(optIssues.length).toBeGreaterThan(0);
  });

  test('calculates cost summary', () => {
    const results = analyzeTemplate(path.join(TEMPLATES_DIR, 'sample-overprovisioned.yaml'));
    expect(results.summary.totalMonthlyCost).toBeGreaterThan(0);
    expect(results.summary.totalPotentialSavings).toBeGreaterThan(0);
    expect(results.summary.savingsPercentage).toBeGreaterThan(0);
    expect(results.summary.savingsPercentage).toBeLessThanOrEqual(100);
  });

  test('sorts recommendations by savings descending', () => {
    const results = analyzeTemplate(path.join(TEMPLATES_DIR, 'sample-overprovisioned.yaml'));
    for (let i = 1; i < results.recommendations.length; i++) {
      const prev = results.recommendations[i - 1].estimatedSavings || 0;
      const curr = results.recommendations[i].estimatedSavings || 0;
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  test('applies region multiplier', () => {
    const usEast = analyzeTemplate(path.join(TEMPLATES_DIR, 'sample-overprovisioned.json'), { region: 'us-east-1' });
    const tokyo = analyzeTemplate(path.join(TEMPLATES_DIR, 'sample-overprovisioned.json'), { region: 'ap-northeast-1' });
    expect(tokyo.summary.totalMonthlyCost).toBeGreaterThan(usEast.summary.totalMonthlyCost);
  });

  test('handles missing template file', () => {
    expect(() => analyzeTemplate('/does/not/exist.yaml')).toThrow();
  });

  test('categorizes issues correctly', () => {
    const results = analyzeTemplate(path.join(TEMPLATES_DIR, 'sample-overprovisioned.yaml'));
    const categories = results.summary.issuesByCategory;
    expect(categories).toBeDefined();
    for (const [cat, info] of Object.entries(categories)) {
      expect(info.count).toBeGreaterThan(0);
      expect(typeof info.totalSavings).toBe('number');
    }
  });

  test('counts resource types', () => {
    const results = analyzeTemplate(path.join(TEMPLATES_DIR, 'sample-overprovisioned.yaml'));
    const types = results.summary.resourcesByType;
    expect(types['AWS::EC2::Instance']).toBeDefined();
    expect(types['AWS::EC2::Instance']).toBeGreaterThan(0);
  });

  test('detects GPU instance anti-pattern', () => {
    const results = analyzeTemplate(path.join(TEMPLATES_DIR, 'sample-overprovisioned.yaml'));
    const gpuIssues = results.recommendations.filter(r =>
      r.title.includes('GPU')
    );
    expect(gpuIssues.length).toBeGreaterThan(0);
  });

  test('detects DynamoDB high throughput', () => {
    const results = analyzeTemplate(path.join(TEMPLATES_DIR, 'sample-overprovisioned.yaml'));
    const dynamoIssues = results.recommendations.filter(r =>
      r.resourceType === 'AWS::DynamoDB::Table'
    );
    expect(dynamoIssues.length).toBeGreaterThan(0);
  });

  test('detects load balancer without targets', () => {
    const results = analyzeTemplate(path.join(TEMPLATES_DIR, 'sample-overprovisioned.yaml'));
    const albIssues = results.recommendations.filter(r =>
      r.title.includes('Load Balancer Without Targets')
    );
    expect(albIssues.length).toBeGreaterThan(0);
  });
});
