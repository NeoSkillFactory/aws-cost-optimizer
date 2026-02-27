'use strict';

const path = require('path');
const { analyzeTemplate } = require('./analyze');
const { generateReport } = require('./reporter');

const VERSION = '1.0.0';
const SKILL_NAME = 'aws-cost-optimizer';

function printHelp() {
  const help = `
${SKILL_NAME} v${VERSION}
Analyze AWS CloudFormation templates for cost optimization opportunities.

Usage:
  cfn-cost-opt analyze <template-path> [options]
  cfn-cost-opt --help
  cfn-cost-opt --version

Commands:
  analyze    Analyze a CloudFormation template for cost optimization

Options:
  --format <type>    Output format: text (default), json, html
  --region <region>  AWS region for pricing (default: us-east-1)
  --output <file>    Write report to file instead of stdout
  --help, -h         Show this help message
  --version, -v      Show version number

Examples:
  cfn-cost-opt analyze template.yaml
  cfn-cost-opt analyze stack.json --format json
  cfn-cost-opt analyze template.yaml --region eu-west-1 --format html --output report.html
`;
  console.log(help.trim());
}

function printVersion() {
  console.log(`${SKILL_NAME} v${VERSION}`);
}

function parseArgs(argv) {
  const args = {
    command: null,
    templatePath: null,
    format: 'text',
    region: 'us-east-1',
    output: null,
    help: false,
    version: false
  };

  const rawArgs = argv.slice(2);
  let i = 0;

  while (i < rawArgs.length) {
    const arg = rawArgs[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--version' || arg === '-v') {
      args.version = true;
    } else if (arg === '--format' && i + 1 < rawArgs.length) {
      i++;
      args.format = rawArgs[i];
    } else if (arg === '--region' && i + 1 < rawArgs.length) {
      i++;
      args.region = rawArgs[i];
    } else if (arg === '--output' && i + 1 < rawArgs.length) {
      i++;
      args.output = rawArgs[i];
    } else if (!arg.startsWith('-')) {
      if (!args.command) {
        args.command = arg;
      } else if (!args.templatePath) {
        args.templatePath = arg;
      }
    }

    i++;
  }

  return args;
}

function run(argv) {
  const args = parseArgs(argv || process.argv);

  if (args.help) {
    printHelp();
    return 0;
  }

  if (args.version) {
    printVersion();
    return 0;
  }

  if (!args.command) {
    console.error('Error: No command specified. Use --help for usage information.');
    return 1;
  }

  if (args.command !== 'analyze') {
    console.error(`Error: Unknown command "${args.command}". Use --help for usage information.`);
    return 1;
  }

  if (!args.templatePath) {
    console.error('Error: No template path specified. Usage: cfn-cost-opt analyze <template-path>');
    return 1;
  }

  // Validate format
  const validFormats = ['text', 'json', 'html'];
  if (!validFormats.includes(args.format)) {
    console.error(`Error: Invalid format "${args.format}". Valid formats: ${validFormats.join(', ')}`);
    return 1;
  }

  try {
    const results = analyzeTemplate(args.templatePath, {
      region: args.region
    });

    const report = generateReport(results, args.format);

    if (args.output) {
      const fs = require('fs');
      fs.writeFileSync(args.output, report, 'utf8');
      console.log(`Report written to ${args.output}`);
    } else {
      console.log(report);
    }

    if (!results.success) {
      return 1;
    }

    return 0;
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return 1;
  }
}

// Run if called directly
if (require.main === module) {
  const exitCode = run();
  process.exit(exitCode);
}

module.exports = { run, parseArgs, printHelp, printVersion };
