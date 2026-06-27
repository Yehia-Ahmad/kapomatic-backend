const asyncHandler = require("../utils/asyncHandler");
const WebsiteOrder = require("../models/websiteOrder.model");
const { buildPaginatedResponse, getPaginationParams } = require("../utils/pagination");
const { createSellingInvoice, toSellingInvoice } = require("./selling.controller");

const WEBSITE_ORDER_POPULATE = [
  { path: "items.product", select: "code" },
  { path: "selling", select: "_id invoiceId sellingDate refundStatus refundedQuantity refundedAmount" },
];

const toWebsiteOrder = (order) => ({
  _id: order._id,
  customerName: order.customerName,
  customerPhone: order.customerPhone,
  shippingLocation: order.shippingLocation,
  government: order.government,
  orderDate: order.orderDate,
  itemCount: Array.isArray(order.items) ? order.items.length : 0,
  totalQuantity: order.totalQuantity,
  discountAmount: order.discountAmount ?? 0,
  shippingFees: order.shippingFees,
  totalPrice: order.totalPrice,
  status: order.status,
  sellingId: order.selling?._id ?? order.selling ?? null,
  invoiceId: order.selling?.invoiceId ?? order.selling?._id ?? null,
  acceptedAt: order.acceptedAt ?? null,
  refundedAt: order.refundedAt ?? null,
  refundReason: order.refundReason ?? null,
  items: (order.items || []).map((item) => ({
    _id: item._id,
    productId: item.product?._id ?? item.product,
    productName: item.productName,
    productCode:
      item.product && typeof item.product === "object"
        ? item.product.code ?? item.productCode ?? null
        : item.productCode ?? null,
    categoryName: item.categoryName ?? null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
  })),
});

const getWebsiteOrdersByStatus = (status) =>
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPaginationParams(req.query);
    const query = status ? { status } : {};

    const [orders, totalItems] = await Promise.all([
      WebsiteOrder.find(query)
        .populate(WEBSITE_ORDER_POPULATE)
        .sort({ orderDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      WebsiteOrder.countDocuments(query),
    ]);

    res.json(
      buildPaginatedResponse({
        data: orders.map(toWebsiteOrder),
        page,
        limit,
        totalItems,
      })
    );
  });

const getWebsiteOrders = getWebsiteOrdersByStatus();
const getPendingWebsiteOrders = getWebsiteOrdersByStatus("pending");
const getAcceptedWebsiteOrders = getWebsiteOrdersByStatus("accepted");
const getRefundedWebsiteOrders = getWebsiteOrdersByStatus("refunded");

const confirmWebsiteOrder = asyncHandler(async (req, res) => {
  const order = await WebsiteOrder.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error("طلب الموقع غير موجود");
  }

  if (order.status === "refunded") {
    res.status(400);
    throw new Error("لا يمكن تأكيد طلب موقع تم رده");
  }

  if (order.status === "accepted") {
    res.status(400);
    throw new Error("تم تأكيد طلب الموقع مسبقًا");
  }

  const selling = await createSellingInvoice({
    body: {
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      shippingLocation: order.shippingLocation,
      government: order.government,
      shippingFees: order.shippingFees,
      discountAmount: order.discountAmount ?? 0,
      sellingDate: req.body?.sellingDate ?? new Date(),
      confirmInsufficientInventory: req.body?.confirmInsufficientInventory === true,
      items: order.items.map((item) => ({
        productId: item.product,
        price: item.unitPrice,
        quantity: item.quantity,
      })),
    },
    res,
    options: {
      requireShippingLocation: true,
      requireGovernment: true,
    },
  });

  order.status = "accepted";
  order.selling = selling._id;
  order.acceptedAt = new Date();
  await order.save();
  await order.populate(WEBSITE_ORDER_POPULATE);

  res.status(201).json({
    success: true,
    data: {
      order: toWebsiteOrder(order),
      invoice: toSellingInvoice(selling),
    },
  });
});

const refundWebsiteOrder = asyncHandler(async (req, res) => {
  const order = await WebsiteOrder.findById(req.params.id).populate(WEBSITE_ORDER_POPULATE);

  if (!order) {
    res.status(404);
    throw new Error("طلب الموقع غير موجود");
  }

  if (order.status === "refunded") {
    return res.json({ success: true, data: toWebsiteOrder(order) });
  }

  const refundReason = req.body?.reason ?? req.body?.note;
  if (
    refundReason !== undefined &&
    (typeof refundReason !== "string" || refundReason.trim().length > 1000)
  ) {
    res.status(400);
    throw new Error("سبب رد طلب الموقع غير صالح");
  }

  order.status = "refunded";
  order.refundedAt = new Date();
  order.refundReason = refundReason?.trim() || undefined;
  await order.save();
  await order.populate(WEBSITE_ORDER_POPULATE);

  res.json({ success: true, data: toWebsiteOrder(order) });
});

const markWebsiteOrderRefundedBySelling = async (selling, options = {}) => {
  if (!selling?._id) return null;

  const order = await WebsiteOrder.findOne({
    selling: selling._id,
    status: "accepted",
  });

  if (!order) return null;

  order.status = "refunded";
  order.refundedAt = options.refundedAt ?? new Date();
  order.refundReason = options.refundReason;
  await order.save();
  return order;
};

module.exports = {
  getWebsiteOrders,
  getPendingWebsiteOrders,
  getAcceptedWebsiteOrders,
  getRefundedWebsiteOrders,
  confirmWebsiteOrder,
  refundWebsiteOrder,
  markWebsiteOrderRefundedBySelling,
};
