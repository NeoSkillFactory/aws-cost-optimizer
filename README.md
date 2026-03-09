# aws-cost-optimizer

![Audit](https://img.shields.io/badge/audit%3A%20PASS-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue) ![OpenClaw](https://img.shields.io/badge/OpenClaw-skill-orange)

> Automatically analyzes AWS CloudFormation templates to identify unused or over-provisioned resources for cost optimization.

## Features

- **Template Analysis**: Parses JSON/YAML CloudFormation files to map resource dependencies
- **Idle Detection**: Identifies unused resources (inactive instances, detached volumes)
- **Over-provisioning Checks**: Compares requested vs actual capacity (CPU/memory, instance sizes)
- **Recommendation Engine**: Suggests optimization paths with cost savings estimates
- **Multi-format CLI**: Supports JSON/Text/HTML report formats with standardized CLI
- **OCA Integration**: Exposes analysis results via OpenClaw agent triggers

## GitHub

Source code: [github.com/NeoSkillFactory/aws-cost-optimizer](https://github.com/NeoSkillFactory/aws-cost-optimizer)

**Price suggestion:** $29.99 USD

## License

MIT © NeoSkillFactory
