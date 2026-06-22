const asyncHandler = require("../utils/asyncHandler");
const service = require("../services/returns.service");

const getReturns = asyncHandler(async (req, res) => res.json({ success: true, ...(await service.listReturns(req.query)) }));
const getReturnById = asyncHandler(async (req, res) => {
  const data = await service.getReturn(req.params.id);
  if (!data) { res.status(404); throw new Error("سجل المرتجع غير موجود"); }
  res.json({ success: true, data });
});
const getReturnsSummary = asyncHandler(async (req, res) => res.json(await service.getSummary(req.query)));

module.exports = { getReturns, getReturnById, getReturnsSummary };
