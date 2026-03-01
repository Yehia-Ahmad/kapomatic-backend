const mongoose = require("mongoose");

const sellingSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "معرّف المنتج مطلوب"],
    },
    productName: {
      type: String,
      required: [true, "اسم المنتج مطلوب"],
      trim: true,
      maxlength: [200, "يجب ألا يزيد اسم المنتج عن 200 حرف"],
    },
    categoryName: {
      type: String,
      required: [true, "اسم الفئة مطلوب"],
      trim: true,
      maxlength: [120, "يجب ألا يزيد اسم الفئة عن 120 حرف"],
    },
    customerName: {
      type: String,
      required: [true, "اسم العميل مطلوب"],
      trim: true,
      maxlength: [200, "يجب ألا يزيد اسم العميل عن 200 حرف"],
    },
    sellingDate: {
      type: Date,
      required: [true, "تاريخ البيع مطلوب"],
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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Selling", sellingSchema);
