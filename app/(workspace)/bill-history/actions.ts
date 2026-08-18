"use server";

import { authorizedRegisterIds, requireCapability } from "@/lib/authorization";
import {
  getBillHistoryPage,
  sanitizeBillFilters,
  type BillCursor,
  type BillHistoryFilters,
} from "@/lib/pos/bills";

export async function loadMoreBillsAction(filters: BillHistoryFilters, cursor: BillCursor) {
  const authorization = await requireCapability("BILL_HISTORY_VIEW", "BILL_HISTORY_LOAD_MORE");
  return getBillHistoryPage(sanitizeBillFilters(filters), cursor, authorizedRegisterIds(authorization));
}
