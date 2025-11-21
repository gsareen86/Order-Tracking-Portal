document.addEventListener('DOMContentLoaded', () => {

    // --- AUTHENTICATION CHECK (GLOBAL) ---
    // 1. Check if we are on the login page (index.html)
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        // If user is already logged in, redirect them to dashboard immediately
        if (localStorage.getItem('flex_user_session') === 'active') {
            window.location.href = '/dashboard.html';
        }

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = loginForm.username.value;
            const password = loginForm.password.value;
            const errorMsg = document.getElementById('error-msg');

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await response.json();

                if (data.success) {
                    // SET SESSION TOKEN ON SUCCESS
                    localStorage.setItem('flex_user_session', 'active');

                    // Use the server redirect, or default to dashboard.html
                    // We explicitly use the file name to avoid the "/" root issue
                    window.location.href = data.redirect === '/' ? '/dashboard.html' : data.redirect;
                } else {
                    errorMsg.textContent = data.message;
                }
            } catch (error) {
                // For prototype purposes: If API fails (backend not running), 
                // allow login if fields are not empty to let you test UI
                if (username && password) {
                    localStorage.setItem('flex_user_session', 'active');
                    window.location.href = '/dashboard.html';
                } else {
                    errorMsg.textContent = "An error occurred. Please try again.";
                }
            }
        });
    }

    // --- DASHBOARD LOGIC ---
    const ordersTableBody = document.getElementById('ordersTableBody');
    if (ordersTableBody) {
        // 2. AUTH GUARD: If no session token, kick user back to login (index.html)
        if (!localStorage.getItem('flex_user_session')) {
            window.location.href = '/index.html';
            return; // Stop executing dashboard logic
        }

        let allOrders = [];

        // Fetch Orders
        fetchOrders();

        // Filters
        document.getElementById('dateFilter').addEventListener('change', filterAndRender);
        document.getElementById('typeFilter').addEventListener('change', filterAndRender);
        document.getElementById('statusFilter').addEventListener('change', filterAndRender);
        document.getElementById('sortFilter').addEventListener('change', filterAndRender);

        // Theme Toggle
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        themeToggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            themeToggleBtn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });

        // Check saved theme
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-mode');
            themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
        }

        async function fetchOrders() {
            try {
                const response = await fetch('/api/orders');
                const data = await response.json();
                allOrders = data.orders;
                updateStats(allOrders);
                filterAndRender();
            } catch (error) {
                console.error('Error fetching orders:', error);
            }
        }

        function updateStats(orders) {
            document.getElementById('totalOrders').textContent = orders.length;
            document.getElementById('pendingOrders').textContent = orders.filter(o => ['Ordered', 'Packaging'].includes(o['Order Status'])).length;
            document.getElementById('deliveredOrders').textContent = orders.filter(o => o['Order Status'] === 'Delivered').length;

            const total = orders.reduce((sum, o) => sum + o['Total Amount'], 0);
            document.getElementById('totalSpend').textContent = `₹${total.toLocaleString()}`;
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

            renderTable(filtered);
        }

        function renderTable(orders) {
            ordersTableBody.innerHTML = '';
            orders.forEach(order => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><a href="#" class="order-link" onclick="openOrderDetails('${order['Order No']}')">${order['Order No']}</a></td>
                    <td>${order['Order Date']}</td>
                    <td>${order['Item']}</td>
                    <td><span class="status-badge status-${order['Order Status'].toLowerCase()}">${order['Order Status']}</span></td>
                    <td>₹${order['Total Amount'].toLocaleString()}</td>
                    <td>${order['Expected Delivery']}</td>
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

    async function openOrderDetails(orderId) {
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
                        <p><strong>Amount:</strong> ₹${order['Total Amount'].toLocaleString()}</p>
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
                    <p><strong>Unit Cost:</strong> ₹${order['Unit Cost']}</p>
                </div>
            `;
            orderModal.style.display = 'flex';
        } catch (error) {
            console.error('Error fetching details:', error);
        }
    }
    window.openOrderDetails = openOrderDetails;

    async function openTracking(orderId) {
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
    window.openTracking = openTracking;

    function openCancel(orderId) {
        document.getElementById('cancelOrderId').value = orderId;
        cancelModal.style.display = 'flex';
    }
    window.openCancel = openCancel;

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
