const mongoose = require("mongoose");
const Customer = require("../models/customer.model");
const Product = require("../models/product.model");
const Selling = require("../models/selling.model");
const asyncHandler = require("../utils/asyncHandler");

const getRawQuantity = (body) => {
  if (body.quantity !== undefined) return body.quantity;
  if (body.quentity !== undefined) return body.quentity;
  return undefined;
};

const normalizeSellingDate = (value, res) => {
  if (value === undefined || value === null || value === "") {
    res.status(400);
    throw new Error("تاريخ البيع مطلوب");
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    res.status(400);
    throw new Error("تنسيق تاريخ البيع غير صالح");
  }

  return parsedDate;
};

const parsePositiveInteger = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseNonNegativeNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
};

const normalizeRequiredString = (value, fieldLabel, res) => {
  if (typeof value !== "string" || !value.trim()) {
    res.status(400);
    throw new Error(`${fieldLabel} مطلوب`);
  }

  return value.trim();
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const getSellingItemProductId = (item) => {
  if (
    item.product &&
    typeof item.product === "object" &&
    item.product._id !== undefined
  ) {
    return item.product._id;
  }

  return item.product;
};

const normalizeSellingItems = (body, res) => {
  if (body.items !== undefined) {
    if (!Array.isArray(body.items)) {
      res.status(400);
      throw new Error("يجب أن تكون items مصفوفة");
    }

    if (body.items.length === 0) {
      res.status(400);
      throw new Error("يجب أن تحتوي items على عنصر واحد على الأقل");
    }

    return body.items.map((item, index) => {
      const itemNumber = index + 1;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        res.status(400);
        throw new Error(`العنصر رقم ${itemNumber} غير صالح`);
      }

      const { productId, price } = item;
      const rawQuantity = getRawQuantity(item);

      if (!productId) {
        res.status(400);
        throw new Error(`معرّف المنتج مطلوب في العنصر رقم ${itemNumber}`);
      }

      if (!mongoose.Types.ObjectId.isValid(productId)) {
        res.status(400);
        throw new Error(`تنسيق معرّف المنتج غير صالح في العنصر رقم ${itemNumber}`);
      }

      if (rawQuantity === undefined) {
        res.status(400);
        throw new Error(`كمية المنتج مطلوبة في العنصر رقم ${itemNumber}`);
      }

      const quantity = parsePositiveInteger(rawQuantity);
      if (quantity === null) {
        res.status(400);
        throw new Error(`يجب أن تكون كمية المنتج رقمًا صحيحًا موجبًا في العنصر رقم ${itemNumber}`);
      }

      if (price === undefined) {
        res.status(400);
        throw new Error(`السعر مطلوب في العنصر رقم ${itemNumber}`);
      }

      const unitPrice = parseNonNegativeNumber(price);
      if (unitPrice === null) {
        res.status(400);
        throw new Error(`يجب أن يكون السعر رقمًا غير سالب في العنصر رقم ${itemNumber}`);
      }

      return {
        productId,
        quantity,
        unitPrice,
      };
    });
  }

  const { productId, price } = body;
  const rawQuantity = getRawQuantity(body);

  if (!productId) {
    res.status(400);
    throw new Error("معرّف المنتج مطلوب");
  }

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    res.status(400);
    throw new Error("تنسيق معرّف المنتج غير صالح");
  }

  if (rawQuantity === undefined) {
    res.status(400);
    throw new Error("كمية المنتج مطلوبة");
  }

  const quantity = parsePositiveInteger(rawQuantity);
  if (quantity === null) {
    res.status(400);
    throw new Error("يجب أن تكون كمية المنتج رقمًا صحيحًا موجبًا");
  }

  if (price === undefined) {
    res.status(400);
    throw new Error("السعر مطلوب");
  }

  const unitPrice = parseNonNegativeNumber(price);
  if (unitPrice === null) {
    res.status(400);
    throw new Error("يجب أن يكون السعر رقمًا غير سالب");
  }

  return [
    {
      productId,
      quantity,
      unitPrice,
    },
  ];
};

const hasInvoiceItems = (selling) => Array.isArray(selling.items) && selling.items.length > 0;

const getSellingItems = (selling) => {
  if (hasInvoiceItems(selling)) {
    return selling.items;
  }

  if (!selling.product) {
    return [];
  }

  return [
    {
      _id: selling._id,
      product: selling.product,
      productName: selling.productName,
      categoryName: selling.categoryName,
      quantity: selling.quantity,
      unitPrice: selling.unitPrice,
      totalPrice: selling.totalPrice,
    },
  ];
};

const getInvoiceIdentifier = (selling) => selling.invoiceId ?? selling._id;

const buildInvoiceTotals = (items) => {
  const totalQuantity = items.reduce(
    (sum, item) => sum + Number(item.productQuantity ?? item.quantity ?? 0),
    0
  );
  const totalPrice = items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);

  return { totalQuantity, totalPrice };
};

const toSellingInvoiceItem = (item, selling, options = {}) => {
  const sellingHistoryItem = {
    _id: item._id ?? null,
    invoiceId: getInvoiceIdentifier(selling),
    productId: getSellingItemProductId(item),
    productName: item.productName,
    categoryName: item.categoryName,
    productQuantity: item.quantity,
    productQuentity: item.quantity,
    sellingDate: selling.sellingDate,
    customerName: selling.customerName,
    customerPhone: selling.customerPhone ?? null,
    productPricePerEach: item.unitPrice,
    totalPrice: item.totalPrice,
  };

  if (options.includeProductCode) {
    sellingHistoryItem.productCode =
      item.product && typeof item.product === "object" ? item.product.code ?? null : null;
  }

  return sellingHistoryItem;
};

const toSellingInvoice = (selling, options = {}) => {
  const items = getSellingItems(selling).map((item) => toSellingInvoiceItem(item, selling, options));
  const totals = buildInvoiceTotals(items);

  return {
    _id: selling._id,
    invoiceId: getInvoiceIdentifier(selling),
    customerName: selling.customerName,
    customerPhone: selling.customerPhone ?? null,
    sellingDate: selling.sellingDate,
    itemCount: items.length,
    totalQuantity: selling.totalQuantity ?? totals.totalQuantity,
    totalPrice: selling.totalPrice ?? totals.totalPrice,
    items,
  };
};

const ensureCustomerExistsForSelling = async ({ customerName, customerPhone }) => {
  if (
    typeof customerName !== "string" ||
    !customerName.trim() ||
    typeof customerPhone !== "string" ||
    !customerPhone.trim()
  ) {
    return null;
  }

  const existingCustomer = await Customer.findOne({
    name: customerName,
    phone: customerPhone,
  });

  if (existingCustomer) {
    return existingCustomer;
  }

  return Customer.findOneAndUpdate(
    { phone: customerPhone },
    {
      $set: { name: customerName },
      $setOnInsert: { phone: customerPhone },
    },
    {
      new: true,
      runValidators: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
};

const toSellingItemInput = (item) => ({
  productId: getSellingItemProductId(item)?.toString(),
  quantity: Number(item.quantity),
  unitPrice: Number(item.unitPrice),
});

const getSellingItemInputs = (selling) =>
  getSellingItems(selling)
    .map(toSellingItemInput)
    .filter((item) => item.productId);

const buildQuantityByProductId = (items) => {
  const quantityByProductId = new Map();

  for (const item of items) {
    const productId = item.productId.toString();
    quantityByProductId.set(
      productId,
      Number(quantityByProductId.get(productId) || 0) + Number(item.quantity)
    );
  }

  return quantityByProductId;
};

const applyInventoryForInvoiceChange = async ({ currentItems, nextItems, res }) => {
  const currentQuantityByProductId = buildQuantityByProductId(currentItems);
  const nextQuantityByProductId = buildQuantityByProductId(nextItems);
  const allProductIds = [...new Set([
    ...currentQuantityByProductId.keys(),
    ...nextQuantityByProductId.keys(),
  ])];

  if (allProductIds.length === 0) {
    return new Map();
  }

  const products = await Product.find({ _id: { $in: allProductIds } }).populate("category", "name");
  const productsById = new Map(products.map((product) => [product._id.toString(), product]));
  const originalStates = new Map();

  for (const product of products) {
    originalStates.set(product._id.toString(), {
      inventoryCount: Number(product.inventoryCount || 0),
      soldItemCount: Number(product.soldItemCount || 0),
    });
  }

  for (const [productId, nextQuantity] of nextQuantityByProductId.entries()) {
    const product = productsById.get(productId);
    if (!product) {
      res.status(404);
      throw new Error("المنتج غير موجود");
    }

    const currentQuantity = Number(currentQuantityByProductId.get(productId) || 0);
    const availableQuantity = Number(product.inventoryCount || 0) + currentQuantity;
    if (availableQuantity < nextQuantity) {
      res.status(400);
      throw new Error(`المخزون غير كافٍ للمنتج ${product.name}`);
    }
  }

  try {
    for (const productId of allProductIds) {
      const product = productsById.get(productId);
      if (!product) continue;

      const originalState = originalStates.get(productId);
      const currentQuantity = Number(currentQuantityByProductId.get(productId) || 0);
      const nextQuantity = Number(nextQuantityByProductId.get(productId) || 0);

      product.inventoryCount = originalState.inventoryCount + currentQuantity - nextQuantity;
      product.soldItemCount = Math.max(
        0,
        originalState.soldItemCount - currentQuantity + nextQuantity
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
      } catch (_saveError) {
        // Best-effort rollback only; surface the original failure.
      }
    }

    throw error;
  }

  return productsById;
};

const buildPersistedItems = (items, productsById) =>
  items.map((item) => {
    const product = productsById.get(item.productId.toString());

    return {
      product: product._id,
      productName: product.name,
      categoryName: product.category ? product.category.name : "Uncategorized",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.unitPrice * item.quantity,
    };
  });

const hasLineItemChanges = (body) =>
  body.items !== undefined ||
  body.productId !== undefined ||
  body.price !== undefined ||
  getRawQuantity(body) !== undefined;

const createSelling = asyncHandler(async (req, res) => {
  const { customerName, customerPhone } = req.body;
  const normalizedCustomerName = normalizeRequiredString(customerName, "اسم العميل", res);
  const normalizedCustomerPhone = normalizeRequiredString(customerPhone, "رقم هاتف العميل", res);
  const normalizedSellingDate = normalizeSellingDate(req.body.sellingDate, res);
  const items = normalizeSellingItems(req.body, res);

  await ensureCustomerExistsForSelling({
    customerName: normalizedCustomerName,
    customerPhone: normalizedCustomerPhone,
  });

  const productsById = await applyInventoryForInvoiceChange({
    currentItems: [],
    nextItems: items,
    res,
  });
  const persistedItems = buildPersistedItems(items, productsById);
  const invoiceTotals = buildInvoiceTotals(
    persistedItems.map((item) => ({
      productQuantity: item.quantity,
      totalPrice: item.totalPrice,
    }))
  );
  let selling;

  try {
    selling = await Selling.create({
      customerName: normalizedCustomerName,
      customerPhone: normalizedCustomerPhone,
      sellingDate: normalizedSellingDate,
      items: persistedItems,
      totalQuantity: invoiceTotals.totalQuantity,
      totalPrice: invoiceTotals.totalPrice,
    });
  } catch (error) {
    try {
      await applyInventoryForInvoiceChange({
        currentItems: items,
        nextItems: [],
        res,
      });
    } catch (_rollbackError) {
      // Best-effort rollback only; surface the create failure.
    }

    throw error;
  }

  res.status(201).json(toSellingInvoice(selling));
});

const getSellings = asyncHandler(async (req, res) => {
  const { categoryId, productId, customerName, customerPhone, sellingDate } = req.query;
  const sellingQuery = {};

  if (
    categoryId !== undefined &&
    (typeof categoryId !== "string" || !mongoose.Types.ObjectId.isValid(categoryId))
  ) {
    res.status(400);
    throw new Error("تنسيق معرّف الفئة غير صالح");
  }

  if (
    productId !== undefined &&
    (typeof productId !== "string" || !mongoose.Types.ObjectId.isValid(productId))
  ) {
    res.status(400);
    throw new Error("تنسيق معرّف المنتج غير صالح");
  }

  if (customerName !== undefined) {
    if (typeof customerName !== "string") {
      res.status(400);
      throw new Error("تنسيق اسم العميل غير صالح");
    }

    const normalizedCustomerName = customerName.trim();
    if (normalizedCustomerName) {
      sellingQuery.customerName = new RegExp(escapeRegex(normalizedCustomerName), "i");
    }
  }

  if (customerPhone !== undefined) {
    if (typeof customerPhone !== "string") {
      res.status(400);
      throw new Error("تنسيق رقم هاتف العميل غير صالح");
    }

    const normalizedCustomerPhone = customerPhone.trim();
    if (normalizedCustomerPhone) {
      sellingQuery.customerPhone = new RegExp(escapeRegex(normalizedCustomerPhone), "i");
    }
  }

  if (sellingDate !== undefined) {
    if (typeof sellingDate !== "string") {
      res.status(400);
      throw new Error("تنسيق تاريخ البيع غير صالح");
    }

    const normalizedSellingDate = sellingDate.trim();
    if (!normalizedSellingDate) {
      res.status(400);
      throw new Error("لا يمكن أن يكون معامل الاستعلام sellingDate فارغًا");
    }

    const dateRange = getUtcDayRange(normalizedSellingDate);
    if (!dateRange) {
      res.status(400);
      throw new Error("تنسيق تاريخ البيع غير صالح");
    }

    sellingQuery.sellingDate = {
      $gte: dateRange.startOfDayUtc,
      $lt: dateRange.endOfDayUtc,
    };
  }

  if (categoryId !== undefined || productId !== undefined) {
    const productFilter = {};
    if (categoryId !== undefined) productFilter.category = categoryId;
    if (productId !== undefined) productFilter._id = productId;

    const products = await Product.find(productFilter).select("_id").lean();
    if (products.length === 0) {
      return res.json([]);
    }

    const matchingProductIds = products.map((product) => product._id);
    sellingQuery.$or = [
      { "items.product": { $in: matchingProductIds } },
      { product: { $in: matchingProductIds } },
    ];
  }

  const sellings = await Selling.find(sellingQuery)
    .populate("items.product", "code")
    .populate("product", "code")
    .sort({ sellingDate: -1, createdAt: -1 });
  res.json(sellings.map((selling) => toSellingInvoice(selling, { includeProductCode: true })));
});

const getSellingById = asyncHandler(async (req, res) => {
  const selling = await Selling.findById(req.params.id)
    .populate("items.product", "code")
    .populate("product", "code");

  if (!selling) {
    res.status(404);
    throw new Error("سجل البيع غير موجود");
  }

  res.json(toSellingInvoice(selling, { includeProductCode: true }));
});

const updateSelling = asyncHandler(async (req, res) => {
  const selling = await Selling.findById(req.params.id);

  if (!selling) {
    res.status(404);
    throw new Error("سجل البيع غير موجود");
  }

  const normalizedCustomerName =
    req.body.customerName !== undefined
      ? normalizeRequiredString(req.body.customerName, "اسم العميل", res)
      : selling.customerName;
  const normalizedCustomerPhone =
    req.body.customerPhone !== undefined
      ? normalizeRequiredString(req.body.customerPhone, "رقم هاتف العميل", res)
      : selling.customerPhone;
  const normalizedSellingDate =
    req.body.sellingDate !== undefined
      ? normalizeSellingDate(req.body.sellingDate, res)
      : selling.sellingDate;

  const shouldUpdateItems = hasLineItemChanges(req.body);
  const currentItems = getSellingItemInputs(selling);

  let nextItems = currentItems;
  let productsById = new Map();

  if (shouldUpdateItems) {
    if (req.body.items === undefined && currentItems.length !== 1) {
      res.status(400);
      throw new Error("يجب إرسال items لتعديل فاتورة تحتوي على أكثر من عنصر واحد");
    }

    if (req.body.items !== undefined) {
      nextItems = normalizeSellingItems(req.body, res);
    } else {
      const currentItem = currentItems[0];
      if (!currentItem) {
        res.status(400);
        throw new Error("لا يمكن تعديل عناصر الفاتورة الحالية بهذا الطلب");
      }

      nextItems = normalizeSellingItems(
        {
          productId:
            req.body.productId !== undefined ? req.body.productId : currentItem.productId,
          quantity:
            getRawQuantity(req.body) !== undefined
              ? getRawQuantity(req.body)
              : currentItem.quantity,
          price: req.body.price !== undefined ? req.body.price : currentItem.unitPrice,
        },
        res
      );
    }

    productsById = await applyInventoryForInvoiceChange({
      currentItems,
      nextItems,
      res,
    });
  }

  await ensureCustomerExistsForSelling({
    customerName: normalizedCustomerName,
    customerPhone: normalizedCustomerPhone,
  });

  if (shouldUpdateItems) {
    const persistedItems = buildPersistedItems(nextItems, productsById);
    const invoiceTotals = buildInvoiceTotals(
      persistedItems.map((item) => ({
        productQuantity: item.quantity,
        totalPrice: item.totalPrice,
      }))
    );

    selling.items = persistedItems;
    selling.totalQuantity = invoiceTotals.totalQuantity;
    selling.totalPrice = invoiceTotals.totalPrice;

    // Clear legacy top-level line-item fields after converting to invoice storage.
    selling.product = undefined;
    selling.productName = undefined;
    selling.categoryName = undefined;
    selling.quantity = undefined;
    selling.unitPrice = undefined;
  }

  selling.customerName = normalizedCustomerName;
  selling.customerPhone = normalizedCustomerPhone;
  selling.sellingDate = normalizedSellingDate;

  let updatedSelling;
  try {
    updatedSelling = await selling.save();
  } catch (error) {
    if (shouldUpdateItems) {
      try {
        await applyInventoryForInvoiceChange({
          currentItems: nextItems,
          nextItems: currentItems,
          res,
        });
      } catch (_rollbackError) {
        // Best-effort rollback only; surface the update failure.
      }
    }

    throw error;
  }

  res.json(toSellingInvoice(updatedSelling));
});

const deleteSelling = asyncHandler(async (req, res) => {
  const selling = await Selling.findById(req.params.id);

  if (!selling) {
    res.status(404);
    throw new Error("سجل البيع غير موجود");
  }

  await applyInventoryForInvoiceChange({
    currentItems: getSellingItemInputs(selling),
    nextItems: [],
    res,
  });

  await selling.deleteOne();
  res.json({ message: "Selling invoice deleted successfully" });
});

module.exports = {
  createSelling,
  getSellings,
  getSellingById,
  updateSelling,
  deleteSelling,
};
