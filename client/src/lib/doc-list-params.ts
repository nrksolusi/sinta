export interface DocListFilters {
  status?: string;
  warehouse?: string;
  dateRange?: string;
}

export interface DocListParams {
  status?: string;
  warehouseId?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
}

export function buildDocListParams(
  filters: DocListFilters,
  cursor?: string,
): DocListParams {
  const params: DocListParams = {};
  if (filters.status) params.status = filters.status;
  if (filters.warehouse) params.warehouseId = filters.warehouse;
  if (filters.dateRange) {
    params.dateFrom = filters.dateRange;
    params.dateTo = filters.dateRange;
  }
  if (cursor) params.cursor = cursor;
  return params;
}
