const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

const buildInvoiceTotals = (items = [], options = {}) => {
  const totalQuantity = items.reduce(
    (sum, item) => sum + Number(item.productQuantity ?? item.quantity ?? 0),
    0
  );
  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0)
  );
  const discountPercentage = Number(options.discountPercentage || 0);
  const discountAmount = roundMoney((subtotal * discountPercentage) / 100);
  const shippingFees = roundMoney(
    totalQuantity > 0 ? Number(options.shippingFees || 0) : 0
  );
  const totalPrice = roundMoney(
    Math.max(0, subtotal - discountAmount + shippingFees)
  );

  return {
    totalQuantity,
    subtotal,
    discountPercentage,
    discountAmount,
    shippingFees,
    totalPrice,
  };
};

module.exports = {
  roundMoney,
  buildInvoiceTotals,
};
