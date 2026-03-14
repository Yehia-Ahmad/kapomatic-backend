const CreditSale = require("../models/creditSale.model");
const Customer = require("../models/customer.model");
const Selling = require("../models/selling.model");
const {
  buildCreditSaleSummary,
  toCreditSaleInvoice,
} = require("../utils/creditSaleFormatter");
const asyncHandler = require("../utils/asyncHandler");

const OPEN_CREDIT_SALE_STATUSES = ["pending", "partially_paid"];
const MONEY_EPSILON = 1e-9;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const getFirstDefined = (...values) => values.find((value) => value !== undefined);

const normalizeRequiredString = (value, fieldLabel, res) => {
  if (typeof value !== "string" || !value.trim()) {
    res.status(400);
    throw new Error(`${fieldLabel} مطلوب`);
  }

  return value.trim();
};

const normalizeOptionalString = (value, fieldLabel, res) => {
  if (typeof value !== "string" || !value.trim()) {
    res.status(400);
    throw new Error(`${fieldLabel} غير صالح`);
  }

  return value.trim();
};

const normalizeOptionalPaymentNote = (value, fieldLabel, res) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    res.status(400);
    throw new Error(`${fieldLabel} غير صالح`);
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
};

const normalizeRequiredDate = (value, fieldLabel, res) => {
  if (value === undefined || value === null || value === "") {
    res.status(400);
    throw new Error(`${fieldLabel} مطلوب`);
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    res.status(400);
    throw new Error(`تنسيق ${fieldLabel} غير صالح`);
  }

  return parsedDate;
};

const parsePositiveNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseBoolean = (value) => {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === "true" || normalizedValue === "1") return true;
    if (normalizedValue === "false" || normalizedValue === "0") return false;
  }

  return null;
};

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

const getTotalPaymentsAmount = (payments = []) =>
  roundMoney(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));

const getTotalReleasedPaidAmount = (returnedPaidAmount = 0, reallocatedPaidAmount = 0) =>
  roundMoney(Number(returnedPaidAmount || 0) + Number(reallocatedPaidAmount || 0));

const calculateCreditAmounts = (
  totalPrice,
  payments = [],
  returnedPaidAmount = 0,
  reallocatedPaidAmount = 0
) => {
  const normalizedTotalPrice = roundMoney(totalPrice);
  const grossPaidAmount = getTotalPaymentsAmount(payments);
  const normalizedReturnedPaidAmount = roundMoney(returnedPaidAmount);
  const normalizedReallocatedPaidAmount = roundMoney(reallocatedPaidAmount);
  const normalizedReleasedPaidAmount = getTotalReleasedPaidAmount(
    normalizedReturnedPaidAmount,
    normalizedReallocatedPaidAmount
  );

  if (normalizedReleasedPaidAmount - grossPaidAmount > MONEY_EPSILON) {
    return null;
  }

  const paidAmount = roundMoney(
    Math.max(0, grossPaidAmount - normalizedReleasedPaidAmount)
  );
  const remainingAmount = roundMoney(Math.max(0, normalizedTotalPrice - paidAmount));
  const refundDueAmount = roundMoney(Math.max(0, paidAmount - normalizedTotalPrice));
  const status =
    remainingAmount === 0 ? "paid" : paidAmount > 0 ? "partially_paid" : "pending";

  return {
    paidAmount,
    remainingAmount,
    refundDueAmount,
    status,
  };
};

const applyCreditAmountsToInvoice = (creditSale, creditAmounts) => {
  creditSale.paidAmount = creditAmounts.paidAmount;
  creditSale.remainingAmount = creditAmounts.remainingAmount;
  creditSale.refundDueAmount = creditAmounts.refundDueAmount;
  creditSale.status = creditAmounts.status;
};

const createCreditSaleFinancialSnapshot = (creditSale) => ({
  payments: Array.isArray(creditSale.payments)
    ? creditSale.payments.map((payment) => ({
        _id: payment._id,
        amount: Number(payment.amount || 0),
        paymentDate: payment.paymentDate,
        note: payment.note,
      }))
    : [],
  paidAmount: Number(creditSale.paidAmount || 0),
  remainingAmount: Number(creditSale.remainingAmount || 0),
  refundDueAmount: Number(creditSale.refundDueAmount || 0),
  status: creditSale.status,
});

const restoreCreditSaleFinancialSnapshot = (creditSale, snapshot) => {
  creditSale.payments = snapshot.payments.map((payment) => ({ ...payment }));
  creditSale.paidAmount = snapshot.paidAmount;
  creditSale.remainingAmount = snapshot.remainingAmount;
  creditSale.refundDueAmount = snapshot.refundDueAmount;
  creditSale.status = snapshot.status;
};

const rollbackCreditSaleFinancialUpdates = async (updates = []) => {
  for (const update of [...updates].reverse()) {
    restoreCreditSaleFinancialSnapshot(update.creditSale, update.snapshot);

    try {
      await update.creditSale.save();
    } catch (_rollbackError) {
      // Best-effort rollback only; surface the original failure.
    }
  }
};

const parseInvoiceSelectionFlag = (value, fieldLabel, res) => {
  const parsedValue = parseBoolean(value);
  if (parsedValue === null) {
    res.status(400);
    throw new Error(`قيمة ${fieldLabel} غير صالحة`);
  }

  return parsedValue ?? false;
};

const getCustomerPaymentSelection = (body, res) => {
  const firstInvoice = parseInvoiceSelectionFlag(
    getFirstDefined(body.firstInvoice, body.isFirstInvoice),
    "firstInvoice",
    res
  );
  const lastInvoice = parseInvoiceSelectionFlag(
    getFirstDefined(body.lastInvoice, body.isLastInvoice),
    "lastInvoice",
    res
  );

  if (firstInvoice && lastInvoice) {
    res.status(400);
    throw new Error("لا يمكن اختيار firstInvoice و lastInvoice معًا");
  }

  if (!firstInvoice && !lastInvoice) {
    res.status(400);
    throw new Error("يجب اختيار firstInvoice أو lastInvoice");
  }

  return firstInvoice ? "firstInvoice" : "lastInvoice";
};

const getLatestDate = (dates) => {
  let latestDate = null;

  for (const dateValue of dates) {
    if (!dateValue) continue;

    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) continue;

    if (!latestDate || parsedDate > latestDate) {
      latestDate = parsedDate;
    }
  }

  return latestDate;
};

const getCustomers = asyncHandler(async (req, res) => {
  const rawSearch = getFirstDefined(req.query.search, req.query.q);
  const rawName = getFirstDefined(req.query.name, req.query.customerName);
  const rawPhone = getFirstDefined(req.query.phone, req.query.customerPhone);
  const search = typeof rawSearch === "string" ? rawSearch.trim() : "";
  const name = typeof rawName === "string" ? rawName.trim() : "";
  const phone = typeof rawPhone === "string" ? rawPhone.trim() : "";
  const filters = [];

  if (rawSearch !== undefined && typeof rawSearch !== "string") {
    res.status(400);
    throw new Error("تنسيق search غير صالح");
  }

  if (rawName !== undefined && typeof rawName !== "string") {
    res.status(400);
    throw new Error("تنسيق اسم العميل غير صالح");
  }

  if (rawPhone !== undefined && typeof rawPhone !== "string") {
    res.status(400);
    throw new Error("تنسيق رقم هاتف العميل غير صالح");
  }

  if (search) {
    const searchRegex = new RegExp(escapeRegex(search), "i");
    filters.push({
      $or: [{ name: searchRegex }, { phone: searchRegex }],
    });
  }

  if (name) {
    filters.push({ name: new RegExp(escapeRegex(name), "i") });
  }

  if (phone) {
    filters.push({ phone: new RegExp(escapeRegex(phone), "i") });
  }

  const query = filters.length > 0 ? { $and: filters } : {};
  const customers = await Customer.find(query).sort({ createdAt: -1 });

  res.json(customers);
});

const getCustomerById = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    res.status(404);
    throw new Error("العميل غير موجود");
  }

  const creditHistory = await CreditSale.find({ customer: customer._id })
    .populate("items.product", "code")
    .populate("refunds.items.product", "code")
    .sort({ sellingDate: -1, createdAt: -1 });
  const lastCashSale = await Selling.findOne({ customerPhone: customer.phone })
    .sort({ sellingDate: -1, createdAt: -1 })
    .select("sellingDate")
    .lean();
  const lastCreditSalePaymentDate = getLatestDate(
    creditHistory.flatMap((creditSale) =>
      Array.isArray(creditSale.payments)
        ? creditSale.payments.map((payment) => payment.paymentDate)
        : []
    )
  );

  res.json({
    ...customer.toObject(),
    lastCreditSaleDate: creditHistory[0]?.sellingDate ?? null,
    lastCashSaleDate: lastCashSale?.sellingDate ?? null,
    lastCreditSalePaymentDate,
    creditSummary: buildCreditSaleSummary(creditHistory),
    creditHistory: creditHistory.map((creditSale) =>
      toCreditSaleInvoice(creditSale, { includeProductCode: true })
    ),
  });
});

const createCustomer = asyncHandler(async (req, res) => {
  const name = normalizeRequiredString(
    getFirstDefined(req.body.name, req.body.customerName),
    "اسم العميل",
    res
  );
  const phone = normalizeRequiredString(
    getFirstDefined(req.body.phone, req.body.customerPhone),
    "رقم هاتف العميل",
    res
  );

  const customer = await Customer.create({ name, phone });
  res.status(201).json(customer);
});

const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    res.status(404);
    throw new Error("العميل غير موجود");
  }

  const nextName = getFirstDefined(req.body.name, req.body.customerName);
  const nextPhone = getFirstDefined(req.body.phone, req.body.customerPhone);

  if (nextName !== undefined) {
    customer.name = normalizeOptionalString(nextName, "اسم العميل", res);
  }

  if (nextPhone !== undefined) {
    customer.phone = normalizeOptionalString(nextPhone, "رقم هاتف العميل", res);
  }

  const updatedCustomer = await customer.save();
  res.json(updatedCustomer);
});

const addCustomerCreditSalePayment = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    res.status(404);
    throw new Error("العميل غير موجود");
  }

  const amount = parsePositiveNumber(req.body.amount);
  if (amount === null) {
    res.status(400);
    throw new Error("قيمة الدفعة يجب أن تكون رقمًا أكبر من صفر");
  }

  const paymentSelection = getCustomerPaymentSelection(req.body, res);
  const paymentDate =
    req.body.paymentDate !== undefined
      ? normalizeRequiredDate(req.body.paymentDate, "تاريخ الدفعة", res)
      : new Date();
  const note = normalizeOptionalPaymentNote(req.body.note, "ملاحظة الدفعة", res);

  const openCreditSales = await CreditSale.find({
    customer: customer._id,
    remainingAmount: { $gt: 0 },
    status: { $in: OPEN_CREDIT_SALE_STATUSES },
  }).sort(
    paymentSelection === "firstInvoice"
      ? { sellingDate: 1, createdAt: 1, _id: 1 }
      : { sellingDate: -1, createdAt: -1, _id: -1 }
  );

  if (openCreditSales.length === 0) {
    res.status(404);
    throw new Error("لا توجد فواتير آجلة مفتوحة لهذا العميل");
  }

  const selectedCreditSale = openCreditSales[0];
  const selectedInvoiceRemainingAmount = roundMoney(
    Number(selectedCreditSale.remainingAmount || 0)
  );
  const totalRemainingAmount = roundMoney(
    openCreditSales.reduce(
      (sum, creditSale) => sum + Number(creditSale.remainingAmount || 0),
      0
    )
  );

  if (
    paymentSelection === "firstInvoice" &&
    amount - selectedInvoiceRemainingAmount > MONEY_EPSILON
  ) {
    return res.status(400).json({
      message: "قيمة الدفعة لا يمكن أن تتجاوز المبلغ المتبقي في الفاتورة المحددة",
      invoiceId: selectedCreditSale._id,
      remainingAmount: selectedInvoiceRemainingAmount,
      totalRemainingAmount,
      paymentSelection,
    });
  }

  if (
    paymentSelection === "lastInvoice" &&
    amount - totalRemainingAmount > MONEY_EPSILON
  ) {
    return res.status(400).json({
      message: "قيمة الدفعة لا يمكن أن تتجاوز إجمالي المبلغ المتبقي على كل الفواتير المفتوحة",
      invoiceId: selectedCreditSale._id,
      remainingAmount: selectedInvoiceRemainingAmount,
      totalRemainingAmount,
      paymentSelection,
    });
  }

  const targetCreditSales =
    paymentSelection === "lastInvoice" ? openCreditSales : [selectedCreditSale];
  const pendingUpdates = [];
  let remainingPaymentAmount = roundMoney(amount);

  for (const creditSale of targetCreditSales) {
    if (remainingPaymentAmount <= MONEY_EPSILON) {
      break;
    }

    const payableAmount = roundMoney(
      Math.min(remainingPaymentAmount, Number(creditSale.remainingAmount || 0))
    );

    if (payableAmount <= MONEY_EPSILON) {
      continue;
    }

    const snapshot = createCreditSaleFinancialSnapshot(creditSale);

    creditSale.payments.push({
      amount: payableAmount,
      paymentDate,
      note,
    });

    const creditAmounts = calculateCreditAmounts(
      creditSale.totalPrice,
      creditSale.payments,
      creditSale.returnedPaidAmount,
      creditSale.reallocatedPaidAmount
    );

    if (!creditAmounts) {
      res.status(400);
      throw new Error("المبلغ المدفوع المُعاد أو المُعاد توزيعه غير صالح");
    }

    if (creditAmounts.refundDueAmount > MONEY_EPSILON) {
      res.status(400);
      throw new Error("قيمة الدفعة تجاوزت إجمالي إحدى الفواتير أثناء التوزيع");
    }

    applyCreditAmountsToInvoice(creditSale, creditAmounts);
    pendingUpdates.push({ creditSale, snapshot });
    remainingPaymentAmount = roundMoney(remainingPaymentAmount - payableAmount);
  }

  if (remainingPaymentAmount > MONEY_EPSILON) {
    res.status(400);
    throw new Error("تعذر توزيع الدفعة على الفواتير المفتوحة");
  }

  const savedUpdates = [];

  try {
    for (const update of pendingUpdates) {
      await update.creditSale.save();
      savedUpdates.push(update);
    }
  } catch (error) {
    await rollbackCreditSaleFinancialUpdates(savedUpdates);
    throw error;
  }

  const updatedInvoices = pendingUpdates.map((update) =>
    toCreditSaleInvoice(update.creditSale)
  );

  res.status(201).json({
    message: "تم تسجيل الدفعة بنجاح",
    paymentSelection,
    invoice: updatedInvoices[0],
    invoices: updatedInvoices,
  });
});

const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    res.status(404);
    throw new Error("العميل غير موجود");
  }

  const relatedCreditSale = await CreditSale.exists({ customer: customer._id });
  if (relatedCreditSale) {
    res.status(400);
    throw new Error("لا يمكن حذف العميل لوجود معاملات بيع آجل مرتبطة به");
  }

  await customer.deleteOne();
  res.json({ message: "Customer deleted successfully" });
});

module.exports = {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  addCustomerCreditSalePayment,
  deleteCustomer,
};
