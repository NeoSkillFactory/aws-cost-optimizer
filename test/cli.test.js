'use strict';

const path = require('path');
const { run, parseArgs } = require('../scripts/cli');

const TEMPLATES_DIR = path.join(__dirname, '..', 'assets', 'templates');
const YAML_TEMPLATE = path.join(TEMPLATES_DIR, 'sample-overprovisioned.yaml');

describe('cli', () => {
  let originalLog, originalError;
  let logOutput, errOutput;

  beforeEach(() => {
    logOutput = [];
    errOutput = [];
    originalLog = console.log;
    originalError = console.error;
    console.log = (...args) => logOutput.push(args.join(' '));
    console.error = (...args) => errOutput.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  describe('parseArgs', () => {
    test('parses analyze command with path', () => {
      const args = parseArgs(['node', 'cli.js', 'analyze', 'template.yaml']);
      expect(args.command).toBe('analyze');
      expect(args.templatePath).toBe('template.yaml');
    });

    test('parses --format flag', () => {
      const args = parseArgs(['node', 'cli.js', 'analyze', 't.yaml', '--format', 'json']);
      expect(args.format).toBe('json');
    });

    test('parses --region flag', () => {
      const args = parseArgs(['node', 'cli.js', 'analyze', 't.yaml', '--region', 'eu-west-1']);
      expect(args.region).toBe('eu-west-1');
    });

    test('parses --output flag', () => {
      const args = parseArgs(['node', 'cli.js', 'analyze', 't.yaml', '--output', 'report.txt']);
      expect(args.output).toBe('report.txt');
    });

    test('parses --help flag', () => {
      const args = parseArgs(['node', 'cli.js', '--help']);
      expect(args.help).toBe(true);
    });

    test('parses --version flag', () => {
      const args = parseArgs(['node', 'cli.js', '--version']);
      expect(args.version).toBe(true);
    });

    test('parses -h shorthand', () => {
      const args = parseArgs(['node', 'cli.js', '-h']);
      expect(args.help).toBe(true);
    });

    test('parses -v shorthand', () => {
      const args = parseArgs(['node', 'cli.js', '-v']);
      expect(args.version).toBe(true);
    });
  });

  describe('run', () => {
    test('shows help and returns 0', () => {
      const code = run(['node', 'cli.js', '--help']);
      expect(code).toBe(0);
      expect(logOutput.join('\n')).toContain('Usage');
    });

    test('shows version and returns 0', () => {
      const code = run(['node', 'cli.js', '--version']);
      expect(code).toBe(0);
      expect(logOutput.join('\n')).toContain('1.0.0');
    });

    test('returns 1 with no command', () => {
      const code = run(['node', 'cli.js']);
      expect(code).toBe(1);
      expect(errOutput.join('\n')).toContain('No command specified');
    });

    test('returns 1 for unknown command', () => {
      const code = run(['node', 'cli.js', 'badcmd']);
      expect(code).toBe(1);
      expect(errOutput.join('\n')).toContain('Unknown command');
    });

    test('returns 1 with no template path', () => {
      const code = run(['node', 'cli.js', 'analyze']);
      expect(code).toBe(1);
      expect(errOutput.join('\n')).toContain('No template path');
    });

    test('returns 1 for invalid format', () => {
      const code = run(['node', 'cli.js', 'analyze', YAML_TEMPLATE, '--format', 'xml']);
      expect(code).toBe(1);
      expect(errOutput.join('\n')).toContain('Invalid format');
    });

    test('returns 1 for missing file', () => {
      const code = run(['node', 'cli.js', 'analyze', '/no/such/file.yaml']);
      expect(code).toBe(1);
    });

    test('analyzes template successfully', () => {
      const code = run(['node', 'cli.js', 'analyze', YAML_TEMPLATE]);
      expect(code).toBe(0);
      expect(logOutput.join('\n')).toContain('Cost Optimization Report');
    });

    test('outputs JSON format', () => {
      const code = run(['node', 'cli.js', 'analyze', YAML_TEMPLATE, '--format', 'json']);
      expect(code).toBe(0);
      const parsed = JSON.parse(logOutput.join('\n'));
      expect(parsed.success).toBe(true);
    });

    test('outputs HTML format', () => {
      const code = run(['node', 'cli.js', 'analyze', YAML_TEMPLATE, '--format', 'html']);
      expect(code).toBe(0);
      expect(logOutput.join('\n')).toContain('<!DOCTYPE html>');
    });
  });
});
