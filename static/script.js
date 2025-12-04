document.addEventListener('DOMContentLoaded', () => {
    // --- LOGIN PAGE LOGIC ---
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        // 1. LOGIN GUARD: If already logged in, redirect to dashboard
        if (localStorage.getItem('flex_user_session')) {
            window.location.href = '/dashboard.html';
            return; // Stop executing login logic
        }

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const errorMsg = document.getElementById('errorMsg');

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (data.success) {
                    localStorage.setItem('flex_user_session', 'active');
                    window.location.href = data.redirect === '/' ? '/dashboard.html' : data.redirect;
                } else {
                    errorMsg.textContent = 'Invalid credentials. Please try again.';
                }
            } catch (error) {
                errorMsg.textContent = 'Login failed. Please try again.';
                console.error('Login error:', error);
            }
        });
    }

    // --- HELPERS ---
    // formatIndianCurrency and formatCompactNumber are loaded from utils.js


    // --- DASHBOARD LOGIC ---
    const ordersTableBody = document.getElementById('ordersTableBody');
    if (ordersTableBody) {
        // AUTHENTICATION GUARD: Redirect to login if not authenticated
        if (!localStorage.getItem('flex_user_session')) {
            window.location.href = '/index.html';
            return; // Stop executing dashboard logic
        }


        let allOrders = [];
        let charts = {}; // Store chart instances

        // Fetch Orders
        fetchOrders();

        // Filters
        document.getElementById('dateFilter').addEventListener('change', filterAndRender);
        document.getElementById('typeFilter').addEventListener('change', filterAndRender);
        document.getElementById('statusFilter').addEventListener('change', filterAndRender);
        document.getElementById('sortFilter').addEventListener('change', filterAndRender);

        async function fetchOrders() {
            try {
                const response = await fetch('/api/orders');
                const data = await response.json();
                allOrders = data.orders;

                filterAndRender();
            } catch (error) {
                console.error('Error fetching orders:', error);
            }
        }

        function filterAndRender() {
            const dateFilter = document.getElementById('dateFilter').value;
            const typeFilter = document.getElementById('typeFilter').value;
            const statusFilter = document.getElementById('statusFilter').value;
            const sortFilter = document.getElementById('sortFilter').value;

            let filtered = [...allOrders];

            // Date Filter
            if (dateFilter !== 'all') {
                const days = parseInt(dateFilter);
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - days);
                filtered = filtered.filter(o => new Date(o['Order Date']) >= cutoff);
            }

            // Type Filter
            if (typeFilter !== 'all') {
                filtered = filtered.filter(o => o['Order Type'] === typeFilter);
            }

            // Status Filter
            if (statusFilter !== 'all') {
                filtered = filtered.filter(o => o['Order Status'] === statusFilter);
            }

            // Sort
            filtered.sort((a, b) => {
                const dateA = new Date(a['Order Date']);
                const dateB = new Date(b['Order Date']);
                const amountA = a['Total Amount'];
                const amountB = b['Total Amount'];

                switch (sortFilter) {
                    case 'date_asc': return dateA - dateB;
                    case 'date_desc': return dateB - dateA;
                    case 'amount_asc': return amountA - amountB;
                    case 'amount_desc': return amountB - amountA;
                    case 'orderno_asc': return a['Order No'].localeCompare(b['Order No']);
                    case 'orderno_desc': return b['Order No'].localeCompare(a['Order No']);
                    default: return 0;
                }
            });

            // Update Stats
            updateStats(filtered);

            // Render Table
            renderTable(filtered);

            // Render Charts
            renderCharts(filtered);
        }

        function updateStats(orders) {
            document.getElementById('totalOrders').textContent = orders.length;
            document.getElementById('pendingOrders').textContent =
                orders.filter(o => ['Ordered', 'Packaging', 'Shipped'].includes(o['Order Status'])).length;
            document.getElementById('deliveredOrders').textContent =
                orders.filter(o => o['Order Status'] === 'Delivered').length;

            const totalSpend = orders.reduce((sum, o) => sum + o['Total Amount'], 0);
            document.getElementById('totalSpend').textContent = formatIndianCurrency(totalSpend);

            // High Value Orders (> 10 Lakhs)
            const highValueCount = orders.filter(o => o['Total Amount'] > 1000000).length;
            const highValueEl = document.getElementById('highValueOrders');
            if (highValueEl) highValueEl.textContent = highValueCount;
        }

        function renderTable(orders) {
            ordersTableBody.innerHTML = '';
            orders.forEach(order => {
                const tr = document.createElement('tr');

                // Payment Status Logic
                const total = order['Total Amount'] || 0;
                const advance = order['Advance Amount'] || 0;
                const balance = total - advance;
                const dueDate = new Date(order['Payment Due Date']);
                // Overdue if Delivered AND Due Date passed AND Balance > 0
                const isPaymentOverdue = order['Order Status'] === 'Delivered' && dueDate < new Date() && balance > 0;

                let paymentBadge = '';
                if (balance <= 0) {
                    paymentBadge = '<span class="badge-payment badge-paid">PAID</span>';
                } else if (isPaymentOverdue) {
                    paymentBadge = '<span class="badge-payment badge-overdue">OVERDUE</span>';
                } else {
                    paymentBadge = '<span class="badge-payment badge-pending">PENDING</span>';
                }

                // Delivery Delay Logic
                const expectedDate = new Date(order['Expected Delivery']);
                const isDeliveryLate = order['Order Status'] !== 'Delivered' && expectedDate < new Date();
                const deliveryHtml = isDeliveryLate ?
                    `${order['Expected Delivery']} <i class="fas fa-exclamation-circle text-danger" title="Delayed"></i>` :
                    order['Expected Delivery'];

                tr.innerHTML = `
                        <td><a href="/order_details.html?id=${order['Order No']}" class="order-link">${order['Order No']}</a></td>
                        <td>${order['Order Date']}</td>
                        <td>${order['Item']}</td>
                        <td><span class="status-badge status-${order['Order Status'].toLowerCase().replace(/\s+/g, '-')}">${order['Order Status']}</span></td>
                        <td>${formatIndianCurrency(total)} ${paymentBadge}</td>
                        <td>${deliveryHtml}</td>
                        <td>
                            <button class="action-btn" title="Track Order" onclick="openTracking('${order['Order No']}')"><i class="fas fa-map-marker-alt"></i></button>
                            <button class="action-btn" title="Download Invoice" onclick="downloadInvoice('${order['Order No']}')"><i class="fas fa-file-download"></i></button>
                            ${order['Order Status'] !== 'Cancelled' && order['Order Status'] !== 'Delivered' ?
                        `<button class="action-btn" title="Cancel Order" onclick="openCancel('${order['Order No']}')"><i class="fas fa-times-circle"></i></button>` : ''}
                        </td>
                    `;
                ordersTableBody.appendChild(tr);
            });
        }

        // --- CHARTS & EXPORT ---
        function getGradient(ctx, colorStart, colorEnd) {
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, colorStart);
            gradient.addColorStop(1, colorEnd);
            return gradient;
        }

        function renderCharts(orders) {
            // Helper to destroy old charts
            ['statusChart', 'consumptionChart', 'revenueChart', 'trendChart', 'agingChart', 'topProductsChart'].forEach(id => {
                if (charts[id]) {
                    charts[id].destroy();
                }
            });

            // 1. Status Chart
            const statusCounts = {};
            orders.forEach(o => statusCounts[o['Order Status']] = (statusCounts[o['Order Status']] || 0) + 1);

            const statusCtx = document.getElementById('statusChart').getContext('2d');
            charts['statusChart'] = new Chart(statusCtx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(statusCounts),
                    datasets: [{
                        data: Object.values(statusCounts),
                        backgroundColor: [
                            '#1e3a8a', '#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd'
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    onClick: (e, elements) => {
                        if (elements.length > 0) {
                            const index = elements[0].index;
                            const status = Object.keys(statusCounts)[index];
                            const filter = document.getElementById('statusFilter');
                            if (filter) {
                                filter.value = status;
                                filter.dispatchEvent(new Event('change'));
                            }
                        }
                    },
                    plugins: { legend: { position: 'bottom' } }
                }
            });

            // 2. Consumption by Product Type
            const typeCounts = {};
            orders.forEach(o => typeCounts[o['Order Type']] = (typeCounts[o['Order Type']] || 0) + o['Total Amount']);

            const consumptionCtx = document.getElementById('consumptionChart').getContext('2d');
            charts['consumptionChart'] = new Chart(consumptionCtx, {
                type: 'bar',
                data: {
                    labels: Object.keys(typeCounts),
                    datasets: [{
                        label: 'Total Amount',
                        data: Object.values(typeCounts),
                        backgroundColor: getGradient(consumptionCtx, '#003073', '#059cf7'),
                        borderRadius: 5
                    }]
                },
                options: {
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => formatIndianCurrency(context.raw)
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { callback: (value) => formatCompactNumber(value) }
                        }
                    }
                }
            });

            // 3. Revenue vs Advance (Buckets by Order Age)
            const now = new Date();
            const revBuckets = { '0-30 Days': { balance: 0, advance: 0 }, '31-60 Days': { balance: 0, advance: 0 }, '61-90 Days': { balance: 0, advance: 0 }, '90+ Days': { balance: 0, advance: 0 } };

            orders.forEach(o => {
                const orderDate = new Date(o['Order Date']);
                const diffTime = Math.abs(now - orderDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const balance = o['Total Amount'] - (o['Advance Amount'] || 0);
                const advance = o['Advance Amount'] || 0;

                if (diffDays <= 30) { revBuckets['0-30 Days'].balance += balance; revBuckets['0-30 Days'].advance += advance; }
                else if (diffDays <= 60) { revBuckets['31-60 Days'].balance += balance; revBuckets['31-60 Days'].advance += advance; }
                else if (diffDays <= 90) { revBuckets['61-90 Days'].balance += balance; revBuckets['61-90 Days'].advance += advance; }
                else { revBuckets['90+ Days'].balance += balance; revBuckets['90+ Days'].advance += advance; }
            });

            const revenueCtx = document.getElementById('revenueChart').getContext('2d');
            charts['revenueChart'] = new Chart(revenueCtx, {
                type: 'bar',
                data: {
                    labels: Object.keys(revBuckets),
                    datasets: [
                        {
                            label: 'Balance Due',
                            data: Object.values(revBuckets).map(b => b.balance),
                            backgroundColor: '#ef4444',
                            borderRadius: 5
                        },
                        {
                            label: 'Advance Paid',
                            data: Object.values(revBuckets).map(b => b.advance),
                            backgroundColor: '#22c55e',
                            borderRadius: 5
                        }
                    ]
                },
                options: {
                    responsive: true,
                    scales: {
                        x: { stacked: true },
                        y: {
                            stacked: true,
                            ticks: { callback: (value) => formatCompactNumber(value) }
                        }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: (context) => context.dataset.label + ': ' + formatIndianCurrency(context.raw)
                            }
                        }
                    },
                    onClick: (e, elements) => {
                        if (elements.length > 0) {
                            const index = elements[0].index;
                            const label = Object.keys(revBuckets)[index];
                            // Simple filter logic: Set date filter to approximate range
                            const dateFilter = document.getElementById('dateFilter');
                            if (dateFilter) {
                                if (label === '0-30 Days') dateFilter.value = '30'; // Closest approximation
                                else if (label === '31-60 Days') dateFilter.value = '60';
                                else if (label === '61-90 Days') dateFilter.value = '90';
                                else dateFilter.value = '180'; // 90+
                                dateFilter.dispatchEvent(new Event('change'));
                            }
                        }
                    }
                }
            });

            // 4. Order Volume Trend (Monthly)
            const monthlyCounts = {};
            orders.forEach(o => {
                const date = new Date(o['Order Date']);
                const key = date.toLocaleString('default', { month: 'short', year: '2-digit' });
                monthlyCounts[key] = (monthlyCounts[key] || 0) + 1;
            });
            const sortedMonths = Object.keys(monthlyCounts).sort((a, b) => new Date('01 ' + a) - new Date('01 ' + b));

            const trendCtx = document.getElementById('trendChart').getContext('2d');
            charts['trendChart'] = new Chart(trendCtx, {
                type: 'line',
                data: {
                    labels: sortedMonths,
                    datasets: [{
                        label: 'Orders',
                        data: sortedMonths.map(m => monthlyCounts[m]),
                        borderColor: '#059cf7',
                        backgroundColor: 'rgba(5, 156, 247, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: (context) => 'Order Count: ' + context.raw
                            }
                        }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });

            // 5. Aging Balance (Overdue) - Count based
            const agingBuckets = { '0-30 Days': { count: 0, amount: 0 }, '31-60 Days': { count: 0, amount: 0 }, '61-90 Days': { count: 0, amount: 0 }, '90+ Days': { count: 0, amount: 0 } };

            orders.forEach(o => {
                const balance = o['Total Amount'] - (o['Advance Amount'] || 0);
                if (balance > 0 && o['Order Status'] === 'Delivered') {
                    const dueDate = new Date(o['Payment Due Date']);
                    if (dueDate < now) {
                        const diffTime = Math.abs(now - dueDate);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        if (diffDays <= 30) { agingBuckets['0-30 Days'].count++; agingBuckets['0-30 Days'].amount += balance; }
                        else if (diffDays <= 60) { agingBuckets['31-60 Days'].count++; agingBuckets['31-60 Days'].amount += balance; }
                        else if (diffDays <= 90) { agingBuckets['61-90 Days'].count++; agingBuckets['61-90 Days'].amount += balance; }
                        else { agingBuckets['90+ Days'].count++; agingBuckets['90+ Days'].amount += balance; }
                    }
                }
            });

            const agingCtx = document.getElementById('agingChart').getContext('2d');
            charts['agingChart'] = new Chart(agingCtx, {
                type: 'bar',
                data: {
                    labels: Object.keys(agingBuckets),
                    datasets: [{
                        label: 'Overdue Orders',
                        data: Object.values(agingBuckets).map(b => b.count),
                        backgroundColor: getGradient(agingCtx, '#ef4444', '#fca5a5'),
                        borderRadius: 5
                    }]
                },
                options: {
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const index = context.dataIndex;
                                    const key = Object.keys(agingBuckets)[index];
                                    const data = agingBuckets[key];
                                    return [`Orders: ${data.count}`, `Total Amount: ${formatIndianCurrency(data.amount)}`];
                                }
                            }
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, title: { display: true, text: 'Number of Orders' } }
                    }
                }
            });

            // 6. Top 5 Products
            const productSales = {};
            orders.forEach(o => productSales[o['Item']] = (productSales[o['Item']] || 0) + o['Total Amount']);
            const topProducts = Object.entries(productSales)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            const topCtx = document.getElementById('topProductsChart').getContext('2d');
            charts['topProductsChart'] = new Chart(topCtx, {
                type: 'bar',
                indexAxis: 'y',
                data: {
                    labels: topProducts.map(p => p[0]),
                    datasets: [{
                        label: 'Sales',
                        data: topProducts.map(p => p[1]),
                        backgroundColor: getGradient(topCtx, '#8b5cf6', '#c4b5fd'),
                        borderRadius: 5
                    }]
                },
                options: {
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => formatIndianCurrency(context.raw)
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: { callback: (value) => formatCompactNumber(value) }
                        }
                    }
                }
            });
        }

        window.exportData = function (format) {
            let content = '';
            // Get current filtered orders from the table or re-filter
            // Ideally we should store 'currentFilteredOrders' globally, but for now we can just use allOrders 
            // and re-apply filters or just export all. Let's export ALL for simplicity or re-implement filter logic.
            // For better UX, let's use the filtered list.
            // Since we don't have 'filtered' accessible here easily without global, let's just export allOrders for now.
            const orders = allOrders;

            if (format === 'csv') {
                const headers = ['Order No', 'Date', 'Item', 'Status', 'Amount', 'Advance', 'Balance'];
                content = headers.join(',') + '\n';
                orders.forEach(o => {
                    const balance = o['Total Amount'] - (o['Advance Amount'] || 0);
                    content += `${o['Order No']},${o['Order Date']},${o['Item']},${o['Order Status']},${o['Total Amount']},${o['Advance Amount']},${balance}\n`;
                });
                const blob = new Blob([content], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'orders.csv';
                a.click();
            } else if (format === 'pdf') {
                window.print();
            } else {
                alert('Export to ' + format.toUpperCase() + ' is coming soon!');
            }
        }

        // --- MODAL LOGIC ---
        const orderModal = document.getElementById('orderModal');
        const trackingModal = document.getElementById('trackingModal');
        const cancelModal = document.getElementById('cancelModal');
        const helpModal = document.getElementById('helpModal');

        function closeModals() {
            document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        }

        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', closeModals);
        });

        window.onclick = function (event) {
            if (event.target.classList.contains('modal')) {
                closeModals();
            }
        }

        window.openOrderDetails = async function (orderId) {
            try {
                const response = await fetch(`/api/order/${orderId}`);
                const order = await response.json();

                const content = document.getElementById('modalDetailsContent');
                content.innerHTML = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div>
                            <p><strong>Order No:</strong> ${order['Order No']}</p>
                            <p><strong>Date:</strong> ${order['Order Date']}</p>
                            <p><strong>Status:</strong> ${order['Order Status']}</p>
                            <p><strong>Amount:</strong> ${formatIndianCurrency(order['Total Amount'])}</p>
                        </div>
                        <div>
                            <p><strong>Buyer:</strong> ${order['Buyer Name']}</p>
                            <p><strong>Address:</strong> ${order['Buyer Address']}</p>
                            <p><strong>Expected Delivery:</strong> ${order['Expected Delivery']}</p>
                        </div>
                    </div>
                    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #eee;">
                        <p><strong>Item:</strong> ${order['Item']}</p>
                        <p><strong>Quantity:</strong> ${order['Quantity']}</p>
                        <p><strong>Unit Cost:</strong> ${formatIndianCurrency(order['Unit Cost'])}</p>
                    </div>
                    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #eee;">
                        <p><strong>Advance Paid:</strong> ${formatIndianCurrency(order['Advance Amount'] || 0)}</p>
                        <p><strong>Balance Due:</strong> ${formatIndianCurrency(order['Total Amount'] - (order['Advance Amount'] || 0))}</p>
                        <p><strong>Payment Due Date:</strong> ${order['Payment Due Date'] || 'N/A'}</p>
                    </div>
                `;
                orderModal.style.display = 'flex';
            } catch (error) {
                console.error('Error fetching details:', error);
            }
        }

        window.openTracking = async function (orderId) {
            try {
                const response = await fetch(`/api/track/${orderId}`);
                const data = await response.json();

                const timeline = document.getElementById('trackingTimeline');
                timeline.innerHTML = data.tracking.map(step => `
                    <div class="timeline-item ${step.completed ? 'completed' : ''}">
                        <div class="timeline-date">${step.timestamp || 'Pending'}</div>
                        <div class="timeline-status">${step.status}</div>
                        <div class="timeline-location">${step.location}</div>
                    </div>
                `).join('');

                trackingModal.style.display = 'flex';
            } catch (error) {
                console.error('Error fetching tracking:', error);
            }
        }

        window.openCancel = function (orderId) {
            document.getElementById('cancelOrderId').value = orderId;
            cancelModal.style.display = 'flex';
        }

        const cancelForm = document.getElementById('cancelForm');
        if (cancelForm) {
            cancelForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const orderId = document.getElementById('cancelOrderId').value;
                const reason = document.getElementById('cancelReason').value;

                try {
                    const response = await fetch(`/api/cancel/${orderId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reason })
                    });
                    const data = await response.json();

                    if (data.success) {
                        closeModals();
                        showNotification("Order cancelled. We are sorry that we could not serve you to your satisfaction.");
                        setTimeout(() => {
                            location.reload();
                        }, 3000);
                    } else {
                        alert('Failed to cancel order');
                    }
                } catch (error) {
                    console.error('Error cancelling:', error);
                }
            });
        }

        function showNotification(message) {
            const banner = document.getElementById('notificationBanner');
            const msgSpan = document.getElementById('notificationMessage');
            const closeBtn = banner.querySelector('.close-banner');

            msgSpan.textContent = message;
            banner.style.display = 'flex';

            const hideBanner = () => {
                banner.style.display = 'none';
            };

            closeBtn.onclick = hideBanner;
            setTimeout(hideBanner, 5000);
        }
        window.showNotification = showNotification;

        window.downloadInvoice = function (orderId) {
            window.open(`/api/invoice/${orderId}`, '_blank');
        }

        window.logout = function () {
            localStorage.removeItem('flex_user_session');
            window.location.href = '/index.html';
        }

        // --- THEME TOGGLE ---
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', () => {
                document.body.classList.toggle('dark-mode');
                const icon = themeToggleBtn.querySelector('i');
                if (document.body.classList.contains('dark-mode')) {
                    icon.classList.remove('fa-moon');
                    icon.classList.add('fa-sun');
                    localStorage.setItem('theme', 'dark');
                } else {
                    icon.classList.remove('fa-sun');
                    icon.classList.add('fa-moon');
                    localStorage.setItem('theme', 'light');
                }
            });

            // Load saved theme on page load
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-mode');
                const icon = themeToggleBtn.querySelector('i');
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
            }
        }

        // --- CHAT WIDGET EVENT HANDLERS ---
        const chatToggleBtn = document.getElementById('chatToggleBtn');
        const chatWindow = document.getElementById('chatWindow');
        const closeChatBtn = document.getElementById('closeChatBtn');
        const getHelpBtn = document.getElementById('getHelpBtn');
        const startChatFromHelp = document.getElementById('startChatFromHelp');
        const chatInput = document.getElementById('chatInput');
        const sendMessageBtn = document.getElementById('sendMessageBtn');
        const chatMessages = document.getElementById('chatMessages');

        if (getHelpBtn && helpModal) {
            getHelpBtn.addEventListener('click', () => {
                helpModal.style.display = 'flex';
            });
        }

        if (startChatFromHelp && helpModal) {
            startChatFromHelp.addEventListener('click', () => {
                helpModal.style.display = 'none';
                if (chatWindow) chatWindow.style.display = 'flex';
            });
        }

        if (chatToggleBtn && chatWindow) {
            chatToggleBtn.addEventListener('click', () => {
                chatWindow.style.display = chatWindow.style.display === 'none' ? 'flex' : 'none';
            });
        }

        if (closeChatBtn && chatWindow) {
            closeChatBtn.addEventListener('click', () => {
                chatWindow.style.display = 'none';
            });
        }

        // Chat message sending functionality with live progress
        async function sendChatMessage() {
            const query = chatInput.value.trim();
            if (!query) return;

            // Add user message to chat
            addMessage(query, 'user');
            chatInput.value = '';

            // Add progress message with live status
            const progressId = addMessage('🔍 Analyzing your question...', 'ai', true);
            const progressDiv = document.getElementById(progressId);

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query })
                });

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n\n');
                    buffer = lines.pop(); // Keep incomplete line in buffer

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const jsonData = JSON.parse(line.slice(6));

                            if (jsonData.type === 'progress') {
                                // Update progress message with icons and step info
                                let icon = '';
                                if (jsonData.stage === 'planning') icon = '🔍';
                                else if (jsonData.stage === 'executing') icon = '⚙️';
                                else if (jsonData.stage === 'validating') icon = '✓';

                                progressDiv.textContent = `${icon} ${jsonData.message}`;
                            }
                            else if (jsonData.type === 'complete') {
                                // Remove progress indicator
                                removeMessage(progressId);

                                // Add final response with thinking trace
                                addMessage(jsonData.response, 'ai', false, jsonData.thinking);

                                // Handle any actions
                                if (jsonData.action === 'highlight_order' && jsonData.order_id) {
                                    highlightOrder(jsonData.order_id);
                                }
                            }
                            else if (jsonData.type === 'error') {
                                removeMessage(progressId);
                                addMessage("Sorry, I encountered an error. Please try again.", 'ai');
                            }
                        }
                    }
                }
            } catch (error) {
                removeMessage(progressId);
                addMessage("Sorry, I encountered an error. Please try again.", 'ai');
                console.error('Chat Error:', error);
            }
        }

        function addMessage(text, sender, isThinking = false, thinkingTrace = null) {
            const div = document.createElement('div');
            div.classList.add('message', `${sender}-message`);

            if (isThinking) {
                div.id = `msg-${Date.now()}`;
                div.style.fontStyle = 'italic';
                div.style.opacity = '0.7';
                div.textContent = text;
            } else {
                // Create message content
                const messageText = document.createElement('div');
                messageText.className = 'message-text';
                // Render markdown for AI messages, plain text for user messages
                if (sender === 'ai' && typeof marked !== 'undefined') {
                    messageText.innerHTML = marked.parse(text);
                } else {
                    messageText.textContent = text;
                }
                div.appendChild(messageText);

                // Add thinking trace if available (only for AI messages)
                if (sender === 'ai' && thinkingTrace) {
                    const thinkingContainer = document.createElement('details');
                    thinkingContainer.className = 'thinking-trace';

                    const summary = document.createElement('summary');
                    summary.innerHTML = '<i class="fas fa-brain"></i> View AI Thinking Process';
                    thinkingContainer.appendChild(summary);

                    const thinkingContent = document.createElement('pre');
                    thinkingContent.className = 'thinking-content';
                    thinkingContent.textContent = thinkingTrace;
                    thinkingContainer.appendChild(thinkingContent);

                    div.appendChild(thinkingContainer);
                }
            }

            chatMessages.appendChild(div);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return div.id;
        }

        function removeMessage(id) {
            const el = document.getElementById(id);
            if (el) el.remove();
        }

        function highlightOrder(orderId) {
            const rows = document.querySelectorAll('#ordersTableBody tr');
            rows.forEach(row => {
                if (row.innerHTML.includes(orderId)) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    row.style.backgroundColor = 'var(--primary-color)';
                    row.style.color = 'white';
                    setTimeout(() => {
                        row.style.backgroundColor = '';
                        row.style.color = '';
                    }, 3000);
                }
            });
        }

        // Send message on button click
        if (sendMessageBtn) {
            sendMessageBtn.addEventListener('click', sendChatMessage);
        }

        // Send message on Enter key
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendChatMessage();
                }
            });
        }
    }
});
