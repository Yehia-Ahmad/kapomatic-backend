const router = require("express").Router();
const { getReturns, getReturnById, getReturnsSummary } = require("../controllers/returns.controller");
router.get("/summary", getReturnsSummary);
router.get("/", getReturns);
router.get("/:id", getReturnById);
module.exports = router;
