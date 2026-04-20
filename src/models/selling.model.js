const mongoose = require("mongoose");

const sellingItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    productName: {
      type: String,
      trim: true,
      maxlength: [200, "يجب ألا يزيد اسم المنتج عن 200 حرف"],
    },
    categoryName: {
      type: String,
      trim: true,
      maxlength: [120, "يجب ألا يزيد اسم الفئة عن 120 حرف"],
    },
    quantity: {
      type: Number,
      required: [true, "كمية المنتج مطلوبة"],
      min: [1, "يجب أن تكون كمية المنتج 1 على الأقل"],
    },
    unitPrice: {
      type: Number,
      required: [true, "سعر المنتج للوحدة مطلوب"],
      min: [0, "سعر المنتج للوحدة لا يمكن أن يكون سالبًا"],
    },
    totalPrice: {
      type: Number,
      required: [true, "السعر الإجمالي مطلوب"],
      min: [0, "السعر الإجمالي لا يمكن أن يكون سالبًا"],
    },
    purchasePrice: {
      type: Number,
      default: 0,
      min: [0, "سعر الشراء لا يمكن أن يكون سالبًا"],
    },
    profitAmount: {
      type: Number,
      default: 0,
    },
  },
  { _id: true }
);

const sellingSchema = new mongoose.Schema(
  {
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    productName: {
      type: String,
      trim: true,
      maxlength: [200, "يجب ألا يزيد اسم المنتج عن 200 حرف"],
    },
    categoryName: {
      type: String,
      trim: true,
      maxlength: [120, "يجب ألا يزيد اسم الفئة عن 120 حرف"],
    },
    customerName: {
      type: String,
      required: [true, "اسم العميل مطلوب"],
      trim: true,
      maxlength: [200, "يجب ألا يزيد اسم العميل عن 200 حرف"],
    },
    customerPhone: {
      type: String,
      trim: true,
      maxlength: [30, "يجب ألا يزيد رقم هاتف العميل عن 30 حرف"],
    },
    sellingDate: {
      type: Date,
      required: [true, "تاريخ البيع مطلوب"],
    },
    items: {
      type: [sellingItemSchema],
      default: undefined,
    },
    totalQuantity: {
      type: Number,
      min: [0, "إجمالي الكمية لا يمكن أن يكون سالبًا"],
    },
    discountAmount: {
      type: Number,
      min: [0, "قيمة الخصم لا يمكن أن تكون سالبة"],
    },
    // Legacy field kept optional so older percentage-based records still load safely.
    discountPercentage: {
      type: Number,
      min: [0, "نسبة الخصم لا يمكن أن تكون سالبة"],
      max: [100, "نسبة الخصم لا يمكن أن تتجاوز 100"],
    },
    shippingFees: {
      type: Number,
      default: 0,
      min: [0, "مصاريف الشحن لا يمكن أن تكون سالبة"],
    },

    // Legacy single-line selling fields kept optional so older records still load correctly.
    quantity: {
      type: Number,
      min: [1, "يجب أن تكون كمية المنتج 1 على الأقل"],
    },
    unitPrice: {
      type: Number,
      min: [0, "سعر المنتج للوحدة لا يمكن أن يكون سالبًا"],
    },
    totalPrice: {
      type: Number,
      required: [true, "السعر الإجمالي مطلوب"],
      min: [0, "السعر الإجمالي لا يمكن أن يكون سالبًا"],
    },
  },
  { timestamps: true }
);

sellingSchema.index({ "items.product": 1 });

module.exports = mongoose.model("Selling", sellingSchema);
