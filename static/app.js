const API_BASE = 'http://localhost:8000';
let currentServer = '10.60.70.14'; // Default server

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing...');
    
    initTabs();
    updateTime();
    setInterval(updateTime, 1000);
    
    // Load servers first
    loadServers();
    
    // Hide loader and show content after a delay
    setTimeout(() => {
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('mainContent').style.transition = 'opacity 0.8s';
        document.getElementById('mainContent').style.opacity = '1';
        
        // Load overview after content is visible
        loadOverview();
    }, 1500);
    
    // Auto-refresh every 30 seconds
    setInterval(loadOverview, 30000);
    
    // Refresh CPU more frequently (every 2 seconds)
    setInterval(loadCPUUtilization, 2000);
});

function updateTime() {
    const now = new Date();
    document.getElementById('currentTime').textContent = now.toLocaleString();
}

function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');

    // Load data for the tab
    switch(tabName) {
        case 'overview':
            loadOverview();
            break;
        case 'queries':
            loadRunningQueries();
            break;
        case 'long-running':
            loadLongRunningQueries();
            break;
        case 'users':
            loadActiveUsers();
            loadUserList();
            break;
        case 'tables':
            loadTableUsage(1);
            loadUnusedTables(1);
            break;
        case 'sessions':
            loadSleepingSessions();
            break;
    }
}

async function fetchAPI(endpoint) {
    try {
        // Add server parameter if not already in endpoint
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = currentServer ? `${API_BASE}${endpoint}${separator}server=${currentServer}` : `${API_BASE}${endpoint}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('API request failed');
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        document.getElementById('statusBadge').textContent = '● Disconnected';
        document.getElementById('statusBadge').style.background = '#ef4444';
        return null;
    }
}

async function loadServers() {
    console.log('Loading servers...');
    
    const select = document.getElementById('serverSelect');
    if (!select) {
        console.error('serverSelect element not found!');
        return;
    }
    
    try {
        const url = `${API_BASE}/api/servers`;
        console.log('Fetching from:', url);
        
        const response = await fetch(url);
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Server data received:', data);
        
        if (!data.servers || data.servers.length === 0) {
            console.error('No servers in response');
            select.innerHTML = '<option value="10.60.70.14">No servers configured</option>';
            return;
        }
        
        // Populate dropdown
        select.innerHTML = data.servers.map(s => 
            `<option value="${s.ip}">${s.name} (${s.ip})</option>`
        ).join('');
        
        // Set default server
        if (data.default) {
            currentServer = data.default;
            select.value = currentServer;
        }
        
        console.log('Servers loaded successfully. Current server:', currentServer);
    } catch (error) {
        console.error('Error loading servers:', error);
        // Fallback to hardcoded servers
        select.innerHTML = `
            <option value="10.60.70.14">Retail Server (10.60.70.14)</option>
            <option value="10.60.70.137">Group Server (10.60.70.137)</option>
        `;
        currentServer = '10.60.70.14';
        select.value = currentServer;
        console.log('Using fallback servers');
    }
}

function onServerChange() {
    const select = document.getElementById('serverSelect');
    currentServer = select.value;
    
    // Show loading indicator
    document.getElementById('statusBadge').textContent = '● Connecting...';
    document.getElementById('statusBadge').style.background = '#f59e0b';
    
    // Reload current tab data
    const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
    switchTab(activeTab);
}

async function loadOverview() {
    const [running, longRunning, users, topCpu, topIo, cpuUtil] = await Promise.all([
        fetchAPI('/api/queries/running'),
        fetchAPI('/api/queries/long-running'),
        fetchAPI('/api/users/active'),
        fetchAPI('/api/queries/top-cpu'),
        fetchAPI('/api/queries/top-io'),
        fetchAPI('/api/cpu-utilization')
    ]);

    if (running) {
        document.getElementById('runningCount').textContent = running.length;
        document.getElementById('statusBadge').textContent = '● Connected';
        document.getElementById('statusBadge').style.background = '#10b981';
    }
    if (longRunning) document.getElementById('longRunningCount').textContent = longRunning.length;
    if (users) document.getElementById('activeUsersCount').textContent = users.length;
    if (topCpu) {
        document.getElementById('topCpuCount').textContent = topCpu.length;
        renderTopQueries('topCpuQueries', topCpu, 'cpu');
    }
    if (topIo) renderTopQueries('topIoQueries', topIo, 'io');
    
    // Update CPU utilization
    updateCPUDisplay(cpuUtil);
}

async function loadCPUUtilization() {
    const cpuUtil = await fetchAPI('/api/cpu-utilization');
    updateCPUDisplay(cpuUtil);
}

function updateCPUDisplay(cpuUtil) {
    if (cpuUtil) {
        const cpuPercent = cpuUtil.total_cpu || 0;
        const sqlCpu = cpuUtil.sql_cpu || 0;
        const cpuElement = document.getElementById('cpuUtilization');
        cpuElement.textContent = `${cpuPercent}%`;
        
        // Show SQL CPU breakdown
        const cpuCard = cpuElement.closest('.stat-card');
        const existingDetail = cpuCard.querySelector('.cpu-detail');
        if (existingDetail) existingDetail.remove();
        
        if (sqlCpu > 0) {
            const detail = document.createElement('p');
            detail.className = 'cpu-detail';
            detail.style.cssText = 'font-size: 11px; color: #888; margin-top: 4px;';
            detail.textContent = `SQL Server: ${sqlCpu}%`;
            cpuElement.parentElement.appendChild(detail);
        }
        
        // Change color based on CPU usage
        if (cpuPercent >= 80) {
            cpuCard.style.borderLeft = '10px solid #ef4444';
        } else if (cpuPercent >= 60) {
            cpuCard.style.borderLeft = '10px solid #f59e0b';
        } else {
            cpuCard.style.borderLeft = '10px solid #10b981';
        }
    }
}

function renderTopQueries(containerId, queries, type) {
    const container = document.getElementById(containerId);
    if (!queries || queries.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><p>No data available</p></div>';
        return;
    }

    const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe'];
    
    container.innerHTML = queries.slice(0, 5).map((q, index) => `
        <div class="query-item" onclick="selectQueryItem(this)" style="animation-delay: ${index * 0.1}s;">
            <div class="query-item-header">
                <strong style="color: ${colors[index % colors.length]};">Executions: ${q.execution_count}</strong>
                <span style="font-weight: 600;">${type === 'cpu' ? formatNumber(q.total_cpu_time) + ' ms CPU' : formatNumber(q.total_io) + ' I/O'}</span>
            </div>
            <div class="query-item-stats">
                ${type === 'cpu' ? `<span>⚡ Avg CPU: ${formatNumber(q.avg_cpu_time)} ms</span>` : ''}
                ${type === 'io' ? `<span>📖 Reads: ${formatNumber(q.total_logical_reads)}</span>` : ''}
                ${type === 'io' ? `<span>✍️ Writes: ${formatNumber(q.total_logical_writes)}</span>` : ''}
                <span>🕐 Last: ${formatDateTime(q.last_execution_time)}</span>
            </div>
            <div class="query-item-text" title="${escapeHtml(q.query_text)}">
                ${escapeHtml(truncate(q.query_text, 100))}
                <button class="copy-btn" onclick="event.stopPropagation(); copyQuery(\`${escapeForJs(q.query_text)}\`, this)">📋 Copy</button>
            </div>
        </div>
    `).join('');
}

async function loadRunningQueries() {
    const queries = await fetchAPI('/api/queries/running');
    const container = document.getElementById('runningQueriesTable');
    
    if (!queries || queries.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>No running queries</p></div>';
        return;
    }

    // Apply status filter
    const statusFilter = document.getElementById('queryStatusFilter').value.toLowerCase();
    const filteredQueries = statusFilter 
        ? queries.filter(q => q.status && q.status.toLowerCase() === statusFilter)
        : queries;

    if (filteredQueries.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><p>No queries found with selected status</p></div>';
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Session</th>
                    <th>User</th>
                    <th>Database</th>
                    <th>Query</th>
                    <th>Duration</th>
                    <th>CPU (ms)</th>
                    <th>Reads</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${filteredQueries.map(q => `
                    <tr>
                        <td>${q.session_id}</td>
                        <td>${q.login_name}</td>
                        <td>${q.database_name || 'N/A'}</td>
                        <td><div class="query-text" title="${escapeHtml(q.query_text)}">${escapeHtml(truncate(q.query_text, 80))}<button class="copy-btn" onclick="event.stopPropagation(); copyQuery(\`${escapeForJs(q.query_text)}\`, this)">📋 Copy</button></div></td>
                        <td>${formatDuration(q.duration_seconds)}</td>
                        <td>${formatNumber(q.cpu_time)}</td>
                        <td>${formatNumber(q.logical_reads)}</td>
                        <td><span class="badge ${getStatusBadge(q.status)}">${q.status}</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function loadLongRunningQueries() {
    const queries = await fetchAPI('/api/queries/long-running');
    const container = document.getElementById('longRunningTable');
    
    if (!queries || queries.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚡</div><p>No long-running queries</p></div>';
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Session</th>
                    <th>User</th>
                    <th>Database</th>
                    <th>Query</th>
                    <th>Execution Time</th>
                    <th>CPU (ms)</th>
                    <th>Reads</th>
                    <th>Writes</th>
                </tr>
            </thead>
            <tbody>
                ${queries.map(q => `
                    <tr>
                        <td>${q.session_id}</td>
                        <td>${q.login_name}</td>
                        <td>${q.database_name || 'N/A'}</td>
                        <td><div class="query-text" title="${escapeHtml(q.query_text)}">${escapeHtml(truncate(q.query_text, 80))}<button class="copy-btn" onclick="event.stopPropagation(); copyQuery(\`${escapeForJs(q.query_text)}\`, this)">📋 Copy</button></div></td>
                        <td><span class="badge badge-danger">${formatDuration(q.execution_time_seconds)}</span></td>
                        <td>${formatNumber(q.cpu_time)}</td>
                        <td>${formatNumber(q.logical_reads)}</td>
                        <td>${formatNumber(q.writes)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function loadActiveUsers(page = 1) {
    const users = await fetchAPI('/api/users/active');
    const container = document.getElementById('activeUsersTable');
    const paginationContainer = document.getElementById('usersPagination');
    
    if (!users || users.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><p>No active users</p></div>';
        paginationContainer.innerHTML = '';
        return;
    }

    // Apply status filter
    const statusFilter = document.getElementById('statusFilter').value.toLowerCase();
    const filteredUsers = statusFilter 
        ? users.filter(u => u.status && u.status.toLowerCase() === statusFilter)
        : users;

    if (filteredUsers.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><p>No users found with selected status</p></div>';
        paginationContainer.innerHTML = '';
        return;
    }

    // Pagination settings
    const itemsPerPage = 12;
    const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

    // Render table
    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Session</th>
                    <th>Login Name</th>
                    <th>Host</th>
                    <th>Program</th>
                    <th>Login Time</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${paginatedUsers.map(u => `
                    <tr>
                        <td>${u.session_id}</td>
                        <td>${u.login_name}</td>
                        <td>${u.host_name || 'N/A'}</td>
                        <td>${u.program_name || 'N/A'}</td>
                        <td>${formatDateTime(u.login_time)}</td>
                        <td><span class="badge ${getStatusBadge(u.status)}">${u.status}</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    // Render pagination
    if (totalPages > 1) {
        let paginationHTML = `
            <button onclick="loadActiveUsers(${page - 1})" ${page === 1 ? 'disabled' : ''}>
                ← Previous
            </button>
            <span class="pagination-info">Page ${page} of ${totalPages} (${filteredUsers.length} users)</span>
        `;

        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
                paginationHTML += `
                    <button onclick="loadActiveUsers(${i})" class="${i === page ? 'active' : ''}">
                        ${i}
                    </button>
                `;
            } else if (i === page - 3 || i === page + 3) {
                paginationHTML += '<span>...</span>';
            }
        }

        paginationHTML += `
            <button onclick="loadActiveUsers(${page + 1})" ${page === totalPages ? 'disabled' : ''}>
                Next →
            </button>
        `;

        paginationContainer.innerHTML = paginationHTML;
    } else {
        paginationContainer.innerHTML = `<span class="pagination-info">${filteredUsers.length} users</span>`;
    }
}

async function loadUserList() {
    const users = await fetchAPI('/api/users/list');
    const select = document.getElementById('userSelect');
    
    if (users) {
        select.innerHTML = '<option value="">-- Select a user --</option>' +
            users.map(u => `<option value="${u}">${u}</option>`).join('');
    }
}

async function loadUserDetails() {
    const username = document.getElementById('userSelect').value;
    const container = document.getElementById('userDetails');
    
    if (!username) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = '<div class="loading">Loading user details...</div>';

    const separator = '?';
    const serverParam = currentServer ? `${separator}server=${currentServer}` : '';
    
    const [queries, tables, sessions] = await Promise.all([
        fetch(`${API_BASE}/api/users/${encodeURIComponent(username)}/queries${serverParam}`).then(r => r.json()).catch(() => []),
        fetch(`${API_BASE}/api/users/${encodeURIComponent(username)}/tables${serverParam}`).then(r => r.json()).catch(() => []),
        fetch(`${API_BASE}/api/users/${encodeURIComponent(username)}/sessions${serverParam}`).then(r => r.json()).catch(() => [])
    ]);

    let html = '';

    // Queries
    html += '<div class="user-section"><h3>Recent Queries</h3>';
    if (queries && queries.length > 0) {
        html += `<table><thead><tr><th>Session</th><th>Database</th><th>Query</th><th>Duration</th><th>CPU</th><th>Start Time</th></tr></thead><tbody>`;
        html += queries.slice(0, 10).map(q => `
            <tr>
                <td>${q.session_id}</td>
                <td>${q.database_name || 'N/A'}</td>
                <td><div class="query-text" title="${escapeHtml(q.query_text)}">${escapeHtml(truncate(q.query_text, 60))}<button class="copy-btn" onclick="event.stopPropagation(); copyQuery(\`${escapeForJs(q.query_text)}\`, this)">📋 Copy</button></div></td>
                <td>${formatDuration(q.duration_seconds)}</td>
                <td>${formatNumber(q.cpu_time)}</td>
                <td>${formatDateTime(q.start_time)}</td>
            </tr>
        `).join('');
        html += '</tbody></table>';
    } else {
        html += '<p class="empty-state">No running queries for this user</p>';
    }
    html += '</div>';

    // Tables
    html += '<div class="user-section"><h3>Tables Accessed</h3>';
    if (tables && tables.length > 0) {
        html += `<table><thead><tr><th>Database</th><th>Schema</th><th>Table</th><th>Reads</th><th>Writes</th></tr></thead><tbody>`;
        html += tables.map(t => `
            <tr>
                <td>${t.database_name}</td>
                <td>${t.schema_name || 'N/A'}</td>
                <td>${t.table_name}</td>
                <td>${formatNumber(t.total_reads)}</td>
                <td>${formatNumber(t.total_writes)}</td>
            </tr>
        `).join('');
        html += '</tbody></table>';
    } else {
        html += '<p class="empty-state">No table access data</p>';
    }
    html += '</div>';

    // Sessions
    html += '<div class="user-section"><h3>Active Sessions</h3>';
    if (sessions && sessions.length > 0) {
        html += `<table><thead><tr><th>Session ID</th><th>Host</th><th>Program</th><th>Login Time</th><th>Status</th></tr></thead><tbody>`;
        html += sessions.map(s => `
            <tr>
                <td>${s.session_id}</td>
                <td>${s.host_name || 'N/A'}</td>
                <td>${s.program_name || 'N/A'}</td>
                <td>${formatDateTime(s.login_time)}</td>
                <td><span class="badge ${getStatusBadge(s.status)}">${s.status}</span></td>
            </tr>
        `).join('');
        html += '</tbody></table>';
    } else {
        html += '<p class="empty-state">No active sessions</p>';
    }
    html += '</div>';

    container.innerHTML = html;
}

async function loadTableUsage(page = 1) {
    const tables = await fetchAPI('/api/tables/usage?limit=100');
    const container = document.getElementById('tableUsageTable');
    const paginationContainer = document.getElementById('tableUsagePagination');

    if (!tables || tables.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><p>No table usage data</p></div>';
        paginationContainer.innerHTML = '';
        return;
    }

    const itemsPerPage = 12;
    const totalPages = Math.ceil(tables.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const paginated = tables.slice(startIndex, startIndex + itemsPerPage);

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Database</th>
                    <th>Schema</th>
                    <th>Table</th>
                    <th>Reads</th>
                    <th>Writes</th>
                    <th>Last Read</th>
                    <th>Last Write</th>
                </tr>
            </thead>
            <tbody>
                ${paginated.map(t => `
                    <tr>
                        <td>${t.database_name}</td>
                        <td>${t.schema_name || 'N/A'}</td>
                        <td>${t.table_name}</td>
                        <td>${formatNumber(t.read_count)}</td>
                        <td>${formatNumber(t.write_count)}</td>
                        <td>${t.last_read ? formatDateTime(t.last_read) : 'N/A'}</td>
                        <td>${t.last_write ? formatDateTime(t.last_write) : 'N/A'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    paginationContainer.innerHTML = buildPagination(page, totalPages, tables.length, 'loadTableUsage');
}

async function loadUnusedTables(page = 1) {
    const tables = await fetchAPI('/api/tables/unused');
    const container = document.getElementById('unusedTablesTable');
    const paginationContainer = document.getElementById('unusedTablesPagination');

    if (!tables || tables.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>All tables are being used</p></div>';
        paginationContainer.innerHTML = '';
        return;
    }

    const itemsPerPage = 12;
    const totalPages = Math.ceil(tables.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const paginated = tables.slice(startIndex, startIndex + itemsPerPage);

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Database</th>
                    <th>Schema</th>
                    <th>Table</th>
                </tr>
            </thead>
            <tbody>
                ${paginated.map(t => `
                    <tr>
                        <td>${t.database_name}</td>
                        <td>${t.schema_name}</td>
                        <td>${t.table_name}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    paginationContainer.innerHTML = buildPagination(page, totalPages, tables.length, 'loadUnusedTables');
}

function buildPagination(page, totalPages, totalRecords, fnName) {
    if (totalPages <= 1) return `<span class="pagination-info">${totalRecords} records</span>`;

    let html = `
        <button onclick="${fnName}(${page - 1})" ${page === 1 ? 'disabled' : ''}>← Previous</button>
        <span class="pagination-info">Page ${page} of ${totalPages} (${totalRecords} records)</span>
    `;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
            html += `<button onclick="${fnName}(${i})" class="${i === page ? 'active' : ''}">${i}</button>`;
        } else if (i === page - 3 || i === page + 3) {
            html += '<span>...</span>';
        }
    }

    html += `<button onclick="${fnName}(${page + 1})" ${page === totalPages ? 'disabled' : ''}>Next →</button>`;
    return html;
}

async function loadSleepingSessions(page = 1) {
    const sessions = await fetchAPI('/api/sessions/sleeping');
    const container = document.getElementById('sleepingSessionsTable');
    const paginationContainer = document.getElementById('sessionsPagination');
    const actionsDiv = document.getElementById('sleepingSessionsActions');
    const resultDiv = document.getElementById('terminateResult');
    
    resultDiv.innerHTML = '';
    
    if (!sessions || sessions.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>No sleeping/suspended sessions found (idle > 30 minutes)</p></div>';
        paginationContainer.innerHTML = '';
        actionsDiv.style.display = 'none';
        return;
    }

    actionsDiv.style.display = 'block';

    const itemsPerPage = 12;
    const totalPages = Math.ceil(sessions.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const paginated = sessions.slice(startIndex, startIndex + itemsPerPage);

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Session ID</th>
                    <th>Login Name</th>
                    <th>Host</th>
                    <th>Program</th>
                    <th>Login Time</th>
                    <th>Last Request End</th>
                    <th>Idle Minutes</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${paginated.map(s => `
                    <tr>
                        <td>${s.session_id}</td>
                        <td>${s.login_name}</td>
                        <td>${s.host_name || 'N/A'}</td>
                        <td>${s.program_name || 'N/A'}</td>
                        <td>${formatDateTime(s.login_time)}</td>
                        <td>${formatDateTime(s.last_request_end_time)}</td>
                        <td><span class="badge badge-warning">${s.idle_minutes} min</span></td>
                        <td><span class="badge ${getStatusBadge(s.status)}">${s.status}</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <p style="margin-top: 10px; color: #666; font-size: 13px;">
            Found ${sessions.length} sleeping/suspended session(s) idle for more than 30 minutes.
        </p>
    `;

    paginationContainer.innerHTML = buildPagination(page, totalPages, sessions.length, 'loadSleepingSessions');
}

async function terminateSleepingSessions() {
    if (!confirm('Are you sure you want to terminate all sleeping/suspended sessions (idle > 30 minutes)?\n\nThis action cannot be undone!')) {
        return;
    }

    const resultDiv = document.getElementById('terminateResult');
    resultDiv.innerHTML = '<div class="loading">Terminating sessions...</div>';

    try {
        const separator = '?';
        const serverParam = currentServer ? `${separator}server=${currentServer}` : '';
        const response = await fetch(`${API_BASE}/api/sessions/terminate-sleeping${serverParam}`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error('Failed to terminate sessions');
        }

        const result = await response.json();
        
        if (result.terminated_count > 0) {
            resultDiv.innerHTML = `
                <div style="background: #10b981; color: white; padding: 15px; border-radius: 8px; text-align: center;">
                    <strong>✓ Success!</strong><br>
                    Terminated ${result.terminated_count} sleeping session(s).
                </div>
            `;
        } else {
            resultDiv.innerHTML = `
                <div style="background: #f59e0b; color: white; padding: 15px; border-radius: 8px; text-align: center;">
                    <strong>ℹ Info</strong><br>
                    No sessions were terminated. ${result.message || ''}
                </div>
            `;
        }

        // Refresh the list after 2 seconds
        setTimeout(() => {
            loadSleepingSessions();
        }, 2000);

    } catch (error) {
        console.error('Error terminating sessions:', error);
        resultDiv.innerHTML = `
            <div style="background: #ef4444; color: white; padding: 15px; border-radius: 8px; text-align: center;">
                <strong>✗ Error</strong><br>
                Failed to terminate sessions. Please try again.
            </div>
        `;
    }
}

// Utility functions
function formatNumber(num) {
    if (!num) return '0';
    return num.toLocaleString();
}

function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
}

function formatDateTime(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString();
}

function truncate(str, length) {
    if (!str) return '';
    return str.length > length ? str.substring(0, length) + '...' : str;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getStatusBadge(status) {
    if (!status) return 'badge-warning';
    const s = status.toLowerCase();
    if (s === 'running' || s === 'runnable') return 'badge-success';
    if (s === 'suspended' || s === 'sleeping') return 'badge-warning';
    return 'badge-danger';
}

function copyQuery(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        // Show success on button
        const originalText = btn.innerHTML;
        btn.innerHTML = '✓ Copied';
        btn.classList.add('copied');
        
        // Show toast notification
        showCopyToast('Query copied to clipboard!');
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.remove('copied');
        }, 2000);
    }).catch(() => {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        
        btn.innerHTML = '✓ Copied';
        btn.classList.add('copied');
        showCopyToast('Query copied to clipboard!');
        setTimeout(() => {
            btn.innerHTML = '📋 Copy';
            btn.classList.remove('copied');
        }, 2000);
    });
}

function showCopyToast(message) {
    // Remove existing toast
    const existing = document.querySelector('.copy-toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'copy-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 2500);
}

function escapeForJs(text) {
    if (!text) return '';
    return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/\r?\n/g, '\\n');
}

function selectQueryItem(el) {
    // Remove active class from all query items
    document.querySelectorAll('.query-item.active').forEach(item => {
        item.classList.remove('active');
    });
    // Add active class to clicked item
    el.classList.add('active');
}
