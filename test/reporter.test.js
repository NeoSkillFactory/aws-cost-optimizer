'use strict';

const path = require('path');
const { analyzeTemplate } = require('../scripts/analyze');
const { generateReport, escapeHtml } = require('../scripts/reporter');

const TEMPLATES_DIR = path.join(__dirname, '..', 'assets', 'templates');

describe('reporter', () => {
  let results;

  beforeAll(() => {
    results = analyzeTemplate(path.join(TEMPLATES_DIR, 'sample-overprovisioned.yaml'));
  });

  describe('generateReport - text', () => {
    test('generates text report', () => {
      const report = generateReport(results, 'text');
      expect(report).toContain('AWS CloudFormation Cost Optimization Report');
      expect(report).toContain('SUMMARY');
      expect(report).toContain('RECOMMENDATIONS');
      expect(report).toContain('RESOURCE DETAILS');
    });

    test('includes cost figures', () => {
      const report = generateReport(results, 'text');
      expect(report).toContain('$');
      expect(report).toContain('/month');
    });

    test('includes resource names', () => {
      const report = generateReport(results, 'text');
      expect(report).toContain('WebServer');
      expect(report).toContain('OrphanedVolume');
    });
  });

  describe('generateReport - json', () => {
    test('generates valid JSON', () => {
      const report = generateReport(results, 'json');
      const parsed = JSON.parse(report);
      expect(parsed.success).toBe(true);
      expect(parsed.resources).toBeDefined();
      expect(Array.isArray(parsed.recommendations)).toBe(true);
    });
  });

  describe('generateReport - html', () => {
    test('generates HTML report', () => {
      const report = generateReport(results, 'html');
      expect(report).toContain('<!DOCTYPE html>');
      expect(report).toContain('Cost Optimization Report');
      expect(report).toContain('</html>');
    });

    test('contains summary metrics', () => {
      const report = generateReport(results, 'html');
      expect(report).toContain('Total Resources');
      expect(report).toContain('Potential Savings');
    });

    test('contains recommendation table', () => {
      const report = generateReport(results, 'html');
      expect(report).toContain('<table>');
      expect(report).toContain('Severity');
    });
  });

  describe('generateReport - failed analysis', () => {
    test('handles failed results in text', () => {
      const failed = { success: false, errors: ['Missing Resources section'] };
      const report = generateReport(failed, 'text');
      expect(report).toContain('ANALYSIS FAILED');
      expect(report).toContain('Missing Resources section');
    });

    test('handles failed results in html', () => {
      const failed = { success: false, errors: ['Bad template'] };
      const report = generateReport(failed, 'html');
      expect(report).toContain('Analysis failed');
      expect(report).toContain('Bad template');
    });
  });

  describe('escapeHtml', () => {
    test('escapes special HTML characters', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
      expect(escapeHtml('a&b')).toBe('a&amp;b');
      expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    });

    test('handles non-string input', () => {
      expect(escapeHtml(42)).toBe('42');
    });
  });
});
