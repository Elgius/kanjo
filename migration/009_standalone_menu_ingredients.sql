-- Allow selected restaurant recipe ingredients to be sold independently.

ALTER TABLE "menu_item_ingredients"
  ADD COLUMN "standalone" BOOLEAN NOT NULL DEFAULT false;
