import { AiCooChat } from "./ai-coo-chat";

import { requireCapability } from "@/lib/authorization";

export default async function AiCooPage() {
  const authorization = await requireCapability("AI_COO_ACCESS", "AI_COO_PAGE");
  const firstName = authorization.user.name.split(/\s+/)[0] || "there";

  return <AiCooChat firstName={firstName} />;
}
