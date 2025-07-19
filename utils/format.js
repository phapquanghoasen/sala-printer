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

function formatDate(value) {
  if (!value || !value.toDate) return '';

  const date = value.toDate();

  // Format date as DD/MM/YYYY - HH:mm:ss
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');

  return `${day}/${month}/${year} - ${hours}:${minutes}:${seconds}`;
}

function groupBy(data, key) {
  const groups = {};

  data.forEach(item => {
    const name = item[key] || 'other';
    if (!groups[name]) groups[name] = [];
    groups[name].push(item);
  });

  return groups;
}

module.exports = {
  formatDate,
  formatPrice,
  groupBy
};
