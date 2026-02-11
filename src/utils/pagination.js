/** Max page size allowed for all table/list APIs */
export const MAX_PAGE_SIZE = 20;

/**
 * Parse and validate pagination from req.query. Frontend should send page and limit; limit is capped at MAX_PAGE_SIZE.
 * @param {object} query - req.query
 * @param {number} defaultLimit - default page size when limit not provided (default 10)
 * @returns {{ page: number, limit: number, skip: number, totalPages: (total) => number }}
 */
export function getPagination(query, defaultLimit = 10) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  let limit = parseInt(query.limit, 10) || defaultLimit;
  limit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const skip = (page - 1) * limit;
  const totalPages = (total) => Math.max(1, Math.ceil(total / limit));
  return { page, limit, skip, totalPages };
}

/**
 * Standard paginated JSON response. Ensures total, page, limit, totalPages are numbers for the client.
 */
export function paginatedResponse(res, { data, total, page, limit }) {
  const totalNum = Number(total) || 0;
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 10;
  const totalPages = Math.max(1, Math.ceil(totalNum / limitNum));
  return res.status(200).json({
    success: true,
    data,
    pagination: {
      total: totalNum,
      page: pageNum,
      limit: limitNum,
      totalPages,
    },
  });
}
