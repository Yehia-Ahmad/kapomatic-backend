const mongoose = require("mongoose");
const Product = require("../models/product.model");
const Selling = require("../models/selling.model");
const asyncHandler = require("../utils/asyncHandler");

const getRawQuantity = (body) => {
  if (body.quantity !== undefined) return body.quantity;
  if (body.quentity !== undefined) return body.quentity;
  return undefined;
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

const toSellingHistoryItem = (selling) => ({
  _id: selling._id,
  productId: selling.product,
  productName: selling.productName,
  categoryName: selling.categoryName,
  productQuantity: selling.quantity,
  productQuentity: selling.quantity,
  sellingDate: selling.sellingDate,
  customerName: selling.customerName,
  customerPhone: selling.customerPhone ?? null,
  productPricePerEach: selling.unitPrice,
  totalPrice: selling.totalPrice,
});

const createSelling = asyncHandler(async (req, res) => {
  const { productId, customerName, customerPhone, sellingDate, price } = req.body;
  const rawQuantity = getRawQuantity(req.body);

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

  if (price === undefined) {
    res.status(400);
    throw new Error("السعر مطلوب");
  }

  if (typeof customerPhone !== "string" || !customerPhone.trim()) {
    res.status(400);
    throw new Error("رقم هاتف العميل مطلوب");
  }

  const normalizedCustomerPhone = customerPhone.trim();

  const quantity = parsePositiveInteger(rawQuantity);
  if (quantity === null) {
    res.status(400);
    throw new Error("يجب أن تكون كمية المنتج رقمًا صحيحًا موجبًا");
  }

  const unitPrice = parseNonNegativeNumber(price);
  if (unitPrice === null) {
    res.status(400);
    throw new Error("يجب أن يكون السعر رقمًا غير سالب");
  }

  const product = await Product.findById(productId).populate("category", "name");
  if (!product) {
    res.status(404);
    throw new Error("المنتج غير موجود");
  }

  if (product.inventoryCount < quantity) {
    res.status(400);
    throw new Error("المخزون غير كافٍ للكمية المطلوبة");
  }

  product.inventoryCount -= quantity;
  product.soldItemCount = Number(product.soldItemCount || 0) + quantity;
  await product.save();

  const sellingPayload = {
    product: product._id,
    productName: product.name,
    categoryName: product.category ? product.category.name : "Uncategorized",
    customerName,
    customerPhone: normalizedCustomerPhone,
    sellingDate,
    quantity,
    unitPrice,
    totalPrice: unitPrice * quantity,
  };

  let selling;
  try {
    selling = await Selling.create(sellingPayload);
  } catch (error) {
    product.inventoryCount += quantity;
    product.soldItemCount = Math.max(0, Number(product.soldItemCount || 0) - quantity);
    await product.save();
    throw error;
  }

  res.status(201).json(toSellingHistoryItem(selling));
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

    sellingQuery.product = {
      $in: products.map((product) => product._id),
    };
  }

  const sellings = await Selling.find(sellingQuery).sort({ sellingDate: -1, createdAt: -1 });
  res.json(sellings.map(toSellingHistoryItem));
});

const getSellingById = asyncHandler(async (req, res) => {
  const selling = await Selling.findById(req.params.id);

  if (!selling) {
    res.status(404);
    throw new Error("سجل البيع غير موجود");
  }

  res.json(toSellingHistoryItem(selling));
});

const updateSelling = asyncHandler(async (req, res) => {
  const selling = await Selling.findById(req.params.id);

  if (!selling) {
    res.status(404);
    throw new Error("سجل البيع غير موجود");
  }

  const rawQuantity = getRawQuantity(req.body);
  const quantityProvided = rawQuantity !== undefined;
  const nextQuantity = quantityProvided ? parsePositiveInteger(rawQuantity) : selling.quantity;

  if (quantityProvided && nextQuantity === null) {
    res.status(400);
    throw new Error("يجب أن تكون كمية المنتج رقمًا صحيحًا موجبًا");
  }

  if (req.body.productId !== undefined && !mongoose.Types.ObjectId.isValid(req.body.productId)) {
    res.status(400);
    throw new Error("تنسيق معرّف المنتج غير صالح");
  }

  const nextProductId = req.body.productId !== undefined ? req.body.productId : selling.product.toString();
  const isProductChanged = nextProductId.toString() !== selling.product.toString();
  const isQuantityChanged = Number(nextQuantity) !== Number(selling.quantity);

  if (isProductChanged) {
    const currentProduct = await Product.findById(selling.product);
    if (!currentProduct) {
      res.status(404);
      throw new Error("لم يتم العثور على المنتج الحالي المرتبط بسجل البيع هذا");
    }

    currentProduct.inventoryCount += selling.quantity;
    currentProduct.soldItemCount = Math.max(
      0,
      Number(currentProduct.soldItemCount || 0) - Number(selling.quantity)
    );
    await currentProduct.save();

    const nextProduct = await Product.findById(nextProductId).populate("category", "name");
    if (!nextProduct) {
      currentProduct.inventoryCount -= selling.quantity;
      currentProduct.soldItemCount = Number(currentProduct.soldItemCount || 0) + Number(selling.quantity);
      await currentProduct.save();

      res.status(404);
      throw new Error("المنتج غير موجود");
    }

    if (nextProduct.inventoryCount < nextQuantity) {
      currentProduct.inventoryCount -= selling.quantity;
      currentProduct.soldItemCount = Number(currentProduct.soldItemCount || 0) + Number(selling.quantity);
      await currentProduct.save();

      res.status(400);
      throw new Error("المخزون غير كافٍ للكمية المطلوبة");
    }

    nextProduct.inventoryCount -= nextQuantity;
    nextProduct.soldItemCount = Number(nextProduct.soldItemCount || 0) + Number(nextQuantity);
    await nextProduct.save();

    selling.product = nextProduct._id;
    selling.productName = nextProduct.name;
    selling.categoryName = nextProduct.category ? nextProduct.category.name : "Uncategorized";
    selling.unitPrice = nextProduct.retailPrice;
  } else if (isQuantityChanged) {
    const product = await Product.findById(selling.product);
    if (!product) {
      res.status(404);
      throw new Error("لم يتم العثور على المنتج المرتبط بسجل البيع هذا");
    }

    const quantityDifference = Number(nextQuantity) - Number(selling.quantity);
    if (quantityDifference > 0) {
      if (product.inventoryCount < quantityDifference) {
        res.status(400);
        throw new Error("المخزون غير كافٍ للكمية المطلوبة");
      }

      product.inventoryCount -= quantityDifference;
      product.soldItemCount = Number(product.soldItemCount || 0) + quantityDifference;
    } else {
      const restoredQuantity = Math.abs(quantityDifference);
      product.inventoryCount += restoredQuantity;
      product.soldItemCount = Math.max(0, Number(product.soldItemCount || 0) - restoredQuantity);
    }

    await product.save();
  }

  if (req.body.customerName !== undefined) selling.customerName = req.body.customerName;
  if (req.body.customerPhone !== undefined) selling.customerPhone = req.body.customerPhone;
  if (req.body.sellingDate !== undefined) selling.sellingDate = req.body.sellingDate;
  selling.quantity = Number(nextQuantity);
  selling.totalPrice = Number(selling.unitPrice) * Number(selling.quantity);

  const updatedSelling = await selling.save();
  res.json(toSellingHistoryItem(updatedSelling));
});

const deleteSelling = asyncHandler(async (req, res) => {
  const selling = await Selling.findById(req.params.id);

  if (!selling) {
    res.status(404);
    throw new Error("سجل البيع غير موجود");
  }

  const product = await Product.findById(selling.product);
  if (product) {
    product.inventoryCount += Number(selling.quantity);
    product.soldItemCount = Math.max(0, Number(product.soldItemCount || 0) - Number(selling.quantity));
    await product.save();
  }

  await selling.deleteOne();
  res.json({ message: "Selling record deleted successfully" });
});

module.exports = {
  createSelling,
  getSellings,
  getSellingById,
  updateSelling,
  deleteSelling,
};
