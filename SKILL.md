---
name: aws-cost-optimizer
description: Automatically analyzes AWS CloudFormation templates to identify unused or over-provisioned resources for cost optimization.
version: 1.0.0
author: OpenClaw
tags:
  - aws
  - cloudformation
  - cost-optimization
  - devops
triggers:
  - "Find unused resources in my CloudFormation template"
  - "Optimize costs for this AWS template"
  - "What resources in this CFN template are over-provisioned?"
  - "Analyze CloudFormation template for cost savings opportunities"
  - "Show me cost optimization recommendations for this AWS stack"
  - "Review this CloudFormation file for waste"
  - "Generate cost report for CloudFormation template"
---

# aws-cost-optimizer

## 1. Skill Name
aws-cost-optimizer

## 2. One-Sentence Description
Automatically analyzes AWS CloudFormation templates to identify unused or over-provisioned resources for cost optimization.

## 3. Core Capabilities
- **Template Analysis**: Parses JSON/YAML CloudFormation files to map resource dependencies
- **Idle Detection**: Identifies unused resources (inactive instances, detached volumes)
- **Over-provisioning Checks**: Compares requested vs actual capacity (CPU/memory, instance sizes)
- **Recommendation Engine**: Suggests optimization paths with cost savings estimates
- **Multi-format CLI**: Supports JSON/Text/HTML report formats with standardized CLI
- **OCA Integration**: Exposes analysis results via OpenClaw agent triggers

## 4. Out of Scope
- Actual resource provisioning or deletion (read-only analysis)
- Cross-cloud platform analysis (AWS-only)
- Real-time monitoring of deployed resources
- Integration with billing/payment systems
- Performance optimization (focus purely on cost)
- Security compliance analysis
- Historical cost trend analysis
- Automated remediation actions

## 5. Usage

### CLI
```bash
# Analyze a CloudFormation template
cfn-cost-opt analyze path/to/template.yaml

# Specify output format
cfn-cost-opt analyze path/to/template.json --format json

# Set AWS region for pricing
cfn-cost-opt analyze template.yaml --region eu-west-1

# Get help
cfn-cost-opt --help
```

### Agent Trigger
```
/aws-cost-optimizer analyze [template-path]
```

## 6. Output
The skill produces a structured report containing:
- Summary of total resources and estimated monthly costs
- List of idle/unused resources with removal savings
- List of over-provisioned resources with downsizing recommendations
- Estimated total monthly savings
