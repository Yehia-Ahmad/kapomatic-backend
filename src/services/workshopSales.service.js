const mongoose = require("mongoose");
const Customer = require("../models/customer.model");
const Product = require("../models/product.model");
const WorkshopSale = require("../models/workshopSale.model");
const { roundMoney } = require("../utils/invoicePricing");

const MONEY_EPSILON = 1e-9;
const WORKSHOP_SALE_STATUSES = new Set([
  "pending",
  "partially_paid",
  "paid",
  "delivered",
  "cancelled",
]);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const createHttpError = (statusCode, message, responseData) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (responseData) error.responseData = responseData;
  return error;
};

const parsePositiveNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseNonNegativeNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
};

const normalizeRequiredString = (value, fieldLabel) => {
  if (typeof value !== "string" || !value.trim()) {
    throw createHttpError(400, `${fieldLabel} مطلوب`);
  }

  return value.trim();
};

const normalizeOptionalString = (value, fieldLabel) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw createHttpError(400, `${fieldLabel} غير صالح`);

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
};

const normalizeRequiredDate = (value, fieldLabel) => {
  if (value === undefined || value === null || value === "") {
    throw createHttpError(400, `${fieldLabel} مطلوب`);
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    throw createHttpError(400, `تنسيق ${fieldLabel} غير صالح`);
  }

  return parsedDate;
};

const normalizeOptionalDate = (value, fieldLabel) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    throw createHttpError(400, `تنسيق ${fieldLabel} غير صالح`);
  }

  return parsedDate;
};

const getUtcDayRange = (dateValue) => {
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return null;

  const startOfDayUtc = new Date(
    Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate())
  );
  const endOfDayUtc = new Date(startOfDayUtc);
  endOfDayUtc.setUTCDate(endOfDayUtc.getUTCDate() + 1);

  return { startOfDayUtc, endOfDayUtc };
};

const getLineItemProductId = (item) => {
  if (item.product && typeof item.product === "object" && item.product._id !== undefined) {
    return item.product._id;
  }

  return item.product;
};

const getWorkshopInventoryItems = (workshopSale) => [
  ...(workshopSale.materials || []),
  ...(workshopSale.additionalComponents || []),
]
  .map((item) => ({
    productId: getLineItemProductId(item)?.toString(),
    quantity: Number(item.quantity || 0),
  }))
  .filter((item) => item.productId);

const buildQuantityByProductId = (items) => {
  const quantityByProductId = new Map();

  for (const item of items) {
    if (!item.productId) continue;
    quantityByProductId.set(
      item.productId.toString(),
      roundMoney(Number(quantityByProductId.get(item.productId.toString()) || 0) + Number(item.quantity || 0))
    );
  }

  return quantityByProductId;
};

const applyInventoryForWorkshopChange = async ({ currentItems, nextItems }) => {
  const currentQuantityByProductId = buildQuantityByProductId(currentItems);
  const nextQuantityByProductId = buildQuantityByProductId(nextItems);
  const allProductIds = [...new Set([
    ...currentQuantityByProductId.keys(),
    ...nextQuantityByProductId.keys(),
  ])];

  if (allProductIds.length === 0) return new Map();

  const products = await Product.find({ _id: { $in: allProductIds } });
  const productsById = new Map(products.map((product) => [product._id.toString(), product]));
  const originalStates = new Map(
    products.map((product) => [
      product._id.toString(),
      {
        inventoryCount: Number(product.inventoryCount || 0),
        soldItemCount: Number(product.soldItemCount || 0),
      },
    ])
  );

  for (const [productId, nextQuantity] of nextQuantityByProductId.entries()) {
    const product = productsById.get(productId);
    if (!product) throw createHttpError(404, "المنتج غير موجود");

    const currentQuantity = Number(currentQuantityByProductId.get(productId) || 0);
    const availableQuantity = Number(product.inventoryCount || 0) + currentQuantity;
    if (availableQuantity + MONEY_EPSILON < nextQuantity) {
      throw createHttpError(400, `المخزون غير كافٍ للمنتج ${product.name}`);
    }
  }

  try {
    for (const productId of allProductIds) {
      const product = productsById.get(productId);
      if (!product) continue;

      const originalState = originalStates.get(productId);
      const currentQuantity = Number(currentQuantityByProductId.get(productId) || 0);
      const nextQuantity = Number(nextQuantityByProductId.get(productId) || 0);

      product.inventoryCount = roundMoney(originalState.inventoryCount + currentQuantity - nextQuantity);
      product.soldItemCount = Math.max(
        0,
        roundMoney(originalState.soldItemCount - currentQuantity + nextQuantity)
      );
      await product.save();
    }
  } catch (error) {
    for (const productId of allProductIds) {
      const product = productsById.get(productId);
      const originalState = originalStates.get(productId);
      if (!product || !originalState) continue;

      product.inventoryCount = originalState.inventoryCount;
      product.soldItemCount = originalState.soldItemCount;
      try {
        await product.save();
      } catch (_rollbackError) {}
    }

    throw error;
  }

  return productsById;
};

const ensureCustomerExistsForWorkshopSale = async ({ customerId, customerName, customerPhone }) => {
  if (customerId !== undefined && customerId !== null) {
    if (typeof customerId !== "string" || !customerId.trim()) {
      throw createHttpError(400, "تنسيق معرّف العميل غير صالح");
    }

    const normalizedCustomerId = customerId.trim();
    if (!mongoose.Types.ObjectId.isValid(normalizedCustomerId)) {
      throw createHttpError(400, "تنسيق معرّف العميل غير صالح");
    }

    const customer = await Customer.findById(normalizedCustomerId);
    if (!customer) throw createHttpError(404, "العميل غير موجود");

    return customer;
  }

  const normalizedCustomerName = normalizeRequiredString(customerName, "اسم العميل");
  const normalizedCustomerPhone = normalizeRequiredString(customerPhone, "رقم هاتف العميل");
  const existingCustomer = await Customer.findOne({
    name: normalizedCustomerName,
    phone: normalizedCustomerPhone,
  });

  if (existingCustomer) return existingCustomer;

  return Customer.findOneAndUpdate(
    { phone: normalizedCustomerPhone },
    {
      $set: { name: normalizedCustomerName },
      $setOnInsert: { phone: normalizedCustomerPhone },
    },
    {
      new: true,
      runValidators: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
};

const normalizeWorkshopMaterials = (items) => {
  if (items === undefined || items === null) return [];
  if (!Array.isArray(items)) throw createHttpError(400, "يجب أن تكون materials مصفوفة");

  return items.map((item, index) => {
    const itemNumber = index + 1;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw createHttpError(400, `العنصر رقم ${itemNumber} في materials غير صالح`);
    }

    const productId = item.productId ?? item.product;
    if (productId !== undefined && productId !== null && productId !== "") {
      if (typeof productId !== "string" || !mongoose.Types.ObjectId.isValid(productId)) {
        throw createHttpError(400, `تنسيق معرّف المنتج غير صالح في العنصر رقم ${itemNumber}`);
      }
    }

    const quantity = parsePositiveNumber(item.quantity);
    if (quantity === null) {
      throw createHttpError(400, `كمية العنصر رقم ${itemNumber} يجب أن تكون رقمًا أكبر من صفر`);
    }

    const unitPrice = parseNonNegativeNumber(item.unitPrice);
    if (unitPrice === null) {
      throw createHttpError(400, `سعر الوحدة في العنصر رقم ${itemNumber} يجب أن يكون رقمًا غير سالب`);
    }

    const manualCost =
      item.manualCost === undefined || item.manualCost === null || item.manualCost === ""
        ? 0
        : parseNonNegativeNumber(item.manualCost);
    if (manualCost === null) {
      throw createHttpError(400, `التكلفة اليدوية في العنصر رقم ${itemNumber} يجب أن تكون رقمًا غير سالب`);
    }

    return {
      ...(productId ? { product: productId } : {}),
      name: normalizeRequiredString(item.name, `اسم العنصر رقم ${itemNumber}`),
      quantity: roundMoney(quantity),
      unit: normalizeOptionalString(item.unit, `وحدة العنصر رقم ${itemNumber}`),
      unitPrice: roundMoney(unitPrice),
      manualCost: roundMoney(manualCost),
      totalCost: roundMoney(quantity * (unitPrice + manualCost)),
    };
  });
};

const normalizeWorkshopAdditionalComponents = (items) => {
  if (items === undefined || items === null) return [];
  if (!Array.isArray(items)) throw createHttpError(400, "يجب أن تكون additionalComponents مصفوفة");

  return items.map((item, index) => {
    const itemNumber = index + 1;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw createHttpError(400, `العنصر رقم ${itemNumber} في additionalComponents غير صالح`);
    }

    const productId = item.productId ?? item.product;
    if (productId !== undefined && productId !== null && productId !== "") {
      if (typeof productId !== "string" || !mongoose.Types.ObjectId.isValid(productId)) {
        throw createHttpError(400, `تنسيق معرّف المنتج غير صالح في العنصر رقم ${itemNumber}`);
      }
    }

    const quantity = parsePositiveNumber(item.quantity);
    if (quantity === null) {
      throw createHttpError(400, `كمية العنصر رقم ${itemNumber} يجب أن تكون رقمًا أكبر من صفر`);
    }

    const unitPrice = parseNonNegativeNumber(item.unitPrice);
    if (unitPrice === null) {
      throw createHttpError(400, `سعر الوحدة في العنصر رقم ${itemNumber} يجب أن يكون رقمًا غير سالب`);
    }

    return {
      ...(productId ? { product: productId } : {}),
      name: normalizeRequiredString(item.name, `اسم العنصر رقم ${itemNumber}`),
      quantity: roundMoney(quantity),
      unit: normalizeRequiredString(item.unit, `وحدة العنصر رقم ${itemNumber}`),
      unitPrice: roundMoney(unitPrice),
      totalCost: roundMoney(quantity * unitPrice),
    };
  });
};

const calculateWorkshopTotals = ({
  materials,
  additionalComponents,
  laborCost,
  discountAmount,
  payments,
}) => {
  const materialsCost = roundMoney(
    materials.reduce((sum, material) => sum + Number(material.totalCost || 0), 0)
  );
  const additionalComponentsCost = roundMoney(
    additionalComponents.reduce((sum, component) => sum + Number(component.totalCost || 0), 0)
  );
  const normalizedLaborCost = roundMoney(laborCost || 0);
  const subtotal = roundMoney(materialsCost + additionalComponentsCost + normalizedLaborCost);
  const normalizedDiscountAmount = roundMoney(discountAmount || 0);
  const totalPrice = roundMoney(Math.max(0, subtotal - normalizedDiscountAmount));
  const paidAmount = roundMoney(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const remainingAmount = roundMoney(Math.max(0, totalPrice - paidAmount));
  const profitAmount = roundMoney(
    totalPrice - (materialsCost + additionalComponentsCost + normalizedLaborCost)
  );
  const status = remainingAmount === 0 ? "paid" : paidAmount > 0 ? "partially_paid" : "pending";

  return {
    materialsCost,
    additionalComponentsCost,
    laborCost: normalizedLaborCost,
    subtotal,
    discountAmount: normalizedDiscountAmount,
    totalPrice,
    paidAmount,
    remainingAmount,
    profitAmount,
    status,
  };
};

const normalizePayments = (payments, sellingDate) => {
  if (payments === undefined || payments === null) return [];
  if (!Array.isArray(payments)) throw createHttpError(400, "يجب أن تكون payments مصفوفة");

  return payments.map((payment, index) => {
    const itemNumber = index + 1;
    if (!payment || typeof payment !== "object" || Array.isArray(payment)) {
      throw createHttpError(400, `الدفعة رقم ${itemNumber} غير صالحة`);
    }

    const amount = parsePositiveNumber(payment.amount);
    if (amount === null) throw createHttpError(400, `قيمة الدفعة رقم ${itemNumber} يجب أن تكون أكبر من صفر`);

    return {
      amount: roundMoney(amount),
      paymentDate:
        payment.paymentDate !== undefined
          ? normalizeRequiredDate(payment.paymentDate, `تاريخ الدفعة رقم ${itemNumber}`)
          : sellingDate,
      note: normalizeOptionalString(payment.note, `ملاحظة الدفعة رقم ${itemNumber}`),
    };
  });
};

const normalizeCreatePayments = (body, sellingDate) => {
  const rawInitialPaidAmount = body.initialPaidAmount ?? body.downPayment ?? body.paidAmount;

  if (body.payments !== undefined) {
    if (rawInitialPaidAmount !== undefined) {
      throw createHttpError(400, "لا يمكن إرسال payments مع initialPaidAmount في نفس الطلب");
    }

    return normalizePayments(body.payments, sellingDate);
  }

  if (rawInitialPaidAmount === undefined || rawInitialPaidAmount === null || rawInitialPaidAmount === "") {
    return [];
  }

  const initialPaidAmount = parseNonNegativeNumber(rawInitialPaidAmount);
  if (initialPaidAmount === null) {
    throw createHttpError(400, "المبلغ المدفوع مبدئيًا يجب أن يكون رقمًا غير سالب");
  }

  if (initialPaidAmount === 0) {
    return [];
  }

  return [
    {
      amount: roundMoney(initialPaidAmount),
      paymentDate:
        body.initialPaymentDate !== undefined || body.paymentDate !== undefined
          ? normalizeRequiredDate(
              body.initialPaymentDate ?? body.paymentDate,
              "تاريخ الدفعة الأولى"
            )
          : sellingDate,
      note: normalizeOptionalString(body.initialPaymentNote, "ملاحظة الدفعة الأولى"),
    },
  ];
};

const getNextInvoiceNumber = async () => {
  const latestSale = await WorkshopSale.findOne({ invoiceNumber: /^WS-\d+$/ })
    .sort({ createdAt: -1, _id: -1 })
    .select("invoiceNumber")
    .lean();
  const latestNumber = Number(latestSale?.invoiceNumber?.replace("WS-", "") || 0);
  return `WS-${String(latestNumber + 1).padStart(6, "0")}`;
};

const getWorkshopSaleInvoiceNumber = async (providedInvoiceNumber) => {
  if (providedInvoiceNumber !== undefined && providedInvoiceNumber !== null && providedInvoiceNumber !== "") {
    return normalizeRequiredString(providedInvoiceNumber, "رقم الفاتورة");
  }

  return getNextInvoiceNumber();
};

const toWorkshopInventoryInput = (items) =>
  items
    .map((item) => ({
      productId: getLineItemProductId(item)?.toString(),
      quantity: Number(item.quantity || 0),
    }))
    .filter((item) => item.productId);

const toWorkshopSaleLineItem = (item, options = {}) => {
  const rawItem = item.toObject ? item.toObject() : item;
  const productId = getLineItemProductId(rawItem);
  const productCode =
    rawItem.product && typeof rawItem.product === "object" ? rawItem.product.code : undefined;

  return {
    ...rawItem,
    ...(options.includeManualCost
      ? { manualCost: roundMoney(Number(rawItem.manualCost || 0)) }
      : {}),
    productId: productId ?? null,
    productCode,
  };
};

const buildWorkshopSalePayload = async (body, currentSale = null) => {
  if (body.manualCosts !== undefined) {
    throw createHttpError(
      400,
      "manualCosts is no longer supported. Use materials[].manualCost instead."
    );
  }

  let customer;
  if (
    currentSale &&
    body.customerId === undefined &&
    body.customerName === undefined &&
    body.customerPhone === undefined
  ) {
    customer = {
      _id: currentSale.customer,
      name: currentSale.customerName,
      phone: currentSale.customerPhone,
    };
  } else {
    customer = await ensureCustomerExistsForWorkshopSale({
      customerId: body.customerId,
      customerName:
        body.customerName !== undefined ? body.customerName : currentSale?.customerName,
      customerPhone:
        body.customerPhone !== undefined ? body.customerPhone : currentSale?.customerPhone,
    });
  }
  const sellingDate =
    body.sellingDate !== undefined
      ? normalizeRequiredDate(body.sellingDate, "تاريخ البيع")
      : currentSale?.sellingDate;
  const deliveryDate =
    body.deliveryDate !== undefined
      ? normalizeOptionalDate(body.deliveryDate, "تاريخ التسليم")
      : currentSale?.deliveryDate;
  const finalProductName =
    body.finalProductName !== undefined
      ? normalizeRequiredString(body.finalProductName, "اسم المنتج النهائي")
      : currentSale?.finalProductName;
  const quantity =
    body.quantity !== undefined
      ? parsePositiveNumber(body.quantity)
      : currentSale?.quantity;

  if (!sellingDate) throw createHttpError(400, "تاريخ البيع مطلوب");
  if (!finalProductName) throw createHttpError(400, "اسم المنتج النهائي مطلوب");
  if (quantity === null || quantity === undefined) {
    throw createHttpError(400, "كمية المنتج النهائي يجب أن تكون رقمًا أكبر من صفر");
  }

  const materials =
    body.materials !== undefined
      ? normalizeWorkshopMaterials(body.materials)
      : currentSale?.materials || [];
  const additionalComponents =
    body.additionalComponents !== undefined
      ? normalizeWorkshopAdditionalComponents(body.additionalComponents)
      : currentSale?.additionalComponents || [];
  const laborCost =
    body.laborCost !== undefined
      ? parseNonNegativeNumber(body.laborCost)
      : Number(currentSale?.laborCost || 0);
  const discountAmount =
    body.discountAmount !== undefined
      ? parseNonNegativeNumber(body.discountAmount)
      : Number(currentSale?.discountAmount || 0);

  if (laborCost === null) throw createHttpError(400, "تكلفة العمالة يجب أن تكون رقمًا غير سالب");
  if (discountAmount === null) throw createHttpError(400, "قيمة الخصم يجب أن تكون رقمًا غير سالب");

  const payments = currentSale
    ? (currentSale.payments || []).map((payment) => ({
        _id: payment._id,
        amount: Number(payment.amount || 0),
        paymentDate: payment.paymentDate,
        note: payment.note,
      }))
    : normalizeCreatePayments(body, sellingDate);
  const totals = calculateWorkshopTotals({
    materials,
    additionalComponents,
    laborCost,
    discountAmount,
    payments,
  });

  if (totals.paidAmount - totals.totalPrice > MONEY_EPSILON) {
    throw createHttpError(400, "إجمالي الدفعات لا يمكن أن يتجاوز إجمالي الفاتورة");
  }

  return {
    customer,
    payload: {
      customer: customer._id,
      customerName: customer.name,
      customerPhone: customer.phone,
      sellingDate,
      deliveryDate: deliveryDate ?? undefined,
      finalProductName,
      description:
        body.description !== undefined
          ? normalizeOptionalString(body.description, "وصف المنتج النهائي")
          : currentSale?.description,
      quantity: roundMoney(quantity),
      materials,
      additionalComponents,
      notes:
        body.notes !== undefined
          ? normalizeOptionalString(body.notes, "ملاحظات الفاتورة")
          : currentSale?.notes,
      payments,
      ...totals,
    },
  };
};

const toWorkshopSaleInvoice = (workshopSale) => {
  const sale = workshopSale.toObject ? workshopSale.toObject() : workshopSale;
  const invoiceId = sale._id;
  const { manualCosts: _manualCosts, manualCostsTotal: _manualCostsTotal, ...publicSale } = sale;

  return {
    ...publicSale,
    customerId: sale.customer?._id ?? sale.customer,
    materials: (sale.materials || []).map((item) =>
      toWorkshopSaleLineItem(item, { includeManualCost: true })
    ),
    additionalComponents: (sale.additionalComponents || []).map((item) =>
      toWorkshopSaleLineItem(item)
    ),
    invoiceId,
    invoiceType: "workshop",
    report: {
      invoiceId,
      invoiceNumber: sale.invoiceNumber,
      invoiceType: "workshop",
      customerName: sale.customerName,
      finalProductName: sale.finalProductName,
      sellingDate: sale.sellingDate,
      deliveryDate: sale.deliveryDate ?? null,
      totalPrice: sale.totalPrice,
      paidAmount: sale.paidAmount,
      remainingAmount: sale.remainingAmount,
      profitAmount: sale.profitAmount,
      status: sale.status,
    },
    printLabel: "Custom Sales",
  };
};

const buildWorkshopSaleQuery = (query) => {
  const {
    customerName,
    customerPhone,
    invoiceNumber,
    status,
    sellingDate,
    deliveryDate,
    finalProductName,
    invoiceType,
  } = query;
  const workshopSaleQuery = {};

  if (invoiceType !== undefined) {
    if (typeof invoiceType !== "string") {
      throw createHttpError(400, "تنسيق invoiceType غير صالح");
    }

    const normalizedInvoiceType = invoiceType.trim().toLowerCase();
    if (!normalizedInvoiceType) {
      return { workshopSaleQuery };
    }

    if (
      normalizedInvoiceType !== "workshop" &&
      normalizedInvoiceType !== "custom" &&
      normalizedInvoiceType !== "custom-sales"
    ) {
      return { forceEmpty: true, workshopSaleQuery };
    }
  }

  for (const [fieldName, value] of Object.entries({
    customerName,
    customerPhone,
    invoiceNumber,
    finalProductName,
  })) {
    if (value === undefined) continue;
    if (typeof value !== "string") throw createHttpError(400, `تنسيق ${fieldName} غير صالح`);
    const normalizedValue = value.trim();
    if (normalizedValue) {
      workshopSaleQuery[fieldName] = new RegExp(escapeRegex(normalizedValue), "i");
    }
  }

  if (status !== undefined) {
    if (typeof status !== "string" || !status.trim()) {
      throw createHttpError(400, "تنسيق حالة فاتورة الورشة غير صالح");
    }

    const normalizedStatus = status.trim();
    if (!WORKSHOP_SALE_STATUSES.has(normalizedStatus)) {
      throw createHttpError(400, "حالة فاتورة الورشة غير مدعومة");
    }
    workshopSaleQuery.status = normalizedStatus;
  }

  for (const [fieldName, value] of Object.entries({ sellingDate, deliveryDate })) {
    if (value === undefined) continue;
    if (typeof value !== "string" || !value.trim()) {
      throw createHttpError(400, `تنسيق ${fieldName} غير صالح`);
    }

    const dateRange = getUtcDayRange(value.trim());
    if (!dateRange) throw createHttpError(400, `تنسيق ${fieldName} غير صالح`);
    workshopSaleQuery[fieldName] = {
      $gte: dateRange.startOfDayUtc,
      $lt: dateRange.endOfDayUtc,
    };
  }

  return { workshopSaleQuery };
};

const createWorkshopSale = async (body) => {
  const { payload } = await buildWorkshopSalePayload(body);
  const invoiceNumber = await getWorkshopSaleInvoiceNumber(body.invoiceNumber);
  const nextItems = [
    ...toWorkshopInventoryInput(payload.materials),
    ...toWorkshopInventoryInput(payload.additionalComponents),
  ];

  await applyInventoryForWorkshopChange({ currentItems: [], nextItems });

  try {
    const workshopSale = await WorkshopSale.create({
      ...payload,
      invoiceNumber,
    });
    return toWorkshopSaleInvoice(workshopSale);
  } catch (error) {
    try {
      await applyInventoryForWorkshopChange({ currentItems: nextItems, nextItems: [] });
    } catch (_rollbackError) {}
    throw error;
  }
};

const updateWorkshopSale = async (id, body) => {
  const workshopSale = await WorkshopSale.findById(id);
  if (!workshopSale) throw createHttpError(404, "فاتورة الورشة غير موجودة");
  if (workshopSale.status === "cancelled") {
    throw createHttpError(400, "لا يمكن تعديل فاتورة ملغاة");
  }

  const currentItems = getWorkshopInventoryItems(workshopSale);
  const { payload } = await buildWorkshopSalePayload(body, workshopSale);
  const nextItems = [
    ...toWorkshopInventoryInput(payload.materials),
    ...toWorkshopInventoryInput(payload.additionalComponents),
  ];

  await applyInventoryForWorkshopChange({ currentItems, nextItems });

  try {
    Object.assign(workshopSale, payload);
    if (body.invoiceNumber !== undefined) {
      workshopSale.invoiceNumber = await getWorkshopSaleInvoiceNumber(body.invoiceNumber);
    }
    const updatedWorkshopSale = await workshopSale.save();
    return toWorkshopSaleInvoice(updatedWorkshopSale);
  } catch (error) {
    try {
      await applyInventoryForWorkshopChange({ currentItems: nextItems, nextItems: currentItems });
    } catch (_rollbackError) {}
    throw error;
  }
};

const getWorkshopSales = async ({ query, page, limit, skip }) => {
  const { forceEmpty, workshopSaleQuery } = buildWorkshopSaleQuery(query);
  if (forceEmpty) return { data: [], totalItems: 0 };

  const [workshopSales, totalItems] = await Promise.all([
    WorkshopSale.find(workshopSaleQuery)
      .populate("materials.product", "code name")
      .populate("additionalComponents.product", "code name")
      .sort({ sellingDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    WorkshopSale.countDocuments(workshopSaleQuery),
  ]);

  return {
    data: workshopSales.map(toWorkshopSaleInvoice),
    totalItems,
    page,
    limit,
  };
};

const getWorkshopSaleById = async (id) => {
  const workshopSale = await WorkshopSale.findById(id)
    .populate("materials.product", "code name")
    .populate("additionalComponents.product", "code name");
  if (!workshopSale) throw createHttpError(404, "فاتورة الورشة غير موجودة");

  return toWorkshopSaleInvoice(workshopSale);
};

const addWorkshopSalePayment = async (id, body) => {
  const workshopSale = await WorkshopSale.findById(id);
  if (!workshopSale) throw createHttpError(404, "فاتورة الورشة غير موجودة");
  if (workshopSale.status === "cancelled") {
    throw createHttpError(400, "لا يمكن إضافة دفعة إلى فاتورة ملغاة");
  }

  const amount = parsePositiveNumber(body.amount);
  if (amount === null) throw createHttpError(400, "قيمة الدفعة يجب أن تكون رقمًا أكبر من صفر");

  if (amount - Number(workshopSale.remainingAmount || 0) > MONEY_EPSILON) {
    throw createHttpError(400, "قيمة الدفعة لا يمكن أن تتجاوز المبلغ المتبقي", {
      invoiceId: workshopSale._id,
      remainingAmount: workshopSale.remainingAmount,
    });
  }

  workshopSale.payments.push({
    amount: roundMoney(amount),
    paymentDate:
      body.paymentDate !== undefined
        ? normalizeRequiredDate(body.paymentDate, "تاريخ الدفعة")
        : new Date(),
    note: normalizeOptionalString(body.note, "ملاحظة الدفعة"),
  });
  const totals = calculateWorkshopTotals({
    materials: workshopSale.materials || [],
    additionalComponents: workshopSale.additionalComponents || [],
    laborCost: workshopSale.laborCost,
    discountAmount: workshopSale.discountAmount,
    payments: workshopSale.payments,
  });
  workshopSale.paidAmount = totals.paidAmount;
  workshopSale.remainingAmount = totals.remainingAmount;
  workshopSale.status = totals.status;

  const updatedWorkshopSale = await workshopSale.save();
  return toWorkshopSaleInvoice(updatedWorkshopSale);
};

const restoreWorkshopSaleInventory = async (workshopSale) => {
  if (workshopSale.inventoryRestored) return;

  await applyInventoryForWorkshopChange({
    currentItems: getWorkshopInventoryItems(workshopSale),
    nextItems: [],
  });
  workshopSale.inventoryRestored = true;
};

const cancelWorkshopSale = async (id) => {
  const workshopSale = await WorkshopSale.findById(id);
  if (!workshopSale) throw createHttpError(404, "فاتورة الورشة غير موجودة");
  if (workshopSale.status === "cancelled") return toWorkshopSaleInvoice(workshopSale);

  await restoreWorkshopSaleInventory(workshopSale);
  workshopSale.status = "cancelled";
  const updatedWorkshopSale = await workshopSale.save();
  return toWorkshopSaleInvoice(updatedWorkshopSale);
};

const markWorkshopSaleDelivered = async (id) => {
  const workshopSale = await WorkshopSale.findById(id);
  if (!workshopSale) throw createHttpError(404, "فاتورة الورشة غير موجودة");
  if (workshopSale.status === "cancelled") {
    throw createHttpError(400, "لا يمكن تسليم فاتورة ملغاة");
  }

  workshopSale.status = "delivered";
  const updatedWorkshopSale = await workshopSale.save();
  return toWorkshopSaleInvoice(updatedWorkshopSale);
};

const deleteWorkshopSale = async (id) => {
  const workshopSale = await WorkshopSale.findById(id);
  if (!workshopSale) throw createHttpError(404, "فاتورة الورشة غير موجودة");

  await restoreWorkshopSaleInventory(workshopSale);
  await workshopSale.deleteOne();
};

module.exports = {
  WORKSHOP_SALE_STATUSES,
  getLineItemProductId,
  toWorkshopSaleInvoice,
  createWorkshopSale,
  getWorkshopSales,
  getWorkshopSaleById,
  updateWorkshopSale,
  deleteWorkshopSale,
  addWorkshopSalePayment,
  cancelWorkshopSale,
  markWorkshopSaleDelivered,
};
