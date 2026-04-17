const fs = require('fs');
const path = require('path');

const replacements = [
  { file: 'src/services/ActivityService.ts', from: '"./googleCalendarService"', to: '"./GoogleCalendarService"' },
  { file: 'src/services/ActivityService.ts', from: '"./mentionService"', to: '"./MentionService"' },
  { file: 'src/services/ApiKeyService.ts', from: '"./auditLogService"', to: '"./AuditLogService"' },
  { file: 'src/services/AutoAssignmentService.ts', from: '"./messageProcessorService"', to: '"./MessageProcessorService"' },
  { file: 'src/services/CampaignService.ts', from: '"./templateService"', to: '"./TemplateService"' },
  { file: 'src/services/ConversationActionService.ts', from: '"./contactService"', to: '"./ContactService"' },
  { file: 'src/services/ConversationQueryService.ts', from: '"./chatSyncService"', to: '"./ChatSyncService"' },
  { file: 'src/services/DealService.ts', from: '"./workflowEngine"', to: '"./WorkflowEngine"' },
  { file: 'src/services/flow/FlowNavigationService.ts', from: '"../cacheService"', to: '"../CacheService"' },
  { file: 'src/services/LoginNotificationService.ts', from: '"./emailService"', to: '"./EmailService"' },
  { file: 'src/services/messageProcessing/FlowRunner.ts', from: '"../flowExecutor"', to: '"../FlowExecutor"' },
  { file: 'src/services/MessageProcessorService.ts', from: '"./aiResponseService"', to: '"./AiResponseService"' },
  { file: 'src/services/MetaMediaService.ts', from: '"./storageService"', to: '"./StorageService"' },
  { file: 'src/services/queue/messageQueueWorker.ts', from: '"../storageService"', to: '"../StorageService"' },
  { file: 'src/services/WebhookService.ts', from: '"@/services/messageProcessorService"', to: '"@/services/MessageProcessorService"' }
];

replacements.forEach(({ file, from, to }) => {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(from)) {
      content = content.replace(from, to);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Replaced in ${file}: ${from} -> ${to}`);
    } else if (content.includes(from.replace(/"/g, "'"))) { // check single quotes
      content = content.replace(from.replace(/"/g, "'"), to.replace(/"/g, "'"));
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Replaced in ${file} (single quotes): ${from} -> ${to}`);
    } else {
      console.log(`Warning: Could not find ${from} in ${file}`);
    }
  } else {
    // Check if the file itself has wrong casing, e.g. MessageProcessorService
    const files = fs.readdirSync(path.dirname(filePath));
    const targetBase = path.basename(filePath).toLowerCase();
    const actualBase = files.find(f => f.toLowerCase() === targetBase);
    if (actualBase) {
      const actualFilePath = path.join(path.dirname(filePath), actualBase);
      let content = fs.readFileSync(actualFilePath, 'utf8');
      if (content.includes(from)) {
        content = content.replace(from, to);
        fs.writeFileSync(actualFilePath, content, 'utf8');
        console.log(`Replaced in ${actualBase}: ${from} -> ${to}`);
      } else if (content.includes(from.replace(/"/g, "'"))) { // check single quotes
        content = content.replace(from.replace(/"/g, "'"), to.replace(/"/g, "'"));
        fs.writeFileSync(actualFilePath, content, 'utf8');
        console.log(`Replaced in ${actualBase} (single quotes): ${from} -> ${to}`);
      }
    } else {
      console.log(`Error: File not found: ${file}`);
    }
  }
});
