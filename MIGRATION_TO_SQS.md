# MIGRATION GUIDE: Bull (Redis) → AWS SQS

## 🎯 Why Migrate to SQS?

- **Unlimited Scale**: SQS handles millions of messages/second
- **Fully Managed**: No Redis infrastructure to maintain
- **Cost-Effective**: Pay only for what you use ($0.40/million requests)
- **High Availability**: 99.9% SLA across multiple AZs
- **FIFO Queues**: Guaranteed ordering for critical workflows

## 🏗️ Current Architecture (Flexible)

```typescript
// Current: messageQueue.service.ts uses Bull
class MessageQueueService {
  async enqueue(job) { ... }
  async getJobStatus(jobId) { ... }
}
```

## 🚀 Migration Steps (2 Hours)

### STEP 1: Create SQS Queue Service (30 min)

```typescript
// src/services/queue/sqsQueue.service.ts
import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";

class SQSQueueService {
  private client: SQSClient;
  private queueUrls: Map<string, string> = new Map();

  constructor() {
    this.client = new SQSClient({
      region: process.env.AWS_REGION,
    });
  }

  async enqueue(jobData: MessageJob): Promise<string> {
    const queueUrl = await this.getQueueUrl(jobData.companyId);

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(jobData),
      MessageAttributes: {
        companyId: { StringValue: jobData.companyId, DataType: "String" },
        type: {
          StringValue: jobData.media?.type || "text",
          DataType: "String",
        },
      },
    });

    const result = await this.client.send(command);
    return result.MessageId!;
  }

  private async getQueueUrl(companyId: string): Promise<string> {
    if (!this.queueUrls.has(companyId)) {
      // Create or get queue URL
      const queueName = `whatsapp-messages-${companyId}`;
      // ... SQS queue creation logic
    }
    return this.queueUrls.get(companyId)!;
  }
}
```

### STEP 2: Create Queue Factory (15 min)

```typescript
// src/services/queue/queueFactory.ts
export function getQueueService() {
  const provider = process.env.QUEUE_PROVIDER || "bull";

  switch (provider) {
    case "sqs":
      return new SQSQueueService();
    case "bull":
    default:
      return messageQueueService; // Current
  }
}
```

### STEP 3: Update whatsappService.ts (15 min)

```typescript
// Change this:
const { messageQueueService } = await import("./queue/messageQueue.service");

// To this:
const { getQueueService } = await import("./queue/queueFactory");
const queueService = getQueueService();
```

### STEP 4: Update Worker (30 min)

```typescript
// src/services/queue/sqsQueue.worker.ts
class SQSWorker {
  async startPolling(companyId: string) {
    const queueUrl = await this.getQueueUrl(companyId);

    while (true) {
      const messages = await this.receiveMessages(queueUrl);

      for (const message of messages) {
        await this.processMessage(message);
        await this.deleteMessage(queueUrl, message.ReceiptHandle);
      }
    }
  }
}
```

### STEP 5: Environment Variables (5 min)

```env
# .env
QUEUE_PROVIDER=sqs  # Change from 'bull' to 'sqs'
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

### STEP 6: Deploy & Test (30 min)

```bash
npm install @aws-sdk/client-sqs
npm run build
npm run deploy
```

## 📊 Comparison

| Feature               | Bull (Redis)    | AWS SQS     |
| --------------------- | --------------- | ----------- |
| **Setup Time**        | ✅ 10 min       | ⚠️ 2 hours  |
| **Cost (1M msgs)**    | $0.10 (Redis)   | $0.40       |
| **Max Throughput**    | ~10K/sec        | Unlimited   |
| **Maintenance**       | ⚠️ Redis upkeep | ✅ Zero     |
| **Retries**           | ✅ Built-in     | ✅ Built-in |
| **Dead Letter Queue** | ✅ Yes          | ✅ Yes      |
| **FIFO Ordering**     | ⚠️ Limited      | ✅ Native   |
| **Multi-Region**      | ❌ Complex      | ✅ Easy     |

## 🎯 When to Migrate?

Migrate to SQS when:

- ✅ Processing > 100K messages/day
- ✅ Need 99.9% SLA
- ✅ Want zero infrastructure management
- ✅ Expanding to multiple regions
- ✅ Need guaranteed message ordering (FIFO)

Stay with Bull when:

- ✅ < 50K messages/day
- ✅ Want lower costs
- ✅ Already have Redis infrastructure
- ✅ Need sub-second latency

## 🏆 Hybrid Approach (Best of Both)

```typescript
// Use Bull for real-time, SQS for batch
if (jobData.priority === "realtime") {
  await bullQueue.enqueue(jobData);
} else {
  await sqsQueue.enqueue(jobData);
}
```

## 🚀 Future: Kafka for Extreme Scale

If you reach > 1M messages/day:

- **Apache Kafka**: 1M+ messages/sec
- **AWS MSK**: Managed Kafka
- Same abstraction pattern applies

---

**Your current architecture is production-ready and can scale to SQS in 2 hours when needed.**
