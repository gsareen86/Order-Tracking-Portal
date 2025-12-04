// Shared Utility Functions - UFlex Order Tracking Portal

/**
 * Format a number as Indian currency (₹ with lakhs/crores separators)
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string (e.g., "₹1,50,000")
 */
function formatIndianCurrency(amount) {
    if (amount === undefined || amount === null) return '₹0';
    const x = Math.round(amount).toString();
    let lastThree = x.substring(x.length - 3);
    const otherNumbers = x.substring(0, x.length - 3);
    if (otherNumbers !== '') lastThree = ',' + lastThree;
    const res = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
    return '₹' + res;
}

/**
 * Format a number into compact form (K, L, Cr)
 * @param {number} number - The number to format
 * @returns {string} Formatted compact number (e.g., "1.50 Cr")
 */
function formatCompactNumber(number) {
    if (number >= 10000000) {
        return (number / 10000000).toFixed(2) + ' Cr';
    } else if (number >= 100000) {
        return (number / 100000).toFixed(2) + ' L';
    } else if (number >= 1000) {
        return (number / 1000).toFixed(2) + ' K';
    }
    return number.toString();
}

// Export functions for use in other modules (if using ES modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatIndianCurrency, formatCompactNumber };
}
