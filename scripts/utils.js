'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const REFS_DIR = path.join(__dirname, '..', 'references');

/**
 * Load and parse a CloudFormation template from a file path.
 * Supports both JSON and YAML formats.
 */
function loadTemplate(filePath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Template file not found: ${absPath}`);
  }

  const content = fs.readFileSync(absPath, 'utf8');
  const ext = path.extname(absPath).toLowerCase();

  if (ext === '.json') {
    return parseJSON(content);
  }
  if (ext === '.yaml' || ext === '.yml') {
    return parseYAML(content);
  }

  // Try JSON first, then YAML
  try {
    return parseJSON(content);
  } catch (_) {
    return parseYAML(content);
  }
}

function parseJSON(content) {
  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`Invalid JSON in template: ${err.message}`);
  }
}

function parseYAML(content) {
  try {
    // Custom YAML schema that handles CloudFormation intrinsic functions
    const cfnSchema = createCfnYamlSchema();
    return yaml.load(content, { schema: cfnSchema });
  } catch (err) {
    throw new Error(`Invalid YAML in template: ${err.message}`);
  }
}

/**
 * Create a YAML schema that handles CloudFormation intrinsic functions
 * like !Ref, !GetAtt, !Sub, etc.
 */
function createCfnYamlSchema() {
  const cfnTags = [
    'Ref', 'GetAtt', 'Sub', 'Join', 'Select', 'Split',
    'If', 'Equals', 'And', 'Or', 'Not',
    'FindInMap', 'Base64', 'Cidr', 'GetAZs',
    'ImportValue', 'Transform'
  ];

  const types = cfnTags.map(tag => {
    return new yaml.Type(`!${tag}`, {
      kind: 'scalar',
      construct: (data) => ({ 'Fn::Intrinsic': tag, Value: data }),
      predicate: () => false
    });
  });

  // Also handle sequence variants (e.g., !Join [",", [...]])
  const seqTypes = cfnTags.map(tag => {
    return new yaml.Type(`!${tag}`, {
      kind: 'sequence',
      construct: (data) => ({ 'Fn::Intrinsic': tag, Value: data }),
      predicate: () => false
    });
  });

  // Handle mapping variants (e.g., !Sub with mapping)
  const mapTypes = cfnTags.map(tag => {
    return new yaml.Type(`!${tag}`, {
      kind: 'mapping',
      construct: (data) => ({ 'Fn::Intrinsic': tag, Value: data }),
      predicate: () => false
    });
  });

  return yaml.DEFAULT_SCHEMA.extend([...types, ...seqTypes, ...mapTypes]);
}

/**
 * Validate that a parsed object looks like a CloudFormation template.
 */
function validateTemplate(template) {
  const errors = [];

  if (!template || typeof template !== 'object') {
    errors.push('Template must be a valid object');
    return { valid: false, errors };
  }

  if (!template.Resources || typeof template.Resources !== 'object') {
    errors.push('Template must contain a "Resources" section');
    return { valid: false, errors };
  }

  if (Object.keys(template.Resources).length === 0) {
    errors.push('Template "Resources" section is empty');
    return { valid: false, errors };
  }

  // Check each resource has a Type
  for (const [name, resource] of Object.entries(template.Resources)) {
    if (!resource.Type) {
      errors.push(`Resource "${name}" is missing a "Type" property`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Load AWS services reference data.
 */
function loadServicesData() {
  const filePath = path.join(REFS_DIR, 'aws-services.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Load resource metrics reference data.
 */
function loadMetricsData() {
  const filePath = path.join(REFS_DIR, 'resource-metrics.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Get the hourly cost of a resource given its type and properties.
 */
function getResourceCost(resourceType, properties, servicesData) {
  const serviceInfo = servicesData.resourceTypes[resourceType];
  if (!serviceInfo || !serviceInfo.pricing) {
    return { hourly: 0, monthly: 0, details: 'No pricing data available' };
  }

  switch (resourceType) {
    case 'AWS::EC2::Instance':
      return getEC2Cost(properties, serviceInfo);
    case 'AWS::EC2::Volume':
      return getEBSCost(properties, serviceInfo);
    case 'AWS::RDS::DBInstance':
      return getRDSCost(properties, serviceInfo);
    case 'AWS::ElasticLoadBalancingV2::LoadBalancer':
      return getALBCost(properties, serviceInfo);
    case 'AWS::EC2::EIP':
      return getEIPCost(properties, serviceInfo);
    case 'AWS::EC2::NatGateway':
      return getNatGatewayCost(properties, serviceInfo);
    case 'AWS::DynamoDB::Table':
      return getDynamoDBCost(properties, serviceInfo);
    case 'AWS::ElastiCache::CacheCluster':
      return getElastiCacheCost(properties, serviceInfo);
    default:
      return { hourly: 0, monthly: 0, details: 'Free or usage-based pricing' };
  }
}

function getEC2Cost(properties, serviceInfo) {
  const instanceType = properties.InstanceType || 't2.micro';
  const hourly = serviceInfo.pricing[instanceType] || 0;
  return {
    hourly,
    monthly: hourly * 730,
    details: `${instanceType} On-Demand pricing`
  };
}

function getEBSCost(properties, serviceInfo) {
  const volumeType = properties.VolumeType || 'gp2';
  const size = properties.Size || 0;
  const pricePerGB = serviceInfo.pricing[volumeType] || 0;
  const monthly = pricePerGB * size;
  const iops = properties.Iops || 0;
  const iopsCost = (volumeType === 'io1' || volumeType === 'io2') ? iops * 0.065 : 0;
  return {
    hourly: (monthly + iopsCost) / 730,
    monthly: monthly + iopsCost,
    details: `${volumeType} ${size}GB` + (iops > 0 ? ` + ${iops} IOPS` : '')
  };
}

function getRDSCost(properties, serviceInfo) {
  const instanceClass = properties.DBInstanceClass || 'db.t2.micro';
  const hourly = serviceInfo.pricing[instanceClass] || 0;
  const multiAZ = properties.MultiAZ ? 2 : 1;
  const storageType = properties.StorageType || 'gp2';
  const storage = properties.AllocatedStorage || 0;
  const storageCostPerGB = storageType === 'io1' ? 0.125 : storageType === 'gp2' ? 0.115 : 0.10;
  const storageMonthlyCost = storage * storageCostPerGB;
  const computeHourly = hourly * multiAZ;
  return {
    hourly: computeHourly + storageMonthlyCost / 730,
    monthly: (computeHourly * 730) + storageMonthlyCost,
    details: `${instanceClass}${multiAZ > 1 ? ' Multi-AZ' : ''} + ${storage}GB ${storageType}`
  };
}

function getALBCost(properties, serviceInfo) {
  const lbType = (properties.Type || 'application').toLowerCase();
  const hourly = serviceInfo.pricing[lbType] || serviceInfo.pricing.application || 0;
  return {
    hourly,
    monthly: hourly * 730,
    details: `${lbType} load balancer`
  };
}

function getEIPCost(properties, serviceInfo) {
  // EIPs cost money when unattached
  const hourly = serviceInfo.pricing.unattached || 0.005;
  return {
    hourly,
    monthly: hourly * 730,
    details: 'Elastic IP (unattached cost estimate)'
  };
}

function getNatGatewayCost(properties, serviceInfo) {
  const hourly = serviceInfo.pricing['per-hour'] || 0.045;
  return {
    hourly,
    monthly: hourly * 730,
    details: 'NAT Gateway hourly charge (excludes data processing)'
  };
}

function getDynamoDBCost(properties, serviceInfo) {
  const throughput = properties.ProvisionedThroughput || {};
  const rcu = throughput.ReadCapacityUnits || 5;
  const wcu = throughput.WriteCapacityUnits || 5;
  const rcuCost = rcu * (serviceInfo.pricing['per-rcu'] || 0.00013);
  const wcuCost = wcu * (serviceInfo.pricing['per-wcu'] || 0.00065);
  const monthly = (rcuCost + wcuCost) * 730;
  return {
    hourly: rcuCost + wcuCost,
    monthly,
    details: `${rcu} RCU + ${wcu} WCU provisioned`
  };
}

function getElastiCacheCost(properties, serviceInfo) {
  const nodeType = properties.CacheNodeType || 'cache.t2.micro';
  const numNodes = properties.NumCacheNodes || 1;
  const hourly = (serviceInfo.pricing[nodeType] || 0) * numNodes;
  return {
    hourly,
    monthly: hourly * 730,
    details: `${numNodes}x ${nodeType}`
  };
}

/**
 * Extract all resource references from a template to build a dependency graph.
 * Returns a map of resourceName -> [referenced resource names].
 */
function buildDependencyGraph(resources) {
  const graph = {};

  for (const [name, resource] of Object.entries(resources)) {
    graph[name] = [];
    const refs = extractRefs(resource);
    for (const ref of refs) {
      if (resources[ref] && ref !== name) {
        graph[name].push(ref);
      }
    }
  }

  return graph;
}

/**
 * Recursively extract all Ref and GetAtt references from a value.
 */
function extractRefs(value) {
  const refs = [];

  if (value === null || value === undefined) {
    return refs;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return refs;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      refs.push(...extractRefs(item));
    }
    return refs;
  }

  if (typeof value === 'object') {
    if (value.Ref) {
      refs.push(value.Ref);
    }
    if (value['Fn::GetAtt']) {
      const attr = value['Fn::GetAtt'];
      if (Array.isArray(attr) && attr.length > 0) {
        refs.push(attr[0]);
      } else if (typeof attr === 'string') {
        refs.push(attr.split('.')[0]);
      }
    }
    if (value['Fn::Intrinsic'] === 'Ref' && value.Value) {
      refs.push(value.Value);
    }
    if (value['Fn::Intrinsic'] === 'GetAtt' && value.Value) {
      const attr = value.Value;
      if (typeof attr === 'string') {
        refs.push(attr.split('.')[0]);
      }
    }

    for (const key of Object.keys(value)) {
      refs.push(...extractRefs(value[key]));
    }
  }

  return [...new Set(refs)];
}

/**
 * Find resources that are not referenced by any other resource.
 */
function findUnreferencedResources(resources, graph) {
  const referenced = new Set();
  for (const deps of Object.values(graph)) {
    for (const dep of deps) {
      referenced.add(dep);
    }
  }

  const unreferenced = [];
  for (const name of Object.keys(resources)) {
    if (!referenced.has(name)) {
      unreferenced.push(name);
    }
  }

  return unreferenced;
}

/**
 * Format a dollar amount to a readable string.
 */
function formatCurrency(amount) {
  return `$${amount.toFixed(2)}`;
}

/**
 * Format monthly cost.
 */
function formatMonthlyCost(amount) {
  return `${formatCurrency(amount)}/month`;
}

module.exports = {
  loadTemplate,
  parseJSON,
  parseYAML,
  validateTemplate,
  loadServicesData,
  loadMetricsData,
  getResourceCost,
  buildDependencyGraph,
  extractRefs,
  findUnreferencedResources,
  formatCurrency,
  formatMonthlyCost,
  createCfnYamlSchema
};
