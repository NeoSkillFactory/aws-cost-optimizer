'use strict';

const path = require('path');
const {
  loadTemplate,
  validateTemplate,
  loadServicesData,
  loadMetricsData,
  getResourceCost,
  buildDependencyGraph,
  extractRefs,
  findUnreferencedResources,
  formatCurrency,
  formatMonthlyCost
} = require('../scripts/utils');

const TEMPLATES_DIR = path.join(__dirname, '..', 'assets', 'templates');

describe('utils', () => {
  describe('loadTemplate', () => {
    test('loads a JSON template', () => {
      const tpl = loadTemplate(path.join(TEMPLATES_DIR, 'sample-overprovisioned.json'));
      expect(tpl).toBeDefined();
      expect(tpl.Resources).toBeDefined();
      expect(tpl.Resources.LargeInstance).toBeDefined();
    });

    test('loads a YAML template', () => {
      const tpl = loadTemplate(path.join(TEMPLATES_DIR, 'sample-overprovisioned.yaml'));
      expect(tpl).toBeDefined();
      expect(tpl.Resources).toBeDefined();
      expect(tpl.Resources.WebServer).toBeDefined();
    });

    test('throws on missing file', () => {
      expect(() => loadTemplate('/nonexistent/file.json')).toThrow('Template file not found');
    });
  });

  describe('validateTemplate', () => {
    test('validates a correct template', () => {
      const result = validateTemplate({
        Resources: {
          MyInstance: { Type: 'AWS::EC2::Instance', Properties: {} }
        }
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('rejects null template', () => {
      const result = validateTemplate(null);
      expect(result.valid).toBe(false);
    });

    test('rejects template without Resources', () => {
      const result = validateTemplate({ Description: 'no resources' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Resources');
    });

    test('rejects empty Resources', () => {
      const result = validateTemplate({ Resources: {} });
      expect(result.valid).toBe(false);
    });

    test('reports missing Type on resources', () => {
      const result = validateTemplate({
        Resources: { Bad: { Properties: {} } }
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Type');
    });
  });

  describe('loadServicesData', () => {
    test('loads services JSON', () => {
      const data = loadServicesData();
      expect(data.resourceTypes).toBeDefined();
      expect(data.resourceTypes['AWS::EC2::Instance']).toBeDefined();
      expect(data.regions).toBeDefined();
    });
  });

  describe('loadMetricsData', () => {
    test('loads metrics JSON', () => {
      const data = loadMetricsData();
      expect(data.idleThresholds).toBeDefined();
      expect(data.overProvisioningThresholds).toBeDefined();
    });
  });

  describe('getResourceCost', () => {
    let servicesData;
    beforeAll(() => {
      servicesData = loadServicesData();
    });

    test('calculates EC2 cost', () => {
      const cost = getResourceCost('AWS::EC2::Instance', { InstanceType: 't2.micro' }, servicesData);
      expect(cost.hourly).toBeCloseTo(0.0116, 3);
      expect(cost.monthly).toBeCloseTo(0.0116 * 730, 1);
    });

    test('calculates EBS volume cost', () => {
      const cost = getResourceCost('AWS::EC2::Volume', { VolumeType: 'gp2', Size: 100 }, servicesData);
      expect(cost.monthly).toBeCloseTo(10, 1);
    });

    test('calculates EBS io1 cost with IOPS', () => {
      const cost = getResourceCost('AWS::EC2::Volume', { VolumeType: 'io1', Size: 100, Iops: 1000 }, servicesData);
      expect(cost.monthly).toBeGreaterThan(10);
    });

    test('calculates RDS cost', () => {
      const cost = getResourceCost('AWS::RDS::DBInstance', {
        DBInstanceClass: 'db.t2.micro',
        AllocatedStorage: 20,
        StorageType: 'gp2'
      }, servicesData);
      expect(cost.monthly).toBeGreaterThan(0);
    });

    test('calculates RDS Multi-AZ cost', () => {
      const singleAz = getResourceCost('AWS::RDS::DBInstance', {
        DBInstanceClass: 'db.t2.micro',
        MultiAZ: false
      }, servicesData);
      const multiAz = getResourceCost('AWS::RDS::DBInstance', {
        DBInstanceClass: 'db.t2.micro',
        MultiAZ: true
      }, servicesData);
      expect(multiAz.monthly).toBeGreaterThan(singleAz.monthly);
    });

    test('calculates ALB cost', () => {
      const cost = getResourceCost('AWS::ElasticLoadBalancingV2::LoadBalancer', { Type: 'application' }, servicesData);
      expect(cost.monthly).toBeGreaterThan(0);
    });

    test('calculates EIP cost', () => {
      const cost = getResourceCost('AWS::EC2::EIP', { Domain: 'vpc' }, servicesData);
      expect(cost.monthly).toBeGreaterThan(0);
    });

    test('calculates NAT Gateway cost', () => {
      const cost = getResourceCost('AWS::EC2::NatGateway', {}, servicesData);
      expect(cost.monthly).toBeGreaterThan(0);
    });

    test('calculates DynamoDB cost', () => {
      const cost = getResourceCost('AWS::DynamoDB::Table', {
        ProvisionedThroughput: { ReadCapacityUnits: 100, WriteCapacityUnits: 100 }
      }, servicesData);
      expect(cost.monthly).toBeGreaterThan(0);
    });

    test('calculates ElastiCache cost', () => {
      const cost = getResourceCost('AWS::ElastiCache::CacheCluster', {
        CacheNodeType: 'cache.t2.micro',
        NumCacheNodes: 1
      }, servicesData);
      expect(cost.monthly).toBeGreaterThan(0);
    });

    test('returns zero for unknown resource types', () => {
      const cost = getResourceCost('AWS::Unknown::Resource', {}, servicesData);
      expect(cost.monthly).toBe(0);
    });

    test('returns zero for free resources', () => {
      const cost = getResourceCost('AWS::EC2::VPC', {}, servicesData);
      expect(cost.monthly).toBe(0);
    });
  });

  describe('buildDependencyGraph', () => {
    test('builds graph from Ref references', () => {
      const resources = {
        MyVPC: { Type: 'AWS::EC2::VPC', Properties: { CidrBlock: '10.0.0.0/16' } },
        MySubnet: { Type: 'AWS::EC2::Subnet', Properties: { VpcId: { Ref: 'MyVPC' } } }
      };
      const graph = buildDependencyGraph(resources);
      expect(graph.MySubnet).toContain('MyVPC');
      expect(graph.MyVPC).toHaveLength(0);
    });

    test('ignores non-resource references', () => {
      const resources = {
        MyInstance: { Type: 'AWS::EC2::Instance', Properties: { ImageId: { Ref: 'AWS::Region' } } }
      };
      const graph = buildDependencyGraph(resources);
      expect(graph.MyInstance).toHaveLength(0);
    });
  });

  describe('extractRefs', () => {
    test('extracts Ref from object', () => {
      const refs = extractRefs({ Ref: 'MyResource' });
      expect(refs).toContain('MyResource');
    });

    test('extracts GetAtt from array form', () => {
      const refs = extractRefs({ 'Fn::GetAtt': ['MyResource', 'Arn'] });
      expect(refs).toContain('MyResource');
    });

    test('extracts GetAtt from string form', () => {
      const refs = extractRefs({ 'Fn::GetAtt': 'MyResource.Arn' });
      expect(refs).toContain('MyResource');
    });

    test('handles nested arrays', () => {
      const refs = extractRefs([{ Ref: 'A' }, { Ref: 'B' }]);
      expect(refs).toContain('A');
      expect(refs).toContain('B');
    });

    test('handles null and primitives', () => {
      expect(extractRefs(null)).toHaveLength(0);
      expect(extractRefs(42)).toHaveLength(0);
      expect(extractRefs('string')).toHaveLength(0);
      expect(extractRefs(true)).toHaveLength(0);
    });
  });

  describe('findUnreferencedResources', () => {
    test('finds unreferenced resources', () => {
      const resources = {
        A: { Type: 'AWS::EC2::VPC' },
        B: { Type: 'AWS::EC2::Subnet' },
        C: { Type: 'AWS::EC2::Instance' }
      };
      const graph = { A: [], B: ['A'], C: ['B'] };
      const unreferenced = findUnreferencedResources(resources, graph);
      expect(unreferenced).toContain('C');
      expect(unreferenced).not.toContain('A');
      expect(unreferenced).not.toContain('B');
    });
  });

  describe('formatting helpers', () => {
    test('formatCurrency formats correctly', () => {
      expect(formatCurrency(100)).toBe('$100.00');
      expect(formatCurrency(0)).toBe('$0.00');
      expect(formatCurrency(1234.567)).toBe('$1234.57');
    });

    test('formatMonthlyCost appends /month', () => {
      expect(formatMonthlyCost(50)).toBe('$50.00/month');
    });
  });
});
