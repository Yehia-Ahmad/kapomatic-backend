const mongoose = require("mongoose");

const workshopSaleMaterialSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    name: {
      type: String,
      required: [true, "اسم البند مطلوب"],
      trim: true,
      maxlength: [200, "يجب ألا يزيد اسم البند عن 200 حرف"],
    },
    quantity: {
      type: Number,
      required: [true, "الكمية مطلوبة"],
      min: [0.01, "يجب أن تكون الكمية أكبر من صفر"],
    },
    unit: {
      type: String,
      trim: true,
      maxlength: [50, "يجب ألا تزيد الوحدة عن 50 حرف"],
    },
    unitPrice: {
      type: Number,
      required: [true, "سعر الوحدة مطلوب"],
      min: [0, "سعر الوحدة لا يمكن أن يكون سالبًا"],
    },
    manualCost: {
      type: Number,
      default: 0,
      min: [0, "التكلفة اليدوية لا يمكن أن تكون سالبة"],
    },
    totalCost: {
      type: Number,
      required: [true, "الإجمالي مطلوب"],
      min: [0, "الإجمالي لا يمكن أن يكون سالبًا"],
    },
  },
  { _id: true }
);

const workshopSaleComponentSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    name: {
      type: String,
      required: [true, "اسم البند مطلوب"],
      trim: true,
      maxlength: [200, "يجب ألا يزيد اسم البند عن 200 حرف"],
    },
    quantity: {
      type: Number,
      required: [true, "الكمية مطلوبة"],
      min: [0.01, "يجب أن تكون الكمية أكبر من صفر"],
    },
    unit: {
      type: String,
      required: [true, "الوحدة مطلوبة"],
      trim: true,
      maxlength: [50, "يجب ألا تزيد الوحدة عن 50 حرف"],
    },
    unitPrice: {
      type: Number,
      required: [true, "سعر الوحدة مطلوب"],
      min: [0, "سعر الوحدة لا يمكن أن يكون سالبًا"],
    },
    totalCost: {
      type: Number,
      required: [true, "الإجمالي مطلوب"],
      min: [0, "الإجمالي لا يمكن أن يكون سالبًا"],
    },
  },
  { _id: true }
);

const workshopSalePaymentSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: [true, "قيمة الدفعة مطلوبة"],
      min: [0.01, "قيمة الدفعة يجب أن تكون أكبر من صفر"],
    },
    paymentDate: {
      type: Date,
      required: [true, "تاريخ الدفعة مطلوب"],
    },
    note: {
      type: String,
      trim: true,
      maxlength: [500, "يجب ألا يزيد وصف الدفعة عن 500 حرف"],
    },
  },
  { _id: true }
);

const workshopSaleSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: [true, "معرّف العميل مطلوب"],
      index: true,
    },
    customerName: {
      type: String,
      required: [true, "اسم العميل مطلوب"],
      trim: true,
      maxlength: [200, "يجب ألا يزيد اسم العميل عن 200 حرف"],
    },
    customerPhone: {
      type: String,
      required: [true, "رقم هاتف العميل مطلوب"],
      trim: true,
      maxlength: [30, "يجب ألا يزيد رقم هاتف العميل عن 30 حرف"],
    },
    invoiceNumber: {
      type: String,
      required: [true, "رقم الفاتورة مطلوب"],
      trim: true,
      unique: true,
      maxlength: [100, "يجب ألا يزيد رقم الفاتورة عن 100 حرف"],
    },
    sellingDate: {
      type: Date,
      required: [true, "تاريخ البيع مطلوب"],
      index: true,
    },
    deliveryDate: {
      type: Date,
      index: true,
    },
    finalProductName: {
      type: String,
      required: [true, "اسم المنتج النهائي مطلوب"],
      trim: true,
      maxlength: [200, "يجب ألا يزيد اسم المنتج النهائي عن 200 حرف"],
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, "يجب ألا يزيد الوصف عن 2000 حرف"],
    },
    quantity: {
      type: Number,
      required: [true, "كمية المنتج النهائي مطلوبة"],
      min: [0.01, "كمية المنتج النهائي يجب أن تكون أكبر من صفر"],
    },
    materials: {
      type: [workshopSaleMaterialSchema],
      default: [],
    },
    additionalComponents: {
      type: [workshopSaleComponentSchema],
      default: [],
    },
    laborCost: {
      type: Number,
      default: 0,
      min: [0, "تكلفة العمالة لا يمكن أن تكون سالبة"],
    },
    materialsCost: {
      type: Number,
      default: 0,
      min: [0, "تكلفة المواد لا يمكن أن تكون سالبة"],
    },
    additionalComponentsCost: {
      type: Number,
      default: 0,
      min: [0, "تكلفة المكونات الإضافية لا يمكن أن تكون سالبة"],
    },
    subtotal: {
      type: Number,
      required: [true, "الإجمالي قبل الخصم مطلوب"],
      min: [0, "الإجمالي قبل الخصم لا يمكن أن يكون سالبًا"],
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: [0, "قيمة الخصم لا يمكن أن تكون سالبة"],
    },
    totalPrice: {
      type: Number,
      required: [true, "إجمالي السعر مطلوب"],
      min: [0, "إجمالي السعر لا يمكن أن يكون سالبًا"],
    },
    profitAmount: {
      type: Number,
      default: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: [0, "المبلغ المدفوع لا يمكن أن يكون سالبًا"],
    },
    remainingAmount: {
      type: Number,
      required: [true, "المبلغ المتبقي مطلوب"],
      min: [0, "المبلغ المتبقي لا يمكن أن يكون سالبًا"],
    },
    status: {
      type: String,
      enum: {
        values: ["pending", "partially_paid", "paid", "delivered", "cancelled"],
        message: "حالة فاتورة الورشة غير صالحة",
      },
      default: "pending",
      index: true,
    },
    payments: {
      type: [workshopSalePaymentSchema],
      default: [],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, "يجب ألا تزيد الملاحظات عن 2000 حرف"],
    },
    inventoryRestored: {
      type: Boolean,
      default: false,
    },
  },
  { collection: "workshop-sales", timestamps: true }
);

workshopSaleSchema.index({ "materials.product": 1 });
workshopSaleSchema.index({ "additionalComponents.product": 1 });
workshopSaleSchema.index({ customerName: 1, customerPhone: 1, sellingDate: -1 });

module.exports = mongoose.model("WorkshopSale", workshopSaleSchema);
