ALTER TABLE "Product"
  ADD CONSTRAINT "Product_pricePaise_nonnegative"
    CHECK ("pricePaise" >= 0),
  ADD CONSTRAINT "Product_packSize_positive"
    CHECK ("packSize" > 0),
  ADD CONSTRAINT "Product_inventoryQty_nonnegative"
    CHECK ("inventoryQty" >= 0);

ALTER TABLE "Scheme"
  ADD CONSTRAINT "Scheme_parameters_match_kind"
    CHECK (
      (
        "kind" = 'BUY_X_GET_Y'
        AND "buyQty" > 0
        AND "freeQty" > 0
        AND "minQty" IS NULL
        AND "discountBps" IS NULL
      )
      OR
      (
        "kind" = 'THRESHOLD_PERCENT'
        AND "buyQty" IS NULL
        AND "freeQty" IS NULL
        AND "minQty" > 0
        AND "discountBps" > 0
        AND "discountBps" <= 10000
      )
    );
