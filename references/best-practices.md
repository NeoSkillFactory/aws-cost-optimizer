# AWS Cost Optimization Best Practices

## 1. Right-Sizing Resources

- **Monitor utilization**: Track CPU, memory, network, and storage metrics for at least 14 days before making sizing decisions.
- **Downsize idle resources**: Instances consistently below 30% CPU utilization should be downsized.
- **Use burstable instances**: For variable workloads, T3/T3a instances with CPU credits are more cost-effective than fixed-size instances.
- **Match instance family to workload**: Use C-series for compute, R-series for memory, I-series for storage-intensive workloads.

## 2. Eliminate Unused Resources

- **Unattached EBS volumes**: Volumes not attached to any instance still incur storage costs.
- **Unattached Elastic IPs**: Unassociated EIPs cost $0.005/hour (~$3.60/month).
- **Idle load balancers**: ALBs/NLBs with no registered targets or zero traffic should be removed.
- **Unused NAT Gateways**: NAT Gateways with minimal data transfer can be consolidated or removed.
- **Orphaned snapshots**: EBS snapshots from deleted volumes should be reviewed and cleaned up.

## 3. Storage Optimization

- **Use appropriate volume types**: gp3 volumes are ~20% cheaper than gp2 with better baseline performance.
- **S3 lifecycle policies**: Move infrequently accessed data to S3-IA, Glacier, or Deep Archive.
- **Delete unused snapshots**: Old EBS snapshots accumulate costs over time.

## 4. Database Optimization

- **Reserved instances**: For steady-state RDS workloads, reserved instances save up to 60%.
- **Aurora Serverless**: For variable database workloads, Aurora Serverless scales automatically.
- **DynamoDB on-demand**: Switch from provisioned to on-demand capacity for unpredictable workloads.
- **Read replicas**: Use read replicas instead of scaling up the primary instance for read-heavy workloads.

## 5. Networking Optimization

- **NAT Gateway consolidation**: Use fewer NAT Gateways with proper routing instead of one per subnet.
- **VPC endpoints**: Use VPC endpoints for S3 and DynamoDB to avoid NAT Gateway data charges.
- **CloudFront**: Use CloudFront for frequently accessed S3 content to reduce data transfer costs.

## 6. Compute Optimization

- **Spot instances**: Use Spot Instances for fault-tolerant, flexible workloads (up to 90% savings).
- **Auto Scaling**: Implement Auto Scaling to match capacity to demand.
- **Lambda**: Consider serverless for event-driven, short-duration workloads.
- **Graviton instances**: ARM-based Graviton instances offer up to 40% better price/performance.

## 7. Monitoring and Governance

- **AWS Cost Explorer**: Use Cost Explorer to track spending trends and identify anomalies.
- **Budgets and alerts**: Set budget alerts to catch unexpected cost increases early.
- **Tagging strategy**: Tag all resources for cost allocation and tracking.
- **Regular reviews**: Schedule monthly cost optimization reviews.
