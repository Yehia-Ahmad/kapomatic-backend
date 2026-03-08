const Customer = require("../models/customer.model");
const asyncHandler = require("../utils/asyncHandler");

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

  res.json(customer);
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

const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    res.status(404);
    throw new Error("العميل غير موجود");
  }

  await customer.deleteOne();
  res.json({ message: "Customer deleted successfully" });
});

module.exports = {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};
