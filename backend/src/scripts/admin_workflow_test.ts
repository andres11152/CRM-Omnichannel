import axios from "axios";

/**
 * 🚀 CRM WORKFLOW AUTOMATED TEST
 * Target: admin@reply.com
 * Goal: Verify end-to-end business logic (Auth -> Contact -> Deal -> Note)
 */

const API_URL = "http://127.0.0.1:4000/api";

async function runWorkflow() {
  console.log("\n🧪 STARTING AUTOMATED CRM WORKFLOW FOR admin@reply.com\n");

  try {
    // 🔐 Step 1: Logging in...
    console.log("🔐 Step 1: Logging in...");
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: "admin@reply.com",
      password: "password123",
    });

    const token = loginRes.data.token;
    const companyId = loginRes.data.data.user.companyId;
    console.info(`✅ Logged in successfully. Company ID: ${companyId}`);

    const authHeaders = {
      Authorization: `Bearer ${token}`,
    };

    // 2. CREATE CONTACT
    console.log("\n👤 Step 2: Creating a new contact...");
    const contactPhone = `+57300${Math.floor(Math.random() * 10000000)}`;
    const contactRes = await axios.post(
      `${API_URL}/contacts`,
      {
        name: "Test User Workflow",
        phone: contactPhone,
        email: "workflow_test@example.com",
        tags: ["workflow", "automated-test"],
      },
      { headers: authHeaders },
    );

    const contactId = contactRes.data.data.contact.id;
    console.info(`✅ Contact created with ID: ${contactId} (${contactPhone})`);

    // 3. CREATE DEAL
    console.log("\n📊 Step 3: Creating a deal for the contact...");

    // Get stages first to find a valid one
    const pipelineRes = await axios.get(`${API_URL}/pipelines`, {
      headers: authHeaders,
    });
    const defaultPipeline =
      pipelineRes.data.pipelines.find((p: any) => p.isDefault) ||
      pipelineRes.data.pipelines[0];
    const firstStageId = defaultPipeline.stages[0].id;

    const dealRes = await axios.post(
      `${API_URL}/deals`,
      {
        title: "Workflow Deal Opportunity",
        value: 1500,
        currency: "USD",
        contactId: contactId,
        pipelineId: defaultPipeline.id,
        stageId: firstStageId,
        probability: 20,
      },
      { headers: authHeaders },
    );

    const dealId = dealRes.data.data.deal.id;
    console.info(`✅ Deal created with ID: ${dealId}`);

    // 4. ADD INTERNAL NOTE
    console.log("\n📝 Step 4: Adding an internal note...");
    await axios.post(
      `${API_URL}/activities`,
      {
        contactId: contactId,
        type: "NOTE",
        subject: "Workflow Test Note",
        description:
          "This is an automated note created by the system workflow script.",
        status: "COMPLETED",
      },
      { headers: authHeaders },
    );
    console.info("✅ Internal note added.");

    // 5. VERIFICATION (360 VIEW)
    console.log("\n🔍 Step 5: Verifying Customer 360 data...");
    const contact360Res = await axios.get(
      `${API_URL}/contacts/${contactId}/full`,
      {
        headers: authHeaders,
      },
    );

    const dealsCount = contact360Res.data.data.deals?.length || 0;
    const notesCount =
      contact360Res.data.data.activities?.filter((a: any) => a.type === "NOTE")
        .length || 0;

    console.info(`📊 Summary for Contact ${contactId}:`);
    console.info(`   - Deals found: ${dealsCount}`);
    console.info(`   - Notes found: ${notesCount}`);

    if (dealsCount > 0 && notesCount > 0) {
      console.log("\n✨ CRM WORKFLOW COMPLETED SUCCESSFULLY! ✨\n");
    } else {
      console.error("\n❌ ERROR: Data mismatch in Customer 360 verification.");
    }
  } catch (error: any) {
    console.error("\n❌ WORKFLOW FAILED:");
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data: ${JSON.stringify(error.response.data)}`);
    } else {
      console.error(`   Message: ${error.message}`);
      console.error(error);
    }
  }
}

// Run the script
runWorkflow();
