const fs = require("fs");

const path =
  "c:/Users/Andres Betancourt/Desktop/Desarrollos Personales/Reply/Proyecto/frontend/src/components/AgentWorkspace.tsx";
let content = fs.readFileSync(path, "utf8");

const regex =
  /const handleSyncSubmit = async \(\{?.*\}?\) => \{[\s\S]*?toast\.error\("Error al iniciar[^\"]*"\);\s*\n\s*\};/;

if (content.match(regex)) {
  content = content.replace(
    regex,
    `const handleSyncSubmit = async (dateStr: string) => {\n    setIsSyncModalOpen(false);\n    try {\n      const token = localStorage.getItem("token");\n      const res = await fetch(\`\${API_BASE_URL}/whatsapp/sync\`, {\n        method: "POST",\n        headers: {\n          "Content-Type": "application/json",\n          Authorization: \`Bearer \${token}\`,\n        },\n        body: JSON.stringify({ sinceDate: dateStr }),\n      });\n      const data = await res.json();\n      toast.success(data.message || "Sincronización iniciada");\n      fetchData();\n    } catch (e) {\n      toast.error("Error al iniciar sincronización");\n    }\n  };`,
  );
  fs.writeFileSync(path, content, "utf8");
  console.log("Replaced successfully");
} else {
  console.log("Regex did not match");
}
