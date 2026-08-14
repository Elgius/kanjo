"use server";

import { requirePageAccess } from "@/lib/authorization";
import {
  getBillHistoryPage,
  sanitizeBillFilters,
  type BillCursor,
  type BillHistoryFilters,
} from "@/lib/pos/bills";

export async function loadMoreBillsAction(filters: BillHistoryFilters, cursor: BillCursor) {
  await requirePageAccess("BILL_HISTORY");
  return getBillHistoryPage(sanitizeBillFilters(filters), cursor);
}
