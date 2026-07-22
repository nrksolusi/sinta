import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";
import type { EntityDocumentSources } from "./entity-documents";

// The four document lists an entity detail page joins over. Fetched together
// and cached under one key so the partner and warehouse detail pages share the
// same client-side dataset (M1 list endpoints return all tenant rows).
export const entityDocumentsQueryOptions = queryOptions({
  queryKey: ["entity-documents"],
  queryFn: async (): Promise<EntityDocumentSources> => {
    const [po, gr, so, del] = await Promise.all([
      api.GET("/purchase-orders"),
      api.GET("/goods-receipts"),
      api.GET("/sales-orders"),
      api.GET("/deliveries"),
    ]);
    return {
      purchaseOrders: po.data ?? [],
      goodsReceipts: gr.data ?? [],
      salesOrders: so.data ?? [],
      deliveries: del.data ?? [],
    };
  },
});
