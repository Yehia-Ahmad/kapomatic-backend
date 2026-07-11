const asyncHandler = require("../utils/asyncHandler");
const { buildPaginatedResponse, getPaginationParams } = require("../utils/pagination");
const WorkshopSalesService = require("../services/workshopSales.service");

const WorkshopSalesController = {
  createWorkshopSale: asyncHandler(async (req, res) => {
    const workshopSale = await WorkshopSalesService.createWorkshopSale(req.body);
    res.status(201).json(workshopSale);
  }),

  getWorkshopSales: asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { data, totalItems } = await WorkshopSalesService.getWorkshopSales({
      query: req.query,
      page,
      limit,
      skip,
    });

    res.json(buildPaginatedResponse({ data, page, limit, totalItems }));
  }),

  getWorkshopSaleById: asyncHandler(async (req, res) => {
    res.json(await WorkshopSalesService.getWorkshopSaleById(req.params.id));
  }),

  updateWorkshopSale: asyncHandler(async (req, res) => {
    res.json(await WorkshopSalesService.updateWorkshopSale(req.params.id, req.body));
  }),

  deleteWorkshopSale: asyncHandler(async (req, res) => {
    await WorkshopSalesService.deleteWorkshopSale(req.params.id);
    res.json({ message: "Workshop sale invoice deleted successfully" });
  }),

  addWorkshopSalePayment: asyncHandler(async (req, res) => {
    const workshopSale = await WorkshopSalesService.addWorkshopSalePayment(req.params.id, req.body);
    res.status(201).json(workshopSale);
  }),

  cancelWorkshopSale: asyncHandler(async (req, res) => {
    res.json(await WorkshopSalesService.cancelWorkshopSale(req.params.id));
  }),

  markWorkshopSaleDelivered: asyncHandler(async (req, res) => {
    res.json(await WorkshopSalesService.markWorkshopSaleDelivered(req.params.id));
  }),
};

module.exports = WorkshopSalesController;
