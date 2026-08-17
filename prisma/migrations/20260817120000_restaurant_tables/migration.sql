-- Restaurant floor tables and held-bill assignments.

CREATE TABLE "restaurant_tables" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "registerId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "seats" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "restaurant_tables_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "restaurant_tables_seats_positive" CHECK ("seats" > 0)
);

ALTER TABLE "register_orders"
  ADD COLUMN "restaurantTableId" UUID;

CREATE UNIQUE INDEX "restaurant_tables_registerId_name_key"
  ON "restaurant_tables"("registerId", "name");
CREATE INDEX "restaurant_tables_registerId_active_name_idx"
  ON "restaurant_tables"("registerId", "active", "name");
CREATE INDEX "register_orders_restaurantTableId_status_idx"
  ON "register_orders"("restaurantTableId", "status");
CREATE UNIQUE INDEX "register_orders_one_held_bill_per_table_key"
  ON "register_orders"("restaurantTableId")
  WHERE "status" = 'HELD' AND "restaurantTableId" IS NOT NULL;

ALTER TABLE "restaurant_tables"
  ADD CONSTRAINT "restaurant_tables_registerId_fkey"
  FOREIGN KEY ("registerId") REFERENCES "cash_registers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "register_orders"
  ADD CONSTRAINT "register_orders_restaurantTableId_fkey"
  FOREIGN KEY ("restaurantTableId") REFERENCES "restaurant_tables"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
