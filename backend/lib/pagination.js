/**
 * Parse page/limit from query. Caps page size to avoid unbounded lists.
 * @returns {{ page: number, limit: number, skip: number }}
 */
function parsePagination(query, { defaultLimit = 50, maxLimit = 200 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  let limit = parseInt(query.limit, 10) || defaultLimit;
  if (limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  return { page, limit, skip: (page - 1) * limit };
}

function paginated(items, total, page, limit) {
  return {
    data: items,
    meta: {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit))
    }
  };
}

module.exports = { parsePagination, paginated };
