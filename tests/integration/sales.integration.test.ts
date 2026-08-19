import { afterAll, beforeAll, expect, test } from "bun:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { databaseDescribe, testDatabaseUrl } from "@/tests/integration/database";

databaseDescribe("Neon sale transaction", () => {
  let db: PrismaClient;
  let recordSale: typeof import("@/lib/pos/sales").recordSale;
  let holdRegisterOrder: typeof import("@/lib/pos/orders").holdRegisterOrder;
  let issueCustomerCredit: typeof import("@/lib/pos/customers").issueCustomerCredit;
  let settleCustomerCredit: typeof import("@/lib/pos/customers").settleCustomerCredit;
  let trackPrintedBill: typeof import("@/lib/pos/bill-lifecycle").trackPrintedBill;
  let amendPrintedBill: typeof import("@/lib/pos/bill-lifecycle").amendPrintedBill;
  let reversePaidBill: typeof import("@/lib/pos/bill-corrections").reversePaidBill;
  let userId: string;
  let roleId: string;
  let registerId: string;
  let shiftId: string;
  let productId: string;
  let categoryId: string;
  let customerId: string;
  const marker = `codex-test-${crypto.randomUUID()}`;

  beforeAll(async () => {
    process.env.NEON_DB = testDatabaseUrl;
    ({ prisma: db } = await import("@/lib/db"));
    ({ recordSale } = await import("@/lib/pos/sales"));
    ({ holdRegisterOrder } = await import("@/lib/pos/orders"));
    ({ issueCustomerCredit, settleCustomerCredit } = await import("@/lib/pos/customers"));
    ({ trackPrintedBill, amendPrintedBill } = await import("@/lib/pos/bill-lifecycle"));
    ({ reversePaidBill } = await import("@/lib/pos/bill-corrections"));

    const role = await db.role.create({
      data: { name: marker, normalizedName: marker },
    });
    roleId = role.id;
    const user = await db.user.create({
      data: { id: marker, name: "Integration Test", email: `${marker}@example.invalid`, roleId },
    });
    userId = user.id;
    const register = await db.cashRegister.create({
      data: { code: marker.toUpperCase(), name: marker },
    });
    registerId = register.id;
    const shift = await db.registerShift.create({
      data: { registerId, openedById: userId, openingCashLaari: 10_000 },
    });
    shiftId = shift.id;
    categoryId = (await db.productCategory.create({
      data: { name: `Test ${marker}`, normalizedName: `test ${marker}` },
    })).id;
    const product = await db.product.create({
      data: {
        sku: marker.toUpperCase(),
        registerId,
        name: "Integration product",
        category: "Test",
        categoryId,
        retailPriceLaari: 2_500,
        costPriceLaari: 1_000,
        lowStockThreshold: 1,
      },
    });
    productId = product.id;
    customerId = (await db.customer.create({
      data: { name: "Credit Customer", nationality: "Maldivian", creditLimitLaari: 2_500 },
    })).id;
    await db.inventoryBatch.create({ data: {
      productId, registerId, receivedById: userId,
      receivedQuantity: 5, remainingQuantity: 5,
    } });
  });

  afterAll(async () => {
    if (!db) return;
    await db.auditLog.deleteMany({ where: { actorId: userId } });
    await db.inventoryConsumption.deleteMany({ where: { OR: [{ sale: { createdById: userId } }, { customerCreditBill: { customerId } }] } });
    await db.inventoryMovement.deleteMany({ where: { createdById: userId } });
    await db.bill.deleteMany({ where: { sale: { createdById: userId } } });
    await db.customerCreditBill.deleteMany({ where: { customerId } });
    await db.sale.deleteMany({ where: { createdById: userId } });
    await db.registerOrder.deleteMany({ where: { createdById: userId } });
    await db.inventoryBatch.deleteMany({ where: { productId } });
    await db.product.deleteMany({ where: { id: productId } });
    await db.productCategory.deleteMany({ where: { id: categoryId } });
    await db.customer.deleteMany({ where: { id: customerId } });
    await db.registerShift.deleteMany({ where: { registerId } });
    await db.cashRegister.deleteMany({ where: { id: registerId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.role.deleteMany({ where: { id: roleId } });
    await db.$disconnect();
  });

  test("records a sale and deducts stock in one transaction", async () => {
    const sale = await recordSale(db, {
      shiftId,
      createdById: userId,
      paymentMethod: "CASH",
      items: [{ itemId: productId, quantity: 2 }],
      audit: { actorLabel: marker },
    });

    expect(sale.totalLaari).toBe(5_000);
    const [product, storedSale, movement, audit, bill] = await Promise.all([
      db.inventoryBatch.aggregate({ where: { productId }, _sum: { remainingQuantity: true } }),
      db.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true } }),
      db.inventoryMovement.findFirstOrThrow({ where: { saleId: sale.id } }),
      db.auditLog.findFirstOrThrow({ where: { event: "SALE_RECORD", targetId: sale.id } }),
      db.bill.findUniqueOrThrow({ where: { saleId: sale.id } }),
    ]);
    expect(Number(product._sum.remainingQuantity)).toBe(3);
    expect(storedSale.items).toHaveLength(1);
    expect(storedSale.items[0].lineTotalLaari).toBe(5_000);
    expect(Number(movement.quantityDelta)).toBe(-2);
    expect(movement.registerId).toBe(registerId);
    expect(Number(movement.balanceAfter)).toBe(3);
    expect(audit.outcome).toBe("SUCCESS");
    expect(audit.actorId).toBe(userId);
    expect(bill.receiptNumber).toBe(sale.receiptNumber);
    expect(bill.registerId).toBe(registerId);
    expect(bill.totalLaari).toBe(5_000);
    expect(Array.isArray(bill.items)).toBe(true);
  });

  test("rolls back the sale when stock is insufficient", async () => {
    const [before, auditBefore] = await Promise.all([
      db.sale.count({ where: { createdById: userId } }),
      db.auditLog.count({ where: { actorId: userId } }),
    ]);
    await expect(
      recordSale(db, {
        shiftId,
        createdById: userId,
        paymentMethod: "CARD",
        items: [{ itemId: productId, quantity: 99 }],
        audit: { actorLabel: marker },
      }),
    ).rejects.toThrow("does not have enough usable stock");
    expect(await db.sale.count({ where: { createdById: userId } })).toBe(before);
    expect(await db.auditLog.count({ where: { actorId: userId } })).toBe(auditBefore);
    expect(Number((await db.inventoryBatch.aggregate({ where: { productId }, _sum: { remainingQuantity: true } }))._sum.remainingQuantity)).toBe(3);
  });

  test("holds an order without stock movement and completes it with the sale", async () => {
    const before = await db.inventoryBatch.aggregate({
      where: { productId },
      _sum: { remainingQuantity: true },
    });
    const order = await holdRegisterOrder(db, {
      shiftId,
      createdById: userId,
      paymentMethod: "CASH",
      customerNote: "Integration hold",
      items: [{ itemId: productId, quantity: 1 }],
      audit: { actorLabel: marker },
    });
    expect(order.status).toBe("HELD");
    expect(Number((await db.inventoryBatch.aggregate({
      where: { productId },
      _sum: { remainingQuantity: true },
    }))._sum.remainingQuantity)).toBe(Number(before._sum.remainingQuantity));

    const sale = await recordSale(db, {
      shiftId,
      createdById: userId,
      heldOrderId: order.id,
      paymentMethod: "CASH",
      items: [{ itemId: productId, quantity: 1 }],
      audit: { actorLabel: marker },
    });
    const completed = await db.registerOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.saleId).toBe(sale.id);
  });

  test("tracks a printed unpaid bill, amendments, and payment on one canonical bill", async () => {
    await db.inventoryBatch.create({ data: {
      productId, registerId, receivedById: userId,
      receivedQuantity: 10, remainingQuantity: 10,
    } });
    const tracked = await trackPrintedBill(db, {
      shiftId,
      actorId: userId,
      actorName: "Integration Test",
      paymentMethod: "CASH",
      items: [{ itemId: productId, quantity: 1 }],
      audit: { actorLabel: marker },
    });
    expect(tracked.version).toBe(1);
    const amended = await amendPrintedBill(db, {
      shiftId,
      actorId: userId,
      actorName: "Integration Test",
      billId: tracked.id,
      heldOrderId: tracked.orderId,
      expectedVersion: tracked.version,
      paymentMethod: "CARD",
      items: [{ itemId: productId, quantity: 2 }],
      audit: { actorLabel: marker },
    });
    expect(amended.version).toBe(2);
    await expect(amendPrintedBill(db, {
      shiftId,
      actorId: userId,
      actorName: "Integration Test",
      billId: tracked.id,
      heldOrderId: tracked.orderId,
      expectedVersion: 1,
      paymentMethod: "CARD",
      items: [{ itemId: productId, quantity: 2 }],
      audit: { actorLabel: marker },
    })).rejects.toThrow("changed elsewhere");

    const sale = await recordSale(db, {
      shiftId,
      createdById: userId,
      cashierName: "Integration Test",
      heldOrderId: tracked.orderId,
      paymentMethod: "CARD",
      items: [{ itemId: productId, quantity: 2 }],
      audit: { actorLabel: marker },
    });
    const paid = await db.bill.findUniqueOrThrow({ where: { id: tracked.id }, include: { revisions: { orderBy: { revision: "asc" } } } });
    expect(paid.status).toBe("PAID");
    expect(paid.saleId).toBe(sale.id);
    expect(JSON.stringify(paid.revisions.map((revision) => revision.kind))).toBe(JSON.stringify(["INITIAL_PRINT", "AMENDMENT", "PAYMENT"]));
  });

  test("deducts stock on customer credit and records the sale only when paid", async () => {
    const beforeStock = Number((await db.inventoryBatch.aggregate({
      where: { productId },
      _sum: { remainingQuantity: true },
    }))._sum.remainingQuantity);
    const salesBefore = await db.sale.count({ where: { createdById: userId } });
    const creditBill = await issueCustomerCredit(db, {
      shiftId,
      customerId,
      createdById: userId,
      items: [{ itemId: productId, quantity: 1 }],
      audit: { actorLabel: marker },
    });
    expect(creditBill.totalLaari).toBe(2_500);
    const storedCreditBill = await db.customerCreditBill.findUniqueOrThrow({
      where: { id: creditBill.id },
      select: {
        status: true,
        saleId: true,
        stockMovements: {
          select: {
            type: true,
            saleId: true,
            customerCreditBillId: true,
            quantityDelta: true,
          },
        },
      },
    });
    expect(storedCreditBill.status).toBe("OUTSTANDING");
    expect(storedCreditBill.saleId).toBeNull();
    expect(storedCreditBill.stockMovements).toHaveLength(1);
    expect(storedCreditBill.stockMovements[0].type).toBe("SALE");
    expect(storedCreditBill.stockMovements[0].saleId).toBeNull();
    expect(storedCreditBill.stockMovements[0].customerCreditBillId).toBe(creditBill.id);
    expect(Number(storedCreditBill.stockMovements[0].quantityDelta)).toBe(-1);
    expect(await db.sale.count({ where: { createdById: userId } })).toBe(salesBefore);
    expect(Number((await db.inventoryBatch.aggregate({ where: { productId }, _sum: { remainingQuantity: true } }))._sum.remainingQuantity)).toBe(beforeStock - 1);

    await expect(issueCustomerCredit(db, {
      shiftId,
      customerId,
      createdById: userId,
      items: [{ itemId: productId, quantity: 1 }],
      audit: { actorLabel: marker },
    })).rejects.toThrow("does not have enough available credit");

    const sale = await settleCustomerCredit(db, {
      creditBillId: creditBill.id,
      settledById: userId,
      cashierName: "Integration Test",
      paymentMethod: "CARD",
      audit: { actorLabel: marker },
    });
    expect(sale.receiptNumber > 0).toBe(true);
    const paid = await db.customerCreditBill.findUniqueOrThrow({ where: { id: creditBill.id } });
    expect(paid.status).toBe("PAID");
    expect(paid.saleId).toBe(sale.id);
    expect(Number((await db.inventoryBatch.aggregate({ where: { productId }, _sum: { remainingQuantity: true } }))._sum.remainingQuantity)).toBe(beforeStock - 1);

    const settledBill = await db.bill.findUniqueOrThrow({ where: { saleId: sale.id } });
    await reversePaidBill(db, {
      billId: settledBill.id,
      registerId,
      sessionId: shiftId,
      expectedVersion: settledBill.version,
      stock: { mode: "ALL", quantities: [] },
      actorId: userId,
      actorName: "Integration Test",
      audit: { actorLabel: marker },
    });
    const reversedCredit = await db.customerCreditBill.findUniqueOrThrow({ where: { id: creditBill.id } });
    expect(reversedCredit.status).toBe("REVERSED");
    expect((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe("REFUNDED");
    expect(Number((await db.inventoryBatch.aggregate({ where: { productId }, _sum: { remainingQuantity: true } }))._sum.remainingQuantity)).toBe(beforeStock);
  });
});
