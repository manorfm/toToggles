// Estado global da aplicação
let currentAppId = null;
let currentAppName = null;
let currentEditingAppId = null;
let editingToggleId = null;
let lastEditedTogglePath = null;

// Elementos DOM
const applicationsSection = document.getElementById('applications-section');
const togglesSection = document.getElementById('toggles-section');
const applicationsList = document.getElementById('applications-list');
const togglesList = document.getElementById('toggles-list');
const appNameElement = document.getElementById('app-name');
const globalLoadingSpinner = document.getElementById('global-loading-spinner');

// Funções de Secret Key
let currentSecretKeyAppId = null;
let currentSecretKeyAppName = null;

async function manageSecretKey(appId, appName) {
    currentSecretKeyAppId = appId;
    currentSecretKeyAppName = appName;
    
    // Atualizar título do modal
    document.getElementById('secret-key-modal-title').textContent = `Secret Key - ${appName}`;
    
    // Reset modal state
    resetSecretKeyModal();
    
    // Verificar se já existe uma secret key
    try {
        const response = await apiCall(`/applications/${appId}/secret-keys`);
        if (response.secret_keys && response.secret_keys.length > 0) {
            showExistingSecretKey(response.secret_keys[0]);
        } else {
            showGenerateSecretKey();
        }
    } catch (error) {
        showGenerateSecretKey();
    }
    
    openModal('secret-key-modal');
}

function resetSecretKeyModal() {
    document.getElementById('secret-key-generate-section').style.display = 'none';
    document.getElementById('secret-key-display-section').style.display = 'none';
    document.getElementById('secret-key-existing-section').style.display = 'none';
}

function showGenerateSecretKey() {
    resetSecretKeyModal();
    document.getElementById('secret-key-generate-section').style.display = 'block';
    document.getElementById('generate-secret-btn').style.display = 'inline-flex';
    document.getElementById('regenerate-secret-btn').style.display = 'none';
}

function showExistingSecretKey(secretKey) {
    resetSecretKeyModal();
    document.getElementById('secret-key-existing-section').style.display = 'block';
    document.getElementById('generate-secret-btn').style.display = 'none';
    document.getElementById('regenerate-secret-btn').style.display = 'inline-flex';
    document.getElementById('secret-key-info').innerHTML = `
        <div class="secret-key-info">
            <p><strong>Name:</strong> ${secretKey.name}</p>
            <p><strong>Created:</strong> ${new Date(secretKey.created_at).toLocaleDateString()}</p>
            <p><strong>Key:</strong> <code>sk_****...****</code></p>
        </div>
    `;
}

function showSecretKeyDisplay(plainKey) {
    resetSecretKeyModal();
    document.getElementById('secret-key-display-section').style.display = 'block';
    document.getElementById('secret-key-value').textContent = plainKey;
    document.getElementById('generate-secret-btn').style.display = 'none';
    document.getElementById('regenerate-secret-btn').style.display = 'none';
}

async function generateSecretKey() {
    try {
        showGlobalLoading();
        const response = await apiCall(`/applications/${currentSecretKeyAppId}/generate-secret`, {
            method: 'POST'
        });
        
        showSecretKeyDisplay(response.plain_key);
        showSuccess('Secret key generated successfully! Save it securely - it will not be shown again.');
    } catch (error) {
        showError('Failed to generate secret key: ' + error.message);
    } finally {
        hideGlobalLoading();
    }
}

async function regenerateSecretKey() {
    if (!confirm('Are you sure you want to regenerate the secret key? This will invalidate the previous key and break any integrations using it.')) {
        return;
    }
    
    try {
        showGlobalLoading();
        const response = await apiCall(`/applications/${currentSecretKeyAppId}/generate-secret`, {
            method: 'POST'
        });
        
        showSecretKeyDisplay(response.plain_key);
        showSuccess('Secret key regenerated successfully! The previous key has been invalidated. Save the new key securely.');
    } catch (error) {
        showError('Failed to regenerate secret key: ' + error.message);
    } finally {
        hideGlobalLoading();
    }
}

function copySecretKey() {
    const secretKeyValue = document.getElementById('secret-key-value').textContent;
    navigator.clipboard.writeText(secretKeyValue).then(() => {
        showSuccess('Secret key copied to clipboard!');
    }).catch(() => {
        showError('Failed to copy secret key to clipboard');
    });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    console.log('[DEBUG] DOMContentLoaded: Document ready, starting initialization');
    console.log('[DEBUG] DOMContentLoaded: Current location:', window.location.href);
    console.log('[DEBUG] DOMContentLoaded: Current pathname:', window.location.pathname);
    console.log('[DEBUG] DOMContentLoaded: Available cookies:', document.cookie);
    
    // Verificar se estamos na página de login
    if (window.location.pathname.includes('/login')) {
        console.log('[DEBUG] DOMContentLoaded: On login page - skipping main app initialization');
        return;
    }
    
    console.log('[DEBUG] DOMContentLoaded: On main page - proceeding with initialization');
    
    // Verificar se os elementos necessários existem (caso estejamos numa página diferente)
    if (!document.getElementById('applications-section')) {
        console.log('[DEBUG] DOMContentLoaded: Main app elements not found - skipping initialization');
        return;
    }
    
    // Inicializar dados do usuário na interface (cookies são gerenciados pelo servidor)
    console.log('[DEBUG] DOMContentLoaded: Initializing user interface');
    initializeUserInterface();
    
    console.log('[DEBUG] DOMContentLoaded: Loading applications');
    loadApplications();
    
    // Botões principais
    document.getElementById('new-app-btn').addEventListener('click', () => {
        currentEditingAppId = null;
        document.getElementById('app-modal-title').textContent = 'New Application';
        document.getElementById('app-form').reset();
        openModal('app-modal');
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
    const savedAppId = sessionStorage.getItem('currentAppId');
    const savedAppName = sessionStorage.getItem('currentAppName');
    if (savedAppId && savedAppName) {
        showToggles(savedAppId, savedAppName);
    }
});

// Funções de Modal
function openModal(modalId) {
    const modal = document.getElementById(modalId);
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
        
        if (focusElement && modal.offsetHeight > 0) { // Verificar se o modal está visível
            focusElement.focus();
            // Selecionar o texto se for um campo de edição
            if (modalId === 'edit-toggle-modal' || (modalId === 'app-modal' && currentEditingAppId)) {
                focusElement.select();
            }
        }
    }, 150); // Pequeno delay para garantir que o modal esteja completamente visível
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
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
    }
}

// Funções de Navegação
function showApplications() {
    applicationsSection.classList.remove('hidden');
    togglesSection.classList.add('hidden');
    currentAppId = null;
    currentAppName = null;
    // Clear sessionStorage
    sessionStorage.removeItem('currentAppId');
    sessionStorage.removeItem('currentAppName');
    loadApplications();
}

function showToggles(appId, appName) {
    currentAppId = appId;
    currentAppName = appName;
    appNameElement.textContent = `Toggles of ${appName}`;
    applicationsSection.classList.add('hidden');
    togglesSection.classList.remove('hidden');
    // Persistir no sessionStorage
    sessionStorage.setItem('currentAppId', appId);
    sessionStorage.setItem('currentAppName', appName);
    loadToggles(appId);
}

// Funções de API
async function apiCall(url, options = {}) {
    console.log(`[DEBUG] apiCall: Making request to ${url}`, {
        method: options.method || 'GET',
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
        return data;
    } catch (error) {
        console.error('[DEBUG] API Error:', error);
        console.log(`[DEBUG] apiCall: Error details:`, {
            url,
            method: options.method || 'GET',
            error: error.message,
            stack: error.stack
        });
        showError(`Error in request: ${error.message}`);
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
    if (!name) return;
    
    try {
        if (currentEditingAppId) {
            // Editando aplicação existente
            await apiCall(`/applications/${currentEditingAppId}`, {
                method: 'PUT',
                body: JSON.stringify({ name })
            });
            showSuccess('Application updated successfully!');
            currentEditingAppId = null;
        } else {
            // Criando nova aplicação
            await apiCall('/applications', {
                method: 'POST',
                body: JSON.stringify({ name })
            });
            showSuccess('Application created successfully!');
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
    applicationsList.innerHTML = applications.map(app => `
        <div class="card app-card" data-app-id="${app.id}">
            <div class="app-card-header">
                <div class="app-card-header-right">
                    <button class="icon-btn" title="Ver Toggles" onclick="event.stopPropagation(); showToggles('${app.id}', '${app.name}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                    <button class="icon-btn" title="Gerenciar Secret Key" onclick="event.stopPropagation(); manageSecretKey('${app.id}', '${app.name}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <circle cx="12" cy="16" r="1"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
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
                </div>
            </div>
            <div class="toggle-divider"></div>
            <div class="app-card-body">
                <div class="app-title-row">
                    <a href="#" class="app-title-link" onclick="event.preventDefault(); showToggles('${app.id}', '${app.name}')">${app.name}</a>
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
        await apiCall(`/applications/${currentAppId}/toggles`, {
            method: 'POST',
            body: JSON.stringify({ toggle: path })
        });
        
        closeModal('toggle-modal');
        showSuccess('Toggle created successfully!');
        loadToggles(currentAppId);
    } catch (error) {
        showError('Error creating toggle');
    }
}

async function handleUpdateToggle(event) {
    event.preventDefault();
    const enabled = document.getElementById('edit-toggle-enabled-input').checked;
    const hasActivationRule = document.getElementById('edit-toggle-activation-rule-input').checked;
    
    if (!editingToggleId) return;
    
    let updateData = { enabled };
    
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
    } else {
        updateData.has_activation_rule = false;
        updateData.activation_rule = null;
    }
    
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
        showError('Error saving toggle');
    }
}

function renderToggles(toggles) {
    if (!toggles || toggles.length === 0) {
        showEmptyState(togglesList, 'No toggles found for this application', 'Start by creating your first feature toggle to control application behavior.', 'toggles');
        return;
    }
    
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
            return `<a href="#" class="${linkClass}" onclick="editTogglePath('${toggleId}'); return false;">${part}</a>`;
        }).join('<span class="path-separator">.</span>');

        return `
            <div class="toggle-card">
                <div class="toggle-card-header">
                    <div class="toggle-header-left"><span class="toggle-status-dot">${statusSVG}</span></div>
                    <div class="toggle-header-right">
                        <button class="icon-btn danger" title="Excluir Toggle" onclick="deleteToggle('${toggle.id}', '${pathStr}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3,6 5,6 21,6"/>
                                <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
                                <line x1="10" y1="11" x2="10" y2="17"/>
                                <line x1="14" y1="11" x2="14" y2="17"/>
                            </svg>
                        </button>
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
}

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
        await apiCall(`/applications/${currentAppId}/toggles/${toggleId}`, {
            method: 'DELETE'
        });
        
        showSuccess('Toggle deleted successfully!');
        loadToggles(currentAppId);
    } catch (error) {
        showError('Error deleting toggle');
    }
}

// Função para criar modal de confirmação profissional
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
    } catch (error) {
        showError('Error deleting application');
    }
}

function editApplication(appId, appName) {
    currentEditingAppId = appId;
    document.getElementById('app-name-input').value = appName;
    document.getElementById('app-modal-title').textContent = 'Edit Application';
    openModal('app-modal');
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
function openProfileModal() {
    closeUserMenu();
    showInfo('Profile settings modal will be implemented soon');
}

function openUsersModal() {
    closeUserMenu();
    showInfo('User management modal will be implemented soon');
}

function openSecretKeysModal() {
    closeUserMenu();
    showInfo('Secret keys management modal will be implemented soon');
} 