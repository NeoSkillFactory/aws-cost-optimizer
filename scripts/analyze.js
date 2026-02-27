'use strict';

const path = require('path');
const {
  loadTemplate,
  validateTemplate,
  loadServicesData,
  loadMetricsData,
  getResourceCost,
  buildDependencyGraph,
  findUnreferencedResources
} = require('./utils');

/**
 * Main analysis entry point.
 * Analyzes a CloudFormation template and returns optimization recommendations.
 */
function analyzeTemplate(templatePath, options = {}) {
  const region = options.region || 'us-east-1';

  // Load and parse the template
  const template = loadTemplate(templatePath);

  // Validate
  const validation = validateTemplate(template);
  if (!validation.valid) {
    return {
      success: false,
      errors: validation.errors,
      templatePath: path.resolve(templatePath),
      resources: [],
      recommendations: [],
      summary: null
    };
  }

  // Load reference data
  const servicesData = loadServicesData();
  const metricsData = loadMetricsData();
  const regionMultiplier = (servicesData.regions[region] || { multiplier: 1.0 }).multiplier;

  const resources = template.Resources;
  const resourceNames = Object.keys(resources);

  // Build dependency graph
  const depGraph = buildDependencyGraph(resources);
  const unreferenced = findUnreferencedResources(resources, depGraph);

  // Analyze each resource
  const analyzedResources = [];
  const recommendations = [];
  let totalMonthlyCost = 0;
  let totalPotentialSavings = 0;

  for (const [name, resource] of Object.entries(resources)) {
    const resourceType = resource.Type;
    const properties = resource.Properties || {};

    // Calculate cost
    const cost = getResourceCost(resourceType, properties, servicesData);
    const adjustedCost = {
      hourly: cost.hourly * regionMultiplier,
      monthly: cost.monthly * regionMultiplier,
      details: cost.details
    };
    totalMonthlyCost += adjustedCost.monthly;

    const analyzed = {
      name,
      type: resourceType,
      properties,
      cost: adjustedCost,
      issues: [],
      isReferenced: !unreferenced.includes(name),
      dependsOn: depGraph[name] || []
    };

    // Run checks
    const idleFindings = checkIdleResource(name, resource, properties, servicesData, metricsData, depGraph);
    const provisioningFindings = checkOverProvisioning(name, resource, properties, servicesData, metricsData);
    const patternFindings = checkAntiPatterns(name, resource, properties, servicesData);

    for (const finding of [...idleFindings, ...provisioningFindings, ...patternFindings]) {
      analyzed.issues.push(finding);
      totalPotentialSavings += finding.estimatedSavings || 0;
      recommendations.push({
        resource: name,
        resourceType,
        ...finding
      });
    }

    analyzedResources.push(analyzed);
  }

  // Sort recommendations by estimated savings (highest first)
  recommendations.sort((a, b) => (b.estimatedSavings || 0) - (a.estimatedSavings || 0));

  return {
    success: true,
    errors: [],
    templatePath: path.resolve(templatePath),
    templateDescription: template.Description || 'No description',
    region,
    regionMultiplier,
    resources: analyzedResources,
    recommendations,
    summary: {
      totalResources: resourceNames.length,
      analyzedResources: analyzedResources.length,
      totalMonthlyCost,
      totalPotentialSavings,
      savingsPercentage: totalMonthlyCost > 0
        ? ((totalPotentialSavings / totalMonthlyCost) * 100)
        : 0,
      issuesByCategory: categorizeIssues(recommendations),
      resourcesByType: countResourceTypes(resources)
    }
  };
}

/**
 * Check if a resource appears to be idle/unused based on template structure.
 */
function checkIdleResource(name, resource, properties, servicesData, metricsData, depGraph) {
  const findings = [];
  const type = resource.Type;

  // Check for unattached EBS volumes (volumes not referenced by any instance)
  if (type === 'AWS::EC2::Volume') {
    const referencedBy = Object.entries(depGraph).filter(([_, deps]) => deps.includes(name));
    if (referencedBy.length === 0) {
      const cost = getResourceCost(type, properties, servicesData);
      findings.push({
        category: 'idle',
        severity: 'high',
        title: 'Unattached EBS Volume',
        description: `Volume "${name}" is not attached to any EC2 instance in this template. Unattached volumes incur storage costs without providing value.`,
        recommendation: 'Remove the volume if no longer needed, or attach it to an instance.',
        estimatedSavings: cost.monthly
      });
    }
  }

  // Check for EIPs not associated with instances
  if (type === 'AWS::EC2::EIP') {
    const isUsedByNatGw = Object.values(depGraph).some(deps => deps.includes(name));
    const associatedInstance = properties.InstanceId;
    if (!associatedInstance && !isUsedByNatGw) {
      const cost = getResourceCost(type, properties, servicesData);
      findings.push({
        category: 'idle',
        severity: 'medium',
        title: 'Unassociated Elastic IP',
        description: `Elastic IP "${name}" is not associated with any instance or NAT Gateway. Unassociated EIPs cost $0.005/hour.`,
        recommendation: 'Associate the EIP with a resource or release it.',
        estimatedSavings: cost.monthly
      });
    }
  }

  // Check for load balancers without target groups in the same template
  if (type === 'AWS::ElasticLoadBalancingV2::LoadBalancer') {
    const hasTargetGroup = Object.values(depGraph).some(deps => deps.includes(name));
    if (!hasTargetGroup) {
      const cost = getResourceCost(type, properties, servicesData);
      findings.push({
        category: 'idle',
        severity: 'high',
        title: 'Load Balancer Without Targets',
        description: `Load balancer "${name}" has no target groups defined in this template. An idle ALB/NLB still incurs hourly charges.`,
        recommendation: 'Add target groups or remove the load balancer if unused.',
        estimatedSavings: cost.monthly
      });
    }
  }

  // Check for NAT Gateway in dev/test environments
  if (type === 'AWS::EC2::NatGateway') {
    const cost = getResourceCost(type, properties, servicesData);
    findings.push({
      category: 'idle',
      severity: 'low',
      title: 'NAT Gateway Cost Review',
      description: `NAT Gateway "${name}" costs $0.045/hour plus data charges. Consider whether this is necessary for non-production environments.`,
      recommendation: 'For development, consider using NAT instances or VPC endpoints instead.',
      estimatedSavings: cost.monthly * 0.5
    });
  }

  return findings;
}

/**
 * Check for over-provisioned resources.
 */
function checkOverProvisioning(name, resource, properties, servicesData, metricsData) {
  const findings = [];
  const type = resource.Type;
  const serviceInfo = servicesData.resourceTypes[type];
  if (!serviceInfo) return findings;

  // EC2 Instance over-provisioning
  if (type === 'AWS::EC2::Instance') {
    const instanceType = properties.InstanceType || 't2.micro';
    const downsizeMap = serviceInfo.downsizeMap || {};

    // Check if a smaller size is available
    if (downsizeMap[instanceType]) {
      const currentCost = getResourceCost(type, properties, servicesData);
      const smallerType = downsizeMap[instanceType];
      const smallerCost = getResourceCost(type, { ...properties, InstanceType: smallerType }, servicesData);
      const savings = currentCost.monthly - smallerCost.monthly;

      if (savings > 0) {
        findings.push({
          category: 'overprovisioned',
          severity: instanceType.includes('xlarge') ? 'high' : 'medium',
          title: 'EC2 Instance May Be Over-Provisioned',
          description: `Instance "${name}" uses ${instanceType}. If utilization is below 30%, consider downsizing to ${smallerType}.`,
          recommendation: `Downsize from ${instanceType} to ${smallerType} to save ${formatMoney(savings)}/month.`,
          currentSize: instanceType,
          recommendedSize: smallerType,
          estimatedSavings: savings
        });
      }
    }

    // Check for GPU instances
    if (instanceType.startsWith('p3') || instanceType.startsWith('p4') || instanceType.startsWith('g4')) {
      const currentCost = getResourceCost(type, properties, servicesData);
      findings.push({
        category: 'overprovisioned',
        severity: 'high',
        title: 'GPU Instance Review Recommended',
        description: `Instance "${name}" uses GPU instance type ${instanceType}. GPU instances are expensive. Ensure GPU capabilities are required.`,
        recommendation: `If no GPU workloads are running, switch to a general-purpose instance like m5.xlarge to save significantly.`,
        currentSize: instanceType,
        recommendedSize: 'm5.xlarge',
        estimatedSavings: currentCost.monthly * 0.8
      });
    }
  }

  // RDS over-provisioning
  if (type === 'AWS::RDS::DBInstance') {
    const instanceClass = properties.DBInstanceClass || 'db.t2.micro';
    const downsizeMap = serviceInfo.downsizeMap || {};

    if (downsizeMap[instanceClass]) {
      const currentCost = getResourceCost(type, properties, servicesData);
      const smallerClass = downsizeMap[instanceClass];
      const smallerCost = getResourceCost(type, { ...properties, DBInstanceClass: smallerClass }, servicesData);
      const savings = currentCost.monthly - smallerCost.monthly;

      if (savings > 0) {
        findings.push({
          category: 'overprovisioned',
          severity: 'high',
          title: 'RDS Instance May Be Over-Provisioned',
          description: `RDS instance "${name}" uses ${instanceClass}. If database utilization is low, consider downsizing.`,
          recommendation: `Downsize from ${instanceClass} to ${smallerClass} to save ${formatMoney(savings)}/month.`,
          currentSize: instanceClass,
          recommendedSize: smallerClass,
          estimatedSavings: savings
        });
      }
    }

    // Check for io1 storage type
    if (properties.StorageType === 'io1' && properties.Iops) {
      const gpCost = getResourceCost(type, { ...properties, StorageType: 'gp2', Iops: undefined }, servicesData);
      const currentCost = getResourceCost(type, properties, servicesData);
      const savings = currentCost.monthly - gpCost.monthly;
      if (savings > 0) {
        findings.push({
          category: 'overprovisioned',
          severity: 'medium',
          title: 'RDS Storage Type Review',
          description: `RDS instance "${name}" uses io1 storage with ${properties.Iops} provisioned IOPS. This is expensive.`,
          recommendation: `If high IOPS are not required, switch to gp2/gp3 to save ${formatMoney(savings)}/month.`,
          estimatedSavings: savings
        });
      }
    }
  }

  // DynamoDB over-provisioning
  if (type === 'AWS::DynamoDB::Table') {
    const throughput = properties.ProvisionedThroughput || {};
    const rcu = throughput.ReadCapacityUnits || 5;
    const wcu = throughput.WriteCapacityUnits || 5;

    if (rcu > 100 || wcu > 100) {
      const currentCost = getResourceCost(type, properties, servicesData);
      const onDemandEstimate = currentCost.monthly * 0.3; // On-demand is typically cheaper for bursty
      const savings = currentCost.monthly - onDemandEstimate;

      findings.push({
        category: 'overprovisioned',
        severity: 'high',
        title: 'DynamoDB High Provisioned Throughput',
        description: `DynamoDB table "${name}" has ${rcu} RCU and ${wcu} WCU provisioned. High provisioned throughput can be costly if not fully utilized.`,
        recommendation: `Consider switching to on-demand billing or enabling auto-scaling. Potential savings: ${formatMoney(savings)}/month.`,
        estimatedSavings: savings
      });
    }
  }

  // ElastiCache over-provisioning
  if (type === 'AWS::ElastiCache::CacheCluster') {
    const nodeType = properties.CacheNodeType || 'cache.t2.micro';
    const downsizeMap = serviceInfo.downsizeMap || {};

    if (downsizeMap[nodeType]) {
      const currentCost = getResourceCost(type, properties, servicesData);
      const smallerNode = downsizeMap[nodeType];
      const smallerCost = getResourceCost(type, { ...properties, CacheNodeType: smallerNode }, servicesData);
      const savings = currentCost.monthly - smallerCost.monthly;

      if (savings > 0) {
        findings.push({
          category: 'overprovisioned',
          severity: 'medium',
          title: 'ElastiCache Node May Be Over-Provisioned',
          description: `Cache cluster "${name}" uses ${nodeType}. If cache utilization is low, consider downsizing.`,
          recommendation: `Downsize from ${nodeType} to ${smallerNode} to save ${formatMoney(savings)}/month.`,
          currentSize: nodeType,
          recommendedSize: smallerNode,
          estimatedSavings: savings
        });
      }
    }
  }

  return findings;
}

/**
 * Check for common cost anti-patterns in the template.
 */
function checkAntiPatterns(name, resource, properties, servicesData) {
  const findings = [];
  const type = resource.Type;

  // EBS volume using gp2 instead of gp3
  if (type === 'AWS::EC2::Volume' && properties.VolumeType === 'gp2') {
    const size = properties.Size || 0;
    const gp2Monthly = 0.10 * size;
    const gp3Monthly = 0.08 * size;
    const savings = gp2Monthly - gp3Monthly;

    if (savings > 0) {
      findings.push({
        category: 'optimization',
        severity: 'low',
        title: 'Use gp3 Instead of gp2',
        description: `Volume "${name}" uses gp2. gp3 volumes are 20% cheaper with better baseline performance.`,
        recommendation: `Switch from gp2 to gp3 to save ${formatMoney(savings)}/month.`,
        estimatedSavings: savings
      });
    }
  }

  // io1 volumes that might not need provisioned IOPS
  if (type === 'AWS::EC2::Volume' && (properties.VolumeType === 'io1' || properties.VolumeType === 'io2')) {
    const size = properties.Size || 0;
    const iops = properties.Iops || 0;
    const currentCost = getResourceCost(type, properties, servicesData);
    const gp3Cost = getResourceCost(type, { ...properties, VolumeType: 'gp3', Iops: undefined }, servicesData);
    const savings = currentCost.monthly - gp3Cost.monthly;

    if (savings > 0) {
      findings.push({
        category: 'optimization',
        severity: 'medium',
        title: 'Provisioned IOPS Volume Review',
        description: `Volume "${name}" uses ${properties.VolumeType} with ${iops} IOPS. Provisioned IOPS volumes are significantly more expensive.`,
        recommendation: `If high IOPS are not consistently needed, switch to gp3 to save ${formatMoney(savings)}/month.`,
        estimatedSavings: savings
      });
    }
  }

  return findings;
}

/**
 * Categorize issues by type.
 */
function categorizeIssues(recommendations) {
  const categories = {};
  for (const rec of recommendations) {
    const cat = rec.category || 'other';
    if (!categories[cat]) {
      categories[cat] = { count: 0, totalSavings: 0 };
    }
    categories[cat].count++;
    categories[cat].totalSavings += rec.estimatedSavings || 0;
  }
  return categories;
}

/**
 * Count resources by type.
 */
function countResourceTypes(resources) {
  const counts = {};
  for (const resource of Object.values(resources)) {
    const type = resource.Type || 'Unknown';
    counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
}

function formatMoney(amount) {
  return `$${amount.toFixed(2)}`;
}

module.exports = {
  analyzeTemplate,
  checkIdleResource,
  checkOverProvisioning,
  checkAntiPatterns,
  categorizeIssues,
  countResourceTypes
};
