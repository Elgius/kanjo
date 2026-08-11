-- Neon-side Stock aggregation, bounded hybrid search, and supporting indexes.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

ALTER TABLE "products"
  ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';

ALTER TABLE "inventory_movements"
  ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.stock_normalize_search(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURN btrim(regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', ' ', 'g'));

CREATE OR REPLACE FUNCTION public.stock_product_search_text(product_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT public.stock_normalize_search(concat_ws(
    ' ',
    product."name",
    product."sku",
    product."barcode",
    product."category",
    product."description",
    product."kind"::TEXT,
    register."name",
    register."code"
  ))
  FROM public.products AS product
  JOIN public.cash_registers AS register ON register."id" = product."registerId"
  WHERE product."id" = product_id
$$;

CREATE OR REPLACE FUNCTION public.stock_movement_search_text(movement_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT public.stock_normalize_search(concat_ws(
    ' ',
    product."name",
    product."sku",
    register."name",
    register."code",
    movement."type"::TEXT,
    movement."reason",
    creator."name",
    CASE WHEN sale."receiptNumber" IS NULL THEN NULL ELSE 'Receipt ' || sale."receiptNumber"::TEXT END,
    movement."quantityDelta"::TEXT,
    movement."balanceAfter"::TEXT
  ))
  FROM public.inventory_movements AS movement
  JOIN public.products AS product ON product."id" = movement."productId"
  JOIN public.cash_registers AS register ON register."id" = movement."registerId"
  JOIN public."user" AS creator ON creator."id" = movement."createdById"
  LEFT JOIN public.sales AS sale ON sale."id" = movement."saleId"
  WHERE movement."id" = movement_id
$$;

CREATE OR REPLACE FUNCTION public.set_stock_product_search_text()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  register_name TEXT;
  register_code TEXT;
BEGIN
  SELECT register."name", register."code"
  INTO register_name, register_code
  FROM public.cash_registers AS register
  WHERE register."id" = NEW."registerId";

  NEW."searchText" := public.stock_normalize_search(concat_ws(
    ' ',
    NEW."name",
    NEW."sku",
    NEW."barcode",
    NEW."category",
    NEW."description",
    NEW."kind"::TEXT,
    register_name,
    register_code
  ));
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.set_stock_movement_search_text()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  product_name TEXT;
  product_sku TEXT;
  register_name TEXT;
  register_code TEXT;
  creator_name TEXT;
  receipt_number BIGINT;
BEGIN
  SELECT product."name", product."sku"
  INTO product_name, product_sku
  FROM public.products AS product
  WHERE product."id" = NEW."productId";

  SELECT register."name", register."code"
  INTO register_name, register_code
  FROM public.cash_registers AS register
  WHERE register."id" = NEW."registerId";

  SELECT creator."name"
  INTO creator_name
  FROM public."user" AS creator
  WHERE creator."id" = NEW."createdById";

  IF NEW."saleId" IS NOT NULL THEN
    SELECT sale."receiptNumber"
    INTO receipt_number
    FROM public.sales AS sale
    WHERE sale."id" = NEW."saleId";
  END IF;

  NEW."searchText" := public.stock_normalize_search(concat_ws(
    ' ',
    product_name,
    product_sku,
    register_name,
    register_code,
    NEW."type"::TEXT,
    NEW."reason",
    creator_name,
    CASE WHEN receipt_number IS NULL THEN NULL ELSE 'Receipt ' || receipt_number::TEXT END,
    NEW."quantityDelta"::TEXT,
    NEW."balanceAfter"::TEXT
  ));
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.refresh_stock_search_documents()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    UPDATE public.inventory_movements
    SET "searchText" = public.stock_movement_search_text("id")
    WHERE "productId" = NEW."id";
  ELSIF TG_TABLE_NAME = 'cash_registers' THEN
    UPDATE public.products
    SET "searchText" = public.stock_product_search_text("id")
    WHERE "registerId" = NEW."id";

    UPDATE public.inventory_movements
    SET "searchText" = public.stock_movement_search_text("id")
    WHERE "registerId" = NEW."id";
  ELSIF TG_TABLE_NAME = 'user' THEN
    UPDATE public.inventory_movements
    SET "searchText" = public.stock_movement_search_text("id")
    WHERE "createdById" = NEW."id";
  ELSIF TG_TABLE_NAME = 'sales' THEN
    UPDATE public.inventory_movements
    SET "searchText" = public.stock_movement_search_text("id")
    WHERE "saleId" = NEW."id";
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER products_stock_search_text_set
BEFORE INSERT OR UPDATE OF "registerId", "sku", "barcode", "name", "category", "description", "kind"
ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_stock_product_search_text();

CREATE TRIGGER inventory_movements_stock_search_text_set
BEFORE INSERT OR UPDATE OF "productId", "registerId", "saleId", "createdById", "type", "quantityDelta", "balanceAfter", "reason"
ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.set_stock_movement_search_text();

CREATE TRIGGER products_stock_search_dependents_refresh
AFTER UPDATE OF "name", "sku"
ON public.products
FOR EACH ROW
WHEN (OLD."name" IS DISTINCT FROM NEW."name" OR OLD."sku" IS DISTINCT FROM NEW."sku")
EXECUTE FUNCTION public.refresh_stock_search_documents();

CREATE TRIGGER cash_registers_stock_search_dependents_refresh
AFTER UPDATE OF "name", "code"
ON public.cash_registers
FOR EACH ROW
WHEN (OLD."name" IS DISTINCT FROM NEW."name" OR OLD."code" IS DISTINCT FROM NEW."code")
EXECUTE FUNCTION public.refresh_stock_search_documents();

CREATE TRIGGER users_stock_search_dependents_refresh
AFTER UPDATE OF "name"
ON public."user"
FOR EACH ROW
WHEN (OLD."name" IS DISTINCT FROM NEW."name")
EXECUTE FUNCTION public.refresh_stock_search_documents();

CREATE TRIGGER sales_stock_search_dependents_refresh
AFTER UPDATE OF "receiptNumber"
ON public.sales
FOR EACH ROW
WHEN (OLD."receiptNumber" IS DISTINCT FROM NEW."receiptNumber")
EXECUTE FUNCTION public.refresh_stock_search_documents();

UPDATE public.products
SET "searchText" = public.stock_product_search_text("id");

UPDATE public.inventory_movements
SET "searchText" = public.stock_movement_search_text("id");

CREATE INDEX "products_search_text_trgm_idx"
ON public.products USING GIN ("searchText" gin_trgm_ops);

CREATE INDEX "inventory_movements_search_text_trgm_idx"
ON public.inventory_movements USING GIN ("searchText" gin_trgm_ops);

CREATE INDEX "inventory_movements_createdAt_id_idx"
ON public.inventory_movements ("createdAt" DESC, "id" DESC);

DROP INDEX "inventory_movements_registerId_createdAt_idx";
CREATE INDEX "inventory_movements_registerId_createdAt_id_idx"
ON public.inventory_movements ("registerId", "createdAt" DESC, "id" DESC);

CREATE INDEX "inventory_movements_type_createdAt_id_idx"
ON public.inventory_movements ("type", "createdAt" DESC, "id" DESC);

DROP INDEX "inventory_batches_productId_expiryDate_receivedAt_idx";
CREATE INDEX "inventory_batches_positive_product_expiry_received_idx"
ON public.inventory_batches ("productId", "expiryDate", "receivedAt", "id")
INCLUDE ("remainingQuantity")
WHERE "remainingQuantity" > 0;

CREATE OR REPLACE FUNCTION public.stock_page_data(
  p_register_id UUID DEFAULT NULL,
  p_movement_type public."InventoryMovementType" DEFAULT NULL,
  p_query TEXT DEFAULT NULL,
  p_candidate_limit INTEGER DEFAULT 1001,
  p_result_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
SET pg_trgm.word_similarity_threshold = '0.3'
AS $$
WITH parameters AS (
  SELECT
    p_register_id AS register_id,
    p_movement_type AS movement_type,
    NULLIF(public.stock_normalize_search(p_query), '') AS query_text,
    LEAST(GREATEST(COALESCE(p_candidate_limit, 1001), 2), 1001) AS candidate_limit,
    LEAST(GREATEST(COALESCE(p_result_limit, 100), 1), 100) AS result_limit
),
positive_batches AS (
  SELECT
    batch."productId" AS product_id,
    SUM(batch."remainingQuantity") AS measured_on_hand,
    jsonb_agg(
      jsonb_build_object(
        'id', batch."id",
        'remainingQuantity', batch."remainingQuantity",
        'expiryDate', batch."expiryDate"
      )
      ORDER BY batch."expiryDate" ASC NULLS LAST, batch."receivedAt" ASC, batch."id" ASC
    ) AS batches
  FROM public.inventory_batches AS batch
  WHERE batch."remainingQuantity" > 0
  GROUP BY batch."productId"
),
product_base AS (
  SELECT
    product."id",
    product."sku",
    product."barcode",
    product."name",
    product."category",
    product."description",
    product."costPriceLaari",
    product."lowStockThreshold",
    product."kind",
    product."quantityMetric",
    product."quantityValue",
    product."servingSize",
    product."searchText",
    register."id" AS register_id,
    register."code" AS register_code,
    register."name" AS register_name,
    register."purpose" AS register_purpose,
    COALESCE(batch.measured_on_hand, 0) AS measured_on_hand,
    CASE
      WHEN product."kind" = 'CONSUMABLE' AND product."quantityValue" > 0
        THEN COALESCE(batch.measured_on_hand, 0) / product."quantityValue"
      WHEN product."kind" = 'GOODS'
        THEN COALESCE(batch.measured_on_hand, 0)
      ELSE 0
    END AS stock_quantity,
    COALESCE(batch.batches, '[]'::JSONB) AS batches
  FROM public.products AS product
  JOIN public.cash_registers AS register ON register."id" = product."registerId"
  LEFT JOIN positive_batches AS batch ON batch.product_id = product."id"
  CROSS JOIN parameters AS parameter
  WHERE product."active" = TRUE
    AND (parameter.register_id IS NULL OR product."registerId" = parameter.register_id)
),
product_candidates AS (
  SELECT
    product.*,
    CASE
      WHEN parameter.query_text IS NULL THEN 1::REAL
      ELSE word_similarity(parameter.query_text, product."searchText")
    END AS candidate_score
  FROM product_base AS product
  CROSS JOIN parameters AS parameter
  WHERE parameter.query_text IS NULL
    OR product."searchText" LIKE '%' || parameter.query_text || '%'
    OR parameter.query_text <% product."searchText"
),
product_candidate_count AS (
  SELECT COUNT(*)::INTEGER AS count FROM product_candidates
),
selected_product_ids AS (
  SELECT candidate."id"
  FROM product_candidates AS candidate
  CROSS JOIN parameters AS parameter
  ORDER BY
    CASE WHEN parameter.query_text IS NOT NULL THEN candidate.candidate_score END DESC NULLS LAST,
    candidate.register_name ASC,
    candidate."name" ASC,
    candidate."id" ASC
  LIMIT (SELECT CASE WHEN query_text IS NULL THEN 2147483647 ELSE candidate_limit END FROM parameters)
),
selected_products AS (
  SELECT candidate.*
  FROM product_candidates AS candidate
  JOIN selected_product_ids AS selected ON selected."id" = candidate."id"
),
product_metrics AS (
  SELECT
    COALESCE(SUM(product.stock_quantity), 0) AS units_on_hand,
    COALESCE(SUM(product.stock_quantity * product."costPriceLaari"), 0) AS stock_value_laari,
    COUNT(*) FILTER (
      WHERE product.stock_quantity > 0
        AND product.stock_quantity <= product."lowStockThreshold"
    )::INTEGER AS low_stock,
    COUNT(*) FILTER (WHERE product.stock_quantity = 0)::INTEGER AS out_of_stock
  FROM selected_products AS product
),
movement_base AS (
  SELECT
    movement."id",
    movement."type",
    movement."quantityDelta",
    movement."balanceAfter",
    movement."reason",
    movement."createdAt",
    movement."searchText",
    product."id" AS product_id,
    product."name" AS product_name,
    product."sku" AS product_sku,
    product."kind" AS product_kind,
    product."quantityMetric" AS product_quantity_metric,
    product."quantityValue" AS product_quantity_value,
    product."servingSize" AS product_serving_size,
    register."id" AS register_id,
    register."code" AS register_code,
    register."name" AS register_name,
    creator."name" AS creator_name,
    sale."receiptNumber" AS receipt_number
  FROM public.inventory_movements AS movement
  JOIN public.products AS product ON product."id" = movement."productId"
  JOIN public.cash_registers AS register ON register."id" = movement."registerId"
  JOIN public."user" AS creator ON creator."id" = movement."createdById"
  LEFT JOIN public.sales AS sale ON sale."id" = movement."saleId"
  CROSS JOIN parameters AS parameter
  WHERE (parameter.register_id IS NULL OR movement."registerId" = parameter.register_id)
    AND (parameter.movement_type IS NULL OR movement."type" = parameter.movement_type)
),
movement_candidates AS (
  SELECT
    movement.*,
    CASE
      WHEN parameter.query_text IS NULL THEN 1::REAL
      ELSE word_similarity(parameter.query_text, movement."searchText")
    END AS candidate_score
  FROM movement_base AS movement
  CROSS JOIN parameters AS parameter
  WHERE parameter.query_text IS NULL
    OR movement."searchText" LIKE '%' || parameter.query_text || '%'
    OR parameter.query_text <% movement."searchText"
),
movement_candidate_count AS (
  SELECT COUNT(*)::INTEGER AS count FROM movement_candidates
),
selected_movement_ids AS (
  SELECT candidate."id"
  FROM movement_candidates AS candidate
  CROSS JOIN parameters AS parameter
  ORDER BY
    CASE WHEN parameter.query_text IS NOT NULL THEN candidate.candidate_score END DESC NULLS LAST,
    candidate."createdAt" DESC,
    candidate."id" DESC
  LIMIT (SELECT CASE WHEN query_text IS NULL THEN result_limit ELSE candidate_limit END FROM parameters)
),
selected_movements AS (
  SELECT candidate.*
  FROM movement_candidates AS candidate
  JOIN selected_movement_ids AS selected ON selected."id" = candidate."id"
)
SELECT jsonb_build_object(
  'registers', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('id', register."id", 'code', register."code", 'name', register."name")
      ORDER BY register."name" ASC, register."id" ASC
    )
    FROM public.cash_registers AS register
    WHERE register."active" = TRUE
  ), '[]'::JSONB),
  'products', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', product."id",
        'sku', product."sku",
        'barcode', product."barcode",
        'name', product."name",
        'category', product."category",
        'description', product."description",
        'costPriceLaari', product."costPriceLaari",
        'lowStockThreshold', product."lowStockThreshold",
        'kind', product."kind",
        'quantityMetric', product."quantityMetric",
        'quantityValue', product."quantityValue",
        'servingSize', product."servingSize",
        'register', jsonb_build_object(
          'id', product.register_id,
          'code', product.register_code,
          'name', product.register_name,
          'purpose', product.register_purpose
        ),
        'batches', product.batches,
        'measuredOnHand', product.measured_on_hand,
        'stockQuantity', product.stock_quantity
      )
      ORDER BY product.register_name ASC, product."name" ASC, product."id" ASC
    )
    FROM selected_products AS product
  ), '[]'::JSONB),
  'movements', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', movement."id",
        'type', movement."type",
        'quantityDelta', movement."quantityDelta",
        'balanceAfter', movement."balanceAfter",
        'reason', movement."reason",
        'createdAt', movement."createdAt",
        'product', jsonb_build_object(
          'id', movement.product_id,
          'name', movement.product_name,
          'sku', movement.product_sku,
          'kind', movement.product_kind,
          'quantityMetric', movement.product_quantity_metric,
          'quantityValue', movement.product_quantity_value,
          'servingSize', movement.product_serving_size
        ),
        'register', jsonb_build_object(
          'id', movement.register_id,
          'code', movement.register_code,
          'name', movement.register_name
        ),
        'createdBy', jsonb_build_object('name', movement.creator_name),
        'sale', CASE
          WHEN movement.receipt_number IS NULL THEN NULL
          ELSE jsonb_build_object('receiptNumber', movement.receipt_number::TEXT)
        END
      )
      ORDER BY movement."createdAt" DESC, movement."id" DESC
    )
    FROM selected_movements AS movement
  ), '[]'::JSONB),
  'movementCount', (SELECT count FROM movement_candidate_count),
  'productCandidateCapHit', (
    SELECT query_text IS NOT NULL AND product_candidate_count.count >= candidate_limit
    FROM parameters CROSS JOIN product_candidate_count
  ),
  'movementCandidateCapHit', (
    SELECT query_text IS NOT NULL AND movement_candidate_count.count >= candidate_limit
    FROM parameters CROSS JOIN movement_candidate_count
  ),
  'metrics', jsonb_build_object(
    'unitsOnHand', metrics.units_on_hand,
    'stockValueLaari', metrics.stock_value_laari,
    'lowStock', metrics.low_stock,
    'outOfStock', metrics.out_of_stock
  )
)
FROM product_metrics AS metrics
$$;

REVOKE ALL ON FUNCTION public.stock_page_data(UUID, public."InventoryMovementType", TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_page_data(UUID, public."InventoryMovementType", TEXT, INTEGER, INTEGER) TO CURRENT_USER;
