// Estado global da aplicação
let currentAppId = null;
let currentAppName = null;
let currentEditingAppId = null;
let editingToggleId = null;
let lastEditedTogglePath = null;

// Cache system to optimize API calls
const apiCache = {
    data: new Map(),
    ttl: 30000, // 30 seconds TTL
    
    set(key, value) {
        this.data.set(key, {
            value,
            timestamp: Date.now()
        });
    },
    
    get(key) {
        const item = this.data.get(key);
        if (!item) return null;
        
        // Check if expired
        if (Date.now() - item.timestamp > this.ttl) {
            this.data.delete(key);
            return null;
        }
        
        return item.value;
    },
    
    clear(pattern = null) {
        if (pattern) {
            // Clear specific pattern
            for (const key of this.data.keys()) {
                if (key.includes(pattern)) {
                    this.data.delete(key);
                }
            }
        } else {
            // Clear all
            this.data.clear();
        }
    },
    
    has(key) {
        return this.get(key) !== null;
    }
};

// Elementos DOM
const applicationsSection = document.getElementById('applications-section');
const togglesSection = document.getElementById('toggles-section');
const applicationsList = document.getElementById('applications-list');
const togglesList = document.getElementById('toggles-list');
const appNameElement = document.getElementById('app-name');
const globalLoadingSpinner = document.getElementById('global-loading-spinner');


// Event Listeners initialization function
async function initializeEventListeners() {
    // Verificar se os elementos necessários existem
    if (!document.getElementById('applications-section')) {
        console.log('[DEBUG] initializeEventListeners: Main app elements not found - skipping');
        return;
    }
    
    // Botões principais
    document.getElementById('new-app-btn').addEventListener('click', () => {
        openNewApplicationModal();
    });
    document.getElementById('new-toggle-btn').addEventListener('click', () => openModal('toggle-modal'));
    document.getElementById('back-to-apps').addEventListener('click', showApplications);
    
    // Formulários
    document.getElementById('app-form').addEventListener('submit', handleCreateApplication);
    document.getElementById('toggle-form').addEventListener('submit', handleCreateToggle);
    document.getElementById('edit-toggle-form').addEventListener('submit', handleUpdateToggle);
    
    // Event listener para o checkbox de regras de ativação
    document.getElementById('edit-toggle-activation-rule-input').addEventListener('change', function() {
        const activationRuleConfig = document.getElementById('activation-rule-config');
        if (this.checked) {
            activationRuleConfig.classList.remove('hidden');
        } else {
            activationRuleConfig.classList.add('hidden');
            // Limpar os campos quando desabilitado
            document.getElementById('activation-rule-type').value = '';
            document.getElementById('activation-rule-value').value = '';
            updateRuleValueHints('');
        }
    });

    // Event listener para o select de tipo de regra
    document.getElementById('activation-rule-type').addEventListener('change', function() {
        updateRuleValueHints(this.value);
        updateRuleValueIcon(this.value);
        updateRuleValuePlaceholder(this.value);
    });

    // Após carregar aplicações, verificar se deve abrir tela de toggles
    try {
        const savedAppId = sessionStorage.getItem('currentAppId');
        const savedAppName = sessionStorage.getItem('currentAppName');
        if (savedAppId && savedAppName) {
            console.log('[DEBUG] Restoring saved application:', savedAppId, savedAppName);
            await showToggles(savedAppId, savedAppName);
        }
    } catch (error) {
        console.error('[ERROR] Failed to restore saved application:', error);
        // If restoration fails, clear the saved state and continue
        sessionStorage.removeItem('currentAppId');
        sessionStorage.removeItem('currentAppName');
        sessionStorage.removeItem('current_application');
    }
}

// Funções de Modal
async function openNewApplicationModal() {
    try {
        // Reset form and set title
        currentEditingAppId = null;
        document.getElementById('app-modal-title').textContent = 'New Application';
        document.getElementById('app-form').reset();
        
        // Load teams for selection based on user role
        const currentUser = JSON.parse(sessionStorage.getItem('current_user') || '{}');
        const teamSelect = document.getElementById('app-team-select');
        
        // Clear previous options except the first one
        teamSelect.innerHTML = '<option value="">Select a team...</option>';
        
        let teamsResponse;
        if (currentUser.role === 'root') {
            // Root users see all teams
            teamsResponse = await apiCall('/teams');
        } else {
            // Admin users see only their associated teams
            teamsResponse = await apiCall('/profile/teams');
        }
        
        if (teamsResponse.success && teamsResponse.teams) {
            teamsResponse.teams.forEach(team => {
                const option = document.createElement('option');
                option.value = team.id;
                option.textContent = team.name;
                teamSelect.appendChild(option);
            });
        }
        
        // Open the modal
        openModal('app-modal');
        
    } catch (error) {
        console.error('Failed to load teams:', error);
        // Still open the modal even if teams failed to load
        openModal('app-modal');
    }
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error(`Modal with id "${modalId}" not found`);
        return;
    }
    
    // Check user permissions for toggle modals
    if ((modalId === 'toggle-modal' || modalId === 'edit-toggle-modal') && currentUser && currentUser.role === 'user') {
        // For users with 'user' role, configure modal as read-only
        configureToggleModalForViewOnly(modalId);
    } else if (modalId === 'toggle-modal' || modalId === 'edit-toggle-modal') {
        // For admin and root users, enable full functionality
        configureToggleModalForEdit(modalId);
    }
    
    // Manage modal stack for proper z-index handling
    if (!window.modalStack) {
        window.modalStack = [];
    }
    
    // Add to modal stack if not already present
    if (!window.modalStack.includes(modalId)) {
        window.modalStack.push(modalId);
    }
    
    // Update z-index based on stack position
    const baseZIndex = 1000;
    const zIndex = baseZIndex + (window.modalStack.length * 10);
    modal.style.zIndex = zIndex;
    
    modal.classList.remove('hidden');
    
    // Foco automático no input principal após abrir o modal
    setTimeout(() => {
        let focusElement = null;
        
        if (modalId === 'app-modal') {
            focusElement = document.getElementById('app-name-input');
        } else if (modalId === 'toggle-modal') {
            focusElement = document.getElementById('toggle-path-input');
        } else if (modalId === 'edit-toggle-modal') {
            focusElement = document.getElementById('edit-toggle-path-input');
        }
        
        // Only focus and select for non-read-only modals
        if (focusElement && modal.offsetHeight > 0 && !(currentUser && currentUser.role === 'user' && (modalId === 'toggle-modal' || modalId === 'edit-toggle-modal'))) {
            focusElement.focus();
            // Selecionar o texto se for um campo de edição
            if (modalId === 'edit-toggle-modal' || (modalId === 'app-modal' && currentEditingAppId)) {
                focusElement.select();
            }
        }
    }, 150); // Pequeno delay para garantir que o modal esteja completamente visível
}

// Configure toggle modal for view-only mode (users with 'user' role)
function configureToggleModalForViewOnly(modalId) {
    if (modalId === 'toggle-modal') {
        // For create toggle modal, hide the submit button since users can't create
        const submitButton = document.querySelector('#toggle-modal .btn-primary');
        if (submitButton) {
            submitButton.style.display = 'none';
        }
        
        // Disable the input field
        const pathInput = document.getElementById('toggle-path-input');
        if (pathInput) {
            pathInput.disabled = true;
            pathInput.readonly = true;
        }
        
        // Update modal title and subtitle
        const title = document.getElementById('toggle-modal-title');
        const subtitle = document.querySelector('#toggle-modal .modal-subtitle');
        if (title) title.textContent = 'View Toggle Information';
        if (subtitle) subtitle.textContent = 'Toggle information (view-only)';
        
    } else if (modalId === 'edit-toggle-modal') {
        // For edit toggle modal, hide the submit button
        const submitButton = document.querySelector('#edit-toggle-modal .btn-primary');
        if (submitButton) {
            submitButton.style.display = 'none';
        }
        
        // Disable all input fields
        const pathInput = document.getElementById('edit-toggle-path-input');
        const enabledInput = document.getElementById('edit-toggle-enabled-input');
        const activationRuleInput = document.getElementById('edit-toggle-activation-rule-input');
        const ruleTypeSelect = document.getElementById('activation-rule-type');
        const ruleValueInput = document.getElementById('activation-rule-value');
        
        if (pathInput) {
            pathInput.disabled = true;
            pathInput.readonly = true;
        }
        if (enabledInput) {
            enabledInput.disabled = true;
        }
        if (activationRuleInput) {
            activationRuleInput.disabled = true;
        }
        if (ruleTypeSelect) {
            ruleTypeSelect.disabled = true;
        }
        if (ruleValueInput) {
            ruleValueInput.disabled = true;
            ruleValueInput.readonly = true;
        }
        
        // Update modal title and subtitle
        const title = document.getElementById('edit-toggle-title');
        const subtitle = document.querySelector('#edit-toggle-modal .modal-subtitle');
        if (title) title.textContent = 'View Toggle Configuration';
        if (subtitle) subtitle.textContent = 'Toggle configuration (view-only)';
    }
}

// Configure toggle modal for edit mode (admin and root users)
function configureToggleModalForEdit(modalId) {
    if (modalId === 'toggle-modal') {
        // For create toggle modal, show the submit button
        const submitButton = document.querySelector('#toggle-modal .btn-primary');
        if (submitButton) {
            submitButton.style.display = 'flex';
        }
        
        // Enable the input field
        const pathInput = document.getElementById('toggle-path-input');
        if (pathInput) {
            pathInput.disabled = false;
            pathInput.readonly = false;
        }
        
        // Restore original title and subtitle
        const title = document.getElementById('toggle-modal-title');
        const subtitle = document.querySelector('#toggle-modal .modal-subtitle');
        if (title) title.textContent = 'New Toggle';
        if (subtitle) subtitle.textContent = 'Create a new feature toggle for this application';
        
    } else if (modalId === 'edit-toggle-modal') {
        // For edit toggle modal, show the submit button
        const submitButton = document.querySelector('#edit-toggle-modal .btn-primary');
        if (submitButton) {
            submitButton.style.display = 'flex';
        }
        
        // Enable all input fields
        const pathInput = document.getElementById('edit-toggle-path-input');
        const enabledInput = document.getElementById('edit-toggle-enabled-input');
        const activationRuleInput = document.getElementById('edit-toggle-activation-rule-input');
        const ruleTypeSelect = document.getElementById('activation-rule-type');
        const ruleValueInput = document.getElementById('activation-rule-value');
        
        if (pathInput) {
            pathInput.disabled = true; // Path should remain disabled even for edit
            pathInput.readonly = true; // Path should remain readonly even for edit
        }
        if (enabledInput) {
            enabledInput.disabled = false;
        }
        if (activationRuleInput) {
            activationRuleInput.disabled = false;
        }
        if (ruleTypeSelect) {
            ruleTypeSelect.disabled = false;
        }
        if (ruleValueInput) {
            ruleValueInput.disabled = false;
            ruleValueInput.readonly = false;
        }
        
        // Restore original title and subtitle
        const title = document.getElementById('edit-toggle-title');
        const subtitle = document.querySelector('#edit-toggle-modal .modal-subtitle');
        if (title) title.textContent = 'Edit Toggle Configuration';
        if (subtitle) subtitle.textContent = 'Configure toggle settings and activation rules';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error(`Modal with id "${modalId}" not found`);
        return;
    }
    
    modal.classList.add('hidden');
    
    // Remove from modal stack
    if (window.modalStack) {
        const index = window.modalStack.indexOf(modalId);
        if (index > -1) {
            window.modalStack.splice(index, 1);
        }
    }
    
    // Reset modal z-index
    modal.style.zIndex = '';
    
    // Limpar formulários
    if (modalId === 'app-modal') {
        document.getElementById('app-form').reset();
        document.getElementById('app-modal-title').textContent = 'New Application';
        currentEditingAppId = null;
    } else if (modalId === 'toggle-modal') {
        document.getElementById('toggle-form').reset();
        document.getElementById('toggle-modal-title').textContent = 'New Toggle';
    } else if (modalId === 'edit-toggle-modal') {
        document.getElementById('edit-toggle-form').reset();
        editingToggleId = null;
    } else if (modalId === 'secret-key-modal') {
        document.getElementById('secret-key-display').value = '';
    } else if (modalId === 'edit-user-modal') {
        // Limpar formulário de edição de usuário
        document.getElementById('edit-user-role').innerHTML = '<option value="">Select role...</option>';
        document.getElementById('edit-user-teams').innerHTML = '';
        document.getElementById('team-search-input').value = '';
        document.getElementById('teams-empty-state').classList.add('hidden');
        // Limpar dados globais
        allTeamsData = [];
        filteredTeamsData = [];
        window.currentEditingUserTeams = [];
    }
}

// Global modal management system
function closeTopModal() {
    if (window.modalStack && window.modalStack.length > 0) {
        const topModalId = window.modalStack[window.modalStack.length - 1];
        
        // Handle special modal types
        if (topModalId === 'users-modal') {
            closeUsersModal();
        } else {
            closeModal(topModalId);
        }
        
        return true;
    }
    return false;
}

// Add global ESC key handler
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        event.preventDefault();
        closeTopModal();
    }
});

// Funções de Navegação
function showApplications() {
    applicationsSection.classList.remove('hidden');
    togglesSection.classList.add('hidden');
    currentAppId = null;
    currentAppName = null;
    // Clear sessionStorage
    sessionStorage.removeItem('currentAppId');
    sessionStorage.removeItem('currentAppName');
    sessionStorage.removeItem('current_application');
    loadApplications();
}

async function showToggles(appId, appName) {
    currentAppId = appId;
    currentAppName = appName;
    appNameElement.textContent = `Toggles of ${appName}`;
    applicationsSection.classList.add('hidden');
    togglesSection.classList.remove('hidden');
    
    // Persistir no sessionStorage
    sessionStorage.setItem('currentAppId', appId);
    sessionStorage.setItem('currentAppName', appName);
    
    // Load application details and store in sessionStorage for approval system
    try {
        const appResponse = await apiCall(`/applications/${appId}`);
        if (appResponse && appResponse.data) {
            sessionStorage.setItem('current_application', JSON.stringify(appResponse.data));
        }
    } catch (error) {
        console.warn('Failed to load application details:', error);
    }
    
    loadToggles(appId);
}

// Helper function for onclick events (since they can't be async)
function handleShowToggles(appId, appName) {
    showToggles(appId, appName).catch(error => {
        console.error('Error showing toggles:', error);
        showError('Erro ao carregar toggles da aplicação');
    });
}

// Funções de API
async function apiCall(url, options = {}) {
    const method = options.method || 'GET';
    const cacheKey = `${method}:${url}`;
    
    // Check cache for GET requests only (but skip cache for ALL approval endpoints)
    const skipCache = url.includes('/approval/') || 
                     options.forceRefresh === true;
    
    if (method === 'GET' && !skipCache && apiCache.has(cacheKey)) {
        const cachedData = apiCache.get(cacheKey);
        console.log(`[DEBUG] apiCall: Using cached data for ${url}`);
        return cachedData;
    }
    
    if (skipCache) {
        console.log(`[DEBUG] apiCall: Skipping cache for critical endpoint ${url}`);
    }
    
    console.log(`[DEBUG] apiCall: Making request to ${url}`, {
        method,
        headers: options.headers,
        hasBody: !!options.body
    });
    
    try {
        // Headers básicos (cookies são enviados automaticamente)
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        const response = await fetch(url, {
            headers,
            credentials: 'include', // Include cookies in requests
            ...options
        });
        
        console.log(`[DEBUG] apiCall: Response received`, {
            url,
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries())
        });
        
        if (!response.ok) {
            // Verificar se é erro de autenticação
            if (response.status === 401) {
                console.log(`[DEBUG] apiCall: 401 Unauthorized - redirecting to login`);
                console.log(`[DEBUG] apiCall: Current location:`, window.location.href);
                console.log(`[DEBUG] apiCall: Cookies:`, document.cookie);
                
                // Verificar se já estamos na página de login para evitar loop
                if (window.location.pathname.includes('/login')) {
                    console.log(`[DEBUG] apiCall: Already on login page, not redirecting to avoid loop`);
                    return;
                }
                
                console.log(`[DEBUG] apiCall: Redirecting to /login`);
                // Redirecionar para login (cookies serão limpos pelo servidor)
                window.location.href = '/login';
                return;
            }
            
            // Verificar se é precondição requerida (troca de senha)
            if (response.status === 428) {
                console.log(`[DEBUG] apiCall: 428 Precondition Required - password change required`);
                
                try {
                    const errorData = await response.json();
                    if (errorData.redirect === '/change-password') {
                        console.log(`[DEBUG] apiCall: Redirecting to change password page`);
                        
                        // Verificar se já estamos na página de troca de senha para evitar loop
                        if (window.location.pathname.includes('/change-password')) {
                            console.log(`[DEBUG] apiCall: Already on change-password page, not redirecting to avoid loop`);
                            return { success: false, error: 'Password change required' };
                        }
                        
                        window.location.href = '/change-password';
                        return { success: false, error: 'Redirecting to password change' };
                    }
                } catch (parseError) {
                    console.warn('Could not parse 428 response:', parseError);
                }
                
                // Fallback - mostrar mensagem de erro
                showError('Password change required. Please change your password first.');
                return { success: false, error: 'Password change required' };
            }
            
            // Tentar extrair a mensagem de erro da resposta JSON
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                const errorData = await response.json();
                
                // Verificar se é a estrutura de erro padronizada
                if (errorData.code && errorData.message) {
                    // Se há detalhes de erro, usar apenas os detalhes
                    if (errorData.details && errorData.details.length > 0) {
                        const detailMessages = errorData.details.map(detail => 
                            `${detail.field}: ${detail.message}`
                        );
                        errorMessage = detailMessages.join('\n');
                    } else {
                        // Se não há detalhes, usar apenas a mensagem principal
                        errorMessage = errorData.message;
                    }
                } else if (errorData.message) {
                    // Fallback para outras estruturas de erro
                    errorMessage = errorData.message;
                }
            } catch (parseError) {
                // Se não conseguir fazer parse do JSON, usar a mensagem padrão
                console.warn('Could not parse error response:', parseError);
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        console.log(`[DEBUG] apiCall: Success response data:`, data);
        
        // Check if the response indicates approval is required
        if (data.approval_required === true && data.message === "action requires approval") {
            console.log(`[DEBUG] apiCall: Action intercepted by approval middleware`);
            // Throw an error that can be caught specifically to handle approval flow
            const approvalError = new Error(`Approval required for ${data.action_type}`);
            approvalError.approvalRequired = true;
            approvalError.actionType = data.action_type;
            approvalError.originalResponse = data;
            throw approvalError;
        }
        
        // Cache GET requests (but not critical approval endpoints)
        if (method === 'GET' && !skipCache) {
            apiCache.set(cacheKey, data);
        }
        
        // Clear related cache for non-GET requests to ensure fresh data
        if (method !== 'GET') {
            // Clear approval-related cache when making approval changes
            if (url.includes('/approval/')) {
                apiCache.clear('/approval/');
            }
            // Clear applications cache when making application changes
            if (url.includes('/applications')) {
                apiCache.clear('/applications');
                // Also clear approval cache as application changes may create/delete approval requests
                apiCache.clear('/approval/');
            }
            // Clear toggles cache when making toggle changes
            if (url.includes('/toggles')) {
                apiCache.clear('/toggles');
                // Also clear approval cache as toggle changes may create approval requests
                apiCache.clear('/approval/');
            }
        }
        
        // Debug específico para endpoints problemáticos
        if (url.includes('/approval/my-approver-teams')) {
            console.log(`[DEBUG] MY-APPROVER-TEAMS Response:`, {
                url,
                status: response.status,
                dataType: typeof data,
                dataKeys: Object.keys(data || {}),
                data: JSON.stringify(data),
                arrayLength: data?.data?.length
            });
        }
        
        if (url.includes('/approval/requests/approvable')) {
            console.log(`[DEBUG] APPROVABLE-REQUESTS Response:`, {
                url,
                status: response.status,
                dataType: typeof data,
                dataKeys: Object.keys(data || {}),
                data: JSON.stringify(data),
                arrayLength: data?.data?.length
            });
        }
        
        return data;
    } catch (error) {
        console.error('[DEBUG] API Error:', error);
        console.log(`[DEBUG] apiCall: Error details:`, {
            url,
            method: options.method || 'GET',
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

// Funções de Aplicação
async function loadApplications() {
    console.log('[DEBUG] loadApplications: Starting to load applications');
    console.log('[DEBUG] loadApplications: Current location:', window.location.href);
    console.log('[DEBUG] loadApplications: Current cookies:', document.cookie);
    
    showGlobalLoading();
    try {
        // showLoading(applicationsList); // Remover esta linha, pois o spinner global será usado
        console.log('[DEBUG] loadApplications: Making API call to /applications');
        const applications = await apiCall('/applications');
        console.log('[DEBUG] loadApplications: Successfully received applications:', applications);
        renderApplications(applications);
    } catch (error) {
        console.log('[DEBUG] loadApplications: Error occurred:', error);
        showEmptyState(applicationsList, 'No applications found', 'Create your first application to manage feature toggles and get started!', 'applications');
    } finally {
        console.log('[DEBUG] loadApplications: Hiding global loading');
        hideGlobalLoading();
    }
}

async function handleCreateApplication(event) {
    event.preventDefault();
    
    const name = document.getElementById('app-name-input').value.trim();
    const teamId = document.getElementById('app-team-select').value;
    
    if (!name) {
        showError('Application name is required');
        return;
    }
    
    try {
        if (currentEditingAppId) {
            // Editando aplicação existente
            const updateData = { name };
            if (teamId) {
                updateData.team_id = teamId;
            }
            
            await apiCall(`/applications/${currentEditingAppId}`, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });
            showSuccess('Application updated successfully!');
            currentEditingAppId = null;
        } else {
            // Criando nova aplicação
            if (!teamId) {
                showError('Please select a team for this application');
                return;
            }
            
            // Check if approval is required for application creation
            const approvalRequired = await checkIfApprovalRequired('application_create');
            
            if (approvalRequired) {
                // Create approval request instead of executing immediately
                try {
                    const actionData = { name: name, team_id: teamId };
                    const description = `Criar aplicação: ${name}`;
                    
                    // For application creation, we need to create a generic approval request
                    const currentUser = JSON.parse(sessionStorage.getItem('current_user') || '{}');
                    const approvalData = {
                        action_type: 'application_create',
                        description: description,
                        requested_by: currentUser.id,
                        team_id: teamId,
                        application_id: null,
                        toggle_id: null,
                        action_data: actionData
                    };
                    
                    const response = await apiCall('/approval/requests', {
                        method: 'POST',
                        body: JSON.stringify(approvalData)
                    });
                    
                    // Immediately refresh approval-related UI components
                    console.log('[DEBUG] Application create approval request created successfully, refreshing UI...');
                    
                    // Refresh pending count badge
                    await loadPendingRequestsCount();
                    
                    // If approval modal is open, refresh the current tab
                    const approvalModal = document.getElementById('approval-modal');
                    if (approvalModal && approvalModal.classList.contains('show')) {
                        console.log('[DEBUG] Approval modal is open, refreshing approval requests list...');
                        await loadApprovalRequests();
                    }
                    
                    // Force a menu visibility update to ensure menu stays visible for approvers
                    await updateApprovalMenuVisibility();
                    
                    // Show approval required message (simplified to avoid permission issues)
                    showApprovalRequiredMessage([]);
                    closeModal('app-modal');
                    return; // Exit early when approval is required
                    
                } catch (approvalError) {
                    console.error('Error creating approval request:', approvalError);
                    showError('Erro ao criar solicitação de aprovação. Tente novamente.');
                    return;
                }
                
            } else {
                // Execute the creation immediately if no approval required
                await apiCall('/applications', {
                    method: 'POST',
                    body: JSON.stringify({ 
                        name: name,
                        team_id: teamId
                    })
                });
                showSuccess('Application created successfully!');
            }
        }
        
        closeModal('app-modal');
        loadApplications();
    } catch (error) {
        showError('Error saving application');
    }
}

function renderApplications(applications) {
    if (!applications || applications.length === 0) {
        showEmptyState(applicationsList, 'No applications found', 'Create your first application to manage feature toggles and get started!', 'applications');
        return;
    }
    
    // Check user role for permissions
    const currentUser = JSON.parse(sessionStorage.getItem('current_user') || '{}');
    const isAdminOrRoot = currentUser.role === 'admin' || currentUser.role === 'root';
    
    applicationsList.innerHTML = applications.map(app => `
        <div class="card app-card" data-app-id="${app.id}">
            <div class="app-card-header">
                <div class="app-card-header-right">
                    <button class="icon-btn" title="Ver Toggles" onclick="event.stopPropagation(); handleShowToggles('${app.id}', '${app.name}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                    ${isAdminOrRoot ? `
                    <button class="icon-btn" title="Gerar Secret Key" onclick="event.stopPropagation(); generateSecretKey('${app.id}', '${app.name}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M7 10V7C7 4.79086 8.79086 3 11 3H13C15.2091 3 17 4.79086 17 7V10"/>
                            <rect x="5" y="10" width="14" height="11" rx="2"/>
                            <circle cx="12" cy="15.5" r="1.5"/>
                            <path d="M12 17L12 19"/>
                            <path d="M21 10L22 9"/>
                            <path d="M22 15L21 14"/>
                            <path d="M21 18L22 19"/>
                        </svg>
                    </button>
                    <button class="icon-btn" title="Editar Aplicação" onclick="event.stopPropagation(); editApplication('${app.id}', '${app.name}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="icon-btn danger" title="Remover Aplicação" onclick="event.stopPropagation(); deleteApplication('${app.id}', '${app.name}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3,6 5,6 21,6"/>
                            <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
                            <line x1="10" y1="11" x2="10" y2="17"/>
                            <line x1="14" y1="11" x2="14" y2="17"/>
                        </svg>
                    </button>
                    ` : ''}
                </div>
            </div>
            <div class="toggle-divider"></div>
            <div class="app-card-body">
                <div class="app-title-row">
                    <a href="#" class="app-title-link" onclick="event.preventDefault(); handleShowToggles('${app.id}', '${app.name}')">${app.name}</a>
                </div>
                <div class="app-counters-row">
                    <span title="Toggles enabled" class="counter enabled"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M9 12l2 2l4-4"/></svg> ${app.toggles_enabled}</span>
                    <span title="Toggles disabled" class="counter disabled"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="8"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg> ${app.toggles_disabled}</span>
                    <span title="Total of toggles" class="counter total"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg> ${app.toggles_total}</span>
                </div>
                <div class="app-toggles-list" id="app-toggles-list-${app.id}" style="display:none;"></div>
            </div>
        </div>
    `).join('');
}

// Funções de Toggle
async function loadToggles(appId) {
    showGlobalLoading();
    try {
        // showLoading(togglesList); // Remover esta linha, pois o spinner global será usado
        const response = await apiCall(`/applications/${appId}/toggles?hierarchy=true`);
        renderToggles(response.toggles);
    } catch (error) {
        showEmptyState(togglesList, 'No toggles found for this application', 'Start by creating your first feature toggle to control application behavior.', 'toggles');
    } finally {
        hideGlobalLoading();
    }
}

async function handleCreateToggle(event) {
    event.preventDefault();
    
    const path = document.getElementById('toggle-path-input').value.trim();
    
    if (!path) return;
    
    try {
        // Check if approval is required for toggle creation
        const approvalRequired = await checkIfApprovalRequired('toggle_create');
        
        if (approvalRequired) {
            // Create approval request instead of executing immediately
            try {
                const actionData = { toggle: path };
                const description = `Create toggle: ${path}`;
                
                await createApprovalRequestForToggle(
                    'toggle_create',
                    null, // No toggle ID for creation
                    actionData,
                    description
                );
                
                // Show approval required message (simplified to avoid permission issues)
                showApprovalRequiredMessage([]);
                closeModal('toggle-modal');
                
            } catch (approvalError) {
                console.error('Error creating approval request:', approvalError);
                showError('Erro ao criar solicitação de aprovação. Tente novamente.');
            }
            
        } else {
            // Execute the creation immediately if no approval required
            await apiCall(`/applications/${currentAppId}/toggles`, {
                method: 'POST',
                body: JSON.stringify({ toggle: path })
            });
            
            closeModal('toggle-modal');
            showSuccess('Toggle created successfully!');
            loadToggles(currentAppId);
        }
    } catch (error) {
        console.error('Error creating toggle:', error);
        showError('Error creating toggle');
    }
}

async function handleUpdateToggle(event) {
    event.preventDefault();
    const enabled = document.getElementById('edit-toggle-enabled-input').checked;
    const hasActivationRule = document.getElementById('edit-toggle-activation-rule-input').checked;
    
    if (!editingToggleId) return;
    
    let updateData = { enabled };
    let actionType = 'toggle_update';
    let description = `Atualizar toggle: `;
    
    // Get current toggle data to compare changes
    let currentToggle;
    try {
        // Get specific toggle by ID instead of all toggles
        currentToggle = await apiCall(`/applications/${currentAppId}/toggles/${editingToggleId}`);
    } catch (error) {
        console.error('Error getting current toggle data:', error);
        showError('Error getting current toggle data');
        return;
    }
    
    if (!currentToggle) {
        showError('Toggle not found');
        return;
    }
    
    // Determine specific action type and description based on changes
    if (currentToggle.enabled !== enabled) {
        actionType = enabled ? 'toggle_enable' : 'toggle_disable';
        description = `${enabled ? 'Enable' : 'Disable'} toggle ${currentToggle.value || currentToggle.id}`;
    }
    
    // Se tem regra de ativação, incluir os dados da regra
    if (hasActivationRule) {
        const ruleType = document.getElementById('activation-rule-type').value;
        const ruleValue = document.getElementById('activation-rule-value').value;
        
        if (!ruleType || !ruleValue) {
            showError('Rule type and value are required when activation rules are enabled');
            return;
        }
        
        updateData.has_activation_rule = true;
        updateData.activation_rule = {
            type: ruleType,
            value: ruleValue
        };
        
        // If rule is being added/changed, this requires approval
        const hasCurrentRule = currentToggle.has_activation_rule;
        const currentRule = currentToggle.activation_rule;
        const ruleChanged = !hasCurrentRule || 
                           currentRule?.type !== ruleType || 
                           currentRule?.value !== ruleValue;
        
        if (ruleChanged) {
            actionType = 'toggle_rule';
            description = `Change activation rule for toggle ${currentToggle.value || currentToggle.id}`;
        }
    } else {
        updateData.has_activation_rule = false;
        updateData.activation_rule = null;
        
        // If rule is being removed, this requires approval
        if (currentToggle.has_activation_rule) {
            actionType = 'toggle_rule';
            description = `Remove activation rule from toggle ${currentToggle.value || currentToggle.id}`;
        }
    }
    
    try {
        // Check if approval is required for this action
        const approvalRequired = await checkIfApprovalRequired(actionType);
        
        if (approvalRequired) {
            // Create approval request instead of executing immediately
            try {
                await createApprovalRequestForToggle(
                    actionType,
                    editingToggleId,
                    updateData,
                    description
                );
                
                // Get team info for user notification
                console.log('[DEBUG] Getting team info for approval notification...');
                let currentApp = JSON.parse(sessionStorage.getItem('current_application') || '{}');
                
                // If current_application is not available, fetch it
                if (!currentApp.teams && currentAppId) {
                    console.log('[DEBUG] current_application missing teams info, fetching from API...');
                    const appResponse = await apiCall(`/applications/${currentAppId}`);
                    currentApp = appResponse;
                    sessionStorage.setItem('current_application', JSON.stringify(currentApp));
                }
                
                // Get team info from app.teams (multiple teams possible)
                const approverTeams = currentApp.teams || [];
                console.log('[DEBUG] Approver teams found:', approverTeams);
                
                showApprovalRequiredMessage(approverTeams);
                closeModal('edit-toggle-modal');
                editingToggleId = null;
                
            } catch (approvalError) {
                console.error('Error creating approval request:', approvalError);
                showError('Erro ao criar solicitação de aprovação. Tente novamente.');
            }
            
        } else {
            // Execute the change immediately if no approval required
            try {
                await apiCall(`/applications/${currentAppId}/toggles/${editingToggleId}`, {
                    method: 'PUT',
                    body: JSON.stringify(updateData)
                });
                showSuccess('Toggle updated successfully!');
                closeModal('edit-toggle-modal');
                loadToggles(currentAppId);
                editingToggleId = null;
            } catch (error) {
                // Check if this is an approval-required error
                if (error.approvalRequired === true) {
                    console.log(`[DEBUG] Middleware intercepted action requiring approval:`, error.actionType);
                    
                    // Get team info for user notification
                    console.log('[DEBUG] Getting team info for approval notification...');
                    let currentApp = JSON.parse(sessionStorage.getItem('current_application') || '{}');
                    
                    // If current_application is not available, fetch it
                    if (!currentApp.teams && currentAppId) {
                        console.log('[DEBUG] current_application missing teams info, fetching from API...');
                        const appResponse = await apiCall(`/applications/${currentAppId}`);
                        currentApp = appResponse;
                        sessionStorage.setItem('current_application', JSON.stringify(currentApp));
                    }
                    
                    // Get team info from app.teams (multiple teams possible)
                    const approverTeams = currentApp.teams || [];
                    console.log('[DEBUG] Approver teams found:', approverTeams);
                    
                    showApprovalRequiredMessage(approverTeams);
                    closeModal('edit-toggle-modal');
                    editingToggleId = null;
                    
                    // Refresh to show any approval requests created
                    setTimeout(() => {
                        loadToggles(currentAppId);
                    }, 1000);
                } else {
                    // Handle other errors normally
                    console.error('Error updating toggle:', error);
                    showError('Error updating toggle: ' + error.message);
                }
            }
        }
        
    } catch (error) {
        console.error('Error updating toggle:', error);
        showError('Error saving toggle');
    }
}

// Helper functions for approval workflow
async function checkIfApprovalRequired(actionType) {
    try {
        console.log('[DEBUG] Checking approval requirements for action:', actionType);
        
        // First check if approval system is enabled
        const enabledResponse = await apiCall('/approval/enabled');
        console.log('[DEBUG] Approval enabled response:', enabledResponse);
        
        if (!enabledResponse.data || !enabledResponse.data.enabled) {
            console.log('[DEBUG] Approval system is disabled');
            return false;
        }
        
        // Then check if this specific action requires approval
        const requiredResponse = await apiCall(`/approval/required?action_type=${actionType}`);
        console.log('[DEBUG] Approval required response:', requiredResponse);
        
        return requiredResponse.data && requiredResponse.data.required === true;
    } catch (error) {
        console.error('Error checking approval requirements:', error);
        // Default to false if there's an error checking approval requirements
        return false;
    }
}

async function createApprovalRequestForToggle(actionType, toggleId, actionData, description) {
    try {
        // Get current application and team info
        const currentUser = JSON.parse(sessionStorage.getItem('current_user') || '{}');
        let currentApp = JSON.parse(sessionStorage.getItem('current_application') || '{}');
        
        // If current_application is not available, fetch it
        if (!currentApp.teams && currentAppId) {
            console.log('[DEBUG] current_application missing teams info, fetching from API...');
            const appResponse = await apiCall(`/applications/${currentAppId}`);
            currentApp = appResponse;
            sessionStorage.setItem('current_application', JSON.stringify(currentApp));
        }
        
        // Get the first team ID (apps are associated with teams via team_applications table)
        const teamId = currentApp.teams && currentApp.teams.length > 0 ? currentApp.teams[0].id : null;
        
        if (!teamId) {
            throw new Error('No team associated with this application');
        }
        
        console.log('[DEBUG] Creating approval request with data:', {
            actionType,
            toggleId,
            teamId,
            currentUser: currentUser.id
        });
        
        const approvalData = {
            action_type: actionType,
            description: description,
            requested_by: currentUser.id,
            team_id: teamId,
            application_id: currentAppId,
            toggle_id: toggleId,
            action_data: actionData
        };
        
        const response = await apiCall('/approval/requests', {
            method: 'POST',
            body: JSON.stringify(approvalData)
        });
        
        // Immediately refresh approval-related UI components
        console.log('[DEBUG] Approval request created successfully, refreshing UI...');
        
        // Refresh pending count badge
        await loadPendingRequestsCount();
        
        // If approval modal is open, refresh the current tab
        const approvalModal = document.getElementById('approval-modal');
        if (approvalModal && approvalModal.classList.contains('show')) {
            console.log('[DEBUG] Approval modal is open, refreshing approval requests list...');
            await loadApprovalRequests();
        }
        
        // Force a menu visibility update to ensure menu stays visible for approvers
        await updateApprovalMenuVisibility();
        
        return response.data;
    } catch (error) {
        console.error('Error creating approval request:', error);
        throw error;
    }
}

function showApprovalRequiredMessage(approverTeams) {
    console.log('[DEBUG] showApprovalRequiredMessage called with:', approverTeams);
    
    if (!approverTeams || !Array.isArray(approverTeams)) {
        console.error('[DEBUG] approverTeams is not a valid array:', approverTeams);
        showInfo('Sua alteração foi enviada para aprovação. Você será notificado quando a aprovação for processada.');
        return;
    }
    
    const teamNames = approverTeams
        .filter(team => team && team.name) // Filter out invalid teams
        .map(team => team.name)
        .join(', ');
    
    if (teamNames) {
        showInfo(`Sua alteração foi enviada para aprovação dos administradores do time: ${teamNames}. Você será notificado quando a aprovação for processada.`);
    } else {
        showInfo('Sua alteração foi enviada para aprovação. Você será notificado quando a aprovação for processada.');
    }
}

function renderToggles(toggles) {
    if (!toggles || toggles.length === 0) {
        showEmptyState(togglesList, 'No toggles found for this application', 'Start by creating your first feature toggle to control application behavior.', 'toggles');
        return;
    }
    
    // Check user role for permissions
    const currentUser = JSON.parse(sessionStorage.getItem('current_user') || '{}');
    const isAdminOrRoot = currentUser.role === 'admin' || currentUser.role === 'root';
    
    // Extrair todos os caminhos folha
    const leafNodes = [];
    function traverse(node, path = [], enabledPath = [], idPath = []) {
        // Verificar se o node tem a propriedade value
        if (!node.value) {
            // Se não tem value, usar o ID como fallback
            node.value = node.id;
        }
        
        const newPath = [...path, node.value];
        const newEnabledPath = [...enabledPath, node.enabled];
        const newIdPath = [...idPath, node.id];
        
        if (!node.toggles || node.toggles.length === 0) {
            leafNodes.push({
                id: node.id,
                path: newPath,
                enabledPath: newEnabledPath,
                idPath: newIdPath
            });
        } else {
            node.toggles.forEach(child => traverse(child, newPath, newEnabledPath, newIdPath));
        }
    }
    
    toggles.forEach(root => traverse(root));

    if (leafNodes.length === 0) {
        showEmptyState(togglesList, 'No toggles found for this application', 'Start by creating your first feature toggle to control application behavior.', 'toggles');
        return;
    }

    togglesList.innerHTML = leafNodes.map(toggle => {
        // Status: verde (todos true), vermelho (todos false), amarelo (misto)
        const allEnabled = toggle.enabledPath.every(e => e);
        const allDisabled = toggle.enabledPath.every(e => !e);
        let status = 'yellow';
        if (allEnabled) status = 'green';
        else if (allDisabled) status = 'red';

        // SVG marcador
        let statusSVG = '';
        if (status === 'green') {
            statusSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M9 12l2 2l4-4"/></svg>`;
        } else if (status === 'yellow') {
            statusSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2"><circle cx="12" cy="12" r="8"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;
        } else {
            statusSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="8"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`;
        }

        // Caminho concatenado
        const pathStr = toggle.path.join('.');
        // Links: aplicar disabled a partir do primeiro false
        let disabledFound = false;
        const pathLinks = toggle.path.map((part, idx) => {
            if (!disabledFound && !toggle.enabledPath[idx]) disabledFound = true;
            const linkClass = disabledFound ? 'path-link disabled' : 'path-link';
            const toggleId = toggle.idPath[idx];
            if (isAdminOrRoot) {
                return `<a href="#" class="${linkClass}" onclick="editTogglePath('${toggleId}'); return false;">${part}</a>`;
            } else {
                return `<span class="${linkClass}">${part}</span>`;
            }
        }).join('<span class="path-separator">.</span>');

        return `
            <div class="toggle-card">
                <div class="toggle-card-header">
                    <div class="toggle-header-left"><span class="toggle-status-dot">${statusSVG}</span></div>
                    <div class="toggle-header-right">
                        ${isAdminOrRoot ? `
                        <div class="toggle-controls">
                            <button class="icon-btn danger" title="Excluir Toggle" onclick="deleteToggle('${toggle.idPath[toggle.idPath.length - 1]}', '${pathStr}')">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3,6 5,6 21,6"/>
                                    <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
                                    <line x1="10" y1="11" x2="10" y2="17"/>
                                    <line x1="14" y1="11" x2="14" y2="17"/>
                                </svg>
                            </button>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="toggle-divider"></div>
                <div class="toggle-card-body">
                    <span class="toggle-path-line">${pathLinks}</span>
                    ${toggle.has_activation_rule ? `<span class="toggle-rule-indicator">RULE</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    // Quick toggle switches were removed - no longer needed
    // Event listeners for quick switches are no longer necessary
}

// Quick toggle switches were removed from cards
// This function is no longer needed since toggles can only be changed via modal

// Funções de Edição
function editToggle(path, enabled) {
    lastEditedTogglePath = path;
    document.getElementById('edit-toggle-path-input').value = path;
    document.getElementById('edit-toggle-enabled-input').checked = enabled;
    document.getElementById('edit-toggle-title').textContent = 'Edit Toggle';
    openModal('edit-toggle-modal');
}

async function editTogglePath(toggleId) {
    try {
        const toggle = await apiCall(`/applications/${currentAppId}/toggles/${toggleId}`);
        editingToggleId = toggle.id;
        document.getElementById('edit-toggle-path-input').value = toggle.path;
        document.getElementById('edit-toggle-enabled-input').checked = toggle.enabled;
        
        // Configurar regras de ativação
        const hasActivationRule = toggle.has_activation_rule || false;
        document.getElementById('edit-toggle-activation-rule-input').checked = hasActivationRule;
        
        const activationRuleConfig = document.getElementById('activation-rule-config');
        if (hasActivationRule && toggle.activation_rule) {
            activationRuleConfig.classList.remove('hidden');
            document.getElementById('activation-rule-type').value = toggle.activation_rule.type || '';
            document.getElementById('activation-rule-value').value = toggle.activation_rule.value || '';
        } else {
            activationRuleConfig.classList.add('hidden');
            document.getElementById('activation-rule-type').value = '';
            document.getElementById('activation-rule-value').value = '';
        }
        
        document.getElementById('edit-toggle-title').textContent = 'Edit Toggle';
        openModal('edit-toggle-modal');
    } catch (e) {
        showError('Error finding toggle for editing');
    }
}

// Função para encontrar toggle por path na estrutura hierárquica
function findToggleByPath(toggles, path) {
    const parts = path.split('.');
    let nodes = toggles;
    let node = null;
    for (let i = 0; i < parts.length; i++) {
        node = Array.isArray(nodes)
            ? nodes.find(n => n.value === parts[i])
            : null;
        if (!node) return null;
        nodes = node.toggles || [];
    }
    return node;
}

async function deleteToggle(toggleId, togglePath) {
    // Criar modal de confirmação profissional
    const confirmModal = createConfirmModal(
        'Delete Toggle',
        `Are you sure you want to delete the toggle "${togglePath}"?`,
        'This action will permanently delete this toggle and all its child toggles. This action cannot be undone.',
        'Delete',
        'Cancel'
    );
    
    document.body.appendChild(confirmModal);
    
    // Aguardar resposta do usuário
    const confirmed = await new Promise((resolve) => {
        const confirmBtn = confirmModal.querySelector('.confirm-btn');
        const cancelBtn = confirmModal.querySelector('.cancel-btn');
        
        confirmBtn.onclick = () => {
            document.body.removeChild(confirmModal);
            resolve(true);
        };
        
        cancelBtn.onclick = () => {
            document.body.removeChild(confirmModal);
            resolve(false);
        };
        
        // Fechar ao clicar fora do modal
        confirmModal.onclick = (e) => {
            if (e.target === confirmModal) {
                document.body.removeChild(confirmModal);
                resolve(false);
            }
        };
    });
    
    if (!confirmed) {
        return;
    }
    
    try {
        // Check if approval is required for toggle deletion
        const approvalRequired = await checkIfApprovalRequired('toggle_delete');
        
        if (approvalRequired) {
            // Create approval request instead of executing immediately
            try {
                const actionData = { toggle_id: toggleId };
                const description = `Delete toggle: ${togglePath}`;
                
                await createApprovalRequestForToggle(
                    'toggle_delete',
                    toggleId,
                    actionData,
                    description
                );
                
                // Show approval required message (simplified to avoid permission issues)
                showApprovalRequiredMessage([]);
                
            } catch (approvalError) {
                console.error('Error creating approval request:', approvalError);
                showError('Erro ao criar solicitação de aprovação. Tente novamente.');
            }
            
        } else {
            // Execute the deletion immediately if no approval required
            await apiCall(`/applications/${currentAppId}/toggles/${toggleId}`, {
                method: 'DELETE'
            });
            
            showSuccess('Toggle deleted successfully!');
            loadToggles(currentAppId);
        }
    } catch (error) {
        console.error('Error deleting toggle:', error);
        showError('Error deleting toggle');
    }
}

// Função moderna para modal de confirmação profissional
async function showConfirmationModal(title, message, description, confirmText, cancelText, iconType = 'danger') {
    return new Promise((resolve) => {
        const modalId = 'confirmation-modal-' + Date.now();
        
        let iconSVG = '';
        let iconClass = '';
        
        if (iconType === 'danger') {
            iconSVG = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M15 9l-6 6"/>
                    <path d="M9 9l6 6"/>
                </svg>
            `;
            iconClass = 'confirmation-modal-danger';
        } else if (iconType === 'warning') {
            iconSVG = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
                </svg>
            `;
            iconClass = 'confirmation-modal-warning';
        } else if (iconType === 'info') {
            iconSVG = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 16v-4"/>
                    <path d="M12 8h.01"/>
                </svg>
            `;
            iconClass = 'confirmation-modal-info';
        }
        
        const modalHTML = `
            <div id="${modalId}" class="modal-overlay confirmation-modal">
                <div class="confirmation-modal-container">
                    <div class="confirmation-modal-content ${iconClass}">
                        <div class="confirmation-modal-header">
                            <div class="confirmation-modal-icon">
                                ${iconSVG}
                            </div>
                            <div class="confirmation-modal-text">
                                <h3 class="confirmation-modal-title">${title}</h3>
                                <p class="confirmation-modal-message">${message}</p>
                                <p class="confirmation-modal-description">${description}</p>
                            </div>
                        </div>
                        
                        <div class="confirmation-modal-actions">
                            <button type="button" class="btn btn-secondary confirmation-cancel-btn">
                                ${cancelText}
                            </button>
                            <button type="button" class="btn btn-danger confirmation-confirm-btn">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6Z"/>
                                    <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1ZM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118ZM2.5 3h11V2h-11v1Z"/>
                                </svg>
                                ${confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        const modal = document.getElementById(modalId);
        
        // Apply correct z-index using modal stack system
        if (modal) {
            // Initialize modal stack if needed
            if (!window.modalStack) {
                window.modalStack = [];
            }
            
            // Add to modal stack
            if (!window.modalStack.includes(modalId)) {
                window.modalStack.push(modalId);
            }
            
            // Calculate correct z-index (higher than global loading spinner at 10000)
            const baseZIndex = 10100;
            const zIndex = baseZIndex + (window.modalStack.length * 10);
            modal.style.zIndex = zIndex;
        }
        const confirmBtn = modal.querySelector('.confirmation-confirm-btn');
        const cancelBtn = modal.querySelector('.confirmation-cancel-btn');
        
        // Handle button clicks
        confirmBtn.addEventListener('click', () => {
            // Remove from modal stack
            if (window.modalStack) {
                const index = window.modalStack.indexOf(modalId);
                if (index > -1) {
                    window.modalStack.splice(index, 1);
                }
            }
            modal.classList.add('closing');
            setTimeout(() => {
                modal.remove();
                resolve(true);
            }, 300);
        });
        
        cancelBtn.addEventListener('click', () => {
            // Remove from modal stack
            if (window.modalStack) {
                const index = window.modalStack.indexOf(modalId);
                if (index > -1) {
                    window.modalStack.splice(index, 1);
                }
            }
            modal.classList.add('closing');
            setTimeout(() => {
                modal.remove();
                resolve(false);
            }, 300);
        });
        
        // Handle ESC key
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', handleEsc);
                // Remove from modal stack
                if (window.modalStack) {
                    const index = window.modalStack.indexOf(modalId);
                    if (index > -1) {
                        window.modalStack.splice(index, 1);
                    }
                }
                modal.classList.add('closing');
                setTimeout(() => {
                    modal.remove();
                    resolve(false);
                }, 300);
            }
        };
        document.addEventListener('keydown', handleEsc);
        
        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
    });
}

// Função para criar modal de confirmação profissional (legacy - manter compatibilidade)
function createConfirmModal(title, message, description, confirmText, cancelText, iconType = 'danger') {
    const modal = document.createElement('div');
    modal.className = 'confirm-modal';
    
    let iconSVG = '';
    let iconClass = '';
    
    if (iconType === 'danger') {
        iconSVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>`;
        iconClass = 'danger';
    } else if (iconType === 'warning') {
        iconSVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>`;
        iconClass = 'warning';
    }
    
    modal.innerHTML = `
        <div class="confirm-modal-content">
            <div class="confirm-modal-header">
                <div class="confirm-modal-icon ${iconClass}">
                    ${iconSVG}
                </div>
                <h3>${title}</h3>
            </div>
            <div class="confirm-modal-body">
                <p class="confirm-message">${message}</p>
                <p class="confirm-description">${description}</p>
            </div>
            <div class="confirm-modal-actions">
                <button class="btn btn-secondary cancel-btn">${cancelText}</button>
                <button class="btn btn-danger confirm-btn">${confirmText}</button>
            </div>
        </div>
    `;
    return modal;
}

async function deleteApplication(appId, appName) {
    // Criar modal de confirmação profissional
    const confirmModal = createConfirmModal(
        'Delete Application',
        `Are you sure you want to delete the application "${appName}"?`,
        '⚠️ WARNING: This action will permanently delete this application and ALL its toggles. This action cannot be undone.',
        'Delete',
        'Cancel',
        'warning'
    );
    
    document.body.appendChild(confirmModal);
    
    // Aguardar resposta do usuário
    const confirmed = await new Promise((resolve) => {
        const confirmBtn = confirmModal.querySelector('.confirm-btn');
        const cancelBtn = confirmModal.querySelector('.cancel-btn');
        
        confirmBtn.onclick = () => {
            document.body.removeChild(confirmModal);
            resolve(true);
        };
        
        cancelBtn.onclick = () => {
            document.body.removeChild(confirmModal);
            resolve(false);
        };
        
        // Fechar ao clicar fora do modal
        confirmModal.onclick = (e) => {
            if (e.target === confirmModal) {
                document.body.removeChild(confirmModal);
                resolve(false);
            }
        };
    });
    
    if (!confirmed) {
        return;
    }
    
    try {
        console.log('[DEBUG] Checking approval requirements for action: application_delete');
        
        // Check if approval is required
        const approvalRequired = await checkApprovalRequired('application_delete');
        
        if (approvalRequired) {
            console.log('[DEBUG] Approval required for application deletion, creating approval request');
            
            try {
                // Determine which team this application belongs to
                let teamId = null;
                
                // First try to get the team from the current loaded applications
                const applications = JSON.parse(sessionStorage.getItem('applications') || '[]');
                const targetApp = applications.find(app => app.id === appId);
                
                if (targetApp && targetApp.teams && targetApp.teams.length > 0) {
                    // Use the first team associated with this application
                    teamId = targetApp.teams[0].id;
                } else {
                    // Fallback: get user teams and use the first one
                    const userTeams = await getUserTeams();
                    if (userTeams && userTeams.length > 0) {
                        teamId = userTeams[0].id;
                    }
                }
                
                if (!teamId) {
                    showError('Unable to determine team for approval request');
                    return;
                }
                
                const description = `Delete application: ${appName}`;
                const actionData = {
                    application_id: appId,
                    name: appName
                };
                
                // Create approval request
                const approvalData = {
                    action_type: 'application_delete',
                    description: description,
                    team_id: teamId,
                    application_id: appId,
                    action_data: actionData
                };
                
                const response = await apiCall('/approval/requests', {
                    method: 'POST',
                    body: JSON.stringify(approvalData)
                });
                
                // Immediately refresh approval-related UI components
                console.log('[DEBUG] Application delete approval request created successfully, refreshing UI...');
                
                // Refresh pending count badge
                await loadPendingRequestsCount();
                
                // If approval modal is open, refresh the current tab
                const approvalModal = document.getElementById('approval-modal');
                if (approvalModal && approvalModal.classList.contains('show')) {
                    console.log('[DEBUG] Approval modal is open, refreshing approval requests list...');
                    await loadApprovalRequests();
                }
                
                // Force a menu visibility update to ensure menu stays visible for approvers
                await updateApprovalMenuVisibility();
                
                // Show approval required message
                showApprovalRequiredMessage([]);
                
            } catch (approvalError) {
                console.error('Error creating approval request:', approvalError);
                showError('Error creating approval request. Please try again.');
                return;
            }
            
        } else {
            // Execute deletion immediately if no approval required
            await apiCall(`/applications/${appId}`, {
                method: 'DELETE'
            });
            
            showSuccess(`Application "${appName}" deleted successfully!`);
            
            // Se estava visualizando os toggles desta aplicação, volta para a lista de aplicações
            if (currentAppId === appId) {
                showApplications();
            } else {
                // Recarrega a lista de aplicações
                loadApplications();
            }
        }
        
    } catch (error) {
        console.error('Error deleting application:', error);
        showError('Error deleting application');
    }
}

// Get user teams for approval requests
async function getUserTeams() {
    try {
        const response = await apiCall('/profile/teams');
        return response.teams || [];
    } catch (error) {
        console.error('Error getting user teams:', error);
        return [];
    }
}

async function editApplication(appId, appName) {
    try {
        currentEditingAppId = appId;
        document.getElementById('app-name-input').value = appName;
        document.getElementById('app-modal-title').textContent = 'Edit Application';
        
        // Load teams for selection based on user role
        const currentUser = JSON.parse(sessionStorage.getItem('current_user') || '{}');
        const teamSelect = document.getElementById('app-team-select');
        
        // Clear previous options
        teamSelect.innerHTML = '<option value="">Select a team...</option>';
        
        let teamsResponse;
        if (currentUser.role === 'root') {
            // Root users see all teams
            teamsResponse = await apiCall('/teams');
        } else {
            // Admin users see only their associated teams
            teamsResponse = await apiCall('/profile/teams');
        }
        
        if (teamsResponse.success && teamsResponse.teams) {
            teamsResponse.teams.forEach(team => {
                const option = document.createElement('option');
                option.value = team.id;
                option.textContent = team.name;
                teamSelect.appendChild(option);
            });
        }
        
        // Get current application details to find its team
        const appResponse = await apiCall(`/applications/${appId}`);
        if (appResponse && appResponse.teams && appResponse.teams.length > 0) {
            // Select the current team
            teamSelect.value = appResponse.teams[0].id;
        }
        
        openModal('app-modal');
        
    } catch (error) {
        console.error('Failed to load application details:', error);
        // Still open the modal even if data failed to load
        openModal('app-modal');
    }
}

async function generateSecretKey(appId, appName) {
    try {
        showGlobalLoading();
        
        console.log('[DEBUG] Checking approval requirements for action: secret_key_create');
        
        // Check if approval is required
        const approvalRequired = await checkApprovalRequired('secret_key_create');
        
        if (approvalRequired) {
            console.log('[DEBUG] Approval required for secret key generation, creating approval request');
            
            try {
                // Determine which team this application belongs to
                let teamId = null;
                
                // First try to get the team from the current loaded applications
                const applications = JSON.parse(sessionStorage.getItem('applications') || '[]');
                const currentApp = applications.find(app => app.id === appId);
                if (currentApp && currentApp.teams && currentApp.teams.length > 0) {
                    teamId = currentApp.teams[0].id;
                } else {
                    // If not found, get application details
                    const appDetailsResponse = await apiCall(`/applications/${appId}`);
                    if (appDetailsResponse && appDetailsResponse.teams && appDetailsResponse.teams.length > 0) {
                        teamId = appDetailsResponse.teams[0].id;
                    } else {
                        // Fallback: get user teams and use the first one
                        const userTeams = await getUserTeams();
                        if (userTeams && userTeams.length > 0) {
                            teamId = userTeams[0].id;
                        }
                    }
                }
                
                if (!teamId) {
                    hideGlobalLoading();
                    showError('Unable to determine team for approval request');
                    return;
                }
                
                // Check if secret keys already exist for description
                const existingKeysResponse = await apiCall(`/applications/${appId}/secret-keys`);
                const hasExistingKeys = existingKeysResponse && 
                                       existingKeysResponse.secret_keys && 
                                       existingKeysResponse.secret_keys.length > 0;
                
                const description = hasExistingKeys ? 
                    `Regenerar chave secreta da aplicação "${appName}"` :
                    `Gerar chave secreta da aplicação "${appName}"`;
                
                const approvalRequestData = {
                    action_type: 'secret_key_create',
                    description: description,
                    team_id: teamId,
                    application_id: appId,
                    action_data: {
                        application_id: appId,
                        application_name: appName,
                        regenerate: hasExistingKeys
                    }
                };
                
                console.log('[DEBUG] Creating approval request with data:', approvalRequestData);
                
                const approvalResponse = await apiCall('/approval/requests', {
                    method: 'POST',
                    body: JSON.stringify(approvalRequestData)
                });
                
                if (approvalResponse && approvalResponse.data) {
                    hideGlobalLoading();
                    showSuccess('Solicitação de aprovação criada! A chave secreta será gerada após aprovação.');
                    return;
                } else {
                    console.error('[DEBUG] Failed to create approval request:', approvalResponse);
                    hideGlobalLoading();
                    showError('Erro ao criar solicitação de aprovação: ' + (approvalResponse.message || 'Erro desconhecido'));
                    return;
                }
            } catch (approvalError) {
                console.error('[DEBUG] Error creating approval request:', approvalError);
                hideGlobalLoading();
                showError('Erro ao verificar necessidade de aprovação: ' + approvalError.message);
                return;
            }
        }
        
        console.log('[DEBUG] No approval required, proceeding with direct secret key generation');
        
        // Check if secret keys already exist
        const existingKeysResponse = await apiCall(`/applications/${appId}/secret-keys`);
        const hasExistingKeys = existingKeysResponse.success && 
                               existingKeysResponse.secret_keys && 
                               existingKeysResponse.secret_keys.length > 0;
        
        let confirmed;
        if (hasExistingKeys) {
            // Show warning about regeneration
            confirmed = await showConfirmationModal(
                'Regenerate Secret Key',
                `Generate a new secret key for "${appName}"?`,
                '⚠️ WARNING: This will invalidate the current secret key. Any systems using the existing key will stop working until updated with the new key. This action cannot be undone.',
                'Generate New Key',
                'Cancel',
                'warning'
            );
        } else {
            // First time generation
            confirmed = await showConfirmationModal(
                'Generate Secret Key',
                `Generate a secret key for "${appName}"?`,
                'This will create a new API key for accessing toggles. You will only see this key once, so make sure to copy it safely.',
                'Generate Key',
                'Cancel',
                'info'
            );
        }
        
        if (!confirmed) {
            hideGlobalLoading();
            return;
        }
        
        const response = await apiCall(`/applications/${appId}/generate-secret`, {
            method: 'POST'
        });
        
        if (response.success) {
            // Use plain_key which contains the actual secret key value
            let secretKey = response.plain_key || response.plainTextKey || response.secret_key || 'Generated successfully';
            
            // If secret_key is an object, try to extract the plain text key
            if (typeof secretKey === 'object' && secretKey !== null) {
                secretKey = secretKey.plain_key || secretKey.plainTextKey || secretKey.key || 'Generated successfully';
            }
            
            // Ensure secretKey is a string
            if (typeof secretKey === 'object') {
                secretKey = 'Generated successfully';
            }
            if (!secretKey || secretKey === '') {
                secretKey = 'Generated successfully';
            }
            
            showSecretKeyModal(secretKey, appName, hasExistingKeys);
            showSuccess('Secret key generated successfully!');
        } else {
            showError(response.error || 'Failed to generate secret key');
        }
    } catch (error) {
        showError('Error generating secret key: ' + error.message);
    } finally {
        hideGlobalLoading();
    }
}

// Professional secret key modal following system standard
function showSecretKeyModal(secretKey, appName, isRegeneration = false) {
    const modalId = 'professional-secret-modal-' + Date.now();
    
    // Ensure secretKey is a valid string
    if (!secretKey || typeof secretKey === 'object') {
        secretKey = 'Secret key generated successfully';
    }
    secretKey = String(secretKey).trim();
    
    const secretKeyDescription = `
        <div class="secret-key-warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
            </svg>
            <span><strong>Important:</strong> This key will only be shown once. Copy and store it securely.${isRegeneration ? ' The previous key has been invalidated.' : ''}</span>
        </div>
        
        <div class="secret-key-display-container">
            <label class="secret-key-label">Secret Key</label>
            <div class="secret-key-input-group">
                <input type="text" 
                       class="secret-key-input" 
                       value="${secretKey}" 
                       readonly 
                       id="secret-display-${modalId}">
                <button type="button" 
                        class="secret-key-copy-btn" 
                        onclick="copySecretKey('${modalId}', '${secretKey}')">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                        <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                    </svg>
                    Copy
                </button>
            </div>
        </div>
        
        <div class="secret-key-usage">
            <p><strong>API Endpoint:</strong> <code>GET /api/toggles</code></p>
            <p><strong>Authentication:</strong> <code>X-API-Key: YOUR_SECRET_KEY</code></p>
            <p class="usage-note">Always pass the secret key in the X-API-Key header for security. Replace YOUR_SECRET_KEY with your actual key value.</p>
            <div style="margin-top: 12px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
                <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; color: #374151;">Example:</p>
                <code style="display: block; background: #1e293b; color: #e2e8f0; padding: 8px 12px; border-radius: 4px; font-size: 12px; font-family: monospace; border: 1px solid #334155;">curl -H "X-API-Key: YOUR_SECRET_KEY" "https://your-domain.com/api/toggles"</code>
            </div>
        </div>
    `;
    
    const modalHTML = `
        <div id="${modalId}" class="modal-overlay confirmation-modal">
            <div class="confirmation-modal-container">
                <div class="confirmation-modal-content">
                    <div class="confirmation-modal-header">
                        <div class="confirmation-modal-icon secret-key-modal-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M7 10V7C7 4.79086 8.79086 3 11 3H13C15.2091 3 17 4.79086 17 7V10"/>
                                <rect x="5" y="10" width="14" height="11" rx="2"/>
                                <circle cx="12" cy="15.5" r="1.5"/>
                                <path d="M12 17L12 19"/>
                                <path d="M21 10L22 9"/>
                                <path d="M22 15L21 14"/>
                                <path d="M21 18L22 19"/>
                            </svg>
                        </div>
                        <div class="confirmation-modal-text">
                            <h3 class="confirmation-modal-title">
                                ${isRegeneration ? 'Secret Key Regenerated' : 'Secret Key Generated'}
                            </h3>
                            <p class="confirmation-modal-message">for ${appName}</p>
                            <div class="confirmation-modal-description">
                                ${secretKeyDescription}
                            </div>
                        </div>
                    </div>
                    
                    <div class="confirmation-modal-actions">
                        <button type="button" 
                                class="btn btn-primary secret-key-close-btn"
                                onclick="closeSecretKeyModal('${modalId}')">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                            </svg>
                            I've Saved the Key
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Initialize modal stack and show modal
    if (!window.modalStack) {
        window.modalStack = [];
    }
    window.modalStack.push(modalId);
    
    const modal = document.getElementById(modalId);
    modal.style.zIndex = 1000 + (window.modalStack.length * 10);
    modal.style.animation = 'slideInScale 0.3s ease-out';
    
    // Auto-select the secret key for easy copying
    setTimeout(() => {
        const secretInput = document.getElementById(`secret-display-${modalId}`);
        if (secretInput) {
            secretInput.focus();
            secretInput.select();
        }
    }, 100);
}

// Function to copy secret key
function copySecretKey(modalId, secretKey) {
    // Get the actual value from the input field as backup
    const secretInput = document.getElementById(`secret-display-${modalId}`);
    const actualSecretKey = secretInput ? secretInput.value : secretKey;
    
    navigator.clipboard.writeText(actualSecretKey).then(() => {
        showSuccess('Secret key copied to clipboard!');
        
        // Visual feedback on copy button
        const copyBtn = document.querySelector(`#${modalId} .secret-key-copy-btn`);
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
            </svg>
            Copied!
        `;
        copyBtn.classList.add('copied');
        
        setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
            copyBtn.classList.remove('copied');
        }, 2000);
    }).catch(() => {
        // Fallback for older browsers
        const secretInput = document.getElementById(`secret-display-${modalId}`);
        if (secretInput) {
            secretInput.select();
            secretInput.setSelectionRange(0, 99999); // For mobile devices
            document.execCommand('copy');
            showSuccess('Secret key copied to clipboard!');
        } else {
            showError('Failed to copy secret key');
        }
    });
}

// Function to close secret key modal
function closeSecretKeyModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.animation = 'slideOutScale 0.3s ease-in';
        
        // Remove from modal stack
        if (window.modalStack) {
            const index = window.modalStack.indexOf(modalId);
            if (index > -1) {
                window.modalStack.splice(index, 1);
            }
        }
        
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}

// Funções de UI
function showGlobalLoading() {
    if (globalLoadingSpinner) {
        globalLoadingSpinner.classList.remove('hidden');
    }
}

function hideGlobalLoading() {
    if (globalLoadingSpinner) {
        globalLoadingSpinner.classList.add('hidden');
    }
}

// A função showLoading original pode ser mantida se for usada em outros lugares,
// ou removida/adaptada se o spinner global for o único indicador de carregamento.
// Por enquanto, vamos mantê-la, mas ela não será mais chamada por loadApplications/loadToggles.
function showLoading(container) {
    container.innerHTML = '<div class="loading">Loading...</div>';
}

function showEmptyState(container, title, message = '', iconType = 'default') {
    const icons = {
        applications: `
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
        `,
        toggles: `
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 2L2 12l10 10 10-10-10-10z"/>
                <path d="M12 6L6 12l6 6 6-6-6-6z"/>
            </svg>
        `,
        default: `
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
            </svg>
        `
    };

    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">
                ${icons[iconType] || icons.default}
            </div>
            <div class="empty-state-content">
                <h3 class="empty-state-title">${title}</h3>
                ${message ? `<p class="empty-state-message">${message}</p>` : ''}
            </div>
        </div>
    `;
}

// Password Modal Functions
function showPasswordModal(username, password) {
    const modalHTML = `
        <div id="password-modal" class="modal-overlay">
            <div class="password-modal-container">
                <div class="password-modal-content">
                    <div class="password-modal-header">
                        <div class="password-modal-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                <circle cx="12" cy="16" r="1"/>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                        </div>
                        <div class="password-modal-title-section">
                            <h2 class="password-modal-title">User Created Successfully!</h2>
                            <p class="password-modal-subtitle">Please save the generated password</p>
                        </div>
                    </div>
                    
                    <div class="password-modal-body">
                        <div class="user-info-section">
                            <div class="info-item">
                                <label class="info-label">Username:</label>
                                <span class="info-value">${username}</span>
                            </div>
                        </div>
                        
                        <div class="password-section">
                            <div class="password-field-container">
                                <label class="password-label">Generated Password:</label>
                                <div class="password-display-container">
                                    <input type="text" id="generated-password" value="${password}" readonly class="password-display">
                                    <button type="button" onclick="copyPassword()" class="copy-password-btn">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                        </svg>
                                        Copy
                                    </button>
                                </div>
                                <div class="password-warning">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                        <line x1="12" y1="9" x2="12" y2="13"/>
                                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                                    </svg>
                                    Make sure to save this password. It will not be shown again.
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="password-modal-footer">
                        <button type="button" onclick="copyPassword()" class="secondary-btn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                            Copy Password
                        </button>
                        <button type="button" onclick="closePasswordModal()" class="primary-btn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="20,6 9,17 4,12"/>
                            </svg>
                            Got It
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Apply correct z-index using modal stack system
    const modal = document.getElementById('password-modal');
    if (modal) {
        // Initialize modal stack if needed
        if (!window.modalStack) {
            window.modalStack = [];
        }
        
        // Add to modal stack
        const modalId = 'password-modal';
        if (!window.modalStack.includes(modalId)) {
            window.modalStack.push(modalId);
        }
        
        // Calculate correct z-index
        const baseZIndex = 1000;
        const zIndex = baseZIndex + (window.modalStack.length * 10);
        modal.style.zIndex = zIndex;
        
        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
    }
}

function copyPassword() {
    const passwordField = document.getElementById('generated-password');
    if (passwordField) {
        passwordField.select();
        passwordField.setSelectionRange(0, 99999); // For mobile devices
        
        try {
            document.execCommand('copy');
            showSuccess('Password copied to clipboard!');
        } catch (err) {
            // Fallback for modern browsers
            if (navigator.clipboard) {
                navigator.clipboard.writeText(passwordField.value).then(() => {
                    showSuccess('Password copied to clipboard!');
                }).catch(() => {
                    showError('Failed to copy password');
                });
            } else {
                showError('Copy not supported in this browser');
            }
        }
    }
}

function closePasswordModal() {
    const modal = document.getElementById('password-modal');
    if (modal) {
        // Remove from modal stack
        if (window.modalStack) {
            const modalId = 'password-modal';
            const index = window.modalStack.indexOf(modalId);
            if (index > -1) {
                window.modalStack.splice(index, 1);
            }
        }
        
        modal.classList.add('closing');
        setTimeout(() => {
            modal.remove();
            // Refresh the users modal to show the new user
            refreshUsersModal();
        }, 300);
    }
}

function refreshUsersModal() {
    // Close any existing form
    const existingForm = document.getElementById('create-user-form');
    if (existingForm) {
        existingForm.remove();
    }
    
    // Reload users and teams data
    refreshUserAndTeamLists();
}

// User management and permissions
let currentUser = null;

async function loadCurrentUser() {
    try {
        const response = await apiCall('/profile');
        if (response.success && response.user) {
            currentUser = response.user;
            updateUIBasedOnUserRole();
            return currentUser;
        }
    } catch (error) {
        console.error('Failed to load current user:', error);
    }
    return null;
}

function updateUIBasedOnUserRole() {
    const currentUser = JSON.parse(sessionStorage.getItem('current_user') || '{}');
    if (!currentUser.id) return;
    
    // Hide create buttons for regular users (only root and admin can create)
    const newAppBtn = document.getElementById('new-app-btn');
    const newToggleBtn = document.getElementById('new-toggle-btn');
    
    if (currentUser.role === 'user') {
        // Hide create buttons for regular users
        if (newAppBtn) newAppBtn.style.display = 'none';
        if (newToggleBtn) newToggleBtn.style.display = 'none';
    } else {
        // Show create buttons for root and admin users
        if (newAppBtn) newAppBtn.style.display = 'flex';
        if (newToggleBtn) newToggleBtn.style.display = 'flex';
    }
    
    // Controlar visibilidade do botão User Management (apenas para root)
    const userManagementBtn = document.getElementById('user-management-btn');
    if (userManagementBtn) {
        if (currentUser.role === 'root') {
            userManagementBtn.style.display = 'flex';
        } else {
            userManagementBtn.style.display = 'none';
        }
    }
    
    // Controlar visibilidade do botão Approval
    updateApprovalMenuVisibility();
    
    // Update user info in header
    const userNameElements = document.querySelectorAll('#user-name, #dropdown-user-name');
    const userRoleElement = document.getElementById('dropdown-user-role');
    
    userNameElements.forEach(element => {
        if (element) element.textContent = currentUser.username;
    });
    
    if (userRoleElement) {
        const roleMap = {
            'root': 'Root User',
            'admin': 'Administrator', 
            'user': 'User'
        };
        userRoleElement.textContent = roleMap[currentUser.role] || currentUser.role;
    }
}

// Controlar visibilidade do menu de approval baseado no papel do usuário e se o sistema está habilitado
async function updateApprovalMenuVisibility() {
    const approvalBtn = document.getElementById('approval-management-btn');
    const currentUser = JSON.parse(sessionStorage.getItem('current_user') || '{}');
    
    console.log('[DEBUG] updateApprovalMenuVisibility: Starting check', { 
        hasApprovalBtn: !!approvalBtn, 
        currentUserId: currentUser.id,
        userRole: currentUser.role 
    });
    
    if (!approvalBtn || !currentUser.id) {
        console.log('[DEBUG] updateApprovalMenuVisibility: Early exit - missing button or user');
        return;
    }
    
    try {
        // Root sempre vê o menu (pode habilitar/desabilitar o sistema)
        if (currentUser.role === 'root') {
            console.log('[DEBUG] updateApprovalMenuVisibility: Root user - showing menu');
            approvalBtn.style.display = 'flex';
            return;
        }
        
        // Para admin, verificar se o sistema está habilitado E se é aprovador de algum team
        let approvalStatusResponse, approverTeamsResponse;
        
        try {
            [approvalStatusResponse, approverTeamsResponse] = await Promise.all([
                apiCall('/approval/enabled'),
                currentUser.role === 'admin' ? apiCall('/approval/my-approver-teams') : Promise.resolve({ data: [] })
            ]);
        } catch (error) {
            console.error('[ERROR] updateApprovalMenuVisibility: Failed to get approval data', error);
            // In case of error, hide menu for non-root users
            if (currentUser.role !== 'root') {
                approvalBtn.style.display = 'none';
            }
            return;
        }
        
        const isApprovalEnabled = approvalStatusResponse.data?.enabled || false;
        let approverTeams = approverTeamsResponse.data || [];
        
        // Retry logic: Se retornou vazio mas usuário é admin, tentar novamente uma vez
        if (currentUser.role === 'admin' && approverTeams.length === 0 && isApprovalEnabled) {
            console.log('[DEBUG] updateApprovalMenuVisibility: Approver teams returned empty for admin, retrying...');
            try {
                const retryResponse = await apiCall('/approval/my-approver-teams');
                approverTeams = retryResponse.data || [];
                console.log('[DEBUG] updateApprovalMenuVisibility: Retry result:', { approverTeams });
            } catch (retryError) {
                console.warn('[DEBUG] updateApprovalMenuVisibility: Retry failed:', retryError);
            }
        }
        
        console.log('[DEBUG] updateApprovalMenuVisibility: API responses', {
            isApprovalEnabled,
            approverTeams,
            approverTeamsLength: approverTeams.length,
            userRole: currentUser.role,
            approvalStatusResponse: JSON.stringify(approvalStatusResponse),
            approverTeamsResponse: JSON.stringify(approverTeamsResponse),
            approvalStatusType: typeof approvalStatusResponse,
            approverTeamsType: typeof approverTeamsResponse
        });
        
        if (currentUser.role === 'admin' && isApprovalEnabled) {
            if (approverTeams.length > 0) {
                // Admin com teams de aprovação - mostrar menu
                console.log('[DEBUG] updateApprovalMenuVisibility: Admin with approval teams - showing menu');
                approvalBtn.style.display = 'flex';
                // Cache positive result for longer to reduce flickering
                window.approvalMenuLastPositiveCheck = Date.now();
            } else {
                // Admin sem teams de aprovação - mostrar aviso
                console.log('[DEBUG] updateApprovalMenuVisibility: Admin without approval teams - check team configuration');
                console.warn('[WARNING] Admin user is not configured as approver for any team. To see the approval menu, the admin must be added as an approver to at least one team.');
                
                // Check if we had a positive result recently (prevent flickering)
                const recentPositiveCheck = window.approvalMenuLastPositiveCheck && 
                    (Date.now() - window.approvalMenuLastPositiveCheck) < 5000; // 5 second grace period
                
                if (!recentPositiveCheck) {
                    approvalBtn.style.display = 'none';
                } else {
                    console.log('[DEBUG] updateApprovalMenuVisibility: Keeping menu visible due to recent positive check');
                }
            }
        } else {
            // User nunca vê o menu, admin não vê se sistema estiver desabilitado
            console.log('[DEBUG] updateApprovalMenuVisibility: Hiding menu', {
                reason: currentUser.role !== 'admin' ? 'not admin' : 
                       !isApprovalEnabled ? 'approval disabled' : 'unknown'
            });
            approvalBtn.style.display = 'none';
            window.approvalMenuLastPositiveCheck = null;
        }
        
    } catch (error) {
        console.error('[ERROR] updateApprovalMenuVisibility: Error checking approval status', error);
        // Em caso de erro, ocultar para usuários não-root
        if (currentUser.role !== 'root') {
            approvalBtn.style.display = 'none';
        }
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Se a mensagem contém quebras de linha, formatar como HTML
    if (message.includes('\n')) {
        const formattedMessage = message
            .split('\n')
            .filter(line => line.trim()) // Remove linhas vazias
            .map(line => `<div>${line}</div>`)
            .join('');
        toast.innerHTML = formattedMessage;
    } else {
        toast.innerHTML = message;
    }
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 6000); // Aumentar tempo para mensagens de erro mais longas
}

function showSuccess(msg) { showToast(msg, 'success'); }
function showError(msg) { showToast(msg, 'error'); }
function showInfo(msg) { showToast(msg, 'info'); }
function showWarning(msg) { showToast(msg, 'warning'); }

// Fechar modais ao clicar fora
window.addEventListener('click', function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.classList.add('hidden');
        }
    });
});

// Fechar modais com tecla ESC
window.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (!modal.classList.contains('hidden')) {
                modal.classList.add('hidden');
            }
        });
        
        // Fechar modais de confirmação também
        const confirmModals = document.querySelectorAll('.confirm-modal');
        confirmModals.forEach(modal => {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
        });
    }
});

// Funções para melhorar a UX do modal de regras de ativação
function updateRuleValueHints(ruleType) {
    const hintElement = document.getElementById('rule-value-hint');
    const descriptionElement = document.getElementById('rule-value-description');
    
    const hints = {
        'percentage': {
            text: 'Enter a number between 0-100 (e.g., 25 for 25% of requests)',
            description: 'Percentage of requests that should activate this toggle'
        },
        'parameter': {
            text: 'Enter parameter name or value (e.g., "premium", "beta_user")',
            description: 'Parameter value to match for activation'
        },
        'user_id': {
            text: 'Enter specific user IDs separated by commas (e.g., "user123, user456")',
            description: 'Specific user identifiers for targeted activation'
        },
        'ip': {
            text: 'Enter IP addresses or ranges (e.g., "192.168.1.1" or "10.0.0.0/24")',
            description: 'IP addresses or CIDR ranges for geo-targeted activation'
        },
        'country': {
            text: 'Enter country codes separated by commas (e.g., "US, BR, CA")',
            description: 'ISO country codes for location-based activation'
        },
        'time': {
            text: 'Enter time range in 24h format (e.g., "09:00-17:00" or "Mon-Fri 08:00-18:00")',
            description: 'Time windows when the toggle should be active'
        },
        'canary': {
            text: 'Enter deployment version or environment (e.g., "v2.1.0", "staging")',
            description: 'Version or environment identifier for canary deployments'
        }
    };
    
    if (ruleType && hints[ruleType]) {
        hintElement.querySelector('.hint-text').textContent = hints[ruleType].text;
        descriptionElement.textContent = hints[ruleType].description;
        hintElement.style.display = 'flex';
    } else {
        hintElement.style.display = 'none';
        descriptionElement.textContent = 'Enter the value for your selected rule type';
    }
}

function updateRuleValueIcon(ruleType) {
    const iconElement = document.getElementById('rule-value-icon');
    
    const icons = {
        'percentage': `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2.875 3.5A1.375 1.375 0 004.25 2.125h7.5A1.375 1.375 0 0013.125 3.5v9A1.375 1.375 0 0011.75 13.875h-7.5A1.375 1.375 0 002.875 12.5v-9zM4.25 3.625a.375.375 0 00-.375.375v8.5c0 .207.168.375.375.375h7.5a.375.375 0 00.375-.375v-8.5a.375.375 0 00-.375-.375h-7.5z"/>
            <path d="M6.5 5a.5.5 0 01.5.5v5a.5.5 0 01-1 0V6.207l-.146.147a.5.5 0 01-.708-.708l1-1A.5.5 0 016.5 5z"/>
            <path d="M9.5 8.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM11 7.5a1 1 0 100 2 1 1 0 000-2z"/>
        </svg>`,
        'parameter': `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.5 13a1.5 1.5 0 01-3 0v-8a1.5 1.5 0 013 0v8zM10.5 4.5a.5.5 0 00-.5-.5h-4a.5.5 0 000 1h4a.5.5 0 00.5-.5z"/>
        </svg>`,
        'user_id': `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 00-11.215 0c-.22.578.254 1.139.872 1.139h9.47z"/>
        </svg>`,
        'ip': `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM2.04 4.326c.325 1.329 2.532 2.54 3.717 3.19.48.263.793.434.743.484-.08.08-.162-.019-.394-.09-.306-.09-.626-.2-.918-.33-.132-.065-.248-.032-.333.025-.114.075-.204.223-.204.275 0 .097.116.25.256.363.296.24.554.469.785.68.775.704 1.622 1.353 2.477 1.905a.5.5 0 00.577-.094l1.99-1.99.002-.002.002-.002A.5.5 0 0010.5 8.5V4.326c-.54.418-1.972.56-2.064.56-.593.033-1.204.033-1.867.033-1.479 0-2.896-.198-3.509-.593z"/>
        </svg>`,
        'country': `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 2a2 2 0 012-2h8a2 2 0 012 2v2h2a2 2 0 012 2v6a2 2 0 01-2 2H2a2 2 0 01-2-2V2zm12 2.5v-2a.5.5 0 00-.5-.5h-2v3h2.5z"/>
        </svg>`,
        'time': `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 3.5a.5.5 0 00-1 0V9a.5.5 0 00.252.434l3.5 2a.5.5 0 00.496-.868L8 8.71V3.5z"/>
            <path d="M8 16A8 8 0 108 0a8 8 0 000 16zm7-8A7 7 0 111 8a7 7 0 0114 0z"/>
        </svg>`,
        'canary': `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 15A7 7 0 118 1a7 7 0 010 14zm0 1A8 8 0 108 0a8 8 0 000 16z"/>
            <path d="M8.93 6.588l-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 11-2 0 1 1 0 012 0z"/>
        </svg>`
    };
    
    if (ruleType && icons[ruleType]) {
        iconElement.innerHTML = icons[ruleType];
    } else {
        iconElement.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.75.75 0 01.75.75v5.69l3.72-3.72a.75.75 0 111.06 1.06L8.75 10.56v2.69a.75.75 0 01-1.5 0v-2.69L2.47 5.78a.75.75 0 011.06-1.06L7.25 8.44V2.75A.75.75 0 018 2z"/>
        </svg>`;
    }
}

function updateRuleValuePlaceholder(ruleType) {
    const inputElement = document.getElementById('activation-rule-value');
    
    const placeholders = {
        'percentage': 'e.g., 25',
        'parameter': 'e.g., premium_user',
        'user_id': 'e.g., user123, user456',
        'ip': 'e.g., 192.168.1.1',
        'country': 'e.g., US, BR, CA',
        'time': 'e.g., 09:00-17:00',
        'canary': 'e.g., v2.1.0'
    };
    
    inputElement.placeholder = placeholders[ruleType] || 'Enter rule value...';
}

// Funções de autenticação
function getCurrentUser() {
    console.log('[DEBUG] getCurrentUser: Checking for current user in sessionStorage');
    // Try to get user data from sessionStorage (set during login)
    const userJson = sessionStorage.getItem('current_user');
    console.log('[DEBUG] getCurrentUser: Found user data in sessionStorage:', userJson);
    if (userJson) {
        try {
            const user = JSON.parse(userJson);
            console.log('[DEBUG] getCurrentUser: Parsed user data:', user);
            return user;
        } catch (e) {
            console.warn('[DEBUG] getCurrentUser: Error parsing user data:', e);
            return null;
        }
    }
    console.log('[DEBUG] getCurrentUser: No user data found in sessionStorage');
    return null;
}

async function logout() {
    try {
        // Call logout endpoint to clear server-side cookie
        await fetch('/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.warn('Logout request failed:', error);
    }
    
    // Clear session data
    sessionStorage.clear();
    
    // Redirecionar para login
    window.location.href = '/login';
}

// Funções de interface do usuário
function initializeUserInterface() {
    console.log('[DEBUG] initializeUserInterface: Starting user interface initialization');
    
    // Verificar se estamos na página correta
    if (window.location.pathname.includes('/login')) {
        console.log('[DEBUG] initializeUserInterface: On login page - skipping user interface init');
        return;
    }
    
    const user = getCurrentUser();
    console.log('[DEBUG] initializeUserInterface: Current user:', user);
    
    if (user) {
        console.log('[DEBUG] initializeUserInterface: User found, updating interface elements');
        // Atualizar nome do usuário nos elementos da interface
        const userNameElements = document.querySelectorAll('#user-name, #dropdown-user-name');
        userNameElements.forEach(element => {
            element.textContent = user.username || 'User';
        });
        
        // Atualizar role do usuário
        const userRoleElement = document.getElementById('dropdown-user-role');
        if (userRoleElement) {
            userRoleElement.textContent = user.role === 'admin' ? 'Administrator' : 'User';
        }
        
        // Atualizar avatar inicial se necessário
        updateUserAvatar(user.username);
    } else {
        console.log('[DEBUG] initializeUserInterface: No user found - should redirect to login');
        console.log('[DEBUG] initializeUserInterface: Current URL:', window.location.href);
        console.log('[DEBUG] initializeUserInterface: Is on login page?', window.location.pathname.includes('/login'));
        
        // Se não está na página de login e não tem usuário, redirecionar para login
        if (!window.location.pathname.includes('/login')) {
            console.log('[DEBUG] initializeUserInterface: Redirecting to login - no authenticated user');
            window.location.href = '/login';
            return;
        }
    }
    
    // Configurar event listeners do menu do usuário
    setupUserMenuListeners();
}

function updateUserAvatar(username) {
    // Gerar inicial do username para o avatar
    const initial = username ? username.charAt(0).toUpperCase() : 'U';
    const avatarElements = document.querySelectorAll('#user-avatar, .user-menu-avatar');
    
    avatarElements.forEach(element => {
        // Se não há SVG, criar texto com a inicial
        if (username) {
            element.innerHTML = `<div style="font-weight: 600; font-size: 14px;">${initial}</div>`;
        }
    });
}

function setupUserMenuListeners() {
    const userMenuTrigger = document.getElementById('user-menu-trigger');
    const userMenu = document.getElementById('user-menu');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    
    if (userMenuTrigger && userMenu && userMenuDropdown) {
        // Toggle do menu
        userMenuTrigger.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleUserMenu();
        });
        
        // Fechar menu ao clicar fora
        document.addEventListener('click', function(e) {
            if (!userMenu.contains(e.target)) {
                closeUserMenu();
            }
        });
        
        // Fechar menu com ESC
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeUserMenu();
            }
        });
    }
}

function toggleUserMenu() {
    const userMenu = document.getElementById('user-menu');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    
    if (userMenuDropdown.classList.contains('show')) {
        closeUserMenu();
    } else {
        openUserMenu();
    }
}

function openUserMenu() {
    const userMenu = document.getElementById('user-menu');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    
    userMenu.classList.add('open');
    userMenuDropdown.classList.remove('hidden');
    setTimeout(() => {
        userMenuDropdown.classList.add('show');
    }, 10);
}

function closeUserMenu() {
    const userMenu = document.getElementById('user-menu');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    
    userMenu.classList.remove('open');
    userMenuDropdown.classList.remove('show');
    setTimeout(() => {
        userMenuDropdown.classList.add('hidden');
    }, 200);
}

// Funções dos modais do menu do usuário
async function openProfileModal() {
    closeUserMenu();
    
    try {
        showGlobalLoading();
        
        // Get current user from session
        const currentUser = JSON.parse(sessionStorage.getItem('current_user') || '{}');
        if (!currentUser.id) {
            showError('User information not found');
            return;
        }
        
        // Fetch user profile and teams separately
        const [profileResponse, teamsResponse] = await Promise.all([
            apiCall('/profile'),
            apiCall('/profile/teams')
        ]);
        
        if (!profileResponse.success) {
            showError('Failed to load profile information');
            return;
        }
        
        const user = profileResponse.user;
        
        // Add teams to user object if the teams call was successful
        if (teamsResponse.success && teamsResponse.teams) {
            user.teams = teamsResponse.teams;
        } else {
            user.teams = [];
        }
        
        // Populate profile information
        document.getElementById('profile-username').value = user.username;
        document.getElementById('profile-role').value = getRoleDisplayName(user.role);
        
        // Update profile avatar
        const profileAvatar = document.getElementById('profile-avatar');
        if (user.username) {
            const initial = user.username.charAt(0).toUpperCase();
            profileAvatar.innerHTML = `<div style="font-weight: 600; font-size: 28px;">${initial}</div>`;
        }
        
        // Show/hide teams section based on user role
        const teamsSection = document.querySelector('#profile-modal .form-section:nth-child(2)');
        if (user.role === 'root') {
            // Hide teams section for root users
            teamsSection.style.display = 'none';
        } else {
            // Show teams section for non-root users
            teamsSection.style.display = 'block';
            
            // Populate teams list
            const teamsList = document.getElementById('profile-teams-list');
            if (user.teams && user.teams.length > 0) {
                teamsList.innerHTML = user.teams.map(team => `
                    <div class="team-item">
                        <div class="team-icon">
                            ${team.name.charAt(0).toUpperCase()}
                        </div>
                        <div class="team-info">
                            <div class="team-name">${team.name}</div>
                            <div class="team-description">${team.description || 'No description'}</div>
                        </div>
                    </div>
                `).join('');
            } else {
                teamsList.innerHTML = `
                    <div class="team-item">
                        <div class="team-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="3"/>
                                <path d="M12 1v6m0 6v6"/>
                            </svg>
                        </div>
                        <div class="team-info">
                            <div class="team-name">No teams assigned</div>
                            <div class="team-description">You are not currently associated with any teams</div>
                        </div>
                    </div>
                `;
            }
        }
        
        hideGlobalLoading();
        openModal('profile-modal');
        
    } catch (error) {
        hideGlobalLoading();
        console.error('Failed to load profile:', error);
        showError('Failed to load profile information');
    }
}

function getRoleDisplayName(role) {
    const roleMap = {
        'root': 'Root User',
        'admin': 'Administrator',
        'user': 'User'
    };
    return roleMap[role] || role;
}

function openChangePasswordModal() {
    // Clear form fields
    document.getElementById('current-password-input').value = '';
    document.getElementById('new-password-input').value = '';
    document.getElementById('confirm-password-input').value = '';
    
    closeModal('profile-modal');
    openModal('change-password-modal');
}

async function submitChangePassword() {
    const currentPassword = document.getElementById('current-password-input').value;
    const newPassword = document.getElementById('new-password-input').value;
    const confirmPassword = document.getElementById('confirm-password-input').value;
    
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
        showError('All password fields are required');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showError('New password and confirmation do not match');
        return;
    }
    
    if (newPassword.length < 6) {
        showError('New password must be at least 6 characters long');
        return;
    }
    
    if (currentPassword === newPassword) {
        showError('New password must be different from current password');
        return;
    }
    
    try {
        showGlobalLoading();
        
        const currentUser = JSON.parse(sessionStorage.getItem('current_user') || '{}');
        if (!currentUser.id) {
            showError('User information not found');
            return;
        }
        
        const response = await apiCall('/profile/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });
        
        hideGlobalLoading();
        
        if (response.success) {
            showSuccess('Password changed successfully');
            closeModal('change-password-modal');
            
            // Clear form
            document.getElementById('current-password-input').value = '';
            document.getElementById('new-password-input').value = '';
            document.getElementById('confirm-password-input').value = '';
        } else {
            showError(response.message || 'Failed to change password');
        }
        
    } catch (error) {
        hideGlobalLoading();
        console.error('Failed to change password:', error);
        showError('Failed to change password');
    }
}

async function openUsersModal() {
    closeUserMenu();
    
    // Verificar se o usuário é root
    const currentUser = JSON.parse(sessionStorage.getItem('current_user') || '{}');
    if (currentUser.role !== 'root') {
        showError('Only root users can manage users');
        return;
    }
    
    try {
        showGlobalLoading();
        const response = await apiCall('/users?' + Date.now());
        displayUsersModal(response.users);
    } catch (error) {
        showError('Failed to load users: ' + error.message);
    } finally {
        hideGlobalLoading();
    }
}

async function displayUsersModal(users) {
    // Verificar se já existe um modal e removê-lo
    const existingModal = document.getElementById('users-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Carregar teams para associações
    let teams = [];
    try {
        const teamsResponse = await apiCall('/teams');
        teams = teamsResponse.teams || [];
    } catch (error) {
        console.warn('Could not load teams:', error);
    }
    
    // Criar modal dinamicamente com interface profissional redesenhada
    const modalHTML = `
        <div id="users-modal" class="modal-overlay">
            <div class="management-modal-container">
                <div class="management-modal-content">
                    <!-- Header -->
                    <div class="management-modal-header">
                        <div class="management-title-section">
                            <div class="management-modal-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                    <circle cx="9" cy="7" r="4"/>
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                </svg>
                            </div>
                            <div>
                                <h2 class="management-title">User & Team Management</h2>
                                <p class="management-subtitle">Manage system access and organization</p>
                            </div>
                        </div>
                        <button class="modal-close-btn" onclick="closeUsersModal()" aria-label="Close">
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
                                <path d="M14.53 4.53l-1.06-1.06L9 7.94 4.53 3.47 3.47 4.53 7.94 9l-4.47 4.53 1.06 1.06L9 10.06l4.53 4.47 1.06-1.06L10.06 9z"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Navigation Tabs -->
                    <div class="management-nav">
                        <div class="management-tabs">
                            <button class="management-tab-btn active" onclick="switchManagementTab('users')" id="users-tab">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                                    <circle cx="9" cy="7" r="4"/>
                                </svg>
                                <span>Users</span>
                                <span class="management-tab-count">${users.length}</span>
                            </button>
                            <button class="management-tab-btn" onclick="switchManagementTab('teams')" id="teams-tab">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                    <circle cx="9" cy="7" r="4"/>
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                </svg>
                                <span>Teams</span>
                                <span class="management-tab-count">${teams.length}</span>
                            </button>
                        </div>
                    </div>

                    <!-- Content Area -->
                    <div class="management-modal-body">
                        <!-- Users Panel -->
                        <div id="users-panel" class="management-panel active">
                            <div class="management-panel-header">
                                <div>
                                    <h3 class="panel-title">System Users</h3>
                                    <p class="panel-description">Manage user accounts and permissions</p>
                                </div>
                                <button class="btn btn-primary" onclick="openCreateUserForm()">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z"/>
                                    </svg>
                                    <span>Add User</span>
                                </button>
                            </div>
                            <div id="users-list" class="management-grid">
                                ${generateUsersHTML(users)}
                            </div>
                        </div>

                        <!-- Teams Panel -->
                        <div id="teams-panel" class="management-panel">
                            <div class="management-panel-header">
                                <div>
                                    <h3 class="panel-title">Teams</h3>
                                    <p class="panel-description">Organize users into teams for better collaboration</p>
                                </div>
                                <button class="btn btn-primary" onclick="openCreateTeamForm()">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z"/>
                                    </svg>
                                    <span>Create Team</span>
                                </button>
                            </div>
                            <div id="teams-list" class="management-grid">
                                ${generateTeamsHTML(teams)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Adicionar modal ao DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Mostrar modal using proper modal management
    setTimeout(() => {
        const modal = document.getElementById('users-modal');
        if (modal) {
            // Manage modal stack for proper z-index handling
            if (!window.modalStack) {
                window.modalStack = [];
            }
            
            // Add to modal stack
            if (!window.modalStack.includes('users-modal')) {
                window.modalStack.push('users-modal');
            }
            
            // Update z-index based on stack position
            const baseZIndex = 1000;
            const zIndex = baseZIndex + (window.modalStack.length * 10);
            modal.style.zIndex = zIndex;
            
            modal.classList.remove('hidden');
        }
    }, 10);
}

function generateUsersHTML(users) {
    if (!users || users.length === 0) {
        return `
            <div class="management-empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <h3>No Users Found</h3>
                <p>Start by creating your first user account to manage system access.</p>
            </div>
        `;
    }
    
    return users.map(user => `
        <div class="management-item">
            <div class="management-item-info">
                <div class="management-item-avatar">
                    ${user.username.charAt(0).toUpperCase()}
                </div>
                <div class="management-item-details">
                    <h4 class="management-item-name">${user.username}</h4>
                    <p class="management-item-meta">${getRoleDisplayName(user.role)} • Created ${formatDate(user.created_at)}</p>
                </div>
            </div>
            <div class="management-item-actions">
                ${user.must_change_password ? '<span class="management-item-badge warning">Password change required</span>' : ''}
                ${user.role === 'root' ? '<span class="management-item-badge info">Root User</span>' : `
                    <button class="btn btn-secondary btn-sm" onclick="editUser('${user.id}', '${user.username}', '${user.role}')">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/>
                        </svg>
                        Edit
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteUser('${user.id}', '${user.username}')">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6Z"/>
                            <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1ZM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118ZM2.5 3h11V2h-11v1Z"/>
                        </svg>
                        Delete
                    </button>
                `}
            </div>
        </div>
    `).join('');
}

function switchManagementTab(tabName) {
    // Verificar se a aba já está ativa para evitar processamento desnecessário
    const targetTab = document.getElementById(tabName + '-tab');
    if (targetTab && targetTab.classList.contains('active')) {
        return; // Aba já está ativa, não fazer nada
    }
    
    // Update tab buttons
    document.querySelectorAll('.management-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    // Update panels
    document.querySelectorAll('.management-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    const targetPanel = document.getElementById(tabName + '-panel');
    if (targetPanel) {
        targetPanel.classList.add('active');
    }
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    const now = new Date();
    
    // Check if date is invalid
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    const diffTime = now - date; // Positive = past, negative = future
    const absDiffTime = Math.abs(diffTime);
    const diffDays = Math.floor(absDiffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(absDiffTime / (1000 * 60 * 60));
    const diffMinutes = Math.floor(absDiffTime / (1000 * 60));
    
    // For very recent times (less than 1 hour)
    if (diffHours < 1) {
        if (diffMinutes < 1) {
            return 'Just now';
        }
        return diffTime > 0 ? `${diffMinutes} minutes ago` : `in ${diffMinutes} minutes`;
    }
    
    // For same day (less than 24 hours)
    if (diffHours < 24) {
        return diffTime > 0 ? `${diffHours} hours ago` : `in ${diffHours} hours`;
    }
    
    // For dates
    if (diffDays === 0) {
        return diffTime > 0 ? 'Today' : 'Today';
    } else if (diffDays === 1) {
        return diffTime > 0 ? 'Yesterday' : 'Tomorrow';
    } else if (diffDays < 7) {
        return diffTime > 0 ? `${diffDays} days ago` : `in ${diffDays} days`;
    } else if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return diffTime > 0 ? `${weeks} week${weeks > 1 ? 's' : ''} ago` : `in ${weeks} week${weeks > 1 ? 's' : ''}`;
    } else if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        return diffTime > 0 ? `${months} month${months > 1 ? 's' : ''} ago` : `in ${months} month${months > 1 ? 's' : ''}`;
    } else {
        // For dates more than a year, show actual date
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    }
}

function generateTeamsHTML(teams) {
    if (!teams || teams.length === 0) {
        return `
            <div class="management-empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <h3>No Teams Found</h3>
                <p>Create your first team to organize users and applications for better collaboration.</p>
            </div>
        `;
    }
    
    return teams.map(team => `
        <div class="management-item">
            <div class="management-item-info">
                <div class="management-item-avatar">
                    ${team.name.charAt(0).toUpperCase()}
                </div>
                <div class="management-item-details">
                    <h4 class="management-item-name">${team.name}</h4>
                    <p class="management-item-meta">${team.description || 'No description'} • ${team.user_count || 0} users</p>
                </div>
            </div>
            <div class="management-item-actions">
                <span class="management-item-badge success">${team.user_count || 0} Members</span>
                <button class="btn btn-secondary btn-sm" onclick="editTeam('${team.id}', '${team.name}', '${team.description || ''}')">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/>
                    </svg>
                    Edit
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteTeam('${team.id}', '${team.name}')">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6Z"/>
                        <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1ZM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118ZM2.5 3h11V2h-11v1Z"/>
                    </svg>
                    Delete
                </button>
            </div>
        </div>
    `).join('');
}

async function refreshUserAndTeamLists() {
    try {
        console.log('🔄 refreshUserAndTeamLists: Starting refresh...');
        
        // Verificar se o modal principal ainda existe
        const usersModal = document.getElementById('users-modal');
        if (!usersModal) {
            console.log('🔄 refreshUserAndTeamLists: No users-modal found, aborting');
            return;
        }
        
        // Refresh users
        const usersResponse = await apiCall('/users');
        if (usersResponse.success && usersResponse.users) {
            const usersListElement = document.getElementById('users-list');
            if (usersListElement) {
                console.log('🔄 refreshUserAndTeamLists: Updating users list');
                usersListElement.innerHTML = generateUsersHTML(usersResponse.users);
            }
            
            // Update users tab counter
            const usersTabCount = document.querySelector('#users-tab .management-tab-count');
            if (usersTabCount) {
                console.log('🔄 refreshUserAndTeamLists: Updating users tab count');
                usersTabCount.textContent = usersResponse.users.length;
            }
        }
        
        // Refresh teams
        const teamsResponse = await apiCall('/teams');
        if (teamsResponse.success && teamsResponse.teams) {
            const teamsListElement = document.getElementById('teams-list');
            if (teamsListElement) {
                console.log('🔄 refreshUserAndTeamLists: Updating teams list');
                teamsListElement.innerHTML = generateTeamsHTML(teamsResponse.teams);
            }
            
            // Update teams tab counter
            const teamsTabCount = document.querySelector('#teams-tab .management-tab-count');
            if (teamsTabCount) {
                console.log('🔄 refreshUserAndTeamLists: Updating teams tab count');
                teamsTabCount.textContent = teamsResponse.teams.length;
            }
        }
        
        console.log('🔄 refreshUserAndTeamLists: Refresh completed successfully');
    } catch (error) {
        console.warn('Failed to refresh user and team lists:', error);
    }
}


function getRoleDisplayName(role) {
    const roleMap = {
        'root': 'Root User',
        'admin': 'Administrator', 
        'user': 'User'
    };
    return roleMap[role] || role;
}

function closeUsersModal() {
    const modal = document.getElementById('users-modal');
    if (modal) {
        // Remove from modal stack
        if (window.modalStack) {
            const index = window.modalStack.indexOf('users-modal');
            if (index > -1) {
                window.modalStack.splice(index, 1);
            }
        }
        
        modal.classList.add('hidden');
        setTimeout(() => {
            modal.remove();
            // Reset modal z-index
            modal.style.zIndex = '';
        }, 300);
    }
}

let allTeamsData = []; // Global variable to store all teams for filtering
let filteredTeamsData = []; // Global variable to store filtered teams

async function editUser(userId, username, currentRole) {
    try {
        // Carregar apenas dados do usuário
        const userResponse = await apiCall(`/users/${userId}`);
        
        if (!userResponse.success) {
            showError('Failed to load user data');
            return;
        }
        
        // Carregar teams apenas se ainda não estiverem carregados
        let teamsResponse;
        if (!allTeamsData || allTeamsData.length === 0) {
            teamsResponse = await apiCall('/teams');
            if (!teamsResponse.success) {
                showError('Failed to load teams data');
                return;
            }
        }
        
        const user = userResponse.user;
        
        // Armazenar teams do usuário no estado global
        window.currentEditingUserTeams = user.teams || [];
        
        // Só atualizar allTeamsData se carregamos teams agora
        if (teamsResponse) {
            allTeamsData = teamsResponse.teams || [];
        }
        filteredTeamsData = [...allTeamsData];
        
        // Configurar o título do modal
        document.getElementById('edit-user-modal-title').textContent = username;
        document.getElementById('edit-user-modal-subtitle').textContent = `Configure permissions and team access for ${username}`;
        
        // Configurar o select de role com lógica de segurança
        const roleSelect = document.getElementById('edit-user-role');
        roleSelect.innerHTML = '<option value="">Select role...</option>';
        
        // Adicionar opções baseadas na regra de negócio
        const userOption = document.createElement('option');
        userOption.value = 'user';
        userOption.textContent = 'User - View only access';
        userOption.selected = user.role === 'user';
        roleSelect.appendChild(userOption);
        
        const adminOption = document.createElement('option');
        adminOption.value = 'admin';
        adminOption.textContent = 'Admin - Create & modify content';
        adminOption.selected = user.role === 'admin';
        roleSelect.appendChild(adminOption);
        
        // Regra: Apenas o próprio root pode editar seu role para root
        if (currentUser && currentUser.role === 'root' && currentUser.id === userId) {
            const rootOption = document.createElement('option');
            rootOption.value = 'root';
            rootOption.textContent = 'Root - Full system access';
            rootOption.selected = user.role === 'root';
            roleSelect.appendChild(rootOption);
        }
        
        // Configurar pesquisa de teams
        const searchInput = document.getElementById('team-search-input');
        searchInput.value = '';
        searchInput.addEventListener('input', (e) => {
            filterTeams(e.target.value, user.teams);
        });
        
        // Renderizar teams inicialmente
        renderTeamsList(user.teams);
        
        // Configurar o botão de salvar
        const saveBtn = document.getElementById('save-user-changes-btn');
        saveBtn.onclick = () => saveUserChanges(userId, username);
        
        // Abrir o modal
        openModal('edit-user-modal');
        
    } catch (error) {
        showError('Failed to load user data: ' + error.message);
    }
}

function filterTeams(searchTerm, userTeams) {
    const term = searchTerm.toLowerCase().trim();
    
    if (term === '') {
        filteredTeamsData = [...allTeamsData];
    } else {
        filteredTeamsData = allTeamsData.filter(team => 
            team.name.toLowerCase().includes(term) || 
            (team.description && team.description.toLowerCase().includes(term))
        );
    }
    
    renderTeamsList(userTeams);
}

function renderTeamsList(userTeams) {
    const teamsContainer = document.getElementById('edit-user-teams');
    const emptyState = document.getElementById('teams-empty-state');
    
    
    if (filteredTeamsData.length === 0) {
        teamsContainer.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    teamsContainer.innerHTML = filteredTeamsData.map(team => {
        const isAssociated = userTeams && userTeams.some(userTeam => userTeam.id === team.id);
        const teamInitial = team.name.charAt(0).toUpperCase();
        
        return `
            <div class="team-item" data-team-id="${team.id}">
                <div class="team-info">
                    <div class="team-avatar">${teamInitial}</div>
                    <div class="team-details">
                        <h5>${team.name}</h5>
                        <p>${team.description || 'No description available'}</p>
                    </div>
                </div>
                <div class="team-toggle">
                    <label class="toggle-switch" for="team-switch-${team.id}">
                        <input type="checkbox" 
                               id="team-switch-${team.id}" 
                               value="${team.id}" 
                               class="toggle-input team-switch-input"
                               ${isAssociated ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
        `;
    }).join('');
}


async function saveUserChanges(userId, username) {
    try {
        showGlobalLoading();
        
        const newRole = document.getElementById('edit-user-role').value;
        const selectedTeams = [];
        document.querySelectorAll('.team-switch-input:checked').forEach(checkbox => {
            selectedTeams.push(checkbox.value);
        });
        
        if (!newRole) {
            showError('Please select a role for the user');
            return;
        }
        
        // Obter teams atuais do estado do modal (já carregados)
        const currentUserTeams = window.currentEditingUserTeams || [];
        const currentTeams = currentUserTeams.map(team => team.id);
        
        // Calcular teams a adicionar e remover
        const teamsToAdd = selectedTeams.filter(teamId => !currentTeams.includes(teamId));
        const teamsToRemove = currentTeams.filter(teamId => !selectedTeams.includes(teamId));
        
        // Atualizar usuário com role e associações de teams em uma única requisição
        const updateData = {
            role: newRole
        };
        
        if (teamsToAdd.length > 0) {
            updateData.teams_to_add = teamsToAdd;
        }
        
        if (teamsToRemove.length > 0) {
            updateData.teams_to_remove = teamsToRemove;
        }
        
        const updateResponse = await apiCall(`/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });
        
        if (!updateResponse.success) {
            showError(updateResponse.error || 'Failed to update user');
            return;
        }
        
        showSuccess(`User "${username}" updated successfully`);
        console.log('💾 saveUserChanges: Closing edit modal...');
        closeModal('edit-user-modal');
        
        // Add small delay to ensure modal is properly closed before refreshing
        setTimeout(async () => {
            // Verificar se ainda há modal de usuários aberto antes de atualizar
            const usersModal = document.getElementById('users-modal');
            console.log('💾 saveUserChanges: Users modal exists?', !!usersModal, 'Hidden?', usersModal?.classList.contains('hidden'));
            
            if (usersModal && !usersModal.classList.contains('hidden')) {
                console.log('💾 saveUserChanges: Refreshing user and team lists...');
                // Apenas atualizar a lista de usuários sem recriar o modal
                await refreshUserAndTeamLists();
            } else {
                console.log('💾 saveUserChanges: Not refreshing - modal not found or hidden');
            }
        }, 100);
        
    } catch (error) {
        showError('Failed to update user: ' + error.message);
    } finally {
        hideGlobalLoading();
    }
}

async function deleteUser(userId, username) {
    const confirmed = await showConfirmationModal(
        'Delete User',
        `Are you sure you want to delete user "${username}"?`,
        'This action cannot be undone. The user will be permanently removed from the system and will lose access to all applications and teams.',
        'Delete User',
        'Cancel',
        'danger'
    );
    
    if (!confirmed) {
        return;
    }
    
    try {
        showGlobalLoading();
        await apiCall(`/users/${userId}`, { method: 'DELETE' });
        showSuccess(`User "${username}" deleted successfully`);
        
        // Verificar se ainda há modal de usuários aberto antes de atualizar
        const usersModal = document.getElementById('users-modal');
        if (usersModal && !usersModal.classList.contains('hidden')) {
            // Apenas atualizar a lista de usuários sem recriar o modal
            await refreshUserAndTeamLists();
        }
    } catch (error) {
        showError('Failed to delete user: ' + error.message);
    } finally {
        hideGlobalLoading();
    }
}

// Funções de Tab Management
function switchTab(tabName) {
    // Remove active class from all tabs and content
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to selected tab and content
    document.getElementById(`${tabName}-tab`).classList.add('active');
    document.getElementById(`${tabName}-tab-content`).classList.add('active');
}

// Funções de Team Management
async function openCreateTeamForm() {
    const formHTML = `
        <div id="create-team-form" class="form-section" style="margin-top: 20px; border-top: 1px solid #e9ecef; padding-top: 20px;">
            <div class="section-header">
                <h4 class="section-title">Create New Team</h4>
            </div>
            <form id="new-team-form">
                <div class="form-field">
                    <label class="field-label" for="new-team-name">
                        Team Name
                        <span class="field-description">Choose a unique team name</span>
                    </label>
                    <input type="text" id="new-team-name" class="form-input" placeholder="Enter team name" required>
                </div>
                
                <div class="form-field">
                    <label class="field-label" for="new-team-description">
                        Description
                        <span class="field-description">Brief description of the team's purpose</span>
                    </label>
                    <textarea id="new-team-description" class="form-input" placeholder="Enter team description" rows="3"></textarea>
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="cancelCreateTeam()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Create Team</button>
                </div>
            </form>
        </div>
    `;
    
    // Adicionar formulário
    document.getElementById('teams-list').insertAdjacentHTML('beforebegin', formHTML);
    
    // Adicionar event listener para submit
    document.getElementById('new-team-form').addEventListener('submit', createNewTeam);
}

function cancelCreateTeam() {
    const form = document.getElementById('create-team-form');
    if (form) {
        form.remove();
    }
}

async function createNewTeam(event) {
    event.preventDefault();
    
    const name = document.getElementById('new-team-name').value.trim();
    const description = document.getElementById('new-team-description').value.trim();
    
    if (!name) {
        showError('Please enter a team name');
        return;
    }
    
    try {
        showGlobalLoading();
        const response = await apiCall('/teams', {
            method: 'POST',
            body: JSON.stringify({
                name: name,
                description: description
            })
        });
        
        showSuccess(`Team "${name}" created successfully`);
        
        // Limpar formulário
        cancelCreateTeam();
        
        // Recarregar lista de teams
        const teamsResponse = await apiCall('/teams');
        document.getElementById('teams-list').innerHTML = generateTeamsHTML(teamsResponse.teams);
        
        // Atualizar contador na aba
        const teamsTabCount = document.querySelector('#teams-tab .management-tab-count');
        if (teamsTabCount) {
            teamsTabCount.textContent = teamsResponse.teams.length;
        }
        
    } catch (error) {
        showError('Failed to create team: ' + error.message);
    } finally {
        hideGlobalLoading();
    }
}

async function deleteTeam(teamId, teamName) {
    const confirmed = await showConfirmationModal(
        'Delete Team',
        `Are you sure you want to delete team "${teamName}"?`,
        'This action cannot be undone. The team will be permanently removed from the system and all user associations will be lost.',
        'Delete Team',
        'Cancel',
        'danger'
    );
    
    if (!confirmed) {
        return;
    }
    
    try {
        showGlobalLoading();
        await apiCall(`/teams/${teamId}`, { method: 'DELETE' });
        showSuccess(`Team "${teamName}" deleted successfully`);
        
        // Recarregar lista de teams
        const response = await apiCall('/teams');
        document.getElementById('teams-list').innerHTML = generateTeamsHTML(response.teams);
        
        // Atualizar contador na aba
        const teamsTabCount = document.querySelector('#teams-tab .management-tab-count');
        if (teamsTabCount) {
            teamsTabCount.textContent = response.teams.length;
        }
        
    } catch (error) {
        showError('Failed to delete team: ' + error.message);
    } finally {
        hideGlobalLoading();
    }
}

// Funções placeholder para funcionalidades avançadas
function manageUserTeams(userId, username) {
    showInfo(`Team management for user "${username}" will be implemented soon`);
}

function manageTeamMembers(teamId, teamName) {
    showInfo(`Member management for team "${teamName}" will be implemented soon`);
}

async function editTeam(teamId, teamName, description) {
    try {
        // Load team data and check if approval is enabled
        const [teamData, approvalEnabled] = await Promise.all([
            apiCall(`/teams/${teamId}`),
            apiCall('/approval/enabled')
        ]);

        // Populate modal fields
        document.getElementById('edit-team-name').value = teamName || '';
        document.getElementById('edit-team-description').value = description || '';
        document.getElementById('edit-team-modal-title').textContent = `Edit ${teamName}`;
        
        // Store team ID for later use
        document.getElementById('edit-team-modal').dataset.teamId = teamId;
        
        // Reset approval section visibility
        document.getElementById('edit-team-approval-section').style.display = 'block';
        
        // Load team members and approvers if user has permission
        const currentUser = JSON.parse(sessionStorage.getItem('current_user') || '{}');
        
        if (currentUser.role === 'root') {
            // Root sempre pode gerenciar approvers
            await loadTeamMembers(teamId);
            document.getElementById('edit-team-approval-disabled').classList.add('hidden');
            document.getElementById('edit-team-approvers-container').classList.remove('hidden');
        } else if (currentUser.role === 'admin' && approvalEnabled.data?.enabled) {
            // Admin só pode se sistema estiver habilitado
            await loadTeamMembers(teamId);
            document.getElementById('edit-team-approval-disabled').classList.add('hidden');
            document.getElementById('edit-team-approvers-container').classList.remove('hidden');
        } else if (currentUser.role === 'admin' && !approvalEnabled.data?.enabled) {
            // Admin mas sistema desabilitado
            document.getElementById('edit-team-approval-disabled').classList.remove('hidden');
            document.getElementById('edit-team-approvers-container').classList.add('hidden');
        } else {
            // User - ocultar toda a seção de approval
            document.getElementById('edit-team-approval-section').style.display = 'none';
        }
        
        // Show modal
        openModal('edit-team-modal');
    } catch (error) {
        console.error('Error loading team data:', error);
        showError('Failed to load team information');
    }
}

async function loadTeamMembers(teamId) {
    try {
        const [membersResponse, approversResponse] = await Promise.all([
            apiCall(`/teams/${teamId}/users`),
            apiCall(`/teams/${teamId}/approvers`)
        ]);
        
        const members = membersResponse.users || [];
        const approvers = approversResponse.data || [];
        
        // Create a map of approver user IDs for quick lookup
        const approverMap = new Map();
        approvers.forEach(approver => {
            if (approver.is_approver) {
                approverMap.set(approver.user_id, true);
            }
        });
        
        const approversList = document.getElementById('edit-team-approvers-list');
        const emptyState = document.getElementById('edit-team-approvers-empty');
        
        if (members.length === 0) {
            approversList.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }
        
        emptyState.classList.add('hidden');
        
        // Filter to show only admin and root members
        const adminMembers = members.filter(member => member.role === 'admin' || member.role === 'root');
        
        if (adminMembers.length === 0) {
            approversList.innerHTML = '<div class="empty-state">No admin/root members in this team</div>';
            return;
        }
        
        // Render admin/root team members with approver toggles
        approversList.innerHTML = adminMembers.map(member => {
            const canBeApprover = true; // All filtered members can be approvers
            
            return `
                <div class="approver-item" data-user-id="${member.id}">
                    <div class="approver-info">
                        <div class="approver-avatar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                <circle cx="12" cy="7" r="4"/>
                            </svg>
                        </div>
                        <div class="approver-details">
                            <h6>${member.username}</h6>
                            <span class="role-badge ${member.role.toLowerCase()}">${member.role}</span>
                        </div>
                    </div>
                    <div class="approver-toggle">
                        <label class="switch">
                            <input type="checkbox" 
                                   onchange="toggleApprover('${teamId}', '${member.id}', this.checked)"
                                   ${approverMap.has(member.id) ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                        <span class="toggle-label">Approver</span>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading team members:', error);
        showError('Failed to load team members');
    }
}

async function toggleApprover(teamId, userId, isApprover) {
    try {
        const response = await apiCall(`/teams/${teamId}/approvers/${userId}`, {
            method: 'POST',
            body: JSON.stringify({ is_approver: isApprover })
        });
        
        // A API agora retorna os approvers atualizados, vamos usar isso para atualizar a interface
        if (response.data) {
            // Atualizar o mapa de approvers
            const newApprovers = response.data;
            
            // Reconstruir o mapa de approvers
            const approverMap = new Map();
            newApprovers.forEach(approver => {
                if (approver.is_approver) {
                    approverMap.set(approver.user_id, true);
                }
            });
            
            // Atualizar todos os switches baseado no novo estado
            const allToggles = document.querySelectorAll('#edit-team-approvers-list input[type="checkbox"]');
            allToggles.forEach(toggle => {
                const userDiv = toggle.closest('[data-user-id]');
                if (userDiv) {
                    const currentUserId = userDiv.dataset.userId;
                    toggle.checked = approverMap.has(currentUserId);
                }
            });
        }
        
        showSuccess(isApprover ? 'User added as approver' : 'User removed as approver');
    } catch (error) {
        console.error('Error updating approver status:', error);
        showError('Failed to update approver status');
        
        // Revert toggle state on error
        const toggle = document.querySelector(`[data-user-id="${userId}"] input[type="checkbox"]`);
        if (toggle) {
            toggle.checked = !isApprover;
        }
    }
}

async function saveTeamChanges() {
    const teamId = document.getElementById('edit-team-modal').dataset.teamId;
    const name = document.getElementById('edit-team-name').value.trim();
    const description = document.getElementById('edit-team-description').value.trim();
    
    if (!name) {
        showError('Team name is required');
        return;
    }
    
    const saveBtn = document.getElementById('save-team-btn');
    const btnText = saveBtn.querySelector('.btn-text');
    const btnLoading = saveBtn.querySelector('.btn-loading');
    
    try {
        // Show loading state
        btnText.classList.add('hidden');
        btnLoading.classList.remove('hidden');
        saveBtn.disabled = true;
        
        await apiCall(`/teams/${teamId}`, {
            method: 'PUT',
            body: JSON.stringify({
                name,
                description
            })
        });
        
        showSuccess('Team updated successfully');
        closeModal('edit-team-modal');
        
        // Note: Team list refresh would be handled by the calling context if needed
        
    } catch (error) {
        console.error('Error saving team changes:', error);
        showError('Failed to save team changes');
    } finally {
        // Reset button state
        btnText.classList.remove('hidden');
        btnLoading.classList.add('hidden');
        saveBtn.disabled = false;
    }
}

async function openCreateUserForm() {
    // Load teams for selection
    let teams = [];
    try {
        const teamsResponse = await apiCall('/teams');
        teams = teamsResponse.teams || [];
    } catch (error) {
        console.warn('Could not load teams for user creation:', error);
    }

    const formHTML = `
        <div id="create-user-form" class="management-form-section">
            <div class="management-form-header">
                <h4 class="management-form-title">Create New User</h4>
                <p class="management-form-description">Add a new user to the system with role and team assignments</p>
            </div>
            <form id="new-user-form">
                <div class="form-field">
                    <label class="field-label" for="new-username">
                        Username
                        <span class="field-description">Choose a unique username</span>
                    </label>
                    <input type="text" id="new-username" class="form-input" placeholder="Enter username" required>
                </div>
                
                <div class="form-field">
                    <label class="field-label" for="new-role">
                        Role
                        <span class="field-description">Select user role and permissions</span>
                    </label>
                    <select id="new-role" class="form-select" required>
                        <option value="">Select role...</option>
                        <option value="user">User - View only access</option>
                        <option value="admin">Admin - Full access</option>
                    </select>
                </div>
                
                <div class="form-field">
                    <label class="field-label">
                        Team Associations
                        <span class="field-description">Select teams this user should belong to</span>
                    </label>
                    <div id="teams-selection" class="teams-checkbox-list">
                        ${teams.length > 0 ? teams.map(team => `
                            <label class="checkbox-item">
                                <input type="checkbox" name="user-teams" value="${team.id}" class="team-checkbox">
                                <span class="checkbox-label">${team.name}</span>
                            </label>
                        `).join('') : '<p class="empty-message">No teams available. Create teams first to associate users.</p>'}
                    </div>
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="cancelCreateUser()">Cancel</button>
                    <button type="submit" class="btn btn-primary">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z"/>
                        </svg>
                        Create User
                    </button>
                </div>
            </form>
        </div>
    `;
    
    // Insert form into users tab content
    const existingForm = document.getElementById('create-user-form');
    if (existingForm) {
        existingForm.remove();
    }
    
    const usersPanel = document.getElementById('users-panel');
    const usersList = document.getElementById('users-list');
    usersList.insertAdjacentHTML('beforebegin', formHTML);
    
    // Add form submission handler
    document.getElementById('new-user-form').addEventListener('submit', createNewUser);
}

function cancelCreateUser() {
    const form = document.getElementById('create-user-form');
    if (form) {
        form.remove();
    }
}

async function createNewUser(event) {
    event.preventDefault();
    
    const username = document.getElementById('new-username').value.trim();
    const role = document.getElementById('new-role').value;
    
    if (!username || !role) {
        showError('Please fill in all required fields');
        return;
    }
    
    // Get selected teams
    const selectedTeams = [];
    document.querySelectorAll('input[name="user-teams"]:checked').forEach(checkbox => {
        selectedTeams.push(checkbox.value);
    });
    
    try {
        showGlobalLoading();
        const response = await apiCall('/users', {
            method: 'POST',
            body: JSON.stringify({
                username: username,
                role: role
            })
        });
        
        if (response.success) {
            // Show password in professional modal
            showPasswordModal(username, response.password);
            
            // Associate user with selected teams
            if (selectedTeams.length > 0 && response.user) {
                for (const teamId of selectedTeams) {
                    try {
                        await apiCall(`/teams/${teamId}/users`, {
                            method: 'POST',
                            body: JSON.stringify({
                                user_id: response.user.id
                            })
                        });
                    } catch (teamError) {
                        console.warn(`Failed to add user to team ${teamId}:`, teamError);
                    }
                }
            }
            
            // Limpar formulário
            cancelCreateUser();
            
            // Verificar se ainda há modal de usuários aberto antes de atualizar
            const usersModal = document.getElementById('users-modal');
            if (usersModal && !usersModal.classList.contains('hidden')) {
                // Apenas atualizar a lista de usuários sem recriar o modal
                await refreshUserAndTeamLists();
            }
        } else {
            showError('Failed to create user: ' + response.error);
        }
        
    } catch (error) {
        showError('Failed to create user: ' + error.message);
    } finally {
        hideGlobalLoading();
    }
}

// Initialize page when loaded  
document.addEventListener('DOMContentLoaded', async function() {
    // Não inicializar se estamos na página de mudança de senha ou login
    if (window.location.pathname.includes('/change-password') || 
        window.location.pathname.includes('/login')) {
        return;
    }
    
    // Carregar usuário atual primeiro
    const user = await loadCurrentUser();
    
    // Se o usuário não foi carregado ou precisa mudar senha, não continuar
    if (!user) {
        return;
    }
    
    // Só então inicializar o resto da interface
    console.log('[DEBUG] DOMContentLoaded: Initializing user interface');
    initializeUserInterface();
    
    console.log('[DEBUG] DOMContentLoaded: Initializing event listeners');
    await initializeEventListeners();
    
    console.log('[DEBUG] DOMContentLoaded: Loading applications');
    await loadApplications();
    
    // Inicializar sistema de aprovação após aplicações carregarem com sucesso
    console.log('[DEBUG] DOMContentLoaded: Initializing approval system');
    initializeApprovalSystemAfterAuth();
    
    // Após carregar tudo, fazer fade-in suave da página
    console.log('[DEBUG] DOMContentLoaded: Showing page with smooth transition');
    showPageWithTransition();
});

// Função para mostrar a página com transição suave
function showPageWithTransition() {
    // Encontrar overlay de transição
    const overlay = document.getElementById('page-transition-overlay');
    const appLayout = document.querySelector('.app-layout');
    
    // Garantir que o layout da página esteja pronto
    if (appLayout) {
        // Adicionar classe loaded para fade-in
        appLayout.classList.add('loaded');
        
        // Ocultar overlay de loading após um breve delay
        setTimeout(() => {
            if (overlay) {
                overlay.classList.add('hidden');
                
                // Remover o overlay do DOM após a transição
                setTimeout(() => {
                    if (overlay && overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
                }, 500);
            }
        }, 300);
    }
}

// Função para criar overlay de transição (compatibilidade com login.js)
function createPageTransition(text, subtext) {
    // Verificar se já existe um overlay
    let overlay = document.getElementById('page-transition-overlay');
    
    if (!overlay) {
        // Criar overlay se não existir
        overlay = document.createElement('div');
        overlay.id = 'page-transition-overlay';
        overlay.className = 'page-transition-overlay';
        
        overlay.innerHTML = `
            <div class="page-transition-content">
                <div class="page-transition-spinner"></div>
                <div class="page-transition-text">${text}</div>
                <div class="page-transition-subtext">${subtext}</div>
            </div>
        `;
        
        document.body.appendChild(overlay);
    } else {
        // Atualizar conteúdo se já existir
        const textElement = overlay.querySelector('.page-transition-text');
        const subtextElement = overlay.querySelector('.page-transition-subtext');
        
        if (textElement) textElement.textContent = text;
        if (subtextElement) subtextElement.textContent = subtext;
        
        // Mostrar overlay se estiver oculto
        overlay.classList.remove('hidden');
    }
    
    // Forçar o reflow para garantir que a transição funcione
    overlay.offsetHeight;
}

// ============================
// Sistema de Aprovação
// ============================

let approvalData = {
    settings: null,
    pendingRequests: [],
    myRequests: [],
    allRequests: [],
    currentTab: 'pending'
};

// Abrir modal de aprovação
async function openApprovalModal() {
    try {
        closeUserMenu();
        
        // Carregar dados iniciais
        await loadApprovalData();
        
        // Configurar visibilidade baseada no role do usuário
        setupApprovalModalForUser();
        
        openModal('approval-modal');
        
        // Carregar requests da aba ativa
        await loadApprovalRequests();
        
    } catch (error) {
        console.error('Erro ao abrir modal de aprovação:', error);
        showToast('Erro ao carregar dados de aprovação', 'error');
    }
}

// Função para obter o role do usuário atual
function getCurrentUserRole() {
    const currentUser = JSON.parse(sessionStorage.getItem('current_user') || '{}');
    return currentUser.role || null;
}

// Configurar modal baseado no role do usuário
function setupApprovalModalForUser() {
    const settingsTabBtn = document.getElementById('approval-settings-tab-btn');
    const userRole = getCurrentUserRole();
    
    // Show settings tab only for root users
    if (userRole === 'root') {
        settingsTabBtn.style.display = 'flex';
        // Start with Settings tab active for root
        switchApprovalMainTab('settings');
    } else {
        settingsTabBtn.style.display = 'none';
        // Start with Requests tab active for non-root users
        switchApprovalMainTab('requests');
    }
}


// Carregar dados de aprovação
async function loadApprovalData() {
    try {
        // Verificar se há usuário logado antes de carregar dados
        const currentUser = JSON.parse(sessionStorage.getItem('current_user') || '{}');
        if (!currentUser.id) {
            console.log('[DEBUG] loadApprovalData: No user logged in, skipping');
            return;
        }
        
        // Carregar contadores de requests pendentes
        await loadPendingRequestsCount();
        
    } catch (error) {
        console.error('Erro ao carregar dados de aprovação:', error);
    }
}

// Carregar contagem de requests pendentes
async function loadPendingRequestsCount() {
    try {
        // Verificar se há usuário logado antes de fazer a requisição
        const currentUser = JSON.parse(sessionStorage.getItem('current_user') || '{}');
        if (!currentUser.id) {
            return;
        }
        
        let requests = await apiCall('/approval/requests/approvable');
        console.log('[DEBUG] loadPendingRequestsCount: Raw response:', {
            requests,
            requestsType: typeof requests,
            requestsKeys: Object.keys(requests || {}),
            requestsData: requests?.data,
            requestsDataType: typeof requests?.data,
            requestsDataLength: requests?.data?.length
        });
        
        // Retry logic: Se retornou null ou vazio mas há dados esperados, tentar novamente
        if (requests && !requests.data && requests.message) {
            console.log('[DEBUG] loadPendingRequestsCount: Requests data is null, attempting session refresh strategy...');
            try {
                // First, clear any cached data
                apiCache.clear('/approval/');
                
                // Try to refresh user profile to ensure session is valid
                const profileResponse = await apiCall('/profile', { forceRefresh: true });
                if (profileResponse && profileResponse.success && profileResponse.user) {
                    // Update session storage with fresh user data
                    sessionStorage.setItem('current_user', JSON.stringify(profileResponse.user));
                    
                    // Now retry the approvable requests with force refresh
                    const retryResponse = await apiCall('/approval/requests/approvable', { forceRefresh: true });
                    if (retryResponse && retryResponse.data) {
                        requests = retryResponse;
                        console.log('[DEBUG] loadPendingRequestsCount: Session refresh successful:', { requests: retryResponse });
                    } else {
                        console.warn('[DEBUG] loadPendingRequestsCount: Session refresh still returned null data');
                    }
                } else {
                    console.warn('[DEBUG] loadPendingRequestsCount: Failed to refresh user profile');
                }
            } catch (retryError) {
                console.warn('[DEBUG] loadPendingRequestsCount: Session refresh failed:', retryError);
            }
        }
        
        if (requests && requests.data) {
            const count = requests.data.length;
            
            // Atualizar badge no menu
            const badge = document.getElementById('approval-badge');
            if (count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
            
            // Atualizar badge na tab principal de requests
            const mainTabBadge = document.getElementById('main-pending-count-badge');
            if (mainTabBadge) {
                mainTabBadge.textContent = count;
            }
            
            // Atualizar badge na sub-tab de pending requests
            const pendingTabBadge = document.getElementById('pending-count-badge');
            if (pendingTabBadge) {
                pendingTabBadge.textContent = count;
            }
        }
    } catch (error) {
        console.error('Erro ao carregar contagem de requests:', error);
    }
}

// Switch between main approval tabs (Settings and Requests)
function switchApprovalMainTab(tabName) {
    // Update main tab buttons
    const settingsBtn = document.getElementById('approval-settings-tab-btn');
    const requestsBtn = document.getElementById('approval-requests-tab-btn');
    
    settingsBtn.classList.remove('active');
    requestsBtn.classList.remove('active');
    
    // Update main tab content
    const settingsTab = document.getElementById('approval-settings-main-tab');
    const requestsTab = document.getElementById('approval-requests-main-tab');
    
    settingsTab.classList.add('hidden');
    requestsTab.classList.add('hidden');
    
    if (tabName === 'settings') {
        settingsBtn.classList.add('active');
        settingsTab.classList.remove('hidden');
    } else if (tabName === 'requests') {
        requestsBtn.classList.add('active');
        requestsTab.classList.remove('hidden');
    }
}

// Switch between nested request tabs (Pending, My Requests, All Requests)  
function switchApprovalTab(tabName) {
    // Update nested tab buttons
    const nestedContainer = document.querySelector('.tabs-container.nested');
    if (!nestedContainer) return;
    
    const nestedButtons = nestedContainer.querySelectorAll('.tab-button');
    nestedButtons.forEach(btn => btn.classList.remove('active'));
    
    const activeButton = nestedContainer.querySelector(`[onclick="switchApprovalTab('${tabName}')"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
    
    // Update nested tab content
    const nestedTabContents = nestedContainer.querySelectorAll('.tab-content');
    nestedTabContents.forEach(content => content.classList.add('hidden'));
    
    // Convert tab name to correct ID
    let tabId = tabName;
    if (tabName === 'pending') {
        tabId = 'pending-requests';
    }
    tabId += '-tab';
    
    const tabElement = document.getElementById(tabId);
    if (tabElement) {
        tabElement.classList.remove('hidden');
    } else {
        console.error(`Tab element not found: ${tabId}`);
    }
    
    approvalData.currentTab = tabName;
    loadApprovalRequests();
}

// Carregar requests de aprovação
async function loadApprovalRequests() {
    try {
        let endpoint = '';
        let listId = '';
        
        switch (approvalData.currentTab) {
            case 'pending':
                endpoint = '/approval/requests/approvable';
                listId = 'pending-requests-list';
                break;
            case 'my-requests':
                endpoint = '/approval/requests/my';
                listId = 'my-requests-list';
                break;
            case 'all-requests':
                endpoint = '/approval/requests';
                listId = 'all-requests-list';
                break;
        }
        
        let response = await apiCall(endpoint);
        
        // Retry logic: Se retornou null nos dados mas tem mensagem de sucesso, tentar novamente
        if (response && !response.data && response.message && approvalData.currentTab === 'pending') {
            console.log('[DEBUG] loadApprovalRequests: Pending requests returned null, attempting session refresh strategy...');
            try {
                // First, clear any cached data
                apiCache.clear('/approval/');
                
                // Try to refresh user profile to ensure session is valid
                const profileResponse = await apiCall('/profile', { forceRefresh: true });
                if (profileResponse && profileResponse.success && profileResponse.user) {
                    // Update session storage with fresh user data
                    sessionStorage.setItem('current_user', JSON.stringify(profileResponse.user));
                    
                    // Now retry the endpoint with force refresh
                    const retryResponse = await apiCall(endpoint, { forceRefresh: true });
                    if (retryResponse && retryResponse.data) {
                        response = retryResponse;
                        console.log('[DEBUG] loadApprovalRequests: Session refresh successful for pending requests');
                    } else {
                        console.warn('[DEBUG] loadApprovalRequests: Session refresh still returned null data');
                    }
                } else {
                    console.warn('[DEBUG] loadApprovalRequests: Failed to refresh user profile');
                }
            } catch (retryError) {
                console.warn('[DEBUG] loadApprovalRequests: Retry failed:', retryError);
            }
        }
        
        if (response) {
            // Extrair array de requests da resposta da API
            const requests = response.data || [];
            
            // Atualizar lista correspondente
            const listElement = document.getElementById(listId);
            listElement.innerHTML = renderApprovalRequests(requests, approvalData.currentTab);
            
            // Armazenar dados
            switch (approvalData.currentTab) {
                case 'pending':
                    approvalData.pendingRequests = requests;
                    break;
                case 'my-requests':
                    approvalData.myRequests = requests;
                    break;
                case 'all-requests':
                    approvalData.allRequests = requests;
                    break;
            }
        }
    } catch (error) {
        console.error('Erro ao carregar requests de aprovação:', error);
        showToast('Erro ao carregar solicitações de aprovação', 'error');
    }
}

// Renderizar lista de requests
function renderApprovalRequests(requests, tabType) {
    if (!requests || !Array.isArray(requests) || requests.length === 0) {
        return `
            <div class="approval-empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 12l2 2 4-4"/>
                    <circle cx="12" cy="12" r="10"/>
                </svg>
                <h3>No Requests Found</h3>
                <p>There are no approval requests in this category.</p>
            </div>
        `;
    }
    
    return requests.map(request => renderApprovalRequestCard(request, tabType)).join('');
}

// Renderizar card de request individual
function renderApprovalRequestCard(request, tabType) {
    const statusClass = getRequestStatusClass(request.status);
    const actionTypeDisplay = getActionTypeDisplay(request.action_type);
    const canApprove = tabType === 'pending';
    
    return `
        <div class="approval-request-card ${statusClass}">
            <div class="approval-request-header">
                <div class="approval-request-info">
                    <h4 class="approval-request-title">${actionTypeDisplay}</h4>
                    <p class="approval-request-meta">
                        by ${request.requester_name} in ${request.team_name}
                        ${request.application_name ? ` • ${request.application_name}` : ''}
                        ${request.toggle_path ? ` • ${request.toggle_path}` : ''}
                    </p>
                </div>
                <div class="approval-request-status">
                    <span class="status-badge ${statusClass}">${getStatusDisplay(request.status)}</span>
                </div>
            </div>
            
            <div class="approval-request-body">
                <p class="approval-request-description">${request.description || 'No description provided'}</p>
                
                <div class="approval-request-timestamps">
                    <span class="timestamp">Requested: ${formatDate(request.created_at)}</span>
                    ${request.expires_at ? `<span class="timestamp">Expires: ${formatDate(request.expires_at)}</span>` : ''}
                </div>
            </div>
            
            ${canApprove ? `
                <div class="approval-request-actions">
                    <button class="btn btn-success btn-sm" onclick="approveRequest('${request.id}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 6L9 17l-5-5"/>
                        </svg>
                        Approve
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="toggleRejectForm('${request.id}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        Reject
                    </button>
                </div>
                
                <div class="reject-form hidden" id="reject-form-${request.id}">
                    <div class="reject-form-content">
                        <label for="reject-reason-${request.id}" class="reject-form-label">Reason for rejection:</label>
                        <textarea id="reject-reason-${request.id}" class="reject-form-textarea" placeholder="Please provide a reason for rejecting this request..." rows="3"></textarea>
                        <div class="reject-form-actions">
                            <button class="btn btn-secondary btn-sm" onclick="toggleRejectForm('${request.id}')">Cancel</button>
                            <button class="btn btn-danger btn-sm" onclick="confirmRejectRequest('${request.id}')">Confirm Rejection</button>
                        </div>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// Funções auxiliares
function getRequestStatusClass(status) {
    const classes = {
        'pending': 'status-pending',
        'approved': 'status-approved',
        'rejected': 'status-rejected',
        'expired': 'status-expired'
    };
    return classes[status] || 'status-unknown';
}

function getActionTypeDisplay(actionType) {
    const displays = {
        'toggle_create': 'Create Toggle',
        'toggle_update': 'Update Toggle',
        'toggle_delete': 'Delete Toggle',
        'toggle_enable': 'Enable Toggle',
        'toggle_disable': 'Disable Toggle',
        'toggle_rule': 'Change Toggle Rules',
        'application_create': 'Create Application',
        'application_delete': 'Delete Application',
        'secret_key_create': 'Create Secret Key',
        'secret_key_delete': 'Delete Secret Key'
    };
    return displays[actionType] || actionType;
}

function getStatusDisplay(status) {
    const displays = {
        'pending': 'Pending',
        'approved': 'Approved',
        'rejected': 'Rejected',
        'expired': 'Expired'
    };
    return displays[status] || status;
}

// Aprovar request
async function approveRequest(requestId) {
    try {
        // First approve the request
        const response = await apiCall(`/approval/requests/${requestId}/approve`, {
            method: 'POST'
        });
        
        if (response) {
            showToast('Request approved successfully', 'success');
            
            // Then execute the approved action
            try {
                const executeResponse = await apiCall(`/approval/requests/${requestId}/execute`, {
                    method: 'POST'
                });
                
                if (executeResponse) {
                    showToast('Action executed successfully', 'success');
                    
                    // Refresh applications data asynchronously to reflect changes
                    console.log('[DEBUG] executeApprovedAction: Refreshing applications data after successful execution...');
                    try {
                        await loadApplications();
                        console.log('[DEBUG] executeApprovedAction: Applications data refreshed successfully');
                    } catch (refreshError) {
                        console.warn('[WARN] executeApprovedAction: Failed to refresh applications data:', refreshError);
                    }
                } else {
                    showToast('Warning: Request approved but action execution failed', 'warning');
                }
            } catch (executeError) {
                console.error('Erro ao executar ação aprovada:', executeError);
                showToast('Warning: Request approved but action execution failed: ' + executeError.message, 'warning');
            }
            
            // Recarregar dados
            await loadApprovalData();
            await loadApprovalRequests();
        } else {
            throw new Error('Failed to approve request');
        }
    } catch (error) {
        console.error('Erro ao aprovar request:', error);
        showToast('Error approving request: ' + error.message, 'error');
    }
}

// Toggle inline reject form
function toggleRejectForm(requestId) {
    const rejectForm = document.getElementById(`reject-form-${requestId}`);
    if (rejectForm) {
        rejectForm.classList.toggle('hidden');
        
        // Clear textarea when hiding form
        if (rejectForm.classList.contains('hidden')) {
            const textarea = document.getElementById(`reject-reason-${requestId}`);
            if (textarea) {
                textarea.value = '';
            }
        } else {
            // Focus textarea when showing form
            const textarea = document.getElementById(`reject-reason-${requestId}`);
            if (textarea) {
                textarea.focus();
            }
        }
    }
}

// Confirm reject request with inline form
function confirmRejectRequest(requestId) {
    const textarea = document.getElementById(`reject-reason-${requestId}`);
    if (textarea) {
        const reason = textarea.value.trim();
        if (reason === '') {
            showToast('Please provide a reason for rejection', 'error');
            textarea.focus();
            return;
        }
        rejectRequest(requestId, reason);
    }
}

// Rejeitar request
async function rejectRequest(requestId, reason) {
    try {
        const response = await apiCall(`/approval/requests/${requestId}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason })
        });
        
        if (response) {
            showToast('Request rejected successfully', 'success');
            
            // Hide the reject form
            const rejectForm = document.getElementById(`reject-form-${requestId}`);
            if (rejectForm) {
                rejectForm.classList.add('hidden');
            }
            
            // Recarregar dados
            await loadApprovalData();
            await loadApprovalRequests();
        } else {
            throw new Error('Failed to reject request');
        }
    } catch (error) {
        console.error('Erro ao rejeitar request:', error);
        showToast('Error rejecting request: ' + error.message, 'error');
    }
}

// Verificar se aprovação está habilitada e se uma ação precisa aprovação
async function checkApprovalRequired(actionType) {
    try {
        // Root users are always exempt from approval requirements
        const currentUser = JSON.parse(sessionStorage.getItem('current_user') || '{}');
        if (currentUser.role === 'root') {
            console.log('[DEBUG] checkApprovalRequired: Root user detected - skipping approval');
            return false;
        }

        // First check if approval system is enabled
        const enabledResponse = await apiCall('/approval/enabled');
        console.log('[DEBUG] checkApprovalRequired: Approval enabled response:', enabledResponse);
        
        if (!enabledResponse.data || !enabledResponse.data.enabled) {
            console.log('[DEBUG] checkApprovalRequired: Approval system is disabled');
            return false;
        }

        const result = await apiCall(`/approval/required?action_type=${actionType}`);
        if (result && result.data) {
            return result.data.required;
        }
        return false;
    } catch (error) {
        console.error('Erro ao verificar se aprovação é necessária:', error);
        return false;
    }
}

// Inicializar sistema de aprovação
function initializeApprovalSystem() {
    // Approval menu visibility is already updated by updateUIBasedOnUserRole()
    // No need to call updateApprovalMenuVisibility() again to avoid duplicate API calls
    
    // Removed automatic polling to reduce server load
    // Users can manually refresh approval data using the refresh button in the modal
    // Initial count will be loaded only when modal is opened
}

// Manual refresh function for approval data
async function refreshApprovalData() {
    const refreshBtn = document.getElementById('refresh-approval-btn');
    if (!refreshBtn) return;
    
    // Show loading state
    const originalContent = refreshBtn.innerHTML;
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin">
            <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
        Refreshing...
    `;
    
    try {
        console.log('[DEBUG] Manual refresh of approval data requested');
        
        // Refresh all approval-related data
        await Promise.all([
            loadPendingRequestsCount(),
            loadApprovalRequests(),
            updateApprovalMenuVisibility()
        ]);
        
        console.log('[DEBUG] Manual refresh completed successfully');
        showToast('Approval data refreshed successfully', 'success');
        
    } catch (error) {
        console.error('[ERROR] Failed to refresh approval data:', error);
        showToast('Failed to refresh approval data', 'error');
    } finally {
        // Restore button state
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = originalContent;
    }
}

// Função para inicializar o sistema de aprovação após autenticação
function initializeApprovalSystemAfterAuth() {
    if (document.getElementById('approval-modal')) {
        initializeApprovalSystem();
    }
}

// ========================================
// APPROVAL SETTINGS MANAGEMENT
// ========================================

/**
 * Save approval settings configuration
 */
async function saveApprovalSettings() {
    const saveBtn = document.getElementById('save-approval-settings-btn');
    const successFeedback = document.getElementById('save-success-feedback');
    
    if (!saveBtn) return;
    
    try {
        // Show loading state
        saveBtn.classList.add('loading');
        saveBtn.disabled = true;
        
        // Hide any previous success feedback
        successFeedback.classList.remove('show');
        
        // Get approval enabled state
        const approvalEnabledCheckbox = document.getElementById('approval-enabled-checkbox');
        const approvalEnabled = approvalEnabledCheckbox ? approvalEnabledCheckbox.checked : false;
        
        // Collect all approval action settings
        const approvalActions = {};
        const actionCheckboxes = document.querySelectorAll('#approval-actions-config input[data-action]');
        
        actionCheckboxes.forEach(checkbox => {
            const actionType = checkbox.getAttribute('data-action');
            if (actionType) {
                approvalActions[actionType] = checkbox.checked;
            }
        });
        
        console.log('[DEBUG] Saving approval settings:', {
            approval_enabled: approvalEnabled,
            required_actions: approvalActions
        });
        
        // Prepare request data
        const requestData = {
            approval_enabled: approvalEnabled,
            required_actions: approvalActions
        };
        
        // Make API call to save settings
        const response = await apiCall('/approval/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });
        
        console.log('[DEBUG] Save approval settings response:', response);
        
        // Check if response indicates success (has data and message)
        if (response && (response.data || response.message)) {
            // Show success feedback
            successFeedback.classList.add('show');
            
            // Hide success feedback after 3 seconds
            setTimeout(() => {
                successFeedback.classList.remove('show');
            }, 3000);
            
            // Auto-close modal after successful save
            setTimeout(() => {
                closeModal('approval-modal');
            }, 1500);
            
            // Clear cache to force reload of approval settings
            apiCache.clear('approval');
            
            console.log('[SUCCESS] Approval settings saved successfully');
        } else {
            throw new Error(response.message || 'Failed to save approval settings - no data received');
        }
        
    } catch (error) {
        console.error('Error saving approval settings:', error);
        showError('Failed to save approval settings: ' + (error.message || 'Unknown error'));
        
    } finally {
        // Reset button state
        saveBtn.classList.remove('loading');
        saveBtn.disabled = false;
    }
}

/**
 * Load and populate approval settings
 */
async function loadApprovalSettings() {
    try {
        console.log('[DEBUG] Loading approval settings...');
        
        // Get current approval settings
        const response = await apiCall('/approval/settings');
        
        if (response && response.data) {
            const settings = response.data;
            
            console.log('[DEBUG] Loaded approval settings:', settings);
            
            // Set approval enabled checkbox
            const approvalEnabledCheckbox = document.getElementById('approval-enabled-checkbox');
            if (approvalEnabledCheckbox) {
                approvalEnabledCheckbox.checked = settings.approval_enabled || false;
                
                // Toggle actions config visibility
                const actionsConfig = document.getElementById('approval-actions-config');
                if (actionsConfig) {
                    if (settings.approval_enabled) {
                        actionsConfig.classList.remove('hidden');
                    } else {
                        actionsConfig.classList.add('hidden');
                    }
                }
            }
            
            // Set individual action checkboxes
            if (settings.required_actions) {
                Object.entries(settings.required_actions).forEach(([actionType, required]) => {
                    const checkbox = document.querySelector(`input[data-action="${actionType}"]`);
                    if (checkbox) {
                        checkbox.checked = required;
                    }
                });
            }
            
        } else {
            console.warn('Failed to load approval settings:', response.message);
        }
        
    } catch (error) {
        console.error('Error loading approval settings:', error);
    }
}

/**
 * Initialize approval settings when modal opens
 */
function initializeApprovalSettings() {
    // Load current settings
    loadApprovalSettings();
    
    // Setup approval enabled checkbox listener
    const approvalEnabledCheckbox = document.getElementById('approval-enabled-checkbox');
    const actionsConfig = document.getElementById('approval-actions-config');
    
    if (approvalEnabledCheckbox && actionsConfig) {
        approvalEnabledCheckbox.addEventListener('change', function() {
            if (this.checked) {
                actionsConfig.classList.remove('hidden');
            } else {
                actionsConfig.classList.add('hidden');
            }
        });
    }
}

/**
 * Open approval modal and initialize settings
 */
function openApprovalModal() {
    // Open the modal
    const modal = document.getElementById('approval-modal');
    if (modal) {
        modal.classList.remove('hidden');
        
        // Initialize approval settings
        setTimeout(() => {
            initializeApprovalSettings();
        }, 100);
        
        // Focus management for accessibility
        const firstFocusableElement = modal.querySelector('button, [tabindex="0"]');
        if (firstFocusableElement) {
            firstFocusableElement.focus();
        }
    }
}

/**
 * Switch between main tabs in approval modal (settings/requests)
 */
function switchApprovalMainTab(tabName) {
    // Remove active class from all main tab buttons
    document.querySelectorAll('#approval-modal .tabs-nav .tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Hide all main tab contents
    document.querySelectorAll('#approval-modal .tabs-content > .tab-content').forEach(content => {
        content.classList.remove('active');
        content.classList.add('hidden');
    });
    
    // Show selected tab
    const tabButton = document.getElementById(`approval-${tabName}-tab-btn`);
    const tabContent = document.getElementById(`approval-${tabName}-main-tab`);
    
    if (tabButton && tabContent) {
        tabButton.classList.add('active');
        tabContent.classList.add('active');
        tabContent.classList.remove('hidden');
        
        // If switching to settings tab, initialize settings
        if (tabName === 'settings') {
            initializeApprovalSettings();
        }
    }
}

