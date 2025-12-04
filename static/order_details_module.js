// Helper function formatIndianCurrency is loaded from utils.js


// Order Details Page - Enhanced loadOrderDetails function
window.loadOrderDetails = async function (orderId) {
    try {
        console.log('Loading order details for:', orderId);
        const response = await fetch(`/api/order/${orderId}`);
        if (!response.ok) throw new Error('Order not found');
        const order = await response.json();
        console.log('Order data received:', order);

        // Header
        if (document.getElementById('orderIdHeader')) {
            document.getElementById('orderIdHeader').textContent = `Order #${order['Order No']}`;
        }
        if (document.getElementById('currentStatusBadge')) {
            document.getElementById('currentStatusBadge').textContent = order['Order Status'];
            document.getElementById('currentStatusBadge').className = `status-badge ${order['Order Status'].toLowerCase().replace(/\s+/g, '-')}`;
        }

        // Info
        if (document.getElementById('orderDate')) document.getElementById('orderDate').textContent = order['Order Date'] || '-';
        if (document.getElementById('customerRef')) document.getElementById('customerRef').textContent = order['Customer Ref'] || 'N/A';
        if (document.getElementById('productType')) document.getElementById('productType').textContent = order['Order Type'] || 'N/A';

        // Dynamic delivery date label based on order status
        const deliveryLabel = document.getElementById('deliveryDateLabel');
        const deliveryValue = document.getElementById('deliveryDateValue');
        if (deliveryLabel && deliveryValue) {
            if (order['Order Status'] === 'Delivered') {
                deliveryLabel.textContent = 'Delivered On:';
                deliveryValue.textContent = order['Delivered Date'] || 'N/A';
            } else {
                deliveryLabel.textContent = 'Expected Delivery:';
                deliveryValue.textContent = order['Expected Delivery'] || 'N/A';
            }
        }

        // Specs
        if (document.getElementById('materialStructure')) document.getElementById('materialStructure').textContent = order['Structure'] || 'N/A';
        if (document.getElementById('materialThickness')) document.getElementById('materialThickness').textContent = order['Thickness'] || 'N/A';
        if (document.getElementById('materialWidth')) document.getElementById('materialWidth').textContent = order['Width'] || 'N/A';
        if (document.getElementById('orderQuantity')) document.getElementById('orderQuantity').textContent = order['Quantity'] || 'N/A';

        // Financials - handle if financials object doesn't exist
        const total = order.financials ? order.financials.total : (order['Total Amount'] || 0);
        const advance = order.financials ? order.financials.advance : (order['Advance Amount'] || 0);
        const balance = order.financials ? order.financials.balance : (total - advance);

        if (document.getElementById('totalValue')) document.getElementById('totalValue').textContent = formatIndianCurrency(total);
        if (document.getElementById('advancePaid')) document.getElementById('advancePaid').textContent = formatIndianCurrency(advance);
        if (document.getElementById('balanceDue')) document.getElementById('balanceDue').textContent = formatIndianCurrency(balance);
        if (document.getElementById('creditDays')) document.getElementById('creditDays').textContent = (order['Credit Days'] || '-') + ' Days';
        if (document.getElementById('paymentDueDate')) document.getElementById('paymentDueDate').textContent = order['Payment Due Date'] || '-';

        // Shipment
        if (document.getElementById('carrierName')) document.getElementById('carrierName').textContent = order['Carrier'] || 'Pending';
        if (document.getElementById('awbNumber')) document.getElementById('awbNumber').textContent = order['AWB'] || 'Pending';
        if (document.getElementById('shipmentStatus')) document.getElementById('shipmentStatus').textContent = order['Shipment Status'] || 'Pending';

        if (order['Tracking Link'] && order['Tracking Link'] !== '' && document.getElementById('trackingLinkContainer')) {
            document.getElementById('trackingLinkContainer').innerHTML = '<a href="' + order['Tracking Link'] + '" target="_blank" class="btn-primary">Track Shipment</a>';
        }

        // Timeline - handle if timeline doesn't exist
        if (order.timeline && Array.isArray(order.timeline) && order.timeline.length > 0) {
            renderOrderTimeline(order.timeline);
        } else {
            // Create a default timeline based on status
            const defaultTimeline = createOrderTimeline(order['Order Status']);
            renderOrderTimeline(defaultTimeline);
        }

        // Download Invoice
        const downloadInvoiceBtn = document.getElementById('downloadInvoiceBtn');
        if (downloadInvoiceBtn) {
            downloadInvoiceBtn.onclick = () => {
                window.open('/api/invoice/' + order['Order No'], '_blank');
            };
        }

        console.log('Order details loaded successfully');

    } catch (error) {
        console.error('Error loading details:', error);
        alert('Failed to load order details: ' + error.message);
    }
};

function createOrderTimeline(status) {
    const stages = ['PO Received', 'Film Extrusion', 'Printing', 'Lamination', 'Slitting', 'QC', 'Dispatch', 'Delivered'];
    const statusIndex = stages.findIndex(s => status && s.toLowerCase().includes(status.toLowerCase()));
    const currentIndex = statusIndex >= 0 ? statusIndex : 0;

    return stages.map((stage, index) => ({
        stage: stage,
        completed: index < currentIndex,
        current: index === currentIndex
    }));
}

function renderOrderTimeline(timeline) {
    const container = document.getElementById('productionTimeline');
    if (!container || !timeline) return;

    let html = '';
    timeline.forEach(step => {
        const classes = [];
        if (step.completed) classes.push('completed');
        if (step.current) classes.push('current');

        let icon = '';
        if (step.completed) {
            icon = '<i class="fas fa-check"></i>';
        } else if (step.current) {
            icon = '<i class="fas fa-spinner fa-spin"></i>';
        }

        html += '<div class="step ' + classes.join(' ') + '">';
        html += '<div class="step-circle">' + icon + '</div>';
        html += '<div class="step-label">' + step.stage + '</div>';
        html += '</div>';
    });

    container.innerHTML = html;

    const completedCount = timeline.filter(t => t.completed).length;
    const progressTrack = document.querySelector('.progress-track');
    if (progressTrack && timeline.length > 1) {
        const percent = (completedCount / (timeline.length - 1)) * 100;
        progressTrack.style.background = 'linear-gradient(to right, var(--success-color) ' + percent + '%, var(--border-color) ' + percent + '%)';
    }
}
