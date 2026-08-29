import "server-only";

import { getCustomerDetail, getCustomersOverview } from "@/lib/pos/customers";
import { AiCooToolError, defineAiCooTool } from "@/tools/_shared/tool";
import { customerDetailInputSchema, customerDetailOutputSchema, customersOverviewInputSchema, customersOverviewOutputSchema } from "./schemas";

export const customersGetOverview = defineAiCooTool({
  name: "customers_get_overview",
  description: "Return a bounded customer list and global credit exposure without bulk contact or address data.",
  inputSchema: customersOverviewInputSchema,
  outputSchema: customersOverviewOutputSchema,
  execute: async ({ query, page, pageSize }) => {
    const data = await getCustomersOverview({ query, page, pageSize });
    return {
      customers: data.customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        creditLimitLaari: customer.creditLimitLaari,
        outstandingLaari: customer.outstandingLaari,
        availableCreditLaari: customer.availableCreditLaari,
        atLimit: customer.atLimit,
        updatedAt: customer.updatedAt,
      })),
      metrics: data.metrics,
      pagination: data.pagination,
    };
  },
});

export const customersGetDetail = defineAiCooTool({
  name: "customers_get_detail",
  description: "Return one explicitly requested customer's full profile, credit exposure, and bill history.",
  inputSchema: customerDetailInputSchema,
  outputSchema: customerDetailOutputSchema,
  execute: async ({ customerId }) => {
    const data = await getCustomerDetail(customerId, null, true);
    if (!data) throw new AiCooToolError("NOT_FOUND", "Customer not found.");
    return data;
  },
});

export const customerTools = [customersGetOverview, customersGetDetail] as const;
