

// Mock DB for Companies
let companiesDB = [
  { id: 'comp_123', name: 'Acme Corp', status: 'active', subEndsAt: new Date('2024-12-31') },
  { id: 'comp_456', name: 'Expired LLC', status: 'active', subEndsAt: new Date('2023-01-01') }
];

/**
 * CRON JOB: CHECK SUBSCRIPTIONS
 * Runs every night to deactivate companies with past due payments.
 */
export const checkExpiredSubscriptions = () => {
  console.log('\n[Cron] 🕒 Starting Daily Subscription Check...');
  const now = new Date();
  let deactivatedCount = 0;

  companiesDB = companiesDB.map(company => {
    if (company.status === 'active' && company.subEndsAt < now) {
      console.log(`[Cron] ⚠️ Deactivating company ${company.name} (ID: ${company.id}). Plan expired on ${company.subEndsAt.toISOString()}`);
      deactivatedCount++;
      return { ...company, status: 'suspended' };
    }
    return company;
  });

  console.log(`[Cron] ✅ Job Finished. Deactivated ${deactivatedCount} companies.\n`);
};

// Simulate running it immediately for demo purposes
// setTimeout(checkExpiredSubscriptions, 5000);