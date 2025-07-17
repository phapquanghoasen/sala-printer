function formatPrice(value, hasCurrency = true) {
  if (!value) return '';

  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (hasCurrency) {
    return numValue
      .toLocaleString('vi-VN', {
        style: 'currency',
        currency: 'VND',
        maximumFractionDigits: 0,
      })
      .replace('₫', 'VNĐ')
      .trim();
  }

  return numValue.toLocaleString('vi-VN', {
    maximumFractionDigits: 0,
  });
}

function formatDate(date) {
  if (!date) return '';

  return `${date.toLocaleDateString('vi-VN')} - ${date.toLocaleTimeString('vi-VN')}`;
}

function getBillTotal(foods) {
  return (foods || []).reduce((sum, food) => sum + food.price * food.quantity, 0);
}

module.exports = {
  formatPrice,
  formatDate,
  getBillTotal,
};
