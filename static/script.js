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

        async function fetchOrders() {
            try {
                const response = await fetch('/api/orders');
                const data = await response.json();
                allOrders = data.orders;

                // Update stats
                document.getElementById('totalOrders').textContent = allOrders.length;
                document.getElementById('pendingOrders').textContent =
                    allOrders.filter(o => ['Ordered', 'Packaging', 'Shipped'].includes(o['Order Status'])).length;
                document.getElementById('deliveredOrders').textContent =
                    allOrders.filter(o => o['Order Status'] === 'Delivered').length;

                const totalSpend = allOrders.reduce((sum, o) => sum + o['Total Amount'], 0);
                document.getElementById('totalSpend').textContent = `₹${totalSpend.toLocaleString()}`;

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

        // Chat message sending functionality
        async function sendChatMessage() {
            const query = chatInput.value.trim();
            if (!query) return;

            // Add user message to chat
            addMessage(query, 'user');
            chatInput.value = '';

            // Show thinking indicator
            const thinkingId = addMessage('Thinking...', 'ai', true);

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query })
                });
                const data = await response.json();

                // Remove thinking indicator
                removeMessage(thinkingId);

                // Add AI response
                addMessage(data.response, 'ai');

                // Handle any actions (like highlighting orders)
                if (data.action === 'highlight_order' && data.order_id) {
                    highlightOrder(data.order_id);
                }
            } catch (error) {
                removeMessage(thinkingId);
                addMessage("Sorry, I encountered an error. Please try again.", 'ai');
                console.error('Chat Error:', error);
            }
        }

        function addMessage(text, sender, isThinking = false) {
            const div = document.createElement('div');
            div.classList.add('message', `${sender}-message`);
            div.textContent = text;
            if (isThinking) {
                div.id = `msg-${Date.now()}`;
                div.style.fontStyle = 'italic';
                div.style.opacity = '0.7';
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
