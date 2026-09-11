import { beforeAll, afterAll, expect, test } from "bun:test";
import { databaseDescribe, testDatabaseUrl } from "./database";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizePostgresSslMode } from "@/lib/postgres-url";
const { mutateOnce } = await import("@/lib/pos/mutation");
const { recordSale } = await import("@/lib/pos/sales");
const { trackPrintedBill } = await import("@/lib/pos/bill-lifecycle");
const { mergeCustomers } = await import("@/lib/pos/customer-merge");
const { issueCustomerCredit } = await import("@/lib/pos/customers");

databaseDescribe("audit safeguards",()=>{
 let db: PrismaClient, actorId: string, registerId: string, shiftId: string, productId: string;
 const marker = `safeguards-${crypto.randomUUID()}`;
 beforeAll(async()=>{
  db=new PrismaClient({adapter:new PrismaPg({connectionString:normalizePostgresSslMode(testDatabaseUrl!)})});
  actorId=(await db.user.findFirstOrThrow({where:{isSiteAdmin:true}})).id;
  const register=await db.cashRegister.create({data:{code:marker,name:marker,purpose:"SHOP"}});registerId=register.id;
  shiftId=(await db.registerShift.create({data:{registerId,openedById:actorId,openingCashLaari:10000}})).id;
  const categoryId = (await db.productCategory.create({data:{name:marker,normalizedName:marker}})).id;
  productId=(await db.product.create({data:{sku:marker,categoryId,registerId,name:"Safeguard item",category:"Test",retailPriceLaari:1000,costPriceLaari:100,lowStockThreshold:1}})).id;
  console.log(JSON.stringify({registerId,shiftId,productId,marker}));
  await db.inventoryBatch.create({data:{productId,registerId,receivedById:actorId,receivedQuantity:100,remainingQuantity:100}});
 });
 afterAll(async()=>{
  if (!db) return;
  if (registerId && process.env.KEEP_SAFEGUARD_FIXTURES !== "1") {
    await db.product.updateMany({ where: { registerId }, data: { active: false } });
    await db.cashRegister.update({ where: { id: registerId }, data: { active: false } });
    await db.customer.updateMany({ where: { name: { startsWith: marker } }, data: { active: false } });
  }
  await db.$disconnect();
 });
 test("concurrent repeated sale requests return one sale and one stock deduction",async()=>{
  const input={shiftId,createdById:actorId,requestId:crypto.randomUUID(),paymentMethod:"CASH" as const,items:[{itemId:productId,quantity:2}],audit:{actorLabel:marker}};
  const results=await Promise.all([recordSale(db,input),recordSale(db,input)]);
  expect(results[0].id).toBe(results[1].id);
  expect(await db.sale.count({where:{registerShiftId:shiftId}})).toBe(1);
  expect(Number((await db.inventoryBatch.findFirstOrThrow({where:{productId}})).remainingQuantity)).toBe(98);
  expect(await db.auditLog.count({where:{targetId:results[0].id,event:"SALE_RECORD"}})).toBe(1);
  await expect(recordSale(db,{...input,items:[{itemId:productId,quantity:3}]})).rejects.toThrow("different details");
 },30000);
 test("failed mutations roll back both changes and replay records",async()=>{
  const key=crypto.randomUUID();
  await expect(mutateOnce(db,marker,key,{},async tx=>{await tx.customer.create({data:{name:marker,nationality:"Test",creditLimitLaari:0}});throw new Error("rollback");})).rejects.toThrow("rollback");
  expect(await db.customer.count({where:{name:marker}})).toBe(0);
  expect(await db.mutationRequest.count({where:{scope:marker,key}})).toBe(0);
 },30000);
 test("printing records requests, requires a reprint reason, and replays once",async()=>{
  const input={shiftId,actorId,actorName:marker,requestId:crypto.randomUUID(),paymentMethod:"CASH" as const,items:[{itemId:productId,quantity:1}],audit:{actorLabel:marker}};
  const first=await trackPrintedBill(db,input);
  expect(first.printRequestCount).toBe(1);
  expect((await trackPrintedBill(db,input)).id).toBe(first.id);
  const repeat={...input,requestId:crypto.randomUUID(),billId:first.id,heldOrderId:first.orderId,expectedVersion:first.version};
  await expect(trackPrintedBill(db,repeat)).rejects.toThrow("reprint reason");
  expect((await db.bill.findUniqueOrThrow({where:{id:first.id}})).version).toBe(first.version);
  const second=await trackPrintedBill(db,{...repeat,printReason:"Printer paper jam"});expect(second.printRequestCount).toBe(2);
  expect((await trackPrintedBill(db,{...repeat,printReason:"Printer paper jam"})).printRequestCount).toBe(2);
 },30000);
 test("customer merge preserves credit bills and archives source with an audit trail",async()=>{
  const source=await db.customer.create({data:{name:marker+" source",nationality:"Test",creditLimitLaari:10000}});
  const target=await db.customer.create({data:{name:marker+" destination",nationality:"Test",creditLimitLaari:10000}});
  const credit=await issueCustomerCredit(db,{shiftId,customerId:source.id,createdById:actorId,items:[{itemId:productId,quantity:1}],audit:{actorLabel:marker}});
  const input={sourceId:source.id,targetId:target.id,sourceUpdatedAt:source.updatedAt.toISOString(),targetUpdatedAt:target.updatedAt.toISOString(),reason:"Verified duplicate test account",requestId:crypto.randomUUID(),actorId,actorLabel:marker};
  await mergeCustomers(db,input);await mergeCustomers(db,input);
  expect((await db.customerCreditBill.findUniqueOrThrow({where:{id:credit.id}})).customerId).toBe(target.id);
  const archived=await db.customer.findUniqueOrThrow({where:{id:source.id}});expect(archived.active).toBe(false);expect(archived.mergedIntoId).toBe(target.id);
  expect(await db.auditLog.count({where:{event:"CUSTOMER_MERGE",targetId:target.id}})).toBe(1);
 },30000);
});
